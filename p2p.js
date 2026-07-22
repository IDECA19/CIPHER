// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)
// Versión con cola de mensajes pendientes para handshakes lentos

import { getIdentity } from '../core/storage.js';

let peer = null;
let connections = new Map();
let messageHandlers = new Map();
let pendingMessages = new Map(); // 🚀 NUEVO: targetId -> Array of payloads
let isConnected = false;
let myPin = null;

/**
 * Inicializa la conexión P2P con PeerJS
 */
export async function initP2PNetwork() {
    console.log('🌐 Inicializando red P2P con WebRTC (PeerJS)...');
    
    const identity = await getIdentity();
    if (!identity) {
        throw new Error('No se encontró identidad del usuario');
    }

    myPin = identity.pin.replace(/-/g, '').toUpperCase();
    const peerId = identity.pin.replace(/-/g, '').toLowerCase();
    
    console.log('🆔 ID WebRTC asignado:', peerId);
    console.log('📝 Mi PIN para handlers:', myPin);
    
    peer = new window.Peer(peerId, { debug: 1 });

    return new Promise((resolve, reject) => {
        peer.on('open', (id) => {
            console.log('✅ Nodo P2P iniciado y registrado. ID:', id);
            isConnected = true;
            resolve(peer);
        });

        peer.on('error', (err) => {
            console.error('❌ Error en PeerJS:', err.type, err.message);
            if (err.type === 'unavailable-id') {
                const fallbackId = peerId + Math.random().toString(36).slice(2, 5);
                peer = new window.Peer(fallbackId, { debug: 1 });
            } else if (err.type === 'network' || err.type === 'server-error') {
                reject(err);
            }
        });

        peer.on('connection', (conn) => {
            console.log('🔗 Nueva conexión entrante de:', conn.peer);
            setupConnection(conn);
        });

        peer.on('disconnected', () => peer.reconnect());
        peer.on('close', () => { isConnected = false; });
    });
}

/**
 * Configura los event listeners de una conexión WebRTC
 */
function setupConnection(conn) {
    conn.on('open', () => {
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        connections.set(conn.peer, conn);
        
        // 🚀 NUEVO: Enviar mensajes pendientes si los hay
        if (pendingMessages.has(conn.peer)) {
            const messages = pendingMessages.get(conn.peer);
            console.log(`📤 Enviando ${messages.length} mensaje(s) pendiente(s) a ${conn.peer}`);
            messages.forEach(payload => {
                try { conn.send(payload); } catch (e) { console.error(e); }
            });
            pendingMessages.delete(conn.peer);
        }
    });

    conn.on('data', async (data) => {
        if (data.type === 'file-chunk') {
            const handler = messageHandlers.get('file-chunk');
            if (handler) await handler(data);
        } else if (data.type === 'file-metadata') {
            const handler = messageHandlers.get(myPin);
            if (handler) await handler(data);
        } else {
            const handler = messageHandlers.get(myPin);
            if (handler) await handler(data);
        }
    });

    conn.on('close', () => connections.delete(conn.peer));
    conn.on('error', (err) => connections.delete(conn.peer));
}

/**
 * Envía un mensaje a un peer específico
 */
export async function sendMessage(targetPin, messageData) {
    if (!isConnected || !peer) throw new Error('Red P2P no está conectada');

    const targetId = targetPin.replace(/-/g, '').toLowerCase();
    const identity = await getIdentity();
    
    const payload = {
        ...messageData,
        senderPin: identity.pin,
        timestamp: Date.now()
    };

    let conn = connections.get(targetId);
    
    if (!conn) {
        console.log('🔄 Iniciando nueva conexión WebRTC hacia:', targetId);
        conn = peer.connect(targetId, { reliable: true, serialization: 'json' });
        connections.set(targetId, conn);
        setupConnection(conn);
    }

    if (conn.open) {
        conn.send(payload);
        if (messageData.type !== 'file-chunk') {
            console.log(`✅ Mensaje enviado P2P a ${targetPin}`);
        }
    } else {
        // 🚀 NUEVO: Si no está abierta, encolar el mensaje
        console.warn(`⏳ Conexión con ${targetPin} aún no está abierta. Guardando en cola...`);
        if (!pendingMessages.has(targetId)) pendingMessages.set(targetId, []);
        pendingMessages.get(targetId).push(payload);
        
        const error = new Error('Conexión pendiente');
        error.isPending = true; // Bandera para que messaging.js no lo trate como error grave
        throw error;
    }
}

export async function sendFile(targetPin, fileData, onProgress = null) {
    const { metadata, chunks } = fileData;
    await sendMessage(targetPin, { type: 'file-metadata', fileId: metadata.id, metadata: metadata });
    for (let i = 0; i < chunks.length; i++) {
        await sendMessage(targetPin, { type: 'file-chunk', fileId: metadata.id, chunkIndex: i, chunkData: chunks[i], totalChunks: chunks.length });
        if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

export function registerMessageHandler(pin, handler) {
    const cleanPin = pin.replace(/-/g, '').toUpperCase();
    messageHandlers.set(cleanPin, handler);
}

export function registerFileChunkHandler(handler) {
    messageHandlers.set('file-chunk', handler);
}

export function getConnectionStatus() { return isConnected; }
export function getPeerId() { return peer ? peer.id : null; }

export async function stopP2PNetwork() {
    if (peer) {
        connections.forEach((conn) => conn.close());
        connections.clear();
        peer.destroy();
        peer = null;
        isConnected = false;
    }
}