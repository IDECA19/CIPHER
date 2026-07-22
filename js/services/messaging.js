// js/services/messaging.js - Servicio para gestionar el ciclo de vida de los mensajes

import { sendMessage as sendP2P, getConnectionStatus } from '../network/p2p.js';
import { saveMessage, getMessagesByChat, markMessagesAsRead } from '../core/storage.js';
import { encryptMessage, decryptMessage } from '../core/crypto.js';
import { getIdentity } from '../core/storage.js';

/**
 * Prepara y envía un mensaje cifrado
 */
export async function sendChatMessage(recipientPin, textContent) {
    if (!textContent || textContent.trim() === '') {
        throw new Error('El mensaje no puede estar vacío.');
    }

    const myIdentity = await getIdentity();
    const timestamp = Date.now();
    const messageId = `msg_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

    // Estructura del mensaje en texto plano
    const payload = {
        id: messageId,
        senderPin: myIdentity.pinFormatted,
        recipientPin: recipientPin,
        content: textContent.trim(),
        timestamp: timestamp
    };

    // Cifrar contenido
    const encryptedContent = await encryptMessage(JSON.stringify(payload), recipientPin);

    const packet = {
        type: 'chat_message',
        senderPin: myIdentity.pinFormatted,
        payload: encryptedContent,
        timestamp: timestamp
    };

    // Guardar en la base de datos local (IndexedDB) como enviado
    const localRecord = {
        ...payload,
        isOutgoing: true,
        status: 'sent'
    };
    await saveMessage(localRecord);

    // Intentar enviar por la red P2P
    if (getConnectionStatus()) {
        try {
            await sendP2P(recipientPin, packet);
            console.log('✅ Mensaje P2P transmitido con éxito');
        } catch (err) {
            console.warn('⚠️ No se pudo entregar por P2P inmediatamente (se guardó localmente):', err.message);
        }
    } else {
        console.warn('⚠️ Red P2P offline. Mensaje guardado localmente.');
    }

    return localRecord;
}

/**
 * Recibe y procesa mensajes P2P entrantes
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

        // Notificar a la interfaz de usuario para actualizar los chats
        window.dispatchEvent(new CustomEvent('chat-updated', { 
            detail: { senderPin: messageData.senderPin } 
        }));

    } catch (err) {
        console.error('❌ Error al descifrar el mensaje recibido:', err);
    }
}
