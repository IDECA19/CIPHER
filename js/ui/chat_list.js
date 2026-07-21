// js/ui/chat_list.js - Renderizado de la lista de chats en el sidebar

import { getAllContacts } from '../services/contacts.js';
import { getAllChatsPreview } from '../services/messaging.js';
import { formatPin, formatMessageTime, truncateText, getInitials } from '../utils/formatter.js';

/**
 * Renderiza la lista de chats en el sidebar
 * @param {Function} onChatClick - Callback cuando se hace clic en un chat
 */
export async function renderChatList(onChatClick) {
    const chatListContainer = document.getElementById('chat-list');
    const emptyState = document.getElementById('empty-chats');
    
    // Obtener contactos y previews de chats
    const contacts = await getAllContacts();
    const chats = await getAllChatsPreview();
    
    // Combinar contactos que tengan mensajes
    const activeChats = contacts.filter(contact => 
        chats.some(chat => chat.id === contact.pin)
    ).map(contact => {
        const chatData = chats.find(c => c.id === contact.pin);
        return { ...contact, ...chatData };
    });

    // Ordenar por último mensaje más reciente
    activeChats.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    // Limpiar lista actual (manteniendo el empty state)
    Array.from(chatListContainer.children).forEach(child => {
        if (child.id !== 'empty-chats') {
            child.remove();
        }
    });

    if (activeChats.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Renderizar cada chat
    activeChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.pin = chat.pin;
        
        const initials = getInitials(chat.alias);
        const timeStr = chat.lastMessageAt ? formatMessageTime(chat.lastMessageAt) : '';
        const previewText = truncateText(chat.lastMessage || 'Sin mensajes aún', 35);

        chatItem.innerHTML = `
            <div class="chat-item__avatar">${initials}</div>
            <div class="chat-item__content">
                <div class="chat-item__header">
                    <span class="chat-item__name">${chat.alias}</span>
                    <span class="chat-item__time">${timeStr}</span>
                </div>
                <div class="chat-item__preview">
                    <span class="chat-item__last-message">${previewText}</span>
                </div>
            </div>
        `;

        chatItem.addEventListener('click', () => {
            // Remover clase active de otros
            document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
            chatItem.classList.add('active');
            onChatClick(chat.pin, chat.alias);
        });

        chatListContainer.appendChild(chatItem);
    });
}