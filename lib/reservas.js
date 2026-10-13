import { noches, esFechaISO } from '../public/js/fechas.js';
import { resumenPagos } from '../public/js/pagos.js';
import { FUENTES, CANALES } from '../public/js/canales.js';

export { FUENTES };

export const ESTADOS = { confirmado: 'Confirmado', pendiente: 'Anticipo pendiente', cancelada: 'Cancelada' };
const RE_RECORD = /^rec[A-Za-z0-9]{14}$/;
const TAMANO_LOTE = 40;

export function tablasDesdeEnv(env = process.env) {
  return { reservas: env.AIRTABLE_TABLA_RESERVAS || 'Reservas', pagos: env.AIRTABLE_TABLA_PAGOS || 'Pagos', canales: env.AIRTABLE_TABLA_CANALES || 'Canales' };
}

// Solo se interpolan fechas ISO validadas e ids con forma de Airtable: nunca texto libre.
export function formulaRango(desde, hasta, { incluirCanceladas = false } = {}) {
  if (!esFechaISO(desde) || !esFechaISO(hasta)) throw new Error('formulaRango requiere fechas ISO.');
  const canceladas = incluirCanceladas ? '' : `, {Estado} != '${ESTADOS.cancelada}'`;
  return `AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('${hasta}', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('${desde}', 'YYYY-MM-DD'))${canceladas})`;
}

export function formulaIds(ids) {
  if (!ids.length || ids.some((id) => !RE_RECORD.test(id))) throw new Error('formulaIds recibió un id inválido.');
  return `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
}

// Reservas de un canal con salida futura, incluidas las canceladas (para reconocer un UID que vuelve).
export function formulaCanal(canal, hoy) {
  if (!CANALES.includes(canal)) throw new Error('formulaCanal requiere un canal conocido.');
  if (!esFechaISO(hoy)) throw new Error('formulaCanal requiere una fecha ISO.');
  return `AND({Fuente} = '${canal}', IS_AFTER({Fecha salida}, DATETIME_PARSE('${hoy}', 'YYYY-MM-DD')))`;
}

// La REST API devuelve selects como texto; otras rutas (MCP) como { name }.
const nombreOpcion = (valor) => (typeof valor === 'string' ? valor : valor?.name ?? null);

export function aPagoApi(reg) {
  const f = reg.fields ?? {};
  const monto = Number(f['Monto']) || 0;
  const nota = f['Nota'] ?? '';
  return { id: reg.id, fecha: f['Fecha'] ?? null, monto, medio: nombreOpcion(f['Medio']), nota, anulado: monto === 0 && nota.startsWith('ANULADO') };
}

export function ordenarPagos(pagos) {
  return [...pagos].sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')));
}

export function aReservaApi(reg, pagos = []) {
  const f = reg.fields ?? {};
  const entrada = f['Fecha entrada'] ?? null;
  const salida = f['Fecha salida'] ?? null;
  const valorTotal = f['Valor total'] == null ? null : Number(f['Valor total']);
  const pagosOrdenados = ordenarPagos(pagos);
  return {
    id: reg.id,
    huesped: f['Huésped'] ?? '',
    telefono: f['Teléfono'] ?? '',
    entrada,
    salida,
    noches: entrada && salida ? noches(entrada, salida) : 0,
    habitaciones: (f['Habitaciones'] ?? []).map(nombreOpcion),
    personas: Number(f['Personas']) || 0,
    estado: nombreOpcion(f['Estado']) ?? ESTADOS.pendiente,
    notas: f['Notas'] ?? '',
    historial: f['Historial'] ?? '',
    fuente: nombreOpcion(f['Fuente']) ?? FUENTES.directo,
    uidCanal: f['UID canal'] ?? '',
    enlaceCanal: f['Enlace canal'] ?? '',
    valorTotal,
    ...resumenPagos(valorTotal, pagosOrdenados),
    pagos: pagosOrdenados,
  };
}

export async function cargarPagosPorIds(cliente, tablaPagos, ids) {
  const pagos = [];
  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    const regs = await cliente.listar(tablaPagos, { filterByFormula: formulaIds(ids.slice(i, i + TAMANO_LOTE)) });
    pagos.push(...regs.map(aPagoApi));
  }
  return ordenarPagos(pagos);
}

export function listarReservasEnRango(cliente, tablas, desde, hasta, opciones = {}) {
  return cliente.listar(tablas.reservas, {
    filterByFormula: formulaRango(desde, hasta, opciones),
    sort: [{ field: 'Fecha entrada', direction: 'asc' }],
  });
}

export async function cargarReservasConPagos(cliente, tablas, desde, hasta, opciones = {}) {
  const regs = await listarReservasEnRango(cliente, tablas, desde, hasta, opciones);
  const pagos = await cargarPagosPorIds(cliente, tablas.pagos, regs.flatMap((r) => r.fields['Pagos'] ?? []));
  const porId = new Map(pagos.map((p) => [p.id, p]));
  return regs.map((r) => aReservaApi(r, (r.fields['Pagos'] ?? []).map((id) => porId.get(id)).filter(Boolean)));
}

export function camposReservaNueva(datos) {
  return {
    'Huésped': datos.huesped,
    'Teléfono': datos.telefono,
    'Fecha entrada': datos.entrada,
    'Fecha salida': datos.salida,
    'Habitaciones': datos.habitaciones,
    'Personas': datos.personas,
    'Valor total': datos.valorTotal,
    'Estado': datos.abono ? ESTADOS.confirmado : ESTADOS.pendiente,
    'Fuente': FUENTES.directo,
    ...(datos.notas ? { 'Notas': datos.notas } : {}),
  };
}

export function camposPagoNuevo({ reservaId, huesped, esPrimero, monto, medio, fecha, nota }) {
  return {
    'Concepto': `${esPrimero ? 'Anticipo' : 'Abono'} · ${huesped}`,
    'Reserva': [reservaId],
    'Fecha': fecha,
    'Monto': monto,
    'Medio': medio,
    ...(nota ? { 'Nota': nota } : {}),
  };
}

const CAMPOS_RESERVA = {
  huesped: 'Huésped', telefono: 'Teléfono', entrada: 'Fecha entrada', salida: 'Fecha salida',
  habitaciones: 'Habitaciones', personas: 'Personas', valorTotal: 'Valor total', notas: 'Notas',
};
const CAMPOS_PAGO = { monto: 'Monto', fecha: 'Fecha', medio: 'Medio', nota: 'Nota' };

function mapear(cambios, mapa) {
  const campos = {};
  for (const [clave, valor] of Object.entries(cambios)) if (mapa[clave]) campos[mapa[clave]] = valor;
  return campos;
}

export function camposCambiosReserva(cambios) {
  return mapear(cambios, CAMPOS_RESERVA);
}

export function camposCambiosPago(cambios) {
  return mapear(cambios, CAMPOS_PAGO);
}

export function aCanalApi(reg) {
  const f = reg.fields ?? {};
  return {
    id: reg.id, canal: f['Canal'] ?? '', activo: Boolean(f['Activo']), enlace: f['Enlace ICS'] ?? '',
    ultimaLectura: f['Última lectura'] ?? null, ultimoResultado: f['Último resultado'] ?? '',
  };
}

export const estadoCanal = (c) => ({ canal: c.canal, ultimaLectura: c.ultimaLectura, ultimoResultado: c.ultimoResultado });

export async function listarCanalesActivos(cliente, tablas) {
  return (await cliente.listar(tablas.canales)).map(aCanalApi).filter((c) => c.activo);
}
