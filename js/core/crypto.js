// js/core/crypto.js - Cifrado E2EE, Conversiones y Hashes (Web Crypto API)

import { CRYPTO_CONFIG } from '../config.js';

// ==========================================
// --- Conversiones de Formato ---
// ==========================================
export function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

export function base64ToBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
}

export function stringToBuffer(str) { return new TextEncoder().encode(str); }
export function bufferToString(buffer) { return new TextDecoder().decode(buffer); }

// ==========================================
// --- Hashes ---
// ==========================================
export async function hashPin(pin) {
    const cleanPin = pin.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const data = new TextEncoder().encode(cleanPin);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
}

// ==========================================
// --- NUEVO: Criptografía Asimétrica (ECDH) ---
// ==========================================

/**
 * Genera un par de llaves ECDH usando la curva P-384
 */
export async function generateECDHKeyPair() {
    return await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-384" },
        true,
        ["deriveKey", "deriveBits"]
    );
}

/** Exporta una llave a formato JWK (JSON Web Key) para guardarla fácilmente */
export async function exportKeyToJWK(key) {
    return await window.crypto.subtle.exportKey("jwk", key);
}

/** Importa una llave pública desde JWK */
export async function importPublicKeyJWK(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-384" }, true, []
    );
}

/** Importa una llave privada desde JWK */
export async function importPrivateKeyJWK(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "ECDH", namedCurve: "P-384" }, true, ["deriveKey", "deriveBits"]
    );
}

/**
 * Deriva una clave simétrica AES-GCM 256 combinando tu llave privada y la pública del contacto
 */
export async function deriveSharedAESKey(localPrivateKey, remotePublicKey) {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: remotePublicKey },
        localPrivateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// ==========================================
// --- Cifrado de Mensajes E2EE (Actualizado) ---
// ==========================================

/**
 * Cifra un mensaje usando la clave compartida AES-GCM
 */
export async function encryptMessage(text, sharedAESKey) {
    try {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = stringToBuffer(text);
        
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            sharedAESKey,
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
 * Descifra un mensaje usando la clave compartida AES-GCM
 */
export async function decryptMessage(encryptedPacket, sharedAESKey) {
    try {
        const parsedPacket = typeof encryptedPacket === 'string' ? JSON.parse(encryptedPacket) : encryptedPacket;
        if (!parsedPacket.iv || !parsedPacket.cipher) throw new Error('Estructura inválida');

        const ivBuffer = base64ToBuffer(parsedPacket.iv);
        const cipherBuffer = base64ToBuffer(parsedPacket.cipher);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
            sharedAESKey,
            cipherBuffer
        );

        return bufferToString(decryptedBuffer);
    } catch (error) {
        console.error('❌ Error al descifrar mensaje:', error);
        throw new Error('Error al descifrar el mensaje entrante.');
    }
}