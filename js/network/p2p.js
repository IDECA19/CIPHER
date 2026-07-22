// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)
// Versión con verificación de peers y manejo de errores mejorado

import { getIdentity } from '../core/storage.js';

let peer = null;
let connections = new Map();
let messageHandlers = new Map();
let pendingMessages = new Map();
let isConnected = false;
let myPin = null;
let myPeerId = null;

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 15000; // 15 segundos para establecer conexión

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
    
    peer = new window.Peer(peerId, { debug: 2 }); // Debug nivel 2 para más información
    
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
                    console.warn(`⚠️ ID "${peerId}" está ocupado. Reintentando...`);
                    setTimeout(() => {
                        connectWithRetry(basePeerId, attempt + 1).then(resolve).catch(reject);
                    }, RETRY_DELAY);
                } else {
                    reject(new Error('ID ocupado después de varios intentos'));
                }
            } else if (err.type === 'network' || err.type === 'server-error') {
                reject(err);
            } else if (err.type === 'peer-unavailable') {
                console.warn('⚠️ Peer no disponible (se reintentará al enviar)');
            }
        });

        peer.on('connection', (conn) => {
            console.log('🔗 Nueva conexión entrante de:', conn.peer);
            setupConnection(conn);
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

/**
 * Verifica si un peer existe en la red
 * @param {string} peerId - ID del peer a verificar
 * @returns {Promise<boolean>} true si el peer existe
 */
async function checkPeerExists(peerId) {
    return new Promise((resolve) => {
        console.log(`🔍 Verificando si el peer ${peerId} existe...`);
        
        const conn = peer.connect(peerId, { reliable: true, serialization: 'json' });
        
        const timeout = setTimeout(() => {
            console.warn(`⏱️ Timeout verificando peer ${peerId}`);
            conn.close();
            resolve(false);
        }, 5000);
        
        conn.on('open', () => {
            clearTimeout(timeout);
            console.log(`✅ Peer ${peerId} existe y está conectado`);
            conn.close(); // Cerrar la conexión de prueba
            resolve(true);
        });
        
        conn.on('error', (err) => {
            clearTimeout(timeout);
            console.warn(`❌ Peer ${peerId} no disponible:`, err.type);
            resolve(false);
        });
    });
}

function setupConnection(conn) {
    console.log(`🔧 Configurando conexión con ${conn.peer}...`);
    
    // Timeout para establecer la conexión
    const connectionTimeout = setTimeout(() => {
        if (!conn.open) {
            console.error(`⏱️ Timeout: La conexión con ${conn.peer} no se estableció en ${CONNECTION_TIMEOUT/1000}s`);
            conn.close();
            connections.delete(conn.peer);
        }
    }, CONNECTION_TIMEOUT);
    
    conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        console.log('📊 Estado de conexión:', conn.open ? 'ABIERTA' : 'CERRADA');
        connections.set(conn.peer, conn);
        
        // Enviar mensajes pendientes si los hay
        if (pendingMessages.has(conn.peer)) {
            const messages = pendingMessages.get(conn.peer);
            console.log(`📤 Encontrados ${messages.length} mensaje(s) pendiente(s) para ${conn.peer}`);
            
            let sentCount = 0;
            messages.forEach((payload, index) => {
                try {
                    console.log(`📤 Enviando mensaje pendiente ${index + 1}/${messages.length}...`);
                    conn.send(payload);
                    sentCount++;
                    console.log(`✅ Mensaje pendiente ${index + 1} enviado`);
                } catch (e) {
                    console.error(`❌ Error enviando mensaje pendiente ${index + 1}:`, e);
                }
            });
            
            pendingMessages.delete(conn.peer);
            console.log(`✅ ${sentCount}/${messages.length} mensajes pendientes enviados`);
        } else {
            console.log(`ℹ️ No hay mensajes pendientes para ${conn.peer}`);
        }
    });

    conn.on('data', async (data) => {
        console.log('📨 Datos recibidos de', conn.peer, ':', data);
        
        if (data.type === 'file-chunk') {
            const handler = messageHandlers.get('file-chunk');
            if (handler) {
                await handler(data);
            } else {
                console.warn('⚠️ No hay handler para file-chunk');
            }
        } else if (data.type === 'file-metadata') {
            const handler = messageHandlers.get(myPin);
            if (handler) {
                await handler(data);
            } else {
                console.warn('⚠️ No hay handler para file-metadata');
            }
        } else {
            const handler = messageHandlers.get(myPin);
            if (handler) {
                await handler(data);
            } else {
                console.warn('⚠️ No hay handler para mi PIN:', myPin);
            }
        }
    });

    conn.on('close', () => {
        console.log('🔌 Conexión cerrada con:', conn.peer);
        connections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('❌ Error en conexión WebRTC con', conn.peer, ':', err);
        clearTimeout(connectionTimeout);
        connections.delete(conn.peer);
    });
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

    // 🚀 NUEVO: Verificar si el peer existe antes de intentar conectar
    const peerExists = await checkPeerExists(targetId);
    
    if (!peerExists) {
        console.error(`❌ El peer ${targetId} NO existe o no está en línea`);
        console.error(`💡 Posibles causas:`);
        console.error(`   1. El destinatario no tiene la app abierta`);
        console.error(`   2. El destinatario tiene un PIN diferente`);
        console.error(`   3. Problemas de conectividad (firewall/NAT)`);
        throw new Error('Destinatario no disponible');
    }

    let conn = connections.get(targetId);
    
    if (!conn) {
        console.log('🔄 No hay conexión existente. Iniciando nueva conexión WebRTC hacia:', targetId);
        conn = peer.connect(targetId, { reliable: true, serialization: 'json' });
        connections.set(targetId, conn);
        setupConnection(conn);
        
        console.log('📊 Estado inmediato de la conexión:', conn.open ? 'ABIERTA' : 'CERRADA');
    } else {
        console.log('✅ Usando conexión existente con:', targetId);
        console.log('📊 Estado de la conexión:', conn.open ? 'ABIERTA' : 'CERRADA');
    }

    if (conn.open) {
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
        console.log(`📝 Mensaje agregado a la cola. Total en cola: ${pendingMessages.get(targetId).length}`);
        
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
        peer.destroy();
        peer = null;
        isConnected = false;
        myPeerId = null;
        console.log('🛑 Red P2P detenida');
    }
}
