// js/ui/chat_window.js - Manejo de la interfaz del área de chat

import { sendChatMessage } from '../services/messaging.js';
import { getMessagesByChat, markMessagesAsRead } from '../core/storage.js';
import { formatTime } from '../utils/formatter.js';

let activeChatPin = null;

/**
 * Abre y carga la conversación con un contacto
 */
export async function openChatWindow(pin, name) {
    activeChatPin = pin;

    const emptyArea = document.getElementById('chat-empty');
    const windowArea = document.getElementById('chat-window');
    const nameEl = document.getElementById('chat-name');
    const pinEl = document.getElementById('chat-pin');

    if (emptyArea) emptyArea.classList.add('hidden');
    if (windowArea) windowArea.classList.remove('hidden');

    if (nameEl) nameEl.textContent = name || pin;
    if (pinEl) pinEl.textContent = pin;

    await loadMessages(pin);
    await markMessagesAsRead(pin);
}

/**
 * Carga y renderiza los mensajes en la ventana activa
 */
async function loadMessages(pin) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    const messages = await getMessagesByChat(pin);

    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.isOutgoing ? 'message--outgoing' : 'message--incoming'}`;

        const textDiv = document.createElement('div');
        textDiv.className = 'message__text';
        textDiv.textContent = msg.content;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message__time';
        timeDiv.textContent = formatTime(msg.timestamp);

        msgDiv.appendChild(textDiv);
        msgDiv.appendChild(timeDiv);
        container.appendChild(msgDiv);
    });

    container.scrollTop = container.scrollHeight;
}

/**
 * Procesa el evento de envío de mensaje desde la interfaz
 */
export async function handleSendMessage() {
    if (!activeChatPin) return;

    const input = document.getElementById('message-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    try {
        input.value = '';
        await sendChatMessage(activeChatPin, text);
        await loadMessages(activeChatPin);
    } catch (err) {
        console.error('❌ Error al enviar mensaje:', err);
    }
}
