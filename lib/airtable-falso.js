// Airtable en memoria: misma interfaz que lib/airtable.js. Sirve para correr la app
// localmente sin token (npm run dev:falso) y para probar la API sin red.
import { AirtableError } from './airtable.js';
import { seSolapan } from '../public/js/disponibilidad.js';
import { sumarDias } from '../public/js/fechas.js';

let contador = 0;
const nuevoId = () => `rec${String((contador += 1)).padStart(14, '0')}`;

const RE_RANGO = /IS_BEFORE\(\{Fecha entrada\}, DATETIME_PARSE\('(\d{4}-\d{2}-\d{2})'.*IS_AFTER\(\{Fecha salida\}, DATETIME_PARSE\('(\d{4}-\d{2}-\d{2})'/;
const RE_IDS = /RECORD_ID\(\)='(rec[A-Za-z0-9]{14})'/g;
const RE_CANAL = /\{Fuente\} = '([^']+)'.*IS_AFTER\(\{Fecha salida\}, DATETIME_PARSE\('(\d{4}-\d{2}-\d{2})'/;

function filtrar(registros, formula) {
  if (!formula) return registros;
  const rango = formula.match(RE_RANGO);
  if (rango) {
    const [, hasta, desde] = rango;
    const sinCanceladas = formula.includes("{Estado} != 'Cancelada'");
    return registros.filter((r) => seSolapan(
      { entrada: r.fields['Fecha entrada'], salida: r.fields['Fecha salida'] },
      { entrada: desde, salida: hasta },
    ) && !(sinCanceladas && r.fields['Estado'] === 'Cancelada'));
  }
  const canal = formula.match(RE_CANAL);
  if (canal) {
    const [, fuente, hoy] = canal;
    return registros.filter((r) => r.fields['Fuente'] === fuente && String(r.fields['Fecha salida'] ?? '') > hoy);
  }
  const ids = [...formula.matchAll(RE_IDS)].map((m) => m[1]);
  if (ids.length) return registros.filter((r) => ids.includes(r.id));
  throw new Error(`Fórmula no soportada por el Airtable falso: ${formula}`);
}

const copiar = (reg) => JSON.parse(JSON.stringify(reg));

export function crearClienteFalso() {
  const tablas = { Reservas: new Map(), Pagos: new Map(), Canales: new Map() };

  function tablaDe(nombre) {
    const tabla = tablas[nombre];
    if (!tabla) throw new AirtableError(`La tabla ${nombre} no existe.`, 404);
    return tabla;
  }

  function insertar(nombre, fields) {
    const tabla = tablaDe(nombre);
    const reg = { id: nuevoId(), createdTime: new Date().toISOString(), fields: { ...fields } };
    if (nombre === 'Pagos') {
      for (const reservaId of fields['Reserva'] ?? []) {
        const reserva = tablas.Reservas.get(reservaId);
        if (!reserva) throw new AirtableError('La reserva vinculada no existe.', 422);
        reserva.fields['Pagos'] = [...(reserva.fields['Pagos'] ?? []), reg.id];
      }
    }
    tabla.set(reg.id, reg);
    return copiar(reg);
  }

  return {
    async listar(nombre, { filterByFormula, maxRecords, sort } = {}) {
      let regs = filtrar([...tablaDe(nombre).values()], filterByFormula);
      for (const s of [...(sort ?? [])].reverse()) {
        const signo = s.direction === 'desc' ? -1 : 1;
        regs.sort((a, b) => signo * String(a.fields[s.field] ?? '').localeCompare(String(b.fields[s.field] ?? '')));
      }
      if (maxRecords) regs = regs.slice(0, maxRecords);
      return regs.map(copiar);
    },
    async obtener(nombre, id) {
      const reg = tablaDe(nombre).get(id);
      if (!reg) throw new AirtableError('Registro no encontrado.', 404);
      return copiar(reg);
    },
    async crear(nombre, fields) {
      return insertar(nombre, fields);
    },
    async actualizar(nombre, id, fields) {
      const reg = tablaDe(nombre).get(id);
      if (!reg) throw new AirtableError('Registro no encontrado.', 404);
      Object.assign(reg.fields, fields);
      return copiar(reg);
    },
    _tablas: tablas,
  };
}

// Tres reservas alrededor de `hoy`: una confirmada con anticipo, un Full House
// pendiente y una en curso ya pagada.
export async function sembrarDemo(cliente, hoy) {
  const a = await cliente.crear('Reservas', {
    'Huésped': 'Ana Pérez', 'Teléfono': '310 000 0000', 'Fecha entrada': sumarDias(hoy, 5), 'Fecha salida': sumarDias(hoy, 7),
    'Habitaciones': ['La Rosaura', 'La Clara'], 'Personas': 11, 'Valor total': 1060000, 'Estado': 'Confirmado', 'Notas': 'Llegan tarde',
  });
  await cliente.crear('Pagos', { 'Concepto': 'Anticipo · Ana Pérez', 'Reserva': [a.id], 'Fecha': hoy, 'Monto': 530000, 'Medio': 'Nequi' });
  const b = await cliente.crear('Reservas', {
    'Huésped': 'Familia Gómez', 'Teléfono': '+57 300 111 2233', 'Fecha entrada': sumarDias(hoy, 12), 'Fecha salida': sumarDias(hoy, 14),
    'Habitaciones': ['FULL HOUSE'], 'Personas': 26, 'Valor total': 2100000, 'Estado': 'Anticipo pendiente',
  });
  const c = await cliente.crear('Reservas', {
    'Huésped': 'Carlos Ruiz', 'Teléfono': '3155550000', 'Fecha entrada': sumarDias(hoy, -2), 'Fecha salida': sumarDias(hoy, 1),
    'Habitaciones': ['La Yaneth'], 'Personas': 4, 'Valor total': 630000, 'Estado': 'Confirmado',
  });
  await cliente.crear('Pagos', { 'Concepto': 'Anticipo · Carlos Ruiz', 'Reserva': [c.id], 'Fecha': sumarDias(hoy, -10), 'Monto': 315000, 'Medio': 'Bancolombia' });
  await cliente.crear('Pagos', { 'Concepto': 'Abono · Carlos Ruiz', 'Reserva': [c.id], 'Fecha': sumarDias(hoy, -2), 'Monto': 315000, 'Medio': 'Efectivo', 'Nota': 'Pago al llegar' });
  const canal = await cliente.crear('Canales', { 'Canal': 'Airbnb', 'Activo': true, 'Enlace ICS': 'https://www.airbnb.com/calendar/ical/demo.ics' });
  return { a: a.id, b: b.id, c: c.id, canalAirbnb: canal.id };
}
