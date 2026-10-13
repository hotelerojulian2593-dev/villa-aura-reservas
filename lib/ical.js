// iCalendar mínimo (RFC 5545) para sincronizar disponibilidad con las OTAs. Puro: sin red.
import { sumarDias } from '../public/js/fechas.js';
import { FUENTES } from '../public/js/canales.js';

export const RESUMEN_RESERVA_AIRBNB = 'Reserved';
export const HOST = 'villa-aura-reservas.vercel.app';

// Desdobla líneas plegadas: CRLF (o LF) seguido de espacio o tabulación. Tolera BOM y espacios finales.
function lineasDe(texto) {
  return String(texto ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n').map((l) => l.replace(/\r$/, '').trimEnd());
}

// RFC 5545 §3.3.11, en una sola pasada: \n → salto de línea; \\ \; \, → el carácter.
function desescapar(valor) {
  return valor.replace(/\\([nN\\;,])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// 20261017 | 20261017T150000Z → 2026-10-17
function aFechaISO(valor) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parsearIcs(texto) {
  const lineas = lineasDe(texto);
  const claves = lineas.map((l) => l.toUpperCase());
  if (!claves.includes('BEGIN:VCALENDAR') || !claves.includes('END:VCALENDAR')) throw new Error('ICS inválido');
  const eventos = [];
  let actual = null;
  for (const linea of lineas) {
    const clave = linea.toUpperCase();
    if (clave === 'BEGIN:VEVENT') { actual = {}; continue; }
    if (clave === 'END:VEVENT') {
      if (actual?.uid && actual.inicio) {
        eventos.push({ uid: actual.uid, inicio: actual.inicio, fin: actual.fin ?? sumarDias(actual.inicio, 1), resumen: actual.resumen ?? '', descripcion: actual.descripcion ?? '' });
      }
      actual = null;
      continue;
    }
    if (!actual) continue;
    const dosPuntos = linea.indexOf(':');
    if (dosPuntos < 0) continue;
    const nombre = linea.slice(0, dosPuntos).split(';')[0].toUpperCase();
    const valor = linea.slice(dosPuntos + 1);
    if (nombre === 'UID') actual.uid = valor.trim();
    else if (nombre === 'DTSTART') actual.inicio = aFechaISO(valor);
    else if (nombre === 'DTEND') actual.fin = aFechaISO(valor);
    else if (nombre === 'SUMMARY') actual.resumen = desescapar(valor).trim();
    else if (nombre === 'DESCRIPTION') actual.descripcion = desescapar(valor).trim();
  }
  return eventos;
}

// Qué eventos del canal son reservas que nos interesan. Airbnb marca las reales como
// "Reserved" y mezcla bloqueos y ecos en "Airbnb (Not available)"; Booking no distingue.
export function eventosReserva(canal, eventos, hoy) {
  const vistos = new Set();
  return eventos.filter((e) => {
    if (canal === FUENTES.airbnb && e.resumen !== RESUMEN_RESERVA_AIRBNB) return false;
    if (!e.inicio || !e.fin || e.fin <= hoy || e.fin <= e.inicio) return false;
    if (vistos.has(e.uid)) return false;
    vistos.add(e.uid);
    return true;
  });
}

export function datosDeDescripcion(descripcion) {
  const texto = String(descripcion ?? '');
  const enlace = /https?:\/\/\S+/.exec(texto)?.[0] ?? '';
  const codigo = /\/details\/([A-Za-z0-9]+)/.exec(enlace)?.[1] ?? '';
  const telefonoFinal = /Last 4 Digits\)\s*:\s*(\d{4})/i.exec(texto)?.[1] ?? '';
  return { codigo, enlace, telefonoFinal };
}

const compacta = (iso) => iso.replace(/-/g, '');
const marcaUtc = (fecha) => fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545: máximo 75 octetos por línea; cada continuación empieza con un espacio.
export function plegar(linea) {
  const partes = [];
  let resto = linea;
  let limite = 75;
  while (Buffer.byteLength(resto, 'utf8') > limite) {
    let corte = Math.min(limite, resto.length);
    while (Buffer.byteLength(resto.slice(0, corte), 'utf8') > limite) corte -= 1;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte);
    limite = 74;
  }
  partes.push(resto);
  return partes.join('\r\n ');
}

// Todas las reservas activas como noches ocupadas de la casa completa. Nunca nombres.
export function generarIcs(reservas, ahora = new Date()) {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Villa Aura//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const r of reservas) {
    if (!r.entrada || !r.salida) continue;
    lineas.push('BEGIN:VEVENT', `UID:${r.id}@${HOST}`, `DTSTAMP:${marcaUtc(ahora)}`,
      `DTSTART;VALUE=DATE:${compacta(r.entrada)}`, `DTEND;VALUE=DATE:${compacta(r.salida)}`, 'SUMMARY:Villa Aura - ocupado', 'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}
