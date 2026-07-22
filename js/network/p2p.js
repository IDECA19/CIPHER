// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)
// Versión corregida: busca handler por MI PIN, no por el del remitente

import { getIdentity } from '../core/storage.js';

let peer = null;
let connections = new Map();
let messageHandlers = new Map();
let isConnected = false;
let myPin = null; // PIN del usuario local (sin guiones, mayúsculas)

/**
 * Inicializa la conexión P2P con PeerJS
 */
export async function initP2PNetwork() {
    console.log('🌐 Inicializando red P2P con WebRTC (PeerJS)...');
    
    const identity = await getIdentity();
    if (!identity) {
        throw new Error('No se encontró identidad del usuario');
    }

    // Guardar el PIN del usuario local (sin guiones, mayúsculas)
    myPin = identity.pin.replace(/-/g, '').toUpperCase();
    
    // Usamos el PIN sin guiones y en minúsculas como ID único de Peer
    const peerId = identity.pin.replace(/-/g, '').toLowerCase();
    
    console.log('🆔 ID WebRTC asignado:', peerId);
    console.log('📝 Mi PIN para handlers:', myPin);
    
    // Inicializar PeerJS
    peer = new window.Peer(peerId, {
        debug: 1
    });

    return new Promise((resolve, reject) => {
        peer.on('open', (id) => {
            console.log('✅ Nodo P2P iniciado y registrado. ID:', id);
            isConnected = true;
            resolve(peer);
        });

        peer.on('error', (err) => {
            console.error('❌ Error en PeerJS:', err.type, err.message);
            
            if (err.type === 'unavailable-id') {
                console.warn('⚠️ ID en uso, reintentando con sufijo...');
                const fallbackId = peerId + Math.random().toString(36).slice(2, 5);
                peer = new window.Peer(fallbackId, { debug: 1 });
            } else if (err.type === 'network' || err.type === 'server-error') {
                console.warn('⚠️ Error de red/servidor de señalización.');
                reject(err);
            }
        });

        peer.on('connection', (conn) => {
            console.log('🔗 Nueva conexión entrante de:', conn.peer);
            setupConnection(conn);
        });

        peer.on('disconnected', () => {
            console.warn('⚠️ Desconectado del servidor de señalización. Reconectando...');
            peer.reconnect();
        });

        peer.on('close', () => {
            console.log('🔴 Peer cerrado');
            isConnected = false;
        });
    });
}

/**
 * Configura los event listeners de una conexión WebRTC
 */

function setupConnection(conn) {
    conn.on('open', () => {
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        connections.set(conn.peer, conn);
    });

    conn.on('data', async (data) => {
        // Determinar el tipo de mensaje
        if (data.type === 'file-chunk') {
            // Es un chunk de archivo
            console.log(`📥 Chunk de archivo recibido: ${data.chunkIndex + 1}/${data.totalChunks}`);
            
            // Llamar al handler de archivos
            const handler = messageHandlers.get('file-chunk');
            if (handler) {
                await handler(data);
            }
        } else {
            // Es un mensaje de texto normal
            console.log('📨 Mensaje recibido vía WebRTC P2P:', data);
            const handler = messageHandlers.get(myPin);
            if (handler) {
                handler(data);
            } else {
                console.warn('⚠️ No hay handler registrado para mi PIN:', myPin);
            }
        }
    });

    conn.on('close', () => {
        console.log('🔌 Conexión cerrada con:', conn.peer);
        connections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('❌ Error en conexión WebRTC:', err);
        connections.delete(conn.peer);
    });
}
/**
 * Envía un mensaje o chunk a un peer específico
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

    let conn = connections.get(targetId);
    
    if (!conn) {
        console.log('🔄 Iniciando nueva conexión WebRTC hacia:', targetId);
        conn = peer.connect(targetId, { 
            reliable: true,
            serialization: 'json'
        });
        connections.set(targetId, conn);
        setupConnection(conn);
        
        await new Promise((resolve) => {
            const openHandler = () => {
                conn.off('open', openHandler);
                resolve();
            };
            conn.on('open', openHandler);
            setTimeout(() => {
                conn.off('open', openHandler);
                resolve();
            }, 5000);
        });
    }

    if (conn.open) {
        conn.send(payload);
        if (messageData.type !== 'file-chunk') {
            console.log(`✅ Mensaje enviado P2P a ${targetPin}`);
        }
    } else {
        console.warn('⚠️ El destinatario no está en línea.');
        throw new Error('Destinatario offline');
    }
}

/**
 * Envía un archivo completo (metadatos + chunks) a un peer
 * @param {string} targetPin - PIN del destinatario
 * @param {Object} fileData - Datos del archivo (metadata + chunks)
 * @param {Function} onProgress - Callback de progreso (0-100)
 */
export async function sendFile(targetPin, fileData, onProgress = null) {
    const { metadata, chunks } = fileData;
    
    // 1. Enviar primero los metadatos del archivo
    await sendMessage(targetPin, {
        type: 'file-metadata',
        fileId: metadata.id,
        metadata: metadata
    });
    
    // 2. Enviar cada chunk con una pequeña pausa para no saturar
    for (let i = 0; i < chunks.length; i++) {
        await sendMessage(targetPin, {
            type: 'file-chunk',
            fileId: metadata.id,
            chunkIndex: i,
            chunkData: chunks[i],
            totalChunks: chunks.length
        });
        
        // Reportar progreso
        if (onProgress) {
            const progress = Math.round(((i + 1) / chunks.length) * 100);
            onProgress(progress);
        }
        
        // Pausa pequeña entre chunks (5ms) para no saturar WebRTC
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    
    console.log(`✅ Archivo completo enviado: ${metadata.name}`);
}

/**
 * Registra un handler para mensajes entrantes
 */
export function registerMessageHandler(pin, handler) {
    // Guardar el PIN SIN guiones y en MAYÚSCULAS para consistencia
    const cleanPin = pin.replace(/-/g, '').toUpperCase();
    messageHandlers.set(cleanPin, handler);
    console.log(`📝 Handler registrado para PIN: ${cleanPin}`);
}

export function getConnectionStatus() {
    return isConnected;
}

export function getPeerId() {
    return peer ? peer.id : null;
}

export async function stopP2PNetwork() {
    if (peer) {
        connections.forEach((conn) => conn.close());
        connections.clear();
        peer.destroy();
        peer = null;
        isConnected = false;
        console.log('🛑 Red P2P detenida');
    }
}
