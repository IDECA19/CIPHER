// js/services/files.js - Gestión de archivos con cifrado E2EE

import { encryptData, decryptData, generateSymmetricKey, bufferToHex, hexToBuffer } from '../core/crypto.js';
import { STORAGE_CONFIG } from '../config.js';
import { saveToStore, getFromStore } from '../core/storage.js';
import { generateId } from '../utils/formatter.js';

// Configuración de fragmentación
const CHUNK_SIZE = 16 * 1024; // 16KB por chunk (límite WebRTC)

/**
 * Formatea el tamaño de un archivo para mostrar
 * @param {number} bytes - Tamaño en bytes
 * @returns {string} Tamaño formateado (ej: "1.5 MB")
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Obtiene el ícono apropiado según el tipo de archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {string} Emoji del ícono
 */
export function getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '🗜️';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
    if (mimeType.includes('text')) return '📝';
    return '📄';
}

/**
 * Prepara un archivo para envío: lee, cifra y fragmenta
 * @param {File} file - Archivo del input
 * @returns {Promise<Object>} Datos del archivo preparado
 */
export async function prepareFileForSending(file) {
    console.log(`📎 Preparando archivo: ${file.name} (${formatFileSize(file.size)})`);
    
    // 1. Leer el archivo como ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    
    // 2. Generar una clave simétrica única para este archivo
    const fileKey = await generateSymmetricKey();
    
    // 3. Exportar la clave para enviarla al destinatario (cifrada con su clave pública)
    const exportedKey = await crypto.subtle.exportKey('jwk', fileKey);
    
    // 4. Convertir el buffer a string para cifrar
    const fileDataString = bufferToHex(new Uint8Array(fileBuffer));
    
    // 5. Cifrar el contenido del archivo
    const encrypted = await encryptData(fileKey, fileDataString);
    
    // 6. Convertir el ciphertext a Uint8Array para fragmentar
    const ciphertextBytes = hexToBuffer(encrypted.ciphertext);
    
    // 7. Fragmentar en chunks
    const totalChunks = Math.ceil(ciphertextBytes.length / CHUNK_SIZE);
    const chunks = [];
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, ciphertextBytes.length);
        const chunk = ciphertextBytes.slice(start, end);
        chunks.push(bufferToHex(chunk));
    }
    
    // 8. Generar ID único para el archivo
    const fileId = generateId();
    
    // 9. Crear metadatos del archivo
    const fileMetadata = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        mimeType: file.type || 'application/octet-stream',
        totalChunks: totalChunks,
        iv: encrypted.iv,
        key: exportedKey,
        timestamp: Date.now()
    };
    
    // 10. Guardar metadatos localmente
    await saveToStore(STORAGE_CONFIG.stores.files, {
        id: fileId,
        metadata: fileMetadata,
        chunks: chunks,
        isLocal: true
    });
    
    console.log(`✅ Archivo preparado: ${totalChunks} chunks`);
    
    return {
        metadata: fileMetadata,
        chunks: chunks
    };
}

/**
 * Guarda un chunk recibido de un archivo
 * @param {string} fileId - ID del archivo
 * @param {number} chunkIndex - Índice del chunk
 * @param {string} chunkData - Datos del chunk en hex
 * @param {number} totalChunks - Total de chunks esperados
 */
export async function saveReceivedChunk(fileId, chunkIndex, chunkData, totalChunks) {
    // Obtener o crear el registro del archivo
    let fileRecord = await getFromStore(STORAGE_CONFIG.stores.files, fileId);
    
    if (!fileRecord) {
        fileRecord = {
            id: fileId,
            chunks: new Array(totalChunks).fill(null),
            receivedChunks: 0,
            totalChunks: totalChunks,
            isLocal: false
        };
    }
    
    // Guardar el chunk
    fileRecord.chunks[chunkIndex] = chunkData;
    fileRecord.receivedChunks = fileRecord.chunks.filter(c => c !== null).length;
    
    // Actualizar en IndexedDB
    await saveToStore(STORAGE_CONFIG.stores.files, fileRecord);
    
    console.log(`📥 Chunk ${chunkIndex + 1}/${totalChunks} recibido para archivo ${fileId}`);
    
    // Verificar si se completó la recepción
    return fileRecord.receivedChunks === totalChunks;
}

/**
 * Reconstruye y descifra un archivo recibido
 * @param {string} fileId - ID del archivo
 * @param {Object} metadata - Metadatos del archivo (incluye IV y clave)
 * @returns {Promise<Blob>} Blob del archivo descifrado
 */
export async function reconstructAndDecryptFile(fileId, metadata) {
    const fileRecord = await getFromStore(STORAGE_CONFIG.stores.files, fileId);
    
    if (!fileRecord) {
        throw new Error('Archivo no encontrado');
    }
    
    // 1. Unir todos los chunks
    const ciphertextHex = fileRecord.chunks.join('');
    const ciphertextBytes = hexToBuffer(ciphertextHex);
    const ciphertextString = bufferToHex(ciphertextBytes);
    
    // 2. Importar la clave del archivo
    const fileKey = await crypto.subtle.importKey(
        'jwk',
        metadata.key,
        { name: 'AES-GCM', length: 256 },
        true,
        ['decrypt']
    );
    
    // 3. Descifrar el contenido
    const decryptedHex = await decryptData(fileKey, metadata.iv, ciphertextString);
    
    // 4. Convertir a Uint8Array
    const fileBytes = hexToBuffer(decryptedHex);
    
    // 5. Crear Blob
    const blob = new Blob([fileBytes], { type: metadata.mimeType });
    
    console.log(`✅ Archivo reconstruido: ${metadata.name} (${formatFileSize(blob.size)})`);
    
    return blob;
}

/**
 * Genera una URL temporal para descargar/ver un archivo
 * @param {Blob} blob - Blob del archivo
 * @returns {string} URL temporal (object URL)
 */
export function createFileUrl(blob) {
    return URL.createObjectURL(blob);
}

/**
 * Descarga un archivo al dispositivo del usuario
 * @param {Blob} blob - Blob del archivo
 * @param {string} filename - Nombre del archivo
 */
export function downloadFile(blob, filename) {
    const url = createFileUrl(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Guarda los metadatos de un archivo recibido
 * @param {Object} metadata - Metadatos del archivo
 */
export async function saveFileMetadata(metadata) {
    await saveToStore(STORAGE_CONFIG.stores.files, {
        id: metadata.id,
        metadata: metadata,
        chunks: new Array(metadata.totalChunks).fill(null),
        receivedChunks: 0,
        totalChunks: metadata.totalChunks,
        isLocal: false
    });
}
