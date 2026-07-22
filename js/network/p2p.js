// js/network/p2p.js - Módulo de red P2P usando WebRTC (PeerJS)
// PeerJS usa el servidor público gratuito SOLO para señalización inicial.
// Los mensajes viajan DIRECTAMENTE entre navegadores (P2P real).

import { getIdentity } from '../core/storage.js';

// Variables globales del módulo
let peer = null;                          // Instancia principal de PeerJS
let connections = new Map();              // peerId -> DataConnection
let messageHandlers = new Map();          // pin -> handler function
let isConnected = false;

/**
 * Inicializa la conexión P2P con PeerJS
 * @returns {Promise<Object>} Instancia de Peer
 */
export async function initP2PNetwork() {
    console.log('🌐 Inicializando red P2P con WebRTC (PeerJS)...');
    
    const identity = await getIdentity();
    if (!identity) {
        throw new Error('No se encontró identidad del usuario');
    }

    // Usamos el PIN sin guiones y en minúsculas como ID único de Peer
    // Esto garantiza que cada usuario tenga un ID predecible basado en su identidad
    const peerId = identity.pin.replace(/-/g, '').toLowerCase();
    
    console.log('🆔 ID WebRTC asignado:', peerId);
    
    // Inicializar PeerJS
    // El servidor público 0.peerjs.com SOLO se usa para presentación inicial
    // Una vez establecida la conexión WebRTC, los datos viajan directo P2P
    peer = new window.Peer(peerId, {
        debug: 1  // 0=off, 1=errors, 2=warnings, 3=all
    });

    return new Promise((resolve, reject) => {
        // Evento: Peer registrado exitosamente en la red
        peer.on('open', (id) => {
            console.log('✅ Nodo P2P iniciado y registrado. ID:', id);
            isConnected = true;
            resolve(peer);
        });

        // Evento: errores de conexión
        peer.on('error', (err) => {
            console.error('❌ Error en PeerJS:', err.type, err.message);
            
            // Si el ID ya está en uso (colisión extrema), usar sufijo aleatorio
            if (err.type === 'unavailable-id') {
                console.warn('⚠️ ID en uso, reintentando con sufijo...');
                const fallbackId = peerId + Math.random().toString(36).slice(2, 5);
                peer = new window.Peer(fallbackId, { debug: 1 });
                // El nuevo peer disparará 'open' o 'error' nuevamente
            } else if (err.type === 'network' || err.type === 'server-error') {
                console.warn('⚠️ Error de red/servidor de señalización. Modo offline activado.');
                reject(err);
            }
        });

        // Evento: otro peer se conecta a nosotros
        peer.on('connection', (conn) => {
            console.log('🔗 Nueva conexión entrante de:', conn.peer);
            setupConnection(conn);
        });

        // Evento: Peer desconectado del servidor de señalización
        peer.on('disconnected', () => {
            console.warn('⚠️ Desconectado del servidor de señalización. Reconectando...');
            peer.reconnect();
        });

        // Evento: Peer cerrado completamente
        peer.on('close', () => {
            console.log('🔴 Peer cerrado');
            isConnected = false;
        });
    });
}

/**
 * Configura los event listeners de una conexión WebRTC específica
 * @param {DataConnection} conn - Conexión de datos WebRTC
 */
function setupConnection(conn) {
    // Conexión establecida
    conn.on('open', () => {
        console.log('✅ Conexión WebRTC establecida con:', conn.peer);
        connections.set(conn.peer, conn);
    });

    // Datos recibidos (mensajes)
    conn.on('data', (data) => {
        console.log('📨 Mensaje recibido vía WebRTC P2P:', data);
        
        // data debe tener estructura: { senderPin, text, id, timestamp, ... }
        const handler = messageHandlers.get(data.senderPin);
        if (handler) {
            handler(data);
        } else {
            console.warn('⚠️ No hay handler registrado para el PIN:', data.senderPin);
        }
    });

    // Conexión cerrada
    conn.on('close', () => {
        console.log('🔌 Conexión cerrada con:', conn.peer);
        connections.delete(conn.peer);
    });
    
    // Error en la conexión
    conn.on('error', (err) => {
        console.error('❌ Error en conexión WebRTC con', conn.peer, ':', err);
        connections.delete(conn.peer);
    });
}

