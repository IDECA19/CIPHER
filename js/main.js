// js/main.js - Punto de entrada de la aplicación (Fase 1.3 + P2P)

import { APP_CONFIG, DEVELOPER_PIN } from './config.js';
import { initDatabase, getIdentity, saveIdentity } from './core/storage.js';
import { generateNewIdentity } from './core/identity.js';
import { addOrUpdateContact } from './services/contacts.js';
import { renderChatList } from './ui/chat_list.js';
import { openChatWindow, handleSendMessage } from './ui/chat_window.js';
import { openContactsModal } from './ui/contacts_modal.js';
import { initP2PNetwork, registerMessageHandler } from './network/p2p.js';
import { receiveP2PMessage } from './services/messaging.js';

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

function setupEventListeners() {
    // Copiar PIN
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

    // Botón Contactos
    document.getElementById('btn-contacts')?.addEventListener('click', async () => {
        await openContactsModal();
    });

    // Botón Ajustes
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        showToast('Ajustes - Próximamente en Fase 2', 'info');
    });

    // Enviar mensaje
    document.getElementById('btn-send')?.addEventListener('click', handleSendMessage);

    // Enter para enviar
    document.getElementById('message-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Escuchar actualizaciones de chat
    window.addEventListener('chat-updated', async () => {
        await renderChatList(openChatWindow);
    });

    // Escuchar evento para abrir chat desde el modal
    window.addEventListener('open-chat', (e) => {
        const { pin, alias } = e.detail;
        openChatWindow(pin, alias);
    });
}

async function initApp() {
    console.log(`🚀 Iniciando ${APP_CONFIG.name} v${APP_CONFIG.version}`);
    console.log(`📞 PIN del desarrollador: ${DEVELOPER_PIN}`);
    
    try {
        // Paso 1: Inicializar base de datos
        updateSplashStatus('Inicializando almacenamiento...');
        await initDatabase();
        
        // Paso 2: Verificar identidad
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
        
        // Paso 3: Mostrar PIN
        displayUserPin(identity.pinFormatted);
        
        // Paso 4: Configurar listeners
        setupEventListeners();
        
        // Paso 5: Cargar lista de chats
        updateSplashStatus('Cargando chats...');
        await renderChatList(openChatWindow);
        
        // Paso 6: Inicializar red P2P
        updateSplashStatus('Conectando a la red P2P...');
        try {
            await initP2PNetwork();
            
            // Registrar handler para mensajes entrantes
            // IMPORTANTE: El PIN se limpia de guiones dentro de registerMessageHandler
            registerMessageHandler(identity.pin, receiveP2PMessage);
            
            showToast('Conectado a la red P2P', 'success');
        } catch (error) {
            console.warn('⚠️ Red P2P no disponible (modo offline):', error.message);
            showToast('Modo offline: mensajes se guardan localmente', 'warning');
        }
        
        // Paso 7: Mostrar la app
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

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
