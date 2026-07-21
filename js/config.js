// js/config.js - Configuración global y constantes de la app

// Configuración de la aplicación
export const APP_CONFIG = {
    name: "CipherChat",
    version: "1.0.0",
    developer: "CipherChat Team"
};

// PIN del desarrollador (hardcodeado para soporte)
// Formato tipo BlackBerry: XXX-XXXX-XX
export const DEVELOPER_PIN = "DEV-7X9K-M2P";

// Configuración de la red P2P
export const NETWORK_CONFIG = {
    // Bootstrap nodes públicos de libp2p (gratuitos)
    bootstrapNodes: [
        "/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnooDu7bfjPFoTZYWMNLWvQ3yrWaGVPjcaVYWZPZrPcy",
        "/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa"
    ],
    // Protocolo personalizado de la app
    protocol: "/cipherchat/1.0.0",
    // Tiempo máximo de conexión (ms)
    connectionTimeout: 30000,
    // Reintentos de conexión
    maxRetries: 3
};

// Configuración de criptografía
export const CRYPTO_CONFIG = {
    // Algoritmo de firma (identidad)
    signatureAlgorithm: "Ed25519",
    // Algoritmo de cifrado (mensajes)
    encryptionAlgorithm: "AES-GCM",
    encryptionKeyLength: 256,
    // Longitud del IV (Initialization Vector)
    ivLength: 12,
    // Configuración del PIN derivado
    pinLength: 10,
    pinFormat: "XXX-XXXX-XX", // 3-4-2 caracteres
    pinAlphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" // Base36
};

// Configuración de almacenamiento
export const STORAGE_CONFIG = {
    dbName: "cipherchat_db",
    dbVersion: 1,
    stores: {
        identity: "identity",
        contacts: "contacts",
        chats: "chats",
        messages: "messages",
        licenses: "licenses"
    }
};

// Configuración de UI
export const UI_CONFIG = {
    maxMessageLength: 10000,
    maxChatsPreview: 50,
    toastDuration: 3000,
    dateFormat: {
        today: "HH:mm",
        week: "ddd HH:mm",
        older: "DD/MM/YY"
    }
};

// Clave pública del desarrollador (para verificar licencias)
// Se generará en Fase 3 con el generador de licencias
export const DEVELOPER_PUBLIC_KEY = null; // TODO: Fase 3

// Hacer la config accesible globalmente (solo lectura)
window.APP_CONFIG = Object.freeze(APP_CONFIG);
window.DEVELOPER_PIN = DEVELOPER_PIN;