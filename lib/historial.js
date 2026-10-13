// Historial legible de cambios hechos por gerencia. Puro: sin red ni Airtable.
import { formatearCOP } from '../public/js/dinero.js';
import { ZONA } from '../public/js/fechas.js';

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export const ETIQUETAS = {
  huesped: 'Huésped', telefono: 'Teléfono', entrada: 'Fecha entrada', salida: 'Fecha salida',
  habitaciones: 'Habitaciones', personas: 'Personas', valorTotal: 'Valor total', notas: 'Notas',
  monto: 'Monto', fecha: 'Fecha', medio: 'Medio', nota: 'Nota',
};
const DINERO = new Set(['valorTotal', 'monto']);

export function marcaDeTiempo(ahora = new Date()) {
  return formato.format(ahora).replace(', ', ' ');
}

export function lineaHistorial(texto, ahora = new Date()) {
  return `${marcaDeTiempo(ahora)} · gerencia · ${texto}`;
}

export function anteponer(historial, linea) {
  return historial ? `${linea}\n${historial}` : linea;
}

function igual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return [...(a ?? [])].join('|') === [...(b ?? [])].join('|');
  return (a ?? '') === (b ?? '');
}

function mostrar(clave, valor) {
  if (valor == null || valor === '' || (Array.isArray(valor) && valor.length === 0)) return '—';
  if (Array.isArray(valor)) return valor.join(', ');
  if (DINERO.has(clave)) return formatearCOP(valor);
  return String(valor);
}

export function cambiosReales(antes, despues) {
  const reales = {};
  for (const [clave, valor] of Object.entries(despues ?? {})) {
    if (!igual(antes?.[clave], valor)) reales[clave] = valor;
  }
  return reales;
}

export function describirCambios(antes, despues) {
  return Object.entries(cambiosReales(antes, despues))
    .map(([clave, valor]) => `${ETIQUETAS[clave] ?? clave}: ${mostrar(clave, antes?.[clave])} → ${mostrar(clave, valor)}`)
    .join('; ');
}
