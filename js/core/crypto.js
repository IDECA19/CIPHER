// js/core/crypto.js - Cifrado AES-GCM con Web Crypto API

function stringToArrayBuffer(str) {
    return new TextEncoder().encode(str);
}

function arrayBufferToString(buffer) {
    return new TextDecoder().decode(buffer);
}

function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function deriveSymmetricKey(secretPin) {
    const cleanPin = secretPin.replace(/-/g, '').toLowerCase();
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

/**
 * Cifra un texto o JSON utilizando AES-GCM
 */
export async function encryptMessage(text, recipientPin) {
    try {
        const key = await deriveSymmetricKey(recipientPin);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = stringToArrayBuffer(text);

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
 * Descifra un paquete recibido usando la clave derivada del PIN emisor
 */
export async function decryptMessage(encryptedPacket, senderPin) {
    try {
        let parsedPacket;
        try {
            parsedPacket = typeof encryptedPacket === 'string' ? JSON.parse(encryptedPacket) : encryptedPacket;
        } catch (e) {
            return encryptedPacket;
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

        return arrayBufferToString(decryptedBuffer);
    } catch (error) {
        console.error('❌ Error al descifrar mensaje:', error);
        throw new Error('Error al descifrar el mensaje entrante.');
    }
}
