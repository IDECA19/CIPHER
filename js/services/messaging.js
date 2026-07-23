// js/services/messaging.js - Servicio para gestionar el ciclo de vida de los mensajes

import { sendMessage as sendP2P, getConnectionStatus } from '../network/p2p.js';
import { saveMessage, getAllFromStore, getIdentity } from '../core/storage.js';
import { encryptMessage, decryptMessage } from '../core/crypto.js';
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
 * Prepara y envía un mensaje cifrado
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

    const timestamp = Date.now();
    
    // CORRECCIÓN: Se agregaron las comillas invertidas (`) para el template literal
    const messageId = `msg_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;

    // Estructura del mensaje en texto plano
    const payload = {
        id: messageId,
        senderPin: myIdentity.pinFormatted || myIdentity.pin,
        recipientPin: recipientPin,
        content: textContent.trim(),
        timestamp: timestamp
    };

    // Cifrar contenido con la clave del destinatario
    const encryptedContent = await encryptMessage(JSON.stringify(payload), recipientPin);
    
    const packet = {
        type: 'chat_message',
        senderPin: myIdentity.pinFormatted || myIdentity.pin,
        payload: encryptedContent,
        timestamp: timestamp
    };

    // Guardar en la base de datos local (IndexedDB)
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
            console.log('✅ Mensaje P2P transmitido con éxito');
        } catch (err) {
            console.warn('⚠️ Guardado localmente. Se enviará al reconectar:', err.message);
        }
    } else {
        console.warn('⚠️ Red P2P offline. Mensaje guardado localmente.');
    }

    return localRecord;
}

/**
 * Recibe y procesa mensajes P2P entrantes
 * @param {Object} packet - Paquete P2P recibido
 */
export async function receiveP2PMessage(packet) {
    if (!packet || packet.type !== 'chat_message') return;

    try {
        const decryptedJson = await decryptMessage(packet.payload, packet.senderPin);
        const messageData = JSON.parse(decryptedJson);

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
    } catch (err) {
        console.error('❌ Error al descifrar el mensaje recibido:', err);
    }
}
