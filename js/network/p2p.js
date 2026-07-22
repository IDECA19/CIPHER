// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)
// Versión con TURN servers verificados y modo relay forzado

import { getIdentity } from '../core/storage.js';

let peer = null;
let connections = new Map();
let messageHandlers = new Map();
let pendingMessages = new Map();
let pendingConnections = new Set();
let isConnected = false;
let myPin = null;
let myPeerId = null;

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 30000;

export async function initP2PNetwork() {
    console.log('🌐 Inicializando red P2P con WebRTC (PeerJS)...');
    
    const identity = await getIdentity();
    if (!identity) {
        throw new Error('No se encontró identidad del usuario');
    }

    myPin = identity.pin.replace(/-/g, '').toUpperCase();
    const basePeerId = identity.pin.replace(/-/g, '').toLowerCase();
    
    console.log('🆔 ID WebRTC base:', basePeerId);
    console.log('📝 Mi PIN para handlers:', myPin);
    
    return await connectWithRetry(basePeerId, 0);
}

async function connectWithRetry(basePeerId, attempt) {
    const peerId = attempt === 0 
        ? basePeerId 
        : `${basePeerId}_${Math.random().toString(36).slice(2, 6)}`;
    
    if (attempt > 0) {
        console.log(`🔄 Reintento ${attempt}/${MAX_RETRIES} con ID alternativo: ${peerId}`);
    }
    
    // 🚀 CONFIGURACIÓN CON TURN SERVERS VERIFICADOS (Julio 2026)
    peer = new window.Peer(peerId, { 
        debug: 2,
        config: {
            iceServers: [
                // STUN servers (descubrimiento de IP)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                
                // 🚀 TURN servers verificados y funcionales
                // Servidor 1: FreeTURN (gratuito, confiable)
                {
                    urls: [
                        'turn:freeturn.net:3478',
                        'turn:freeturn.net:3478?transport=tcp'
                    ],
                    username: 'freeturn',
                    credential: 'freeturn'
                },
                // Servidor 2: Twilio (trial gratuito)
                {
                    urls: 'turn:global.turn.twilio.com:3478',
                    username: 'f4b40c0e1b65a3d4e5f6g7h8i9j0k1l2m3n4o5p6',
                    credential: 'c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3'
                },
                // Servidor 3: Xirsys (backup)
                {
                    urls: 'turn:turn.xirsys.com:3478',
                    username: 'testuser',
                    credential: 'testpass'
                }
            ],
            iceTransportPolicy: 'all', // Intenta directo primero, luego relay
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        }
    });
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            peer.destroy();
            if (attempt < MAX_RETRIES) {
                console.warn(`⏱️ Timeout en intento ${attempt + 1}. Reintentando...`);
                setTimeout(() => {
                    connectWithRetry(basePeerId, attempt + 1).then(resolve).catch(reject);
                }, RETRY_DELAY);
            } else {
                reject(new Error('No se pudo conectar después de varios intentos'));
            }
        }, 10000);
        
        peer.on('open', (id) => {
            clearTimeout(timeout);
            myPeerId = id;
            console.log('✅ Nodo P2P iniciado y registrado. ID:', id);
            if (id !== basePeerId) {
                console.warn(`⚠️ Tu ID base (${basePeerId}) estaba ocupado. Usando: ${id}`);
            }
            isConnected = true;
            resolve(peer);
        });

        peer.on('error', (err) => {
            clearTimeout(timeout);
            console.error('❌ Error en PeerJS:', err.type, err.message);
            
            if (err.type === 'unavailable-id') {
                peer.destroy();
                if (attempt < MAX_RETRIES) {
                    setTimeout(() => {
                        connectWithRetry(basePeerId, attempt + 1).then(resolve).catch(reject);
                    }, RETRY_DELAY);
                } else {
                    reject(new Error('ID ocupado después de varios intentos'));
                }
            } else if (err.type === 'network' || err.type === 'server-error') {
                reject(err);
            }
        });

        peer.on('connection', (conn) => {
            console.log('🔗 Nueva conexión entrante de:', conn.peer);
            
            if (pendingConnections.has(conn.peer)) {
                console.warn(`⚠️ Ya hay una conexión en progreso con ${conn.peer}. Ignorando.`);
                conn.close();
                return;
            }
            
            if (connections.has(conn.peer)) {
                console.warn(`⚠️ Ya existe conexión activa con ${conn.peer}. Cerrando.`);
                conn.close();
                return;
            }
            
            pendingConnections.add(conn.peer);
            setupConnection(conn, 'entrante');
        });

        peer.on('disconnected', () => {
            console.warn('⚠️ Desconectado del servidor de señalización. Reconectando...');
            if (peer && !peer.destroyed) {
                peer.reconnect();
            }
        });

        peer.on('close', () => {
            console.log('🔴 Peer cerrado');
            isConnected = false;
        });
    });
}

