// js/core/crypto.js - Wrapper de Web Crypto API para cifrado

import { CRYPTO_CONFIG } from '../config.js';

/**
 * Convierte un ArrayBuffer a string hexadecimal
 */
export function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Convierte un string hexadecimal a Uint8Array
 */
export function hexToBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

/**
 * Convierte string a ArrayBuffer
 */
export function stringToBuffer(str) {
    return new TextEncoder().encode(str);
}

/**
 * Convierte ArrayBuffer a string
 */
export function bufferToString(buffer) {
    return new TextDecoder().decode(buffer);
}

/**
 * Calcula el hash SHA-256 de un buffer
 * @param {ArrayBuffer} buffer - Datos a hashear
 * @returns {Promise<ArrayBuffer>} Hash SHA-256
 */
export async function sha256(buffer) {
    return await crypto.subtle.digest('SHA-256', buffer);
}

/**
 * Genera un par de claves Ed25519 para identidad
 * @returns {Promise<CryptoKeyPair>} Par de claves (publicKey, privateKey)
 */
export async function generateIdentityKeys() {
    try {
        // Ed25519 no siempre está soportado en todos los navegadores
        // Fallback a ECDH P-256 si no está disponible
        const supportsEd25519 = crypto.subtle.exportKey && 
            'Ed25519' in (globalThis.crypto?.subtle || {});
        
        if (supportsEd25519) {
            return await crypto.subtle.generateKey(
                { name: "Ed25519" },
                true, // extractable
                ["sign", "verify"]
            );
        }
        
        // Fallback: usar ECDH P-256 (ampliamente soportado)
        return await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
    } catch (error) {
        console.error("Error generando claves de identidad:", error);
        throw new Error("No se pudieron generar las claves de identidad");
    }
}

/**
 * Exporta una clave pública a formato exportable (hex)
 * @param {CryptoKey} publicKey - Clave pública
 * @returns {Promise<string>} Clave en formato hexadecimal
 */
export async function exportPublicKey(publicKey) {
    const exported = await crypto.subtle.exportKey("raw", publicKey);
    return bufferToHex(exported);
}

/**
 * Exporta una clave privada a formato JWK (para almacenamiento)
 * @param {CryptoKey} privateKey - Clave privada
 * @returns {Promise<JsonWebKey>} Clave en formato JWK
 */
export async function exportPrivateKey(privateKey) {
    return await crypto.subtle.exportKey("jwk", privateKey);
}

/**
 * Importa una clave privada desde JWK
 * @param {JsonWebKey} jwk - Clave en formato JWK
 * @param {string} algorithm - Algoritmo ("Ed25519" o "ECDH")
 * @returns {Promise<CryptoKey>} Clave privada importada
 */
export async function importPrivateKey(jwk, algorithm = "ECDH") {
    const algo = algorithm === "Ed25519" 
        ? { name: "Ed25519" }
        : { name: "ECDH", namedCurve: "P-256" };
    
    return await crypto.subtle.importKey(
        "jwk",
        jwk,
        algo,
        true,
        ["deriveKey", "deriveBits"]
    );
}

/**
 * Genera una clave simétrica AES-GCM para cifrar mensajes
 * @returns {Promise<CryptoKey>} Clave AES-256
 */
export async function generateSymmetricKey() {
    return await crypto.subtle.generateKey(
        { 
            name: CRYPTO_CONFIG.encryptionAlgorithm,
            length: CRYPTO_CONFIG.encryptionKeyLength
        },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Cifra datos con AES-GCM
 * @param {CryptoKey} key - Clave de cifrado
 * @param {string} data - Datos a cifrar
 * @returns {Promise<{iv: string, ciphertext: string}>} Datos cifrados
 */
export async function encryptData(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.ivLength));
    const encodedData = stringToBuffer(data);
    
    const ciphertext = await crypto.subtle.encrypt(
        { 
            name: CRYPTO_CONFIG.encryptionAlgorithm,
            iv: iv
        },
        key,
        encodedData
    );
    
    return {
        iv: bufferToHex(iv),
        ciphertext: bufferToHex(ciphertext)
    };
}

/**
 * Descifra datos con AES-GCM
 * @param {CryptoKey} key - Clave de descifrado
 * @param {string} iv - IV en hexadecimal
 * @param {string} ciphertext - Texto cifrado en hexadecimal
 * @returns {Promise<string>} Datos descifrados
 */
export async function decryptData(key, iv, ciphertext) {
    const decodedIv = hexToBuffer(iv);
    const decodedCiphertext = hexToBuffer(ciphertext);
    
    const decrypted = await crypto.subtle.decrypt(
        { 
            name: CRYPTO_CONFIG.encryptionAlgorithm,
            iv: decodedIv
        },
        key,
        decodedCiphertext
    );
    
    return bufferToString(decrypted);
}

/**
 * Deriva una clave AES desde una passphrase (para cifrar almacenamiento local)
 * @param {string} passphrase - Contraseña maestra
 * @param {Uint8Array} salt - Sal aleatoria
 * @returns {Promise<CryptoKey>} Clave AES derivada
 */
export async function deriveKeyFromPassphrase(passphrase, salt) {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        stringToBuffer(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    
    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        baseKey,
        { 
            name: CRYPTO_CONFIG.encryptionAlgorithm,
            length: CRYPTO_CONFIG.encryptionKeyLength
        },
        false,
        ["encrypt", "decrypt"]
    );
}