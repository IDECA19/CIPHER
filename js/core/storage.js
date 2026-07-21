// js/core/storage.js - Wrapper de IndexedDB para almacenamiento persistente

import { STORAGE_CONFIG } from '../config.js';

let db = null;

/**
 * Inicializa la base de datos IndexedDB
 * @returns {Promise<IDBDatabase>} Base de datos abierta
 */
export async function initDatabase() {
    return new Promise((resolve, reject) => {
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
                messagesStore.createIndex("timestamp", "timestamp", { unique: false });
            }
            
            if (!database.objectStoreNames.contains(stores.licenses)) {
                database.createObjectStore(stores.licenses, { 
                    keyPath: "id" 
                });
            }
            
            console.log("📦 Almacenes de IndexedDB creados/verificados");
        };
    });
}

/**
 * Guarda un objeto en un almacén de IndexedDB
 * @param {string} storeName - Nombre del almacén
 * @param {Object} data - Datos a guardar
 * @returns {Promise<any>} Resultado de la operación
 */
export async function saveToStore(storeName, data) {
    if (!db) throw new Error("Base de datos no inicializada");
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(data);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtiene un objeto por su clave primaria
 * @param {string} storeName - Nombre del almacén
 * @param {string|number} key - Clave primaria
 * @returns {Promise<Object|null>} Objeto encontrado o null
 */
export async function getFromStore(storeName, key) {
    if (!db) throw new Error("Base de datos no inicializada");
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtiene todos los objetos de un almacén
 * @param {string} storeName - Nombre del almacén
 * @returns {Promise<Array>} Array de objetos
 */
export async function getAllFromStore(storeName) {
    if (!db) throw new Error("Base de datos no inicializada");
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Elimina un objeto por su clave primaria
 * @param {string} storeName - Nombre del almacén
 * @param {string|number} key - Clave primaria
 * @returns {Promise<void>}
 */
export async function deleteFromStore(storeName, key) {
    if (!db) throw new Error("Base de datos no inicializada");
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Busca objetos por un índice específico
 * @param {string} storeName - Nombre del almacén
 * @param {string} indexName - Nombre del índice
 * @param {any} value - Valor a buscar
 * @returns {Promise<Array>} Objetos encontrados
 */
export async function getByIndex(storeName, indexName, value) {
    if (!db) throw new Error("Base de datos no inicializada");
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtiene la identidad del usuario (debería haber solo una)
 * @returns {Promise<Object|null>} Identidad o null
 */
export async function getIdentity() {
    const identities = await getAllFromStore(STORAGE_CONFIG.stores.identity);
    return identities.length > 0 ? identities[0] : null;
}

/**
 * Guarda la identidad del usuario
 * @param {Object} identity - Objeto de identidad
 * @returns {Promise<void>}
 */
export async function saveIdentity(identity) {
    // Asegurar que tiene un ID fijo
    identity.id = "current_identity";
    await saveToStore(STORAGE_CONFIG.stores.identity, identity);
}

/**
 * Limpia toda la base de datos (para reinstalación)
 * @returns {Promise<void>}
 */
export async function clearDatabase() {
    if (!db) throw new Error("Base de datos no inicializada");
    
    const stores = Object.values(STORAGE_CONFIG.stores);
    const transaction = db.transaction(stores, "readwrite");
    
    return new Promise((resolve, reject) => {
        stores.forEach(storeName => {
            transaction.objectStore(storeName).clear();
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}