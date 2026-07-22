// js/ui/chat_window.js - Gestión de la ventana de conversación

import { getChatMessages, sendP2PMessage, sendP2PFile, downloadReceivedFile } from '../services/messaging.js';
import { getIdentity } from '../core/storage.js';
import { formatMessageTime } from '../utils/formatter.js';
import { formatFileSize, getFileIcon, createFileUrl } from '../services/files.js';
import { getFromStore } from '../core/storage.js';
import { STORAGE_CONFIG } from '../config.js';

let currentChatId = null;

/**
 * Abre la ventana de chat con un contacto específico
 */
export async function openChatWindow(pin, alias) {
    currentChatId = pin;
    
    document.getElementById('chat-name').textContent = alias;
    document.getElementById('chat-pin').textContent = pin;
    
    document.getElementById('chat-empty').classList.add('hidden');
    document.getElementById('chat-window').classList.remove('hidden');
    document.getElementById('app').classList.add('chat-open');
    
    await loadMessages(pin);
    document.getElementById('message-input').focus();
}

/**
 * Cierra la ventana de chat
 */
export function closeChatWindow() {
    currentChatId = null;
    document.getElementById('chat-window').classList.add('hidden');
    document.getElementById('chat-empty').classList.remove('hidden');
    document.getElementById('app').classList.remove('chat-open');
}

/**
 * Carga y renderiza los mensajes del chat
 */
async function loadMessages(chatId) {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';
    
    const messages = await getChatMessages(chatId);
    
    for (const msg of messages) {
        await appendMessageToDOM(msg);
    }
    
    scrollToBottom();
}

/**
 * Agrega un mensaje al DOM (soporta texto y archivos)
 */
