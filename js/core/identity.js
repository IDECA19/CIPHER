// js/core/identity.js - Generación de Identidad Única P2P

import { bufferToHex, hashPin } from './crypto.js';

/**
 * Genera un PIN legible de 9 caracteres formateado (ej: X73-37F1-MI3)
 */
export function formatPin(rawPin) {
    const clean = rawPin.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length < 9) return clean;
    return `${clean.substr(0, 3)}-${clean.substr(3, 4)}-${clean.substr(7, 3)}`;
}

/**
 * Genera una nueva identidad de usuario con claves e ID único
 */
export async function generateNewIdentity() {
    const randomBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const rawSeed = bufferToHex(randomBytes.buffer);
    
    const pinHash = await hashPin(rawSeed);
    const cleanPin = pinHash.substring(0, 10).toUpperCase();
    const pinFormatted = formatPin(cleanPin);

    return {
        pin: cleanPin,
        pinFormatted: pinFormatted,
        createdAt: Date.now()
    };
}
