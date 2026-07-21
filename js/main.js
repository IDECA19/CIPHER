// js/main.js - Punto de entrada de la aplicación (Actualizado Fase 1.2)

import { APP_CONFIG, DEVELOPER_PIN } from './config.js';
import { initDatabase, getIdentity, saveIdentity } from './core/storage.js';
import { generateNewIdentity } from './core/identity.js';
import { addOrUpdateContact, getAllContacts } from './services/contacts.js';
import { renderChatList } from './ui/chat_list.js';
import { openChatWindow, handleSendMessage } from './ui/chat_window.js';

/**
 * Muestra un toast de notificación
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateSplashStatus(message) {
    const status = document.getElementById('splash-status');
    if (status) status.textContent = message;
}

function showApp() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}

function displayUserPin(pinFormatted) {
    document.querySelectorAll('#my-pin, #my-pin-display').forEach(el => {
        if (el) el.textContent = pinFormatted;
    });
}

/**
 * Configura todos los event listeners de la UI
 */
function setupEventListeners() {
    // Copiar PIN
    document.getElementById('btn-copy-pin')?.addEventListener('click', async () => {
        const pin = document.getElementById('my-pin-display')?.textContent;
        if (pin && pin !== '---') {
            await navigator.clipboard.writeText(pin);
            showToast('PIN copiado al portapapeles', 'success');
        }
    });

    // Botón Nuevo Chat
    document.getElementById('btn-new-chat')?.addEventListener('click', async () => {
        const pin = prompt("Ingresa el PIN del contacto (ej: ABC-1234-XY):");
        if (!pin) return;
        
        const alias = prompt("¿Cómo quieres llamar a este contacto? (Alias):");
        if (!alias) return;

        try {
            await addOrUpdateContact(pin, alias);
            showToast(`Contacto ${alias} agregado`, 'success');
            await renderChatList(openChatWindow);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Botón Contactos (Muestra lista en consola por ahora)
    document.getElementById('btn-contacts')?.addEventListener('click', async () => {
        const contacts = await getAllContacts();
        console.table(contacts);
        showToast(`Tienes ${contacts.length} contactos guardados`, 'info');
    });

    // Enviar mensaje con botón
    document.getElementById('btn-send')?.addEventListener('click', handleSendMessage);

    // Enviar mensaje con Enter (sin Shift)
    document.getElementById('message-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Escuchar actualizaciones de chat para refrescar la lista lateral
    window.addEventListener('chat-updated', async () => {
        await renderChatList(openChatWindow);
    });
}

/**
 * Inicializa la aplicación
 */
async function initApp() {
    console.log(`🚀 Iniciando ${APP_CONFIG.name} v${APP_CONFIG.version}`);
    console.log(`📞 PIN del desarrollador: ${DEVELOPER_PIN}`);
    
    try {
        updateSplashStatus('Inicializando almacenamiento...');
        await initDatabase();
        
        updateSplashStatus('Verificando identidad...');
        let identity = await getIdentity();
        
        if (!identity) {
            updateSplashStatus('Generando tu identidad única...');
            identity = await generateNewIdentity();
            await saveIdentity(identity);
            
            // Agregar al desarrollador como contacto por defecto
            await addOrUpdateContact(DEVELOPER_PIN, "Soporte CipherChat");
            
            showToast(`¡Bienvenido! Tu PIN es: ${identity.pinFormatted}`, 'success');
        }
        
        displayUserPin(identity.pinFormatted);
        setupEventListeners();
        
        updateSplashStatus('Cargando chats...');
        await renderChatList(openChatWindow);
        
        setTimeout(() => {
            showApp();
            showToast('CipherChat listo para usar', 'success');
 is ready', 'success');
        }, 500);
        
        console.log("🎉 Aplicación inicializada correctamente");
        
    } catch (error) {
        console.error("❌ Error inicializando la app:", error);
        updateSplashStatus('Error: ' + error.message);
        showToast('Error al iniciar la aplicación', 'error');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}