// js/core/crypto.js - Cifrado de extremo a extremo (E2EE) con Web Crypto API

/**
 * Convierte un String en ArrayBuffer (UTF-8)
 */
function stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

/**
 * Convierte un ArrayBuffer en String (UTF-8)
 */
function arrayBufferToString(buffer) {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
}

/**
 * Convierte ArrayBuffer a una cadena Base64
 */
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Convierte una cadena Base64 a ArrayBuffer
 */
function base64ToBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Deriva una clave simétrica AES-GCM a partir del PIN objetivo usando HKDF
 */
async function deriveSymmetricKey(secretPin) {
    const cleanPin = secretPin.replace(/-/g, '').toLowerCase();
    const enc = new TextEncoder();
    
    // Importar el PIN como material clave inicial
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(cleanPin),
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    // Derivar una clave simétrica AES-GCM de 256 bits
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

/**
 * Cifra un texto plano utilizando AES-GCM
 * @param {string} text - Texto plano o JSON codificado a cifrar
 * @param {string} recipientPin - PIN del destinatario
 * @returns {Promise<string>} Objeto en formato JSON/Base64 con IV y contenido cifrado
 */
export async function encryptMessage(text, recipientPin) {
    try {
        const key = await deriveSymmetricKey(recipientPin);
        
        // Generar IV (Vector de Inicialización) criptográficamente seguro de 12 bytes
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = stringToArrayBuffer(text);

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encodedData
        );

        // Retornar paquete formateado
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
 * Descifra un mensaje cifrado recibido
 * @param {string} encryptedPacket - Paquete en JSON/Base64 (contiene IV y cipher)
 * @param {string} senderPin - PIN del emisor
 * @returns {Promise<string>} Texto plano o JSON descifrado
 */
export async function decryptMessage(encryptedPacket, senderPin) {
    try {
        let parsedPacket;
        
        // Si no es un objeto o cadena válida, devolver directamente si no viene cifrado
        try {
            parsedPacket = typeof encryptedPacket === 'string' ? JSON.parse(encryptedPacket) : encryptedPacket;
        } catch (e) {
            return encryptedPacket;
        }

        if (!parsedPacket.iv || !parsedPacket.cipher) {
            throw new Error('Estructura de mensaje cifrado inválida');
        }

        const key = await deriveSymmetricKey(senderPin);
        const ivBuffer = base64ToBuffer(parsedPacket.iv);
        const cipherBuffer = base64ToBuffer(parsedPacket.cipher);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: new Uint8Array(ivBuffer)
            },
            key,
            cipherBuffer
        );

        return arrayBufferToString(decryptedBuffer);
    } catch (error) {
        console.error('❌ Error al descifrar mensaje:', error);
        throw new Error('Error al descifrar el mensaje entrante.');
    }
}
