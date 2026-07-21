// js/utils/formatter.js - Utilidades de formateo

/**
 * Formatea un timestamp a hora legible según la fecha
 * @param {number} timestamp - Timestamp en milisegundos
 * @returns {string} Hora formateada
 */
export function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    if (diffDays === 0) {
        return `${hours}:${minutes}`;
    } else if (diffDays === 1) {
        return `Ayer`;
    } else if (diffDays < 7) {
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return days[date.getDay()];
    } else {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    }
}

/**
 * Formatea un PIN para mostrarlo con guiones
 * @param {string} pin - PIN sin formato
 * @returns {string} PIN formateado (XXX-XXXX-XX)
 */
export function formatPin(pin) {
    if (!pin || pin.length !== 10) return pin;
    return `${pin.slice(0, 3)}-${pin.slice(3, 7)}-${pin.slice(7, 10)}`;
}

/**
 * Trunca un texto largo con elipsis
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string} Texto truncado
 */
export function truncateText(text, maxLength = 40) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
}

/**
 * Genera iniciales para un avatar a partir de un nombre o PIN
 * @param {string} name - Nombre o identificador
 * @returns {string} Iniciales (1-2 caracteres)
 */
export function getInitials(name) {
    if (!name) return "?";
    
    // Si es un PIN, tomar primeros 2 caracteres
    if (/^[A-Z0-9-]+$/.test(name)) {
        return name.replace(/-/g, '').slice(0, 2);
    }
    
    // Si es un nombre, tomar iniciales de palabras
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Genera un ID único para mensajes/chats
 * @returns {string} ID único
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto seguro
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}