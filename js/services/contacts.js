// js/services/contacts.js - Gestión del directorio de contactos

import { STORAGE_CONFIG, DEVELOPER_PIN } from '../config.js';
import { saveToStore, getAllFromStore, getFromStore } from '../core/storage.js';
import { isValidPinFormat } from '../core/identity.js';

/**
 * Agrega o actualiza un contacto en el directorio
 * @param {string} pin - PIN del contacto (con o sin guiones)
 * @param {string} alias - Nombre o alias para el contacto
 * @returns {Promise<Object>} El contacto guardado
 */
export async function addOrUpdateContact(pin, alias) {
    // Limpiar el PIN de guiones y convertir a mayúsculas para consistencia
    const cleanPin = pin.replace(/-/g, '').toUpperCase();
    
    if (!isValidPinFormat(cleanPin)) {
        throw new Error("El formato del PIN no es válido. Debe ser XXXXXXXXXX");
    }

    const contact = {
        pin: cleanPin,
        alias: alias.trim() || `Usuario ${cleanPin.slice(0, 4)}`,
        addedAt: Date.now(),
        isDeveloper: (cleanPin === DEVELOPER_PIN.replace(/-/g, ''))
    };

    await saveToStore(STORAGE_CONFIG.stores.contacts, contact);
    return contact;
}

/**
 * Obtiene todos los contactos del directorio
 * @returns {Promise<Array>} Lista de contactos
 */
export async function getAllContacts() {
    return await getAllFromStore(STORAGE_CONFIG.stores.contacts);
}

/**
 * Busca un contacto específico por su PIN
 * @param {string} pin - PIN a buscar
 * @returns {Promise<Object|null>} Contacto o null
 */
export async function getContactByPin(pin) {
    const cleanPin = pin.replace(/-/g, '').toUpperCase();
    return await getFromStore(STORAGE_CONFIG.stores.contacts, cleanPin);
}