// js/main.js - Punto de entrada de la aplicación

import { APP_CONFIG, DEVELOPER_PIN } from './config.js';
import { initDatabase, getIdentity, saveIdentity } from './core/storage.js';
import { generateNewIdentity } from './core/identity.js';
import { formatPin } from './utils/formatter.js';

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

/**
 * Actualiza el estado del splash screen
 */
function updateSplashStatus(message) {
    const status = document.getElementById('splash-status');
    if (status) status.textContent = message;
}

/**
 * Oculta el splash y muestra la app
 */
function showApp() {
    const splash = document.getElementById('splash-screen');
    const app = document.getElementById('app');
    
    splash.classList.add('hidden');
    app.classList.remove('hidden');
}

/**
 * Muestra el PIN del usuario en la UI
 */
function displayUserPin(pinFormatted) {
    const myPinElements = document.querySelectorAll('#my-pin, #my-pin-display');
    myPinElements.forEach(el => {
        if (el) el.textContent = pinFormatted;
    });
}

/**
 * Configura los event listeners básicos
 */
function setupEventListeners() {
    // Copiar PIN al portapapeles
    const btnCopyPin = document.getElementById('btn-copy-pin');
    if (btnCopyPin) {
        btnCopyPin.addEventListener('click', async () => {
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
    }
    
    // Botones del sidebar (placeholder por ahora)
    document.getElementById('btn-new-chat')?.addEventListener('click', () => {
        showToast('Nuevo chat - Próximamente en Fase 1.2', 'info');
    });
    
    document.getElementById('btn-contacts')?.addEventListener('click', () => {
        showToast('Contactos - Próximamente en Fase 1.2', 'info');
    });
    
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        showToast('Ajustes - Próximamente en Fase 1.2', 'info');
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
            showToast(`¡Bienvenido! Tu PIN es: ${identity.pinFormatted}`, 'success');
        } else {
            console.log(`✅ Identidad existente: ${identity.pinFormatted}`);
        }
        
        // Paso 3: Mostrar PIN en la UI
        displayUserPin(identity.pinFormatted);
        
        // Paso 4: Configurar event listeners
        setupEventListeners();
        
        // Paso 5: Mostrar la app
        updateSplashStatus('¡Listo!');
        setTimeout(() => {
            showApp();
            showToast('CipherChat iniciado correctamente', 'success');
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