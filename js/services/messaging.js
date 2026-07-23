// js/services/messaging.js - Servicio para gestionar el ciclo de vida de los mensajes

import { sendMessage as sendP2P, getConnectionStatus } from '../network/p2p.js';
// 🔧 IMPORTANTE: Agregamos getContactByPin y saveContact para gestionar el guardado de las llaves públicas
import { saveMessage, getAllFromStore, getIdentity, getContactByPin, saveContact } from '../core/storage.js';
// 🔧 IMPORTANTE: Actualizamos las importaciones de crypto.js para usar ECDH y llaves compartidas
import { importPublicKeyJWK, importPrivateKeyJWK, deriveSharedAESKey, encryptMessage, decryptMessage } from '../core/crypto.js';
import { STORAGE_CONFIG } from '../config.js';

/**
 * Obtiene una vista previa agrupada de todos los chats activos con su último mensaje
 * @returns {Promise<Array>} Lista de objetos con id, lastMessage y lastMessageAt
 */
export async function getAllChatsPreview() {
    const allMessages = await getAllFromStore(STORAGE_CONFIG.stores.messages);
    const chatsMap = new Map();

    allMessages.forEach(msg => {
        // Identificar el PIN de la otra parte (emisor o receptor)
        const peerPin = msg.isOutgoing ? msg.recipientPin : msg.senderPin;
        if (!peerPin) return;

        const cleanPeerPin = peerPin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const existing = chatsMap.get(cleanPeerPin);

        if (!existing || msg.timestamp > existing.lastMessageAt) {
            chatsMap.set(cleanPeerPin, {
                id: peerPin,
                lastMessage: msg.content || 'Archivo / Adjunto',
                lastMessageAt: msg.timestamp,
                unreadCount: (!msg.isOutgoing && msg.status !== 'read') 
                    ? ((existing?.unreadCount || 0) + 1) 
                    : (existing?.unreadCount || 0)
            });
        }
    });

    return Array.from(chatsMap.values());
}

/**
 * Prepara y envía un mensaje cifrado o inicia un Handshake si falta la llave
 * @param {string} recipientPin - PIN del destinatario
 * @param {string} textContent - Texto plano del mensaje
 * @returns {Promise<Object>} Registro del mensaje guardado localmente
 */
