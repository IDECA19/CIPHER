// js/ui/chat_list.js - Renderizado de la lista de chats en el sidebar

// ✅ CORRECCIÓN: Se cambió getAllContacts por getContactsList
import { getContactsList } from '../services/contacts.js'; 
import { getAllChatsPreview } from '../services/messaging.js';
import { formatMessageTime, truncateText, getInitials } from '../utils/formatter.js';

/**
 * Renderiza la lista de chats en el sidebar
 * @param {Function} onChatClick - Callback cuando se hace clic en un chat
 */
export async function renderChatList(onChatClick) {
    const chatListContainer = document.getElementById('chat-list');
    const emptyState = document.getElementById('empty-chats');
    
    // Obtener contactos y previews de chats
    const contacts = await getContactsList(); // ✅ CORRECCIÓN APLICADA
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

        // ✅ SEGURIDAD CRÍTICA (Paso 3): Creación de nodos DOM segura (Evita XSS)
        // En lugar de innerHTML, usamos createElement y textContent
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'chat-item__avatar';
        avatarDiv.textContent = initials;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-item__content';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'chat-item__header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-item__name';
        nameSpan.textContent = chat.alias; // <-- Seguro contra inyección de scripts

        const timeSpan = document.createElement('span');
        timeSpan.className = 'chat-item__time';
        timeSpan.textContent = timeStr;

        headerDiv.appendChild(nameSpan);
        headerDiv.appendChild(timeSpan);

        const previewDiv = document.createElement('div');
        previewDiv.className = 'chat-item__preview';

        const lastMsgSpan = document.createElement('span');
        lastMsgSpan.className = 'chat-item__last-message';
        lastMsgSpan.textContent = previewText; // <-- Seguro contra inyección de scripts

        previewDiv.appendChild(lastMsgSpan);
        contentDiv.appendChild(headerDiv);
        contentDiv.appendChild(previewDiv);
        
        chatItem.appendChild(avatarDiv);
        chatItem.appendChild(contentDiv);

        chatItem.addEventListener('click', () => {
            document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
            chatItem.classList.add('active');
            onChatClick(chat.pin, chat.alias);
        });

        chatListContainer.appendChild(chatItem);
    });
}