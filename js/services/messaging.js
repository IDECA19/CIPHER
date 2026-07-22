// js/services/messaging.js - Gestión de mensajes y archivos (Local + P2P)

import { STORAGE_CONFIG } from '../config.js';
import { saveToStore, getAllFromStore, getByIndex } from '../core/storage.js';
import { generateId } from '../utils/formatter.js';
import { sendMessage as p2pSendMessage, sendFile } from '../network/p2p.js';
import { 
    prepareFileForSending, 
    saveReceivedChunk, 
    saveFileMetadata,
    reconstructAndDecryptFile 
} from './files.js';

export async function saveMessage(chatId, text, isSent, senderPin = null, extraData = null) {
    const message = {
        id: generateId(),
        chatId: chatId,
        text: text,
        isSent: isSent,
        senderPin: senderPin,
        timestamp: Date.now(),
        status: isSent ? 'sent' : 'received',
        type: 'text',
        ...extraData
    };

    await saveToStore(STORAGE_CONFIG.stores.messages, message);
    await updateChatPreview(chatId, text, message.timestamp);
    return message;
}

export async function saveFileMessage(chatId, fileMetadata, isSent, senderPin = null) {
    const message = {
        id: generateId(),
        chatId: chatId,
        text: `📎 ${fileMetadata.name}`,
        isSent: isSent,
        senderPin: senderPin,
        timestamp: Date.now(),
        status: isSent ? 'sent' : 'received',
        type: 'file',
        fileId: fileMetadata.id,
        fileName: fileMetadata.name,
        fileSize: fileMetadata.size,
        mimeType: fileMetadata.mimeType
    };

    await saveToStore(STORAGE_CONFIG.stores.messages, message);
    await updateChatPreview(chatId, message.text, message.timestamp);
    return message;
}

export async function sendP2PMessage(targetPin, text, senderPin) {
    const message = await saveMessage(targetPin, text, true, senderPin);
    
    try {
        const result = await p2pSendMessage(targetPin, {
            id: message.id,
            text: text,
            senderPin: senderPin,
            type: 'text'
        });
        
        if (result.status === 'pending') {
            console.log('⏳ Mensaje en cola de envío P2P (se enviará automáticamente al conectar)');
        } else {
            console.log('✅ Mensaje enviado por P2P');
        }
    } catch (error) {
        console.warn('⚠️ Error enviando por P2P:', error.message);
    }
    
    return message;
}

export async function sendP2PFile(targetPin, file, senderPin, onProgress = null) {
    const fileData = await prepareFileForSending(file);
    const message = await saveFileMessage(targetPin, fileData.metadata, true, senderPin);
    
    try {
        await sendFile(targetPin, fileData, onProgress);
        console.log('✅ Archivo enviado por P2P');
    } catch (error) {
        console.warn('⚠️ Error enviando archivo por P2P:', error.message);
    }
    
    return message;
}

export async function receiveP2PMessage(messageData) {
    const { id, text, senderPin, timestamp } = messageData;
    const message = await saveMessage(senderPin, text, false, senderPin);
    
    window.dispatchEvent(new CustomEvent('message-received', {
        detail: { chatId: senderPin, message }
    }));
    
    console.log('📨 Mensaje recibido y guardado:', message);
}

export async function receiveFileMetadata(metadata) {
    await saveFileMetadata(metadata);
    console.log('📥 Metadatos de archivo recibidos:', metadata.name);
}

export async function receiveFileChunk(chunkData) {
    const { fileId, chunkIndex, chunkData: data, totalChunks } = chunkData;
    const isComplete = await saveReceivedChunk(fileId, chunkIndex, data, totalChunks);
    
    if (isComplete) {
        console.log('✅ Archivo completo recibido:', fileId);
        const { getFromStore } = await import('../core/storage.js');
        const fileRecord = await getFromStore(STORAGE_CONFIG.stores.files, fileId);
        
        if (fileRecord && fileRecord.metadata) {
            const message = await saveFileMessage(
                fileRecord.metadata.senderPin || 'unknown',
                fileRecord.metadata,
                false,
                fileRecord.metadata.senderPin
            );
            
            window.dispatchEvent(new CustomEvent('message-received', {
                detail: { chatId: fileRecord.metadata.senderPin || 'unknown', message }
            }));
            
            window.dispatchEvent(new CustomEvent('file-complete', {
                detail: { fileId, metadata: fileRecord.metadata }
            }));
        }
    }
}

export async function downloadReceivedFile(fileId, metadata) {
    const blob = await reconstructAndDecryptFile(fileId, metadata);
    const { downloadFile } = await import('./files.js');
    downloadFile(blob, metadata.name);
}

export async function getChatMessages(chatId) {
    const messages = await getByIndex(STORAGE_CONFIG.stores.messages, 'chatId', chatId);
    return messages.sort((a, b) => a.timestamp - b.timestamp);
}

async function updateChatPreview(chatId, lastMessage, timestamp) {
    await saveToStore(STORAGE_CONFIG.stores.chats, {
        id: chatId,
        lastMessage: lastMessage,
        lastMessageAt: timestamp
    });
}

export async function getAllChatsPreview() {
    return await getAllFromStore(STORAGE_CONFIG.stores.chats);
}