// js/core/crypto.js - Núcleo Criptográfico (E2EE + Identidad)

// --- Conversiones de Formato ---

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

// --- Derivación y Cifrado ---

export async function hashPin(pin) {
    const cleanPin = pin.replace(/-/g, '').toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanPin);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
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

export async function encryptMessage(text, recipientPin) {
    try {
        const key = await deriveSymmetricKey(recipientPin);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(text);

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

        return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
        console.error('❌ Error al descifrar mensaje:', error);
        throw new Error('Error al descifrar el mensaje entrante.');
    }
}
