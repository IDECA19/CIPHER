// js/network/p2p.js - Módulo de red P2P usando libp2p

import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
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

        console.log('⚙️ Configurando nodo libp2p...');
        
        // Crear el nodo libp2p
        libp2pNode = await createLibp2p({
            addresses: {
                listen: ['/webrtc']
            },
            transports: [
                webSockets(),
                webRTC()
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
                dht: kadDHT({
                    clientMode: true
                }),
                pubsub: gossipsub({
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
        console.log('📡 Escuchando en:', libp2pNode.getMultiaddrs().map(m => m.toString()));

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
    libp2pNode.addEventListener('peer:connect', (evt) => {
        console.log('🔗 Conectado a peer:', evt.detail.toString());
    });

    libp2pNode.addEventListener('peer:disconnect', (evt) => {
        console.log('🔌 Desconectado de peer:', evt.detail.toString());
    });
}

/**
 * Se suscribe al topic personal del usuario (su PIN)
 * @param {string} userPin - PIN del usuario
 */
async function subscribeToOwnTopic(userPin) {
    const topic = `/cipherchat/${userPin}`;
    console.log(`📬 Suscribiéndose al topic: ${topic}`);
    
    pubsub.addEventListener('message', (evt) => {
        const { topic: msgTopic, data } = evt.detail;
        
        if (msgTopic === topic) {
            try {
                const message = JSON.parse(new TextDecoder().decode(data));
                console.log('📨 Mensaje recibido:', message);
                
                const handler = messageHandlers.get(userPin);
                if (handler) {
                    handler(message);
                }
            } catch (error) {
                console.error('Error procesando mensaje:', error);
            }
        }
    });

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
    const identity = await getIdentity();
    const messagePayload = {
        ...messageData,
        timestamp: Date.now(),
        senderPin: identity.pin
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
 */
export function registerMessageHandler(pin, handler) {
    messageHandlers.set(pin, handler);
    console.log(`📝 Handler registrado para PIN: ${pin}`);
}

export function getConnectionStatus() {
    return isConnected;
}

export async function stopP2PNetwork() {
    if (libp2pNode) {
        await libp2pNode.stop();
        isConnected = false;
        console.log('🛑 Red P2P detenida');
    }
}