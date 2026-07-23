// js/utils/formatter.js - Utilidades de formateo

/**
 * Formatea un timestamp a hora legible (HH:mm)
 * @param {number|string} timestamp - Timestamp en milisegundos
 * @returns {string} Hora formateada
 */
export function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Formatea un timestamp a hora legible según la fecha (Hoy, Ayer, Día, Fecha)
 * @param {number|string} timestamp - Timestamp en milisegundos
 * @returns {string} Fecha u hora formateada
 */
export function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return formatTime(timestamp);
    } else if (diffDays === 1) {
        return 'Ayer';
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
 * Formatea un PIN para mostrarlo con guiones (ej: XXX-XXXX-XXX)
 * @param {string} pin - PIN sin formato
 * @returns {string} PIN formateado
 */
export function formatPin(pin) {
    if (!pin) return '';
    const clean = pin.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length < 10) return clean;
    return `${clean.substr(0, 3)}-${clean.substr(3, 4)}-${clean.substr(7, 3)}`;
}

/**
 * Trunca un texto largo con elipsis
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima (por defecto 40)
 * @returns {string} Texto truncado
 */
export function truncateText(text, maxLength = 40) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
}

/**
 * Genera iniciales para un avatar a partir de un nombre o PIN
 * @param {string} name - Nombre o PIN
 * @returns {string} Iniciales (1-2 caracteres)
 */
export function getInitials(name) {
    if (!name) return "?";
    
    // Si es un PIN o cadena alfanumérica con guiones
    if (/^[A-Z0-9-]+$/i.test(name)) {
        return name.replace(/-/g, '').slice(0, 2).toUpperCase();
    }
    
    // Si es un nombre, tomar iniciales de las palabras
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Genera un ID único para mensajes/chats
 * @returns {string} ID único basado en tiempo y aleatoriedad
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Escapa HTML para prevenir vulnerabilidades XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto seguro para insertar en el DOM
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