/**
 * Envía un mensaje a un peer específico
 * @param {string} targetPin - PIN del destinatario (con o sin guiones)
 * @param {Object} messageData - Datos del mensaje a enviar
 * @returns {Promise<void>}
 */
export async function sendMessage(targetPin, messageData) {
    if (!isConnected || !peer) {
        throw new Error('Red P2P no está conectada');
    }

    const targetId = targetPin.replace(/-/g, '').toLowerCase();
    const identity = await getIdentity();
    
    // Construir el payload con metadatos
    const payload = {
        ...messageData,
        senderPin: identity.pin,
        timestamp: Date.now()
    };

    // Verificar si ya tenemos conexión abierta con ese peer
    let conn = connections.get(targetId);
    
    if (!conn) {
        console.log('🔄 Iniciando nueva conexión WebRTC hacia:', targetId);
        
        // Crear nueva conexión al peer destino
        conn = peer.connect(targetId, { 
            reliable: true,      // Garantiza entrega ordenada
            serialization: 'json' // Enviar como JSON
        });
        connections.set(targetId, conn);
        setupConnection(conn);
        
        // Esperar a que la conexión se abra (con timeout de seguridad)
        await new Promise((resolve) => {
            const openHandler = () => {
                conn.off('open', openHandler);
                resolve();
            };
            conn.on('open', openHandler);
            
            // Timeout: si en 5 segundos no se abre, continuar (fallará al enviar)
            setTimeout(() => {
                conn.off('open', openHandler);
                resolve();
            }, 5000);
        });
    }

    // Enviar el mensaje si la conexión está abierta
    if (conn.open) {
        conn.send(payload);
        console.log(`✅ Mensaje enviado P2P a ${targetPin}`);
    } else {
        console.warn('⚠️ El destinatario no está en línea. Mensaje guardado solo localmente.');
        throw new Error('Destinatario offline');
    }
}

/**
 * Registra un handler para mensajes entrantes de un PIN específico
 * @param {string} pin - PIN del remitente esperado
 * @param {Function} handler - Función que procesa el mensaje
 */
export function registerMessageHandler(pin, handler) {
    messageHandlers.set(pin, handler);
    console.log(`📝 Handler registrado para PIN: ${pin}`);
}

/**
 * Elimina un handler registrado
 * @param {string} pin - PIN del handler a eliminar
 */
export function unregisterMessageHandler(pin) {
    messageHandlers.delete(pin);
    console.log(`🗑️ Handler eliminado para PIN: ${pin}`);
}

/**
 * Obtiene el estado de conexión
 * @returns {boolean} true si está conectado
 */
export function getConnectionStatus() {
    return isConnected;
}

/**
 * Obtiene el ID del peer actual
 * @returns {string|null} ID del peer o null
 */
export function getPeerId() {
    return peer ? peer.id : null;
}

/**
 * Obtiene la lista de peers conectados actualmente
 * @returns {Array<string>} Array de IDs de peers conectados
 */
export function getConnectedPeers() {
    return Array.from(connections.keys());
}

/**
 * Cierra una conexión específica con un peer
 * @param {string} targetPin - PIN del peer a desconectar
 */
export function disconnectPeer(targetPin) {
    const targetId = targetPin.replace(/-/g, '').toLowerCase();
    const conn = connections.get(targetId);
    if (conn) {
        conn.close();
        connections.delete(targetId);
        console.log(`🔌 Desconectado de ${targetPin}`);
    }
}

/**
 * Detiene completamente el nodo P2P
 */
export async function stopP2PNetwork() {
    if (peer) {
        // Cerrar todas las conexiones
        connections.forEach((conn) => conn.close());
        connections.clear();
        
        // Destruir el peer
        peer.destroy();
        peer = null;
        isConnected = false;
        console.log('🛑 Red P2P detenida completamente');
    }
}
