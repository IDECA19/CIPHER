// js/core/identity.js - Generación y Validación de Identidad Única P2P

import { bufferToHex, hashPin } from './crypto.js';

/**
 * Valida si un String tiene el formato de PIN correcto (con o sin guiones)
 */
export function isValidPinFormat(pin) {
    if (!pin || typeof pin !== 'string') return false;
    // Formato con guiones: ABC-1234-XYZ o limpio de 10 caracteres alfanuméricos
    const formattedRegex = /^[A-Za-z0-9]{3}-[A-Za-z0-9]{4}-[A-Za-z0-9]{3}$/;
    const rawRegex = /^[A-Za-z0-9]{10}$/;
    return formattedRegex.test(pin.trim()) || rawRegex.test(pin.trim());
}

/**
 * Formatea un PIN limpio a la estructura estándar (ej: X73-37F1-MI3)
 */
export function formatPin(rawPin) {
    if (!rawPin) return '';
    const clean = rawPin.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length < 10) return clean;
    return `${clean.substr(0, 3)}-${clean.substr(3, 4)}-${clean.substr(7, 3)}`;
}

/**
 * Genera una nueva identidad de usuario con ID único
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
