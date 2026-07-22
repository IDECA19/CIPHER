// js/network/p2p.js - Red P2P usando WebRTC con PeerJS

import { getIdentity } from '../core/storage.js';

let peerInstance = null;
let activeConnections = new Map();
let messageHandlers = new Map();
let isConnected = false;

// Servidores STUN públicos y gratuitos para conexión P2P tras NATs/Routers
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
];

/**
 * Inicializa el nodo P2P
 */
export async function initP2PNetwork() {
    return new Promise(async (resolve, reject) => {
        if (typeof window.Peer !== 'function') {
            return reject(new Error('La librería PeerJS no se ha cargado en el navegador.'));
        }

        const identity = await getIdentity();
        if (!identity) {
            return reject(new Error('No se encontró la identidad del usuario local.'));
        }

        // Se usa el PIN limpio en minúsculas como Peer ID
        const peerId = identity.pin.replace(/-/g, '').toLowerCase();

        console.log('🌐 Inicializando nodo PeerJS con ID:', peerId);

        peerInstance = new window.Peer(peerId, {
            config: {
                iceServers: ICE_SERVERS
            },
            debug: 1
        });

        peerInstance.on('open', (id) => {
            console.log('✅ Conectado a la red P2P con ID:', id);
            isConnected = true;
            resolve(peerInstance);
        });

        peerInstance.on('connection', (conn) => {
            setupConnectionListeners(conn);
        });

        peerInstance.on('error', (err) => {
            console.error('❌ Error en PeerJS:', err);
            if (!isConnected) {
                reject(err);
            }
        });

        peerInstance.on('disconnected', () => {
            console.warn('⚠️ Desconectado de la red P2P. Intentando reconectar...');
            isConnected = false;
            peerInstance.reconnect();
        });
    });
}

/**
 * Registra los escuchadores de eventos para un canal de conexión WebRTC
 */
function setupConnectionListeners(conn) {
    conn.on('open', () => {
        console.log(`🔗 Canal P2P establecido con: ${conn.peer}`);
        activeConnections.set(conn.peer.toUpperCase(), conn);
    });

    conn.on('data', (data) => {
        console.log('📨 Mensaje P2P recibido:', data);
        const handler = messageHandlers.get('default');
        if (handler && typeof handler === 'function') {
            handler(data);
        }
    });

    conn.on('close', () => {
        console.log(`🔌 Conexión P2P cerrada con: ${conn.peer}`);
        activeConnections.delete(conn.peer.toUpperCase());
    });

    conn.on('error', (err) => {
        console.error(`❌ Error en el canal de datos con ${conn.peer}:`, err);
    });
}

/**
 * Envía un payload a un PIN específico
 */
export async function sendMessage(targetPin, messageData) {
    const cleanPin = targetPin.replace(/-/g, '').toLowerCase();

    return new Promise((resolve, reject) => {
        let conn = activeConnections.get(cleanPin.toUpperCase());

        if (conn && conn.open) {
            conn.send(messageData);
            console.log('✅ Mensaje enviado vía canal P2P existente');
            return resolve();
        }

        console.log(`📞 Conectando con el destinatario P2P: ${cleanPin}...`);
        conn = peerInstance.connect(cleanPin, { reliable: true });

        conn.on('open', () => {
            activeConnections.set(cleanPin.toUpperCase(), conn);
            setupConnectionListeners(conn);
            conn.send(messageData);
            console.log('✅ Mensaje enviado tras abrir canal P2P');
            resolve();
        });

        conn.on('error', (err) => {
            console.error('❌ Error al conectar con el destinatario P2P:', err);
            reject(new Error('El destinatario no está en línea en la red P2P.'));
        });
    });
}

/**
 * Registra la función para procesar mensajes entrantes
 */
export function registerMessageHandler(pin, handler) {
    messageHandlers.set('default', handler);
}

export function getConnectionStatus() {
    return isConnected;
}