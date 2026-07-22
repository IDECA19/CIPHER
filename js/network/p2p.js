// js/network/p2p.js - Módulo de red P2P usando libp2p

import { createLibp2p } from 'libp2p';
import { WebRTC } from '@chainsafe/libp2p-webrtc';
import { WebSockets } from '@libp2p/websockets';
import { KadDHT } from '@libp2p/kad-dht';
import { GossipSub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';

import { NETWORK_CONFIG } from '../config.js';
import { getIdentity } from '../core/storage.js';

// Variables globales del módulo
let libp2pNode = null;
let pubsub = null;
let isConnected = false;
let messageHandlers = new Map(); // PIN -> handler function

/**
 * Inicializa el nodo libp2p
 * @returns {Promise<Object>} Nodo libp2p inicializado
 */
export async function initP2PNetwork() {
    console.log('🌐 Inicializando red P2P...');
    
    try {
        // Obtener identidad del usuario
        const identity = await getIdentity();
        if (!identity) {
            throw new Error('No se encontró identidad del usuario');
        }

        // Crear el nodo libp2p
        libp2pNode = await createLibp2p({
            addresses: {
                listen: ['/webrtc']
            },
            transports: [
                WebSockets(),
                WebRTC()
            ],
            connectionEncryption: [noise()],
            streamMuxers: [yamux()],
            connectionGater: {
                denyDialMultiaddr: () => false
            },
            peerDiscovery: [
                bootstrap({
                    list: NETWORK_CONFIG.bootstrapNodes
                })
            ],
            services: {
                dht: new KadDHT({
                    clientMode: true
                }),
                pubsub: new GossipSub({
                    emitSelf: false,
                    allowPublishToZeroPeers: true
                }),
                identify: identify()
            }
        });

        // Configurar event listeners
        setupLibp2pEventListeners();

        // Iniciar el nodo
        await libp2pNode.start();
        
        pubsub = libp2pNode.services.pubsub;
        isConnected = true;

        console.log('✅ Nodo libp2p iniciado');
        console.log('🆔 PeerID:', libp2pNode.peerId.toString());
        console.log('📡 Escuchando en:', libp2pNode.getMultiaddrs());

        // Suscribirse al topic personal (tu PIN)
        await subscribeToOwnTopic(identity.pin);

        return libp2pNode;

    } catch (error) {
        console.error('❌ Error inicializando libp2p:', error);
        throw new Error('No se pudo inicializar la red P2P: ' + error.message);
    }
}

/**
 * Configura los event listeners del nodo libp2p
 */
function setupLibp2pEventListeners() {
    // Evento: nueva conexión establecida
    libp2pNode.addEventListener('peer:connect', (evt) => {
        const peerId = evt.detail.toString();
        console.log('🔗 Conectado a peer:', peerId);
    });

    // Evento: conexión cerrada
    libp2pNode.addEventListener('peer:disconnect', (evt) => {
        const peerId = evt.detail.toString();
        console.log('🔌 Desconectado de peer:', peerId);
    });

    // Evento: nuevo peer descubierto
    libp2pNode.addEventListener('peer:discovery', (evt) => {
        const peerId = evt.detail.toString();
        console.log('🔍 Peer descubierto:', peerId);
    });
}

/**
 * Se suscribe al topic personal del usuario (su PIN)
 * @param {string} userPin - PIN del usuario
 */
async function subscribeToOwnTopic(userPin) {
    const topic = `/cipherchat/${userPin}`;
    
    console.log(`📬 Suscribiéndose al topic: ${topic}`);
    
    // Escuchar mensajes en este topic
    pubsub.addEventListener('message', (evt) => {
        const { topic: msgTopic, data } = evt.detail;
        
        if (msgTopic === topic) {
            try {
                const message = JSON.parse(new TextDecoder().decode(data));
                console.log('📨 Mensaje recibido:', message);
                
                // Llamar al handler registrado para este PIN
                const handler = messageHandlers.get(userPin);
                if (handler) {
                    handler(message);
                }
            } catch (error) {
                console.error('Error procesando mensaje:', error);
            }
        }
    });

    // Suscribirse al topic
    await pubsub.subscribe(topic);
    console.log('✅ Suscrito al topic personal');
}

/**
 * Envía un mensaje a un peer específico
 * @param {string} targetPin - PIN del destinatario
 * @param {Object} messageData - Datos del mensaje
 * @returns {Promise<void>}
 */
export async function sendMessage(targetPin, messageData) {
    if (!isConnected || !pubsub) {
        throw new Error('Red P2P no está conectada');
    }

    const topic = `/cipherchat/${targetPin}`;
    const messagePayload = {
        ...messageData,
        timestamp: Date.now(),
        senderPin: (await getIdentity()).pin
    };

    const encodedData = new TextEncoder().encode(JSON.stringify(messagePayload));

    try {
        await pubsub.publish(topic, encodedData);
        console.log(`✅ Mensaje enviado a ${targetPin}`);
    } catch (error) {
        console.error('❌ Error enviando mensaje:', error);
        throw new Error('No se pudo enviar el mensaje: ' + error.message);
    }
}

/**
 * Registra un handler para mensajes entrantes de un PIN específico
 * @param {string} pin - PIN del remitente
 * @param {Function} handler - Función que procesa el mensaje
 */
export function registerMessageHandler(pin, handler) {
    messageHandlers.set(pin, handler);
    console.log(`📝 Handler registrado para PIN: ${pin}`);
}

/**
 * Obtiene el estado de conexión
 * @returns {boolean} true si está conectado
 */
export function getConnectionStatus() {
    return isConnected;
}

/**
 * Obtiene el PeerID del nodo
 * @returns {string|null} PeerID o null
 */
export function getPeerId() {
    return libp2pNode ? libp2pNode.peerId.toString() : null;
}

/**
 * Detiene el nodo libp2p
 */
export async function stopP2PNetwork() {
    if (libp2pNode) {
        await libp2pNode.stop();
        isConnected = false;
        console.log('🛑 Red P2P detenida');
    }
}