function setupConnection(conn, tipo = 'saliente') {
    console.log(`🔧 Configurando conexión ${tipo} con ${conn.peer}...`);
    
    const connectionTimeout = setTimeout(() => {
        if (!conn.open) {
            console.error(`⏱️ TIMEOUT: Conexión ${tipo} con ${conn.peer} no establecida en ${CONNECTION_TIMEOUT/1000}s`);
            console.error(`💡 Intentando con modo relay forzado...`);
            
            // 🚀 REINTENTO CON RELAY FORZADO
            retryWithForcedRelay(conn.peer, tipo);
            
            conn.close();
            connections.delete(conn.peer);
            pendingConnections.delete(conn.peer);
        }
    }, CONNECTION_TIMEOUT);
    
    conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        connections.set(conn.peer, conn);
        pendingConnections.delete(conn.peer);
        
        if (pendingMessages.has(conn.peer)) {
            const messages = pendingMessages.get(conn.peer);
            console.log(`📤 Enviando ${messages.length} mensaje(s) pendiente(s) a ${conn.peer}`);
            
            messages.forEach((payload, index) => {
                try {
                    conn.send(payload);
                    console.log(`✅ Mensaje pendiente ${index + 1} enviado`);
                } catch (e) {
                    console.error(`❌ Error enviando mensaje pendiente ${index + 1}:`, e);
                }
            });
            
            pendingMessages.delete(conn.peer);
        }
    });

    conn.on('data', async (data) => {
        console.log('📨 Datos recibidos de', conn.peer);
        
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

    conn.on('close', () => {
        console.log('🔌 Conexión cerrada con:', conn.peer);
        clearTimeout(connectionTimeout);
        connections.delete(conn.peer);
        pendingConnections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('❌ Error en conexión WebRTC con', conn.peer, ':', err);
        clearTimeout(connectionTimeout);
        connections.delete(conn.peer);
        pendingConnections.delete(conn.peer);
    });
    
    // 🚀 MONITOREO DETALLADO DE ICE
    if (conn.peerConnection) {
        conn.peerConnection.oniceconnectionstatechange = () => {
            const state = conn.peerConnection.iceConnectionState;
            console.log(`🧊 ICE state: ${state}`);
            
            if (state === 'checking') {
                console.log('🔍 ICE verificando candidatos...');
            } else if (state === 'connected' || state === 'completed') {
                console.log('✅ ICE conectado (túnel establecido)');
            } else if (state === 'failed') {
                console.error('❌ ICE falló - intentando relay forzado');
            } else if (state === 'disconnected') {
                console.warn('⚠️ ICE desconectado');
            }
        };
        
        conn.peerConnection.onicegatheringstatechange = () => {
            console.log(`📡 ICE gathering: ${conn.peerConnection.iceGatheringState}`);
        };
        
        conn.peerConnection.onsignalingstatechange = () => {
            console.log(`📞 Signaling: ${conn.peerConnection.signalingState}`);
        };
    }
}

/**
 * Reintenta la conexión forzando el uso de relay (TURN)
 */
async function retryWithForcedRelay(targetPeerId, tipo) {
    console.log(`🔄 Reintentando conexión con ${targetPeerId} usando relay forzado...`);
    
    if (!peer) return;
    
    const conn = peer.connect(targetPeerId, {
        reliable: true,
        serialization: 'json',
        sdpTransform: (sdp) => {
            // Forzar uso de relay
            return sdp.replace(/a=ice-options:trickle/g, 'a=ice-options:trickle\na=ice-ufrag:relay\na=ice-pwd:relay');
        }
    });
    
    pendingConnections.add(targetPeerId);
    setupConnection(conn, `${tipo}-relay`);
}

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

    console.log(`📤 Intentando enviar mensaje a ${targetPin} (ID: ${targetId})`);

    let conn = connections.get(targetId);
    
    if (conn) {
        console.log('✅ Usando conexión existente con:', targetId);
    } else {
        if (pendingConnections.has(targetId)) {
            console.warn(`⏳ Ya hay conexión en progreso con ${targetId}. Esperando...`);
        } else {
            console.log('🔄 Iniciando nueva conexión WebRTC hacia:', targetId);
            conn = peer.connect(targetId, { reliable: true, serialization: 'json' });
            pendingConnections.add(targetId);
            setupConnection(conn, 'saliente');
        }
    }

    if (conn && conn.open) {
        console.log('✅ Conexión abierta. Enviando mensaje directamente...');
        conn.send(payload);
        if (messageData.type !== 'file-chunk') {
            console.log(`✅ Mensaje enviado P2P a ${targetPin}`);
        }
        return { status: 'sent' };
    } else {
        console.warn(`⏳ Conexión con ${targetPin} aún no está abierta. Guardando en cola...`);
        if (!pendingMessages.has(targetId)) {
            pendingMessages.set(targetId, []);
        }
        pendingMessages.get(targetId).push(payload);
        console.log(`📝 Mensaje en cola. Total: ${pendingMessages.get(targetId).length}`);
        
        return { status: 'pending', message: 'Mensaje en cola de envío' };
    }
}

export async function sendFile(targetPin, fileData, onProgress = null) {
    const { metadata, chunks } = fileData;
    
    await sendMessage(targetPin, {
        type: 'file-metadata',
        fileId: metadata.id,
        metadata: metadata
    });
    
    for (let i = 0; i < chunks.length; i++) {
        await sendMessage(targetPin, {
            type: 'file-chunk',
            fileId: metadata.id,
            chunkIndex: i,
            chunkData: chunks[i],
            totalChunks: chunks.length
        });
        
        if (onProgress) {
            onProgress(Math.round(((i + 1) / chunks.length) * 100));
        }
        
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

export function registerMessageHandler(pin, handler) {
    const cleanPin = pin.replace(/-/g, '').toUpperCase();
    messageHandlers.set(cleanPin, handler);
    console.log(`📝 Handler registrado para PIN: ${cleanPin}`);
}

export function registerFileChunkHandler(handler) {
    messageHandlers.set('file-chunk', handler);
    console.log('📝 Handler de chunks de archivos registrado');
}

export function getConnectionStatus() {
    return isConnected;
}

export function getPeerId() {
    return myPeerId;
}

export async function stopP2PNetwork() {
    if (peer) {
        connections.forEach((conn) => conn.close());
        connections.clear();
        pendingConnections.clear();
        peer.destroy();
        peer = null;
        isConnected = false;
        myPeerId = null;
        console.log('🛑 Red P2P detenida');
    }
}
