// js/ui/chat_window.js - Gestión de la ventana de conversación

import { saveMessage, getChatMessages } from '../services/messaging.js';
import { formatMessageTime } from '../utils/formatter.js';
import { renderChatList } from './chat_list.js';

let currentChatId = null;

/**
 * Abre la ventana de chat con un contacto específico
 * @param {string} pin - PIN del contacto
 * @param {string} alias - Alias del contacto
 */
export async function openChatWindow(pin, alias) {
    currentChatId = pin;
    
    // Actualizar header del chat
    document.getElementById('chat-name').textContent = alias;
    document.getElementById('chat-pin').textContent = pin;
    
    // Mostrar ventana de chat, ocultar estado vacío
    document.getElementById('chat-empty').classList.add('hidden');
    document.getElementById('chat-window').classList.remove('hidden');
    
    // Cargar mensajes
    await loadMessages(pin);
    
    // Enfocar el input
    document.getElementById('message-input').focus();
}

/**
 * Carga y renderiza los mensajes del chat
 * @param {string} chatId - ID del chat
 */
async function loadMessages(chatId) {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = ''; // Limpiar
    
    const messages = await getChatMessages(chatId);
    
    messages.forEach(msg => {
        appendMessageToDOM(msg);
    });
    
    scrollToBottom();
}

/**
 * Agrega un mensaje al DOM
 * @param {Object} msg - Objeto del mensaje
 */
function appendMessageToDOM(msg) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.isSent ? 'sent' : 'received'}`;
    
    const timeStr = formatMessageTime(msg.timestamp);
    const statusIcon = msg.isSent ? '✓✓' : ''; // Simulado por ahora
    
    messageDiv.innerHTML = `
        <div class="message__text">${escapeHtml(msg.text)}</div>
        <div class="message__meta">
            <span>${timeStr}</span>
            ${msg.isSent ? `<span class="message__status">${statusIcon}</span>` : ''}
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

/**
 * Maneja el envío de un nuevo mensaje
 */
export async function handleSendMessage() {
    if (!currentChatId) return;
    
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    // Obtener PIN del remitente
    const { getIdentity } = await import('../core/storage.js');
    const identity = await getIdentity();
    
    // 1. Enviar mensaje (local + P2P)
    const { sendP2PMessage } = await import('../services/messaging.js');
    await sendP2PMessage(currentChatId, text, identity.pin);
    
    // 2. Limpiar input
    input.value = '';
    input.style.height = 'auto';
    
    // 3. Renderizar el nuevo mensaje
    const { getChatMessages } = await import('../services/messaging.js');
    const messages = await getChatMessages(currentChatId);
    const newMsg = messages[messages.length - 1];
    appendMessageToDOM(newMsg);
    scrollToBottom();
    
    // 4. Actualizar la lista lateral
    window.dispatchEvent(new CustomEvent('chat-updated'));
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-resize del textarea
document.getElementById('message-input')?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

/**
 * Maneja mensajes recibidos por P2P
 */
window.addEventListener('message-received', async (e) => {
    const { chatId, message } = e.detail;
    
    // Si el chat actual está abierto, mostrar el mensaje
    if (currentChatId === chatId) {
        appendMessageToDOM(message);
        scrollToBottom();
    }
    
    // Actualizar lista de chats
    window.dispatchEvent(new CustomEvent('chat-updated'));
});