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
    
    // 1. Guardar mensaje como "enviado" localmente
    await saveMessage(currentChatId, text, true);
    
    // 2. Limpiar input
    input.value = '';
    input.style.height = 'auto'; // Resetear altura
    
    // 3. Renderizar el nuevo mensaje
    const messages = await getChatMessages(currentChatId);
    const newMsg = messages[messages.length - 1];
    appendMessageToDOM(newMsg);
    scrollToBottom();
    
    // 4. Actualizar la lista lateral
    // Necesitamos importar renderChatList dinámicamente o pasarlo como callback
    // Para evitar dependencias circulares, lo manejamos en main.js
    window.dispatchEvent(new CustomEvent('chat-updated'));
    
    // TODO (Fase 1.3): Aquí irá la llamada a libp2p para enviar el mensaje P2P real
    // await p2pService.sendMessage(currentChatId, text);
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