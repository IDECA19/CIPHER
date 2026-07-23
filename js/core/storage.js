// js/core/storage.js - Wrapper de IndexedDB para almacenamiento persistente

import { STORAGE_CONFIG } from '../config.js';

let db = null;

/**
 * Inicializa la base de datos IndexedDB
 * @returns {Promise<IDBDatabase>} Base de datos abierta
 */
export async function initDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion);
        
        request.onerror = () => {
            console.error("❌ Error abriendo IndexedDB:", request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log("✅ IndexedDB inicializada");
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            const stores = STORAGE_CONFIG.stores;
            
            // Crear almacenes de objetos si no existen
            if (!database.objectStoreNames.contains(stores.identity)) {
                const identityStore = database.createObjectStore(stores.identity, { 
                    keyPath: "id" 
                });
                identityStore.createIndex("pin", "pin", { unique: true });
            }
            
            if (!database.objectStoreNames.contains(stores.contacts)) {
                const contactsStore = database.createObjectStore(stores.contacts, { 
                    keyPath: "pin" 
                });
                contactsStore.createIndex("alias", "alias", { unique: false });
                contactsStore.createIndex("cleanPin", "cleanPin", { unique: false });
            }
            
            if (!database.objectStoreNames.contains(stores.chats)) {
                const chatsStore = database.createObjectStore(stores.chats, { 
                    keyPath: "id" 
                });
                chatsStore.createIndex("peerPin", "peerPin", { unique: false });
                chatsStore.createIndex("lastMessageAt", "lastMessageAt", { unique: false });
            }
            
            if (!database.objectStoreNames.contains(stores.messages)) {
                const messagesStore = database.createObjectStore(stores.messages, { 
                    keyPath: "id" 
                });
                messagesStore.createIndex("chatId", "chatId", { unique: false });
                messagesStore.createIndex("senderPin", "senderPin", { unique: false });
                messagesStore.createIndex("recipientPin", "recipientPin", { unique: false });
                messagesStore.createIndex("timestamp", "timestamp", { unique: false });
            }
            
            if (!database.objectStoreNames.contains(stores.licenses)) {
                database.createObjectStore(stores.licenses, { 
                    keyPath: "id" 
                });
            }

            if (!database.objectStoreNames.contains('files')) {
                database.createObjectStore('files', { keyPath: 'id' });
            }
            
            console.log("📦 Almacenes de IndexedDB creados/verificados");
        };
    });
}

// --- MÉTODOS GENÉRICOS ---

export async function saveToStore(storeName, data) {
    if (!db) await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(data);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getFromStore(storeName, key) {
    if (!db) await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllFromStore(storeName) {
    if (!db) await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteFromStore(storeName, key) {
    if (!db) await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getByIndex(storeName, indexName, value) {
    if (!db) await initDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// --- GESTIÓN DE IDENTIDAD ---

export async function getIdentity() {
    const identities = await getAllFromStore(STORAGE_CONFIG.stores.identity);
    return identities.length > 0 ? identities[0] : null;
}

export async function saveIdentity(identity) {
    identity.id = "current_identity";
    await saveToStore(STORAGE_CONFIG.stores.identity, identity);
}

// --- GESTIÓN DE CONTACTOS ---

/**
 * Guarda o actualiza un contacto, incluyendo su llave pública (ECDH)
 */
export async function saveContact(contact) {
    if (!contact || !contact.pin) {
        throw new Error('El contacto debe incluir al menos un PIN válido.');
    }
    
    // Normalizamos el PIN eliminando guiones para asegurar que sea único en la base de datos
    const cleanPin = contact.pin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    const record = {
        ...contact,
        pin: cleanPin,
        updatedAt: Date.now()
    };
    
    // Usamos el método genérico que ya gestiona la inicialización de la DB
    return await saveToStore(STORAGE_CONFIG.stores.contacts, record);
}

export async function getAllContacts() {
    return await getAllFromStore(STORAGE_CONFIG.stores.contacts);
}

/**
 * Obtiene un contacto guardado por su PIN desde IndexedDB
 */
export async function getContactByPin(pin) {
    if (!pin) return null;
    
    // Normalizamos el PIN para que coincida exactamente con cómo se guardó
    const cleanPin = pin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return await getFromStore(STORAGE_CONFIG.stores.contacts, cleanPin);
}

export async function deleteContact(pin) {
    if (!pin) return;
    const cleanPin = pin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return await deleteFromStore(STORAGE_CONFIG.stores.contacts, cleanPin);
}

// --- GESTIÓN DE MENSAJES ---

export async function saveMessage(message) {
    return await saveToStore(STORAGE_CONFIG.stores.messages, message);
}

export async function getMessagesByChat(chatPin) {
    const allMessages = await getAllFromStore(STORAGE_CONFIG.stores.messages);
    const cleanTarget = chatPin.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const filtered = allMessages.filter(msg => {
        const senderClean = (msg.senderPin || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const recipientClean = (msg.recipientPin || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return senderClean === cleanTarget || recipientClean === cleanTarget;
    });

    filtered.sort((a, b) => a.timestamp - b.timestamp);
    return filtered;
}

export async function markMessagesAsRead(chatPin) {
    if (!db) await initDatabase();
    return new Promise((resolve, reject) => {
        const storeName = STORAGE_CONFIG.stores.messages;
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
            const allMessages = request.result || [];
            const cleanTarget = chatPin.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

            allMessages.forEach(msg => {
                const senderClean = (msg.senderPin || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                if (senderClean === cleanTarget && msg.status !== 'read') {
                    msg.status = 'read';
                    store.put(msg);
                }
            });

            resolve(true);
        };

        request.onerror = () => reject(request.error);
    });
}

// --- MANTENIMIENTO ---

export async function clearDatabase() {
    if (!db) await initDatabase();
    
    const stores = Object.values(STORAGE_CONFIG.stores);
    const transaction = db.transaction(stores, "readwrite");
    
    return new Promise((resolve, reject) => {
        stores.forEach(storeName => {
            if (db.objectStoreNames.contains(storeName)) {
                transaction.objectStore(storeName).clear();
            }
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}