export async function sendChatMessage(recipientPin, textContent) {
    if (!textContent || textContent.trim() === '') {
        throw new Error('El mensaje no puede estar vacío.');
    }

    const myIdentity = await getIdentity();
    if (!myIdentity) {
        throw new Error('No se encontró la identidad del usuario local.');
    }

    // 🔐 LÓGICA E2EE: Verificar si tenemos la llave pública del contacto
    let contact = await getContactByPin(recipientPin);
    if (!contact) {
        // Si no existe, lo creamos temporalmente en memoria para proceder
        contact = { pin: recipientPin, alias: recipientPin };
    }

    // 🤝 Si no hay llave pública, forzamos Handshake y pausamos el envío del mensaje
    if (!contact.publicKey) {
        console.log('🔄 Llave pública desconocida. Iniciando Handshake automático...');
        await sendP2P(recipientPin, {
            type: 'HANDSHAKE',
            senderPin: myIdentity.pinFormatted || myIdentity.pin,
            publicKey: myIdentity.publicKey,
            isAck: false
        });
        throw new Error('Estableciendo conexión segura E2EE... Intenta enviar tu mensaje de nuevo en unos segundos.');
    }

    const timestamp = Date.now();
    const messageId = `msg_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;

    // Estructura del mensaje en texto plano
    const payload = {
        id: messageId,
        senderPin: myIdentity.pinFormatted || myIdentity.pin,
        recipientPin: recipientPin,
        content: textContent.trim(),
        timestamp: timestamp
    };

    // 🔐 LÓGICA E2EE: Reconstruir llaves y derivar secreto compartido
    const myPrivateKey = await importPrivateKeyJWK(myIdentity.privateKey);
    const targetPublicKey = await importPublicKeyJWK(contact.publicKey);
    const sharedAESKey = await deriveSharedAESKey(myPrivateKey, targetPublicKey);

    // Cifrar contenido con la clave compartida (Fuerte)
    const encryptedContent = await encryptMessage(JSON.stringify(payload), sharedAESKey);
    
    const packet = {
        type: 'chat_message', // Mantenemos tu tipo original para no romper compatibilidad
        senderPin: myIdentity.pinFormatted || myIdentity.pin,
        payload: encryptedContent,
        timestamp: timestamp
    };

    // Guardar en la base de datos local (IndexedDB) de forma inalterada
    const localRecord = {
        ...payload,
        isOutgoing: true,
        status: 'sent'
    };
    await saveMessage(localRecord);

    // Intentar transmitir por la red P2P
    if (getConnectionStatus()) {
        try {
            await sendP2P(recipientPin, packet);
            console.log('✅ Mensaje P2P cifrado transmitido con éxito');
        } catch (err) {
            console.warn('⚠️ Guardado localmente. Se enviará al reconectar:', err.message);
        }
    } else {
        console.warn('⚠️ Red P2P offline. Mensaje guardado localmente.');
    }

    return localRecord;
}

/**
 * Recibe y procesa mensajes P2P entrantes y Handshakes
 * @param {Object} packet - Paquete P2P recibido
 */
export async function receiveP2PMessage(packet) {
    if (!packet) return;

    try {
        const myIdentity = await getIdentity();

        // 🤝 CASO 1: Procesar un paquete de Handshake (Intercambio de llaves)
        if (packet.type === 'HANDSHAKE') {
            console.log(`🤝 Handshake recibido de ${packet.senderPin}`);
            
            let contact = await getContactByPin(packet.senderPin);
            if (!contact) {
                contact = { pin: packet.senderPin, alias: packet.senderPin };
            }
            // Guardar la llave pública entrante
            contact.publicKey = packet.publicKey;
            await saveContact(contact); // Tu DB ahora almacena la llave para futuros mensajes

            // Si es un handshake inicial, respondemos con el nuestro (ACK)
            if (!packet.isAck) {
                await sendP2P(packet.senderPin, {
                    type: 'HANDSHAKE',
                    senderPin: myIdentity.pinFormatted || myIdentity.pin,
                    publicKey: myIdentity.publicKey,
                    isAck: true // Evita un bucle infinito
                });
            }
            return; // Terminamos aquí, un handshake no es un mensaje de chat
        }

        // 💬 CASO 2: Procesar un mensaje de chat normal
        if (packet.type === 'chat_message') {
            const contact = await getContactByPin(packet.senderPin);

            if (!contact || !contact.publicKey) {
                console.warn('⚠️ Mensaje cifrado recibido pero no tenemos la llave pública del remitente. Ignorando.');
                return;
            }

            // 🔐 LÓGICA E2EE: Derivar la misma llave secreta usada por el remitente
            const myPrivateKey = await importPrivateKeyJWK(myIdentity.privateKey);
            const senderPublicKey = await importPublicKeyJWK(contact.publicKey);
            const sharedAESKey = await deriveSharedAESKey(myPrivateKey, senderPublicKey);

            // Descifrar con la llave compartida en lugar del PIN
            const decryptedJson = await decryptMessage(packet.payload, sharedAESKey);
            const messageData = JSON.parse(decryptedJson);

            // Estructura de guardado local inalterada
            const localRecord = {
                id: messageData.id,
                senderPin: messageData.senderPin,
                recipientPin: messageData.recipientPin,
                content: messageData.content,
                timestamp: messageData.timestamp,
                isOutgoing: false,
                status: 'received'
            };

            await saveMessage(localRecord);

            // Notificar a la interfaz de usuario para actualizar la lista y la ventana activa
            window.dispatchEvent(new CustomEvent('chat-updated', { 
                detail: { senderPin: messageData.senderPin } 
            }));
        }
    } catch (err) {
        console.error('❌ Error procesando mensaje entrante (posible fallo de descifrado):', err);
    }
}