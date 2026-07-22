// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)
// Versión con logging mejorado y verificación de envío de pendientes

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
    
    peer = new window.Peer(peerId, { debug: 1 });
    
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

function setupConnection(conn) {
    console.log(`🔧 Configurando conexión con ${conn.peer}...`);
    
    conn.on('open', () => {
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        console.log('📊 Estado de conexión:', conn.open ? 'ABIERTA' : 'CERRADA');
        connections.set(conn.peer, conn);
        
        // 🚀 Verificar y enviar mensajes pendientes
        if (pendingMessages.has(conn.peer)) {
            const messages = pendingMessages.get(conn.peer);
            console.log(`📤 Encontrados ${messages.length} mensaje(s) pendiente(s) para ${conn.peer}`);
            console.log('📋 Mensajes pendientes:', messages);
            
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
                console.log('📥 Procesando chunk de archivo...');
                await handler(data);
            } else {
                console.warn('⚠️ No hay handler para file-chunk');
            }
        } else if (data.type === 'file-metadata') {
            const handler = messageHandlers.get(myPin);
            if (handler) {
                console.log('📥 Procesando metadatos de archivo...');
                await handler(data);
            } else {
                console.warn('⚠️ No hay handler para file-metadata');
            }
        } else {
            const handler = messageHandlers.get(myPin);
            if (handler) {
                console.log('📨 Procesando mensaje de texto...');
                await handler(data);
            } else {
                console.warn('⚠️ No hay handler para mi PIN:', myPin);
                console.warn('Handlers disponibles:', Array.from(messageHandlers.keys()));
            }
        }
    });

    conn.on('close', () => {
        console.log('🔌 Conexión cerrada con:', conn.peer);
        connections.delete(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('❌ Error en conexión WebRTC con', conn.peer, ':', err);
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

    let conn = connections.get(targetId);
    
    if (!conn) {
        console.log('🔄 No hay conexión existente. Iniciando nueva conexión WebRTC hacia:', targetId);
        conn = peer.connect(targetId, { reliable: true, serialization: 'json' });
        connections.set(targetId, conn);
        setupConnection(conn);
        
        // Verificar estado inmediato
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
            console.log(`📝 Creada nueva cola de pendientes para ${targetId}`);
        }
        pendingMessages.get(targetId).push(payload);
        console.log(`📝 Mensaje agregado a la cola. Total en cola: ${pendingMessages.get(targetId).length}`);
        console.log('📋 Cola actual de pendientes:', pendingMessages);
        
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
