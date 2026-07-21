// js/services/messaging.js - Gestión local de mensajes (Pre-P2P)

import { STORAGE_CONFIG } from '../config.js';
import { saveToStore, getAllFromStore, getByIndex } from '../core/storage.js';
import { generateId } from '../utils/formatter.js';

/**
 * Guarda un mensaje en la base de datos local
 * @param {string} chatId - ID del chat (generalmente el PIN del contacto)
 * @param {string} text - Contenido del mensaje
 * @param {boolean} isSent - true si lo envió el usuario, false si es recibido
 * @returns {Promise<Object>} El mensaje guardado
 */
export async function saveMessage(chatId, text, isSent) {
    const message = {
        id: generateId(),
        chatId: chatId,
        text: text,
        isSent: isSent,
        timestamp: Date.now(),
        status: isSent ? 'sent' : 'received' // sent, delivered, read
    };

    await saveToStore(STORAGE_CONFIG.stores.messages, message);
    
    // Actualizar el último mensaje en el chat
    await updateChatPreview(chatId, text, message.timestamp);
    
    return message;
}

/**
 * Obtiene todos los mensajes de un chat específico, ordenados por tiempo
 * @param {string} chatId - ID del chat
 * @returns {Promise<Array>} Lista de mensajes
 */
export async function getChatMessages(chatId) {
    const messages = await getByIndex(STORAGE_CONFIG.stores.messages, 'chatId', chatId);
    // Ordenar por timestamp ascendente
    return messages.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Actualiza o crea la vista previa del chat en la lista
 * @param {string} chatId - ID del chat
 * @param {string} lastMessage - Último mensaje
 * @param {number} timestamp - Hora del último mensaje
 */
async function updateChatPreview(chatId, lastMessage, timestamp) {
    const chatsStore = STORAGE_CONFIG.stores.chats;
    // Nota: En una implementación completa, aquí haríamos un get y luego un put
    // Para simplificar, guardamos directamente sobrescribiendo
    await saveToStore(chatsStore, {
        id: chatId,
        lastMessage: lastMessage,
        lastMessageAt: timestamp
    });
}

/**
 * Obtiene todos los chats con su vista previa
 * @returns {Promise<Array>} Lista de chats
 */
export async function getAllChatsPreview() {
    return await getAllFromStore(STORAGE_CONFIG.stores.chats);
}