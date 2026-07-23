// js/ui/contacts_modal.js - Modal visual para mostrar la lista de contactos

// ✅ CORRECCIÓN 1: Importamos getContactsList en lugar de getAllContacts
import { getContactsList } from '../services/contacts.js';
import { formatPin, getInitials } from '../utils/formatter.js';
import { DEVELOPER_PIN } from '../config.js';

/**
 * Abre el modal de contactos
 */
export async function openContactsModal() {
    // Crear el modal si no existe
    let modal = document.getElementById('contacts-modal');
    
    if (!modal) {
        modal = createContactsModal();
        document.body.appendChild(modal);
    }
    
    // Cargar contactos
    await loadContactsList();
    
    // Mostrar modal
    modal.classList.remove('hidden');
    
    // Configurar cierre
    setupModalCloseHandlers(modal);
}

/**
 * Crea la estructura HTML del modal
 * @returns {HTMLElement} Elemento del modal
 */
function createContactsModal() {
    const modal = document.createElement('div');
    modal.id = 'contacts-modal';
    modal.className = 'modal-overlay hidden';
    
    modal.innerHTML = `
        <div class="modal">
            <div class="modal__header">
                <h2 class="modal__title">📇 Mis Contactos</h2>
                <button class="modal__close" id="btn-close-contacts">✕</button>
            </div>
            
            <div class="contacts-list" id="contacts-list">
                <div class="contacts-loading">Cargando contactos...</div>
            </div>
            
            <div class="modal__footer">
                <button class="btn btn-secondary" id="btn-close-contacts-footer">Cerrar</button>
            </div>
        </div>
    `;
    
    return modal;
}

/**
 * Carga y renderiza la lista de contactos en el modal
 */
async function loadContactsList() {
    const contactsList = document.getElementById('contacts-list');
    
    // ✅ CORRECCIÓN 2: Usamos la función correcta expuesta por el servicio
    const contacts = await getContactsList();
    
    if (contacts.length === 0) {
        contactsList.innerHTML = `
            <div class="contacts-empty">
                <div class="contacts-empty__icon">👥</div>
                <div class="contacts-empty__text">No tienes contactos aún</div>
                <div class="contacts-empty__hint">Usa el botón 💬 para agregar contactos</div>
            </div>
        `;
        return;
    }
    
    // Ordenar: desarrollador primero, luego por alias
    contacts.sort((a, b) => {
        if (a.isDeveloper && !b.isDeveloper) return -1;
        if (!a.isDeveloper && b.isDeveloper) return 1;
        return a.alias.localeCompare(b.alias);
    });

    // ✅ SEGURIDAD: Función auxiliar para sanitizar el HTML y evitar ataques XSS
    const escapeHTML = (str) => {
        return str ? str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag)) : '';
    };
    
    contactsList.innerHTML = contacts.map(contact => {
        const safeAlias = escapeHTML(contact.alias); // Escapamos el nombre del contacto
        const initials = getInitials(contact.alias); // getInitials no necesita escape (devuelve 2 letras)
        const formattedPin = formatPin(contact.pin);
        const developerBadge = contact.isDeveloper ? '<span class="badge badge-success">Dev</span>' : '';
        const addedDate = new Date(contact.addedAt).toLocaleDateString('es-ES');
        
        return `
            <div class="contact-item" data-pin="${contact.pin}">
                <div class="contact-item__avatar">${initials}</div>
                <div class="contact-item__info">
                    <div class="contact-item__header">
                        <span class="contact-item__name">${safeAlias}</span>
                        ${developerBadge}
                    </div>
                    <div class="contact-item__pin">${formattedPin}</div>
                    <div class="contact-item__date">Agregado: ${addedDate}</div>
                </div>
                <div class="contact-item__actions">
                    <button class="btn-icon" data-action="chat" data-pin="${contact.pin}" data-alias="${safeAlias}" title="Abrir chat">💬</button>
                    ${!contact.isDeveloper ? `<button class="btn-icon btn-icon--danger" data-action="delete" data-pin="${contact.pin}" title="Eliminar contacto">🗑️</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Agregar event listeners a los botones de acción
    setupContactActions();
}

/**
 * Configura los event listeners para las acciones de contactos
 */
function setupContactActions() {
    // Botón de chat
    document.querySelectorAll('[data-action="chat"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pin = e.currentTarget.dataset.pin;
            const alias = e.currentTarget.dataset.alias;
            closeContactsModal();
            // Disparar evento para abrir el chat
            window.dispatchEvent(new CustomEvent('open-chat', { 
                detail: { pin, alias } 
            }));
        });
    });
    
    // Botón de eliminar
    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const pin = e.currentTarget.dataset.pin;
            const confirmDelete = confirm('¿Estás seguro de eliminar este contacto?');
            
            if (confirmDelete) {
                const { deleteFromStore } = await import('../core/storage.js');
                const { STORAGE_CONFIG } = await import('../config.js');
                await deleteFromStore(STORAGE_CONFIG.stores.contacts, pin);
                
                // Recargar lista
                await loadContactsList();
                
                // Actualizar lista de chats
                window.dispatchEvent(new CustomEvent('chat-updated'));
                
                // Mostrar toast
                const toast = document.createElement('div');
                toast.className = 'toast success';
                toast.textContent = 'Contacto eliminado';
                document.getElementById('toast-container').appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            }
        });
    });
}

/**
 * Configura los handlers para cerrar el modal
 * @param {HTMLElement} modal - Elemento del modal
 */
function setupModalCloseHandlers(modal) {
    // Botón X
    document.getElementById('btn-close-contacts')?.addEventListener('click', closeContactsModal);
    
    // Botón Cerrar del footer
    document.getElementById('btn-close-contacts-footer')?.addEventListener('click', closeContactsModal);
    
    // Clic fuera del modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeContactsModal();
        }
    });
    
    // Tecla Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeContactsModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Cierra el modal de contactos
 */
function closeContactsModal() {
    const modal = document.getElementById('contacts-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}