async function appendMessageToDOM(msg) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.isSent ? 'sent' : 'received'} ${msg.type || 'text'}`;
    messageDiv.dataset.messageId = msg.id;
    
    const timeStr = formatMessageTime(msg.timestamp);
    const statusIcon = msg.isSent ? '✓✓' : '';
    
    let contentHtml = '';
    
    if (msg.type === 'file') {
        // Renderizar archivo adjunto
        contentHtml = await renderFileAttachment(msg);
    } else {
        // Renderizar texto
        contentHtml = `
            <div class="message__text">${escapeHtml(msg.text)}</div>
            <div class="message__meta">
                <span>${timeStr}</span>
                ${msg.isSent ? `<span class="message__status">${statusIcon}</span>` : ''}
            </div>
        `;
    }
    
    messageDiv.innerHTML = contentHtml;
    messagesContainer.appendChild(messageDiv);
}

/**
 * Renderiza un archivo adjunto en el chat
 */
async function renderFileAttachment(msg) {
    const fileRecord = await getFromStore(STORAGE_CONFIG.stores.files, msg.fileId);
    const metadata = fileRecord?.metadata || {
        name: msg.fileName,
        size: msg.fileSize,
        mimeType: msg.mimeType
    };
    
    const icon = getFileIcon(metadata.mimeType);
    const size = formatFileSize(metadata.size);
    const timeStr = formatMessageTime(msg.timestamp);
    
    let previewHtml = '';
    
    // Si es una imagen y tenemos el archivo, mostrar preview
    if (metadata.mimeType && metadata.mimeType.startsWith('image/') && fileRecord) {
        try {
            const { reconstructAndDecryptFile } = await import('../services/files.js');
            const blob = await reconstructAndDecryptFile(msg.fileId, fileRecord.metadata);
            const url = createFileUrl(blob);
            previewHtml = `
                <div class="file-attachment__preview">
                    <img src="${url}" alt="${escapeHtml(metadata.name)}" onclick="window.open('${url}', '_blank')">
                </div>
            `;
        } catch (err) {
            console.warn('No se pudo generar preview de imagen:', err);
            previewHtml = `<div class="file-attachment__preview file-attachment__preview--icon">${icon}</div>`;
        }
    } else {
        previewHtml = `<div class="file-attachment__preview file-attachment__preview--icon">${icon}</div>`;
    }
    
    return `
        <div class="file-attachment">
            ${previewHtml}
            <div class="file-attachment__info">
                <div class="file-attachment__icon">${icon}</div>
                <div class="file-attachment__details">
                    <div class="file-attachment__name">${escapeHtml(metadata.name)}</div>
                    <div class="file-attachment__size">${size}</div>
                </div>
                <button class="file-attachment__download" data-file-id="${msg.fileId}" title="Descargar">⬇️</button>
            </div>
            <div class="message__meta">
                <span>${timeStr}</span>
                ${msg.isSent ? '<span class="message__status">✓✓</span>' : ''}
            </div>
        </div>
    `;
}

/**
 * Maneja el envío de un mensaje de texto
 */
export async function handleSendMessage() {
    if (!currentChatId) return;
    
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    const identity = await getIdentity();
    await sendP2PMessage(currentChatId, text, identity.pin);
    
    input.value = '';
    input.style.height = 'auto';
    
    const messages = await getChatMessages(currentChatId);
    const newMsg = messages[messages.length - 1];
    await appendMessageToDOM(newMsg);
    scrollToBottom();
    
    window.dispatchEvent(new CustomEvent('chat-updated'));
}

/**
 * Maneja el envío de un archivo
 */
export async function handleSendFile(file) {
    if (!currentChatId) return;
    
    const identity = await getIdentity();
    const overlay = document.getElementById('file-progress-overlay');
    const nameEl = document.getElementById('file-progress-name');
    const fillEl = document.getElementById('file-progress-fill');
    const percentEl = document.getElementById('file-progress-percent');
    
    // Mostrar overlay de progreso
    nameEl.textContent = `Enviando: ${file.name}`;
    fillEl.style.width = '0%';
    percentEl.textContent = '0%';
    overlay.classList.remove('hidden');
    
    try {
        const message = await sendP2PFile(currentChatId, file, identity.pin, (progress) => {
            fillEl.style.width = `${progress}%`;
            percentEl.textContent = `${progress}%`;
        });
        
        // Renderizar el mensaje
        await appendMessageToDOM(message);
        scrollToBottom();
        
        window.dispatchEvent(new CustomEvent('chat-updated'));
        
        // Mostrar éxito
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 500);
        
    } catch (error) {
        console.error('Error enviando archivo:', error);
        overlay.classList.add('hidden');
        alert('Error al enviar el archivo: ' + error.message);
    }
}

/**
 * Maneja mensajes recibidos por P2P
 */
window.addEventListener('message-received', async (e) => {
    const { chatId, message } = e.detail;
    
    if (currentChatId === chatId) {
        await appendMessageToDOM(message);
        scrollToBottom();
    }
    
    window.dispatchEvent(new CustomEvent('chat-updated'));
});

/**
 * Maneja la descarga de archivos
 */
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('file-attachment__download')) {
        const fileId = e.target.dataset.fileId;
        const fileRecord = await getFromStore(STORAGE_CONFIG.stores.files, fileId);
        
        if (fileRecord && fileRecord.metadata) {
            try {
                await downloadReceivedFile(fileId, fileRecord.metadata);
            } catch (err) {
                console.error('Error descargando archivo:', err);
                alert('Error al descargar el archivo');
            }
        }
    }
});

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-resize del textarea
document.getElementById('message-input')?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Botón de regreso (móvil)
document.getElementById('btn-back')?.addEventListener('click', () => {
    closeChatWindow();
});

// Botón de adjuntar archivo
document.getElementById('btn-attach')?.addEventListener('click', () => {
    document.getElementById('file-input').click();
});

// Cuando se selecciona un archivo
document.getElementById('file-input')?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Enviar cada archivo seleccionado
    for (const file of files) {
        await handleSendFile(file);
    }
    
    // Limpiar el input para poder seleccionar el mismo archivo otra vez
    e.target.value = '';
});
