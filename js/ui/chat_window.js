// js/ui/chat_window.js - Manejo de la interfaz del área de chat

import { sendChatMessage } from '../services/messaging.js';
import { getMessagesByChat, markMessagesAsRead } from '../core/storage.js';
import { formatTime } from '../utils/formatter.js';

let activeChatPin = null;

/**
 * Abre y carga la conversación con un contacto
 * @param {string} pin - El PIN del contacto
 * @param {string} name - El nombre o alias del contacto
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
 * @param {string} pin - El PIN del contacto
 */
export async function loadMessages(pin) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    const messages = await getMessagesByChat(pin);

    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.isOutgoing ? 'sent' : 'received'}`;

        const textDiv = document.createElement('div');
        textDiv.className = 'message__text';
        textDiv.textContent = msg.content;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message__meta';
        timeDiv.textContent = formatTime(msg.timestamp);

        msgDiv.appendChild(textDiv);
        msgDiv.appendChild(timeDiv);
        container.appendChild(msgDiv);
    });

    // Desplazar el scroll hacia el último mensaje de forma suave
    container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
    });
}

/**
 * Procesa el evento de envío de mensaje desde la interfaz
 */
export async function handleSendMessage() {
    if (!activeChatPin) return;

    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('btn-send');
    if (!input || !sendBtn) return;

    const text = input.value.trim();
    if (!text) return;

    // Deshabilitar UI temporalmente para evitar múltiples clics
    input.disabled = true;
    sendBtn.disabled = true;

    try {
        await sendChatMessage(activeChatPin, text);
        
        // 🟢 ÉXITO: Solo limpiamos el input si el mensaje se cifró y envió/guardó correctamente
        input.value = ''; 
        await loadMessages(activeChatPin);
    } catch (err) {
        // 🟡 MANEJO DEL HANDSHAKE E2EE
        if (err.message.includes('Estableciendo conexión')) {
            // Mostramos el aviso al usuario
            showToast('🔐 ' + err.message, 'info');
            // Nota: NO limpiamos input.value, así el usuario solo tiene que volver a darle a "Enviar"
        } else {
            // 🔴 OTROS ERRORES
            showToast('❌ No se pudo enviar: ' + err.message, 'error');
            console.error('Error al enviar mensaje:', err);
        }
    } finally {
        // Restaurar la UI y devolver el foco al input
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

/**
 * Función auxiliar para mostrar notificaciones (Toasts) en la UI
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de toast ('info', 'error', 'success')
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message); // Fallback por si no existe el contenedor
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto-eliminar después de 4 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}