// js/services/messaging.js - Gestión de mensajes (Local + P2P)

import { STORAGE_CONFIG } from '../config.js';
import { saveToStore, getAllFromStore, getByIndex } from '../core/storage.js';
import { generateId } from '../utils/formatter.js';
import { sendMessage as p2pSendMessage } from '../network/p2p.js';

/**
 * Guarda un mensaje en la base de datos local
 * @param {string} chatId - ID del chat (generalmente el PIN del contacto)
 * @param {string} text - Contenido del mensaje
 * @param {boolean} isSent - true si lo envió el usuario, false si es recibido
 * @param {string} senderPin - PIN del remitente
 * @returns {Promise<Object>} El mensaje guardado
 */
export async function saveMessage(chatId, text, isSent, senderPin = null) {
    const message = {
        id: generateId(),
        chatId: chatId,
        text: text,
        isSent: isSent,
        senderPin: senderPin,
        timestamp: Date.now(),
        status: isSent ? 'sent' : 'received'
    };

    await saveToStore(STORAGE_CONFIG.stores.messages, message);
    await updateChatPreview(chatId, text, message.timestamp);
    
    return message;
}

/**
 * Envía un mensaje tanto local como P2P
 * @param {string} targetPin - PIN del destinatario
 * @param {string} text - Contenido del mensaje
 * @param {string} senderPin - PIN del remitente
 * @returns {Promise<Object>} El mensaje guardado
 */
export async function sendP2PMessage(targetPin, text, senderPin) {
    // 1. Guardar localmente como "enviado"
    const message = await saveMessage(targetPin, text, true, senderPin);
    
    // 2. Enviar por la red P2P
        try {
        await p2pSendMessage(targetPin, {
            id: message.id,
            text: text,
            senderPin: senderPin,
            type: 'text'
        });
        console.log('✅ Mensaje enviado por P2P');
    } catch (error) {
        if (error.isPending) {
            console.log('⏳ Mensaje en cola de envío P2P (conexión estableciéndose...)');
        } else {
            console.warn('⚠️ Error enviando por P2P:', error.message);
        }
    }
    
    return message;
}

/**
 * Procesa un mensaje recibido por P2P
 * @param {Object} messageData - Datos del mensaje recibido
 */
export async function receiveP2PMessage(messageData) {
    const { id, text, senderPin, timestamp } = messageData;
    
    // Guardar como mensaje recibido
    const message = await saveMessage(senderPin, text, false, senderPin);
    
    // Disparar evento para que la UI se actualice
    window.dispatchEvent(new CustomEvent('message-received', {
        detail: { chatId: senderPin, message }
    }));
    
    console.log('📨 Mensaje recibido y guardado:', message);
}

/**
 * Obtiene todos los mensajes de un chat específico
 * @param {string} chatId - ID del chat
 * @returns {Promise<Array>} Lista de mensajes
 */
export async function getChatMessages(chatId) {
    const messages = await getByIndex(STORAGE_CONFIG.stores.messages, 'chatId', chatId);
    return messages.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Actualiza la vista previa del chat
 */
async function updateChatPreview(chatId, lastMessage, timestamp) {
    await saveToStore(STORAGE_CONFIG.stores.chats, {
        id: chatId,
        lastMessage: lastMessage,
        lastMessageAt: timestamp
    });
}

/**
 * Obtiene todos los chats con su vista previa
 */
export async function getAllChatsPreview() {
    return await getAllFromStore(STORAGE_CONFIG.stores.chats);
}