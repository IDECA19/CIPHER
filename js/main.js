// js/main.js - Punto de entrada de la aplicación

import { APP_CONFIG, DEVELOPER_PIN } from './config.js';
import { initDatabase, getIdentity, saveIdentity } from './core/storage.js';
import { generateNewIdentity } from './core/identity.js';
import { addOrUpdateContact } from './services/contacts.js';
import { renderChatList } from './ui/chat_list.js';
import { openChatWindow, handleSendMessage } from './ui/chat_window.js';
import { openContactsModal } from './ui/contacts_modal.js';

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
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
    const splash = document.getElementById('splash-screen');
    const app = document.getElementById('app');
    if (splash) splash.classList.add('hidden');
    if (app) app.classList.remove('hidden');
}

function displayUserPin(pinFormatted) {
    document.querySelectorAll('#my-pin, #my-pin-display').forEach(el => {
        if (el) el.textContent = pinFormatted;
    });
}

function setupEventListeners() {
    document.getElementById('btn-copy-pin')?.addEventListener('click', async () => {
        const pin = document.getElementById('my-pin-display')?.textContent;
        if (pin && pin !== '---') {
            await navigator.clipboard.writeText(pin);
            showToast('PIN copiado al portapapeles', 'success');
        }
    });

    document.getElementById('btn-new-chat')?.addEventListener('click', async () => {
        const pin = prompt("Ingresa el PIN del contacto (ej: ABC-1234-XXX):");
        if (!pin) return;
        
        const alias = prompt("¿Cómo quieres llamar a este contacto?:");
        if (!alias) return;

        try {
            await addOrUpdateContact(pin, alias);
            showToast(`Contacto ${alias} agregado`, 'success');
            await renderChatList(openChatWindow);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    document.getElementById('btn-contacts')?.addEventListener('click', async () => {
        await openContactsModal();
    });

    document.getElementById('btn-send')?.addEventListener('click', handleSendMessage);

    document.getElementById('message-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    window.addEventListener('chat-updated', async () => {
        await renderChatList(openChatWindow);
    });

    window.addEventListener('open-chat', (e) => {
        const { pin, alias } = e.detail;
        openChatWindow(pin, alias);
    });
}

async function initApp() {
    console.log(`🚀 Iniciando ${APP_CONFIG.name} v${APP_CONFIG.version}`);
    
    try {
        updateSplashStatus('Inicializando base de datos...');
        await initDatabase();
        
        updateSplashStatus('Comprobando identidad...');
        let identity = await getIdentity();
        
        if (!identity) {
            updateSplashStatus('Generando tu identidad criptográfica...');
            identity = await generateNewIdentity();
            await saveIdentity(identity);
            await addOrUpdateContact(DEVELOPER_PIN, "Soporte CipherChat");
            showToast(`¡Bienvenido! Tu PIN es: ${identity.pinFormatted}`, 'success');
        }
        
        displayUserPin(identity.pinFormatted);
        setupEventListeners();
        
        updateSplashStatus('Cargando lista de chats...');
        await renderChatList(openChatWindow);
        
        updateSplashStatus('Conectando a la red P2P...');
        try {
            const { initP2PNetwork, registerMessageHandler } = await import('./network/p2p.js');
            const { receiveP2PMessage } = await import('./services/messaging.js');
            
            await initP2PNetwork();
            registerMessageHandler(identity.pin, receiveP2PMessage);
            
            const statusEl = document.getElementById('connection-status');
            if (statusEl) statusEl.textContent = 'En línea (P2P)';
            
            showToast('Conectado a la red P2P correctamente', 'success');
        } catch (p2pError) {
            console.warn('⚠️ No se pudo conectar a la red P2P:', p2pError.message);
            const statusEl = document.getElementById('connection-status');
            if (statusEl) statusEl.textContent = 'Offline';
            
            showToast('Modo offline: ' + p2pError.message, 'warning');
        }
        
        setTimeout(() => {
            showApp();
        }, 500);
        
        console.log("🎉 CipherChat listo para usar");
        
    } catch (error) {
        console.error("❌ Error crítico en la app:", error);
        updateSplashStatus('Error crítico: ' + error.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
