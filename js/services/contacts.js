// js/services/contacts.js - Gestión del Directorio de Contactos

import { saveContact, getAllContacts, getContactByPin, deleteContact } from '../core/storage.js';
import { isValidPinFormat, formatPin } from '../core/identity.js';

/**
 * Agrega o actualiza un contacto en la libreta local
 */
export async function addOrUpdateContact(pin, alias) {
    if (!isValidPinFormat(pin)) {
        throw new Error('El formato del PIN no es válido. Debe ser alfanumérico (ej: ABC-1234-XYZ).');
    }

    if (!alias || alias.trim() === '') {
        throw new Error('Debes asignar un alias o nombre al contacto.');
    }

    const formattedPin = formatPin(pin);
    const cleanPin = formattedPin.replace(/-/g, '').toLowerCase();

    const contactData = {
        pin: formattedPin,
        cleanPin: cleanPin,
        alias: alias.trim(),
        updatedAt: Date.now()
    };

    await saveContact(contactData);
    console.log(`✅ Contacto guardado: ${alias} (${formattedPin})`);
    return contactData;
}

/**
 * Obtiene la lista completa de contactos
 */
export async function getContactsList() {
    return await getAllContacts();
}

/**
 * Busca los detalles de un contacto por su PIN
 */
export async function findContact(pin) {
    const formattedPin = formatPin(pin);
    return await getContactByPin(formattedPin);
}

/**
 * Elimina un contacto de la libreta
 */
export async function removeContact(pin) {
    const formattedPin = formatPin(pin);
    await deleteContact(formattedPin);
    console.log(`🗑️ Contacto eliminado: ${formattedPin}`);
}
