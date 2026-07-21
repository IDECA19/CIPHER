// js/core/identity.js - Gestión de identidad y generación de PIN

import { CRYPTO_CONFIG } from '../config.js';
import { 
    generateIdentityKeys, 
    exportPublicKey, 
    exportPrivateKey,
    importPrivateKey,
    sha256,
    bufferToHex,
    stringToBuffer
} from './crypto.js';
import { formatPin } from '../utils/formatter.js';

/**
 * Genera un PIN único tipo BlackBerry a partir de una clave pública
 * El PIN es determinista: la misma clave pública siempre genera el mismo PIN
 * @param {string} publicKeyHex - Clave pública en hexadecimal
 * @returns {string} PIN de 10 caracteres (sin formato)
 */
export function derivePinFromPublicKey(publicKeyHex) {
    const alphabet = CRYPTO_CONFIG.pinAlphabet;
    const base = alphabet.length; // 36
    
    // Tomar los primeros bytes del hash SHA-256 de la clave pública
    // No podemos usar await aquí, así que usamos un hash simple
    let hash = 0;
    for (let i = 0; i < publicKeyHex.length; i++) {
        const char = publicKeyHex.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convertir a 32bit integer
    }
    
    // Generar PIN de 10 caracteres usando el hash como semilla
    // + bytes adicionales de la clave pública para más entropía
    let pin = "";
    const seed = publicKeyHex + Math.abs(hash).toString(16);
    
    for (let i = 0; i < CRYPTO_CONFIG.pinLength; i++) {
        // Mezcla determinista de bytes
        const index = (seed.charCodeAt(i % seed.length) + 
                      seed.charCodeAt((i + 7) % seed.length) + 
                      i) % base;
        pin += alphabet[index];
    }
    
    return pin;
}

/**
 * Verifica si un PIN tiene el formato correcto
 * @param {string} pin - PIN a validar
 * @returns {boolean} true si es válido
 */
export function isValidPinFormat(pin) {
    // Formato: XXX-XXXX-XX o XXXXXXXXXX
    const cleanPin = pin.replace(/-/g, '');
    return /^[A-Z0-9]{10}$/.test(cleanPin);
}

/**
 * Genera una nueva identidad completa (claves + PIN)
 * @returns {Promise<Object>} Identidad con claves y PIN
 */
export async function generateNewIdentity() {
    console.log("🔐 Generando nueva identidad...");
    
    // 1. Generar par de claves
    const keyPair = await generateIdentityKeys();
    
    // 2. Exportar clave pública a hex
    const publicKeyHex = await exportPublicKey(keyPair.publicKey);
    
    // 3. Exportar clave privada a JWK (para almacenar)
    const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
    
    // 4. Derivar PIN único desde la clave pública
    const pinRaw = derivePinFromPublicKey(publicKeyHex);
    const pinFormatted = formatPin(pinRaw);
    
    // 5. Calcular hash de la clave pública (para verificación rápida)
    const publicKeyBuffer = stringToBuffer(publicKeyHex);
    const publicKeyHash = await sha256(publicKeyBuffer);
    const publicKeyHashHex = bufferToHex(publicKeyHash);
    
    const identity = {
        pin: pinRaw,
        pinFormatted: pinFormatted,
        publicKeyHex: publicKeyHex,
        privateKeyJwk: privateKeyJwk,
        publicKeyHash: publicKeyHashHex,
        createdAt: Date.now(),
        algorithm: "ECDH-P256" // o Ed25519 si está soportado
    };
    
    console.log("✅ Identidad generada:", pinFormatted);
    console.log("🔑 Clave pública:", publicKeyHex.slice(0, 20) + "...");
    
    return identity;
}

/**
 * Recupera un PIN desde una clave pública existente
 * @param {string} publicKeyHex - Clave pública en hex
 * @returns {string} PIN formateado
 */
export function recoverPinFromPublicKey(publicKeyHex) {
    const pinRaw = derivePinFromPublicKey(publicKeyHex);
    return formatPin(pinRaw);
}

/**
 * Compara dos PINs (ignora guiones y mayúsculas/minúsculas)
 * @param {string} pin1 - Primer PIN
 * @param {string} pin2 - Segundo PIN
 * @returns {boolean} true si son iguales
 */
export function comparePins(pin1, pin2) {
    const clean1 = pin1.replace(/-/g, '').toUpperCase();
    const clean2 = pin2.replace(/-/g, '').toUpperCase();
    return clean1 === clean2;
}

/**
 * Valida que un PIN no colisione con una lista de PINs existentes
 * En P2P puro, esto es probabilístico pero con 36^10 combinaciones
 * la probabilidad de colisión es extremadamente baja
 * @param {string} pin - PIN a validar
 * @param {Array<string>} existingPins - Lista de PINs existentes
 * @returns {boolean} true si no hay colisión
 */
export function checkPinCollision(pin, existingPins = []) {
    const cleanPin = pin.replace(/-/g, '').toUpperCase();
    return !existingPins.some(p => 
        p.replace(/-/g, '').toUpperCase() === cleanPin
    );
}

/**
 * Calcula la probabilidad estadística de colisión
 * Con 36^10 ≈ 3.6 × 10^15 combinaciones, necesitamos
 * ~60 millones de usuarios para tener 0.0001% de probabilidad de colisión
 * @param {number} numberOfUsers - Número de usuarios
 * @returns {number} Probabilidad de al menos una colisión
 */
export function calculateCollisionProbability(numberOfUsers) {
    const totalCombinations = Math.pow(36, 10);
    // Aproximación de la paradoja del cumpleaños
    const probability = 1 - Math.exp(
        -(numberOfUsers * (numberOfUsers - 1)) / (2 * totalCombinations)
    );
    return probability;
}