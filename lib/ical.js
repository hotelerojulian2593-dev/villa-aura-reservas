// iCalendar mínimo (RFC 5545) para sincronizar disponibilidad con las OTAs. Puro: sin red.
import { sumarDias } from '../public/js/fechas.js';
import { FUENTES } from '../public/js/canales.js';

export const RESUMEN_RESERVA_AIRBNB = 'Reserved';
export const HOST = 'villa-aura-reservas.vercel.app';

// Desdobla líneas plegadas: CRLF (o LF) seguido de espacio o tabulación.
function lineasDe(texto) {
  return String(texto ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n').map((l) => l.replace(/\r$/, ''));
}

function desescapar(valor) {
  return valor.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}

// 20261017 | 20261017T150000Z → 2026-10-17
function aFechaISO(valor) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parsearIcs(texto) {
  const lineas = lineasDe(texto);
  if (!lineas.includes('BEGIN:VCALENDAR') || !lineas.includes('END:VCALENDAR')) throw new Error('ICS inválido');
  const eventos = [];
  let actual = null;
  for (const linea of lineas) {
    if (linea === 'BEGIN:VEVENT') { actual = {}; continue; }
    if (linea === 'END:VEVENT') {
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
