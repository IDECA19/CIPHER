// js/core/identity.js - Generación y Validación de Identidad Única P2P

import { bufferToHex, hashPin, generateECDHKeyPair, exportKeyToJWK } from './crypto.js';

export function isValidPinFormat(pin) {
    if (!pin || typeof pin !== 'string') return false;
    const formattedRegex = /^[A-Za-z0-9]{3}-[A-Za-z0-9]{4}-[A-Za-z0-9]{3}$/;
    const rawRegex = /^[A-Za-z0-9]{10}$/;
    return formattedRegex.test(pin.trim()) || rawRegex.test(pin.trim());
}

export function formatPin(rawPin) {
    if (!rawPin) return '';
    const clean = rawPin.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length < 10) return clean;
    return `${clean.substr(0, 3)}-${clean.substr(3, 4)}-${clean.substr(7, 3)}`;
}

/**
 * Genera una nueva identidad de usuario con ID único y par de llaves criptográficas ECDH
 */
export async function generateNewIdentity() {
    // 1. Generar PIN aleatorio
    const randomBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const rawSeed = bufferToHex(randomBytes.buffer);
    
    const pinHash = await hashPin(rawSeed);
    const cleanPin = pinHash.substring(0, 10).toUpperCase();
    const pinFormatted = formatPin(cleanPin);

    // 2. Generar el par de llaves asimétricas (ECDH) para E2EE real
    console.log("🔐 Generando par de llaves ECDH (P-384)...");
    const keyPair = await generateECDHKeyPair();
    
    // 3. Exportar a JWK (JSON) para que puedan ser guardadas en IndexedDB/localStorage
    const publicKeyJWK = await exportKeyToJWK(keyPair.publicKey);
    const privateKeyJWK = await exportKeyToJWK(keyPair.privateKey);

    return {
        pin: cleanPin,
        pinFormatted: pinFormatted,
        publicKey: publicKeyJWK, // Llave pública para compartir con contactos
        privateKey: privateKeyJWK, // NUNCA DEBE SALIR DEL DISPOSITIVO
        createdAt: Date.now()
    };
}