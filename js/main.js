// js/main.js - Punto de entrada de la aplicación (Actualizado Fase 1.2)

import { APP_CONFIG, DEVELOPER_PIN } from './config.js';
import { initDatabase, getIdentity, saveIdentity } from './core/storage.js';
import { generateNewIdentity } from './core/identity.js';
import { addOrUpdateContact, getAllContacts } from './services/contacts.js';
import { renderChatList } from './ui/chat_list.js';
import { openChatWindow, handleSendMessage } from './ui/chat_window.js';

/**
 * Muestra un toast de notificación
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de toast ('info', 'success', 'warning', 'error')
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

/**
 * Actualiza el estado del splash screen
 * @param {string} message - Mensaje de estado
 */
function updateSplashStatus(message) {
    const status = document.getElementById('splash-status');
    if (status) status.textContent = message;
}

/**
 * Oculta el splash y muestra la app
 */
function showApp() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}

/**
 * Muestra el PIN del usuario en la UI
 * @param {string} pinFormatted - PIN formateado
 */
function displayUserPin(pinFormatted) {
    document.querySelectorAll('#my-pin, #my-pin-display').forEach(el => {
        if (el) el.textContent = pinFormatted;
    });
}

/**
 * Configura todos los event listeners de la UI
 */
function setupEventListeners() {
    // Copiar PIN al portapapeles
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

    // Botón Contactos (Muestra lista en consola por ahora)
    document.getElementById('btn-contacts')?.addEventListener('click', async () => {
        const contacts = await getAllContacts();
        console.table(contacts);
        showToast(`Tienes ${contacts.length} contactos guardados`, 'info');
    });

    // Botón Ajustes (placeholder)
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        showToast('Ajustes - Próximamente en Fase 1.2', 'info');
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
        // Paso 1: Inicializar base de datos
        updateSplashStatus('Inicializando almacenamiento...');
        await initDatabase();
        
        // Paso 2: Verificar si existe identidad
        updateSplashStatus('Verificando identidad...');
        let identity = await getIdentity();
        
        if (!identity) {
            // Primera vez: generar nueva identidad
            updateSplashStatus('Generando tu identidad única...');
            identity = await generateNewIdentity();
            await saveIdentity(identity);
            
            // Agregar al desarrollador como contacto por defecto
            await addOrUpdateContact(DEVELOPER_PIN, "Soporte CipherChat");
            
            showToast(`¡Bienvenido! Tu PIN es: ${identity.pinFormatted}`, 'success');
        } else {
            console.log(`✅ Identidad existente: ${identity.pinFormatted}`);
        }
        
        // Paso 3: Mostrar PIN en la UI
        displayUserPin(identity.pinFormatted);
        
        // Paso 4: Configurar event listeners
        setupEventListeners();
        
        // Paso 5: Cargar lista de chats
        updateSplashStatus('Cargando chats...');
        await renderChatList(openChatWindow);
        
        // Paso 6: Mostrar la app
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
