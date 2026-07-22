// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)

import { getIdentity } from '../core/storage.js';

let peer = null;
let connections = new Map(); // peerId -> DataConnection
let messageHandlers = new Map(); // pin -> handler function
let isConnected = false;

/**
 * Inicializa la conexión P2P
 * @returns {Promise<Object>} Instancia de Peer
 */
export async function initP2PNetwork() {
    console.log('🌐 Inicializando red P2P con WebRTC (PeerJS)...');
    
    const identity = await getIdentity();
    if (!identity) {
        throw new Error('No se encontró identidad del usuario');
    }

    // Usamos el PIN sin guiones y en minúsculas como ID de Peer
    const peerId = identity.pin.replace(/-/g, '').toLowerCase();
    
    // Inicializar PeerJS (usa el servidor público gratuito SOLO para señalización)
    // Los mensajes NUNCA pasan por este servidor, es 100% P2P WebRTC directo
    peer = new window.Peer(peerId, {
        debug: 1 // 0 = off, 1 = errors, 2 = warnings, 3 = all
    });

    return new Promise((resolve, reject) => {
        peer.on('open', (id) => {
            console.log('✅ Nodo P2P iniciado. ID WebRTC:', id);
            isConnected = true;
            resolve(peer);
        });

        peer.on('error', (err) => {
            console.error('❌ Error en PeerJS:', err);
            if (err.type === 'unavailable-id') {
                console.warn('⚠️ ID no disponible (colisión extrema), usando sufijo aleatorio...');
                // Fallback por si acaso, aunque con 10 chars alfanuméricos es estadísticamente imposible
                const fallbackId = peerId + Math.random().toString(36).slice(2, 5);
                peer = new window.Peer(fallbackId, { debug: 1 });
            } else {
                reject(err);
            }
        });

        // Cuando otro peer nos conecta
        peer.on('connection', (conn) => {
            console.log('🔗 Nueva conexión entrante de:', conn.peer);
            setupConnection(conn);
        });
    });
}

/**
 * Configura los eventos de una conexión WebRTC
 */
function setupConnection(conn) {
    conn.on('open', () => {
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        connections.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
        console.log('📨 Mensaje recibido vía WebRTC P2P:', data);
        // data debe tener { senderPin, text, id, timestamp }
        const handler = messageHandlers.get(data.senderPin);
        if (handler) {
            handler(data);
        }
    });

    conn.on('close', () => {
        console.log('🔌 Conexión cerrada con:', conn.peer);
        connections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('❌ Error en conexión WebRTC:', err);
    });
}

/**
 * Envía un mensaje a un peer específico
 * @param {string} targetPin - PIN del destinatario
 * @param {Object} messageData - Datos del mensaje
 */
export async function sendMessage(targetPin, messageData) {
    if (!isConnected || !peer) {
        throw new Error('Red P2P no está conectada');
    }

    const targetId = targetPin.replace(/-/g, '').toLowerCase();
    const identity = await getIdentity();
    
    const payload = {
        ...messageData,
        senderPin: identity.pin,
        timestamp: Date.now()
    };

    // Si ya tenemos la conexión, la usamos
    let conn = connections.get(targetId);
    
    if (!conn) {
        console.log('🔄 Iniciando nueva conexión WebRTC hacia:', targetId);
        conn = peer.connect(targetId, {
            reliable: true // Garantiza la entrega del mensaje
        });
        connections.set(targetId, conn);
        setupConnection(conn);
        
        // Esperar a que la conexión se abra antes de enviar
        await new Promise((resolve) => {
            conn.on('open', resolve);
            // Timeout de seguridad por si el otro peer está offline
            setTimeout(() => resolve(), 3000);
        });
    }

    if (conn.open) {
        conn.send(payload);
        console.log(`✅ Mensaje enviado P2P a ${targetPin}`);
    } else {
        console.warn('⚠️ El destinatario no está en línea. Mensaje guardado localmente.');
        throw new Error('Destinatario offline');
    }
}

/**
 * Registra un handler para mensajes entrantes de un PIN específico
 */
export function registerMessageHandler(pin, handler) {
    messageHandlers.set(pin, handler);
    console.log(`📝 Handler registrado para PIN: ${pin}`);
}

export function getConnectionStatus() {
    return isConnected;
}

export async function stopP2PNetwork() {
    if (peer) {
        peer.destroy();
        isConnected = false;
        console.log('🛑 Red P2P detenida');
    }
}