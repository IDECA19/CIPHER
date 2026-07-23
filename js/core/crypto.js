// js/core/crypto.js - Cifrado E2EE, Conversiones y Hashes (Web Crypto API)

import { CRYPTO_CONFIG } from '../config.js';

// ==========================================
// --- Conversiones de Formato ---
// ==========================================

export function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function hexToBuffer(hexString) {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
}

export function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function base64ToBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export function stringToBuffer(str) {
    return new TextEncoder().encode(str);
}

export function bufferToString(buffer) {
    return new TextDecoder().decode(buffer);
}

// ==========================================
// --- Hashes y Derivación de Claves ---
// ==========================================

/**
 * Genera un hash SHA-256 de un PIN para su uso seguro
 * @param {string} pin - El PIN a hashear
 * @returns {Promise<string>} El hash en formato hexadecimal
 */
export async function hashPin(pin) {
    const cleanPin = pin.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanPin);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
}

/**
 * Deriva una clave simétrica AES-GCM a partir de un PIN (secreto compartido)
 * @param {string} secretPin - El PIN utilizado como material clave
 * @returns {Promise<CryptoKey>} La clave simétrica derivada
 */
async function deriveSymmetricKey(secretPin) {
    if (!secretPin || typeof secretPin !== 'string') {
        throw new Error('PIN inválido para derivación de clave');
    }
    
    const cleanPin = secretPin.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const enc = new TextEncoder();
    
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(cleanPin),
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            salt: enc.encode('cipherchat-shared-salt'),
            info: enc.encode('cipherchat-e2ee-encryption'),
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ==========================================
// --- Cifrado de Mensajes E2EE ---
// ==========================================

/**
 * Cifra un mensaje de texto utilizando la clave derivada del PIN del destinatario
 * @param {string} text - El mensaje en texto plano
 * @param {string} recipientPin - El PIN del destinatario
 * @returns {Promise<string>} Paquete cifrado en formato JSON stringificado
 */
export async function encryptMessage(text, recipientPin) {
    try {
        const key = await deriveSymmetricKey(recipientPin);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = stringToBuffer(text);
        
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encodedData
        );

        return JSON.stringify({
            iv: bufferToBase64(iv.buffer),
            cipher: bufferToBase64(encryptedBuffer)
        });
    } catch (error) {
        console.error('❌ Error al cifrar mensaje:', error);
        throw new Error('No se pudo cifrar el mensaje.');
    }
}

/**
 * Descifra un paquete de mensaje recibido utilizando la clave derivada del PIN del remitente
 * @param {string|Object} encryptedPacket - El paquete cifrado (string JSON o objeto)
 * @param {string} senderPin - El PIN del remitente
 * @returns {Promise<string>} El mensaje descifrado en texto plano
 */
export async function decryptMessage(encryptedPacket, senderPin) {
    try {
        let parsedPacket;
        try {
            parsedPacket = typeof encryptedPacket === 'string' 
                ? JSON.parse(encryptedPacket) 
                : encryptedPacket;
        } catch (e) {
            return encryptedPacket; // Si no es JSON, se asume que ya está en texto plano o es otro formato
        }

        if (!parsedPacket.iv || !parsedPacket.cipher) {
            throw new Error('Estructura cifrada no válida');
        }

        const key = await deriveSymmetricKey(senderPin);
        const ivBuffer = base64ToBuffer(parsedPacket.iv);
        const cipherBuffer = base64ToBuffer(parsedPacket.cipher);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
            key,
            cipherBuffer
        );

        return bufferToString(decryptedBuffer);
    } catch (error) {
        console.error('❌ Error al descifrar mensaje:', error);
        throw new Error('Error al descifrar el mensaje entrante.');
    }
}

// ==========================================
// --- Cifrado Simétrico Directo (Archivos/Adjuntos) ---
// ==========================================

/**
 * Genera una nueva clave simétrica AES-GCM aleatoria
 * @returns {Promise<CryptoKey>} La clave generada
 */
export async function generateSymmetricKey() {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Cifra datos arbitrarios (como archivos) usando una clave simétrica proporcionada
 * @param {CryptoKey} key - La clave de cifrado
 * @param {string} data - Los datos a cifrar
 * @returns {Promise<{iv: string, ciphertext: string}>} Objeto con IV y texto cifrado en hex
 */
export async function encryptData(key, data) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedData = stringToBuffer(data);
    
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
    );

    return {
        iv: bufferToHex(iv.buffer),
        ciphertext: bufferToHex(ciphertext)
    };
}

/**
 * Descifra datos arbitrarios usando una clave simétrica proporcionada
 * @param {CryptoKey} key - La clave de descifrado
 * @param {string} ivHex - El vector de inicialización en formato hex
 * @param {string} ciphertextHex - El texto cifrado en formato hex
 * @returns {Promise<string>} Los datos descifrados
 */
export async function decryptData(key, ivHex, ciphertextHex) {
    const decodedIv = hexToBuffer(ivHex);
    const decodedCiphertext = hexToBuffer(ciphertextHex);
    
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(decodedIv) },
        key,
        decodedCiphertext
    );

    return bufferToString(decrypted);
}
