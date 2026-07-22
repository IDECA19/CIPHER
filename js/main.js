// js/main.js - Punto de entrada de la aplicación (Fase 2.1 + P2P + Archivos)

import { APP_CONFIG, DEVELOPER_PIN } from './config.js';
import { initDatabase, getIdentity, saveIdentity } from './core/storage.js';
import { generateNewIdentity } from './core/identity.js';
import { addOrUpdateContact } from './services/contacts.js';
import { renderChatList } from './ui/chat_list.js';
import { openChatWindow, handleSendMessage, closeChatWindow } from './ui/chat_window.js';
import { openContactsModal } from './ui/contacts_modal.js';
import { initP2PNetwork, registerMessageHandler, registerFileChunkHandler } from './network/p2p.js';
import { receiveP2PMessage, receiveFileChunk, receiveFileMetadata } from './services/messaging.js';

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

function setupEventListeners() {
    document.getElementById('btn-copy-pin')?.addEventListener('click', async () => {
        const pin = document.getElementById('my-pin-display')?.textContent;
        if (pin && pin !== '---') {
            try {
                await navigator.clipboard.writeText(pin);
                showToast('PIN copiado al portapapeles', 'success');
            } catch (err) {
                showToast('Error al copiar el PIN', 'error');
            }
        }
    });

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

    document.getElementById('btn-contacts')?.addEventListener('click', async () => {
        await openContactsModal();
    });

    document.getElementById('btn-settings')?.addEventListener('click', () => {
        showToast('Ajustes - Próximamente en Fase 2', 'info');
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

    document.getElementById('btn-back')?.addEventListener('click', () => {
        closeChatWindow();
    });
}

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
            await addOrUpdateContact(DEVELOPER_PIN, "Soporte CipherChat");
            showToast(`¡Bienvenido! Tu PIN es: ${identity.pinFormatted}`, 'success');
        } else {
            console.log(`✅ Identidad existente: ${identity.pinFormatted}`);
        }
        
        displayUserPin(identity.pinFormatted);
        setupEventListeners();
        
        updateSplashStatus('Cargando chats...');
        await renderChatList(openChatWindow);
        
        // 🚀 PASO 6: Inicializar red P2P y handlers (ESTO FALTABA)
        updateSplashStatus('Conectando a la red P2P...');
        try {
            await initP2PNetwork();
            
            // Handler para mensajes de texto y metadatos
            registerMessageHandler(identity.pin, async (data) => {
                if (data.type === 'file-metadata') {
                    await receiveFileMetadata(data.metadata);
                } else {
                    await receiveP2PMessage(data);
                }
            });
            
            // Handler especial para chunks de archivos
            registerFileChunkHandler(receiveFileChunk);
            
            showToast('Conectado a la red P2P', 'success');
        } catch (error) {
            console.warn('⚠️ Red P2P no disponible (modo offline):', error.message);
            showToast('Modo offline: mensajes se guardan localmente', 'warning');
        }
        
        setTimeout(() => {
            showApp();
            showToast('CipherChat listo para usar', 'success');
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