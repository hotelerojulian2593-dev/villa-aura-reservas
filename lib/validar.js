import { esFechaISO } from '../public/js/fechas.js';
import { OPCIONES_HABITACION, FULL_HOUSE } from '../public/js/disponibilidad.js';

export const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Efectivo', 'Otro'];
export const MAX_DIAS_RANGO = 93;
const RE_RECORD = /^rec[A-Za-z0-9]{14}$/;

const error = (mensaje) => ({ ok: false, error: mensaje });

function texto(valor, max) {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

// Entero no negativo. Acepta cadenas de solo dígitos (vienen de inputs); rechaza lo demás.
export function aEntero(valor) {
  if (typeof valor === 'string') return /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : NaN;
  return Number.isInteger(valor) ? valor : NaN;
}

export function validarAbono(abono, hoy) {
  const monto = aEntero(abono?.monto);
  if (!(monto > 0)) return error('El monto del abono debe ser un número entero mayor que cero.');
  if (!MEDIOS.includes(abono?.medio)) return error(`El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.`);
  const fecha = abono.fecha == null || abono.fecha === '' ? hoy : abono.fecha;
  if (!esFechaISO(fecha)) return error('La fecha del abono no es válida.');
  if (typeof abono.nota === 'string' && abono.nota.trim().length > 500) return error('La nota no puede superar 500 caracteres.');
  return { ok: true, datos: { monto, medio: abono.medio, fecha, nota: texto(abono.nota, 500) } };
}

export function validarReservaNueva(body, hoy) {
  const huesped = texto(body.huesped, 120);
  if (!huesped) return error('El nombre del huésped es requerido.');
  const telefono = texto(body.telefono, 40);
  if (!telefono) return error('El teléfono es requerido.');
  const { entrada, salida } = body;
  if (!esFechaISO(entrada)) return error('La fecha de llegada no es válida.');
  if (!esFechaISO(salida)) return error('La fecha de salida no es válida.');
  if (entrada < hoy) return error('La fecha de llegada no puede ser anterior a hoy.');
  if (salida <= entrada) return error('La fecha de salida debe ser posterior a la llegada.');
  const habitaciones = Array.isArray(body.habitaciones) ? [...new Set(body.habitaciones)] : [];
  if (habitaciones.length === 0) return error('Selecciona al menos una habitación.');
  if (habitaciones.some((h) => !OPCIONES_HABITACION.includes(h))) return error('Hay una habitación que no existe.');
  if (habitaciones.includes(FULL_HOUSE) && habitaciones.length > 1) return error('Full House no se combina con habitaciones sueltas.');
  const personas = aEntero(body.personas);
  if (!(personas >= 1 && personas <= 60)) return error('El número de personas debe estar entre 1 y 60.');
  const valorTotal = aEntero(body.valorTotal);
  if (!(valorTotal > 0)) return error('El valor total acordado es requerido.');
  let abono = null;
  if (body.abono != null && body.abono !== '') {
    const v = validarAbono(body.abono, hoy);
    if (!v.ok) return v;
    abono = v.datos;
  }
  return {
    ok: true,
    datos: { huesped, telefono, entrada, salida, habitaciones, personas, valorTotal, abono, notas: texto(body.notas, 1000) },
  };
}

export function validarPagoNuevo(body, hoy) {
  const reservaId = typeof body.reservaId === 'string' ? body.reservaId.trim() : '';
  if (!RE_RECORD.test(reservaId)) return error('La reserva indicada no es válida.');
  const v = validarAbono(body, hoy);
  if (!v.ok) return v;
  return { ok: true, datos: { reservaId, ...v.datos } };
}

export function validarRango(query) {
  const { desde, hasta } = query ?? {};
  if (!esFechaISO(desde) || !esFechaISO(hasta)) return error('Indica desde y hasta en formato YYYY-MM-DD.');
  if (hasta <= desde) return error('"hasta" debe ser posterior a "desde".');
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
  if (dias > MAX_DIAS_RANGO) return error(`El rango no puede superar ${MAX_DIAS_RANGO} días.`);
  return { ok: true, datos: { desde, hasta } };
}

// ── Operaciones de gerencia ──────────────────────────────────────────────────

function idValido(id) {
  return typeof id === 'string' && RE_RECORD.test(id.trim()) ? id.trim() : null;
}

function objetoDeCambios(cambios) {
  return cambios && typeof cambios === 'object' && !Array.isArray(cambios) && Object.keys(cambios).length > 0 ? cambios : null;
}

const CLAVES_RESERVA = ['huesped', 'telefono', 'entrada', 'salida', 'habitaciones', 'personas', 'valorTotal', 'notas'];

// Valida cada campo presente con las mismas reglas que al crear. No compara
// fechas entre sí ni con hoy: la API lo hace sobre la reserva ya fusionada.
export function validarCambiosReserva(body) {
  const id = idValido(body?.id);
  if (!id) return error('La reserva indicada no es válida.');
  const cambios = objetoDeCambios(body.cambios);
  if (!cambios) return error('No hay cambios.');
  const desconocida = Object.keys(cambios).find((k) => !CLAVES_RESERVA.includes(k));
  if (desconocida) return error(`Campo desconocido: ${desconocida}.`);
  const datos = {};
  if ('huesped' in cambios) {
    datos.huesped = texto(cambios.huesped, 120);
    if (!datos.huesped) return error('El nombre del huésped es requerido.');
  }
  if ('telefono' in cambios) {
    datos.telefono = texto(cambios.telefono, 40);
    if (!datos.telefono) return error('El teléfono es requerido.');
  }
  if ('entrada' in cambios) {
    if (!esFechaISO(cambios.entrada)) return error('La fecha de llegada no es válida.');
    datos.entrada = cambios.entrada;
  }
  if ('salida' in cambios) {
    if (!esFechaISO(cambios.salida)) return error('La fecha de salida no es válida.');
    datos.salida = cambios.salida;
  }
  if ('habitaciones' in cambios) {
    const habitaciones = Array.isArray(cambios.habitaciones) ? [...new Set(cambios.habitaciones)] : [];
    if (habitaciones.length === 0) return error('Selecciona al menos una habitación.');
    if (habitaciones.some((h) => !OPCIONES_HABITACION.includes(h))) return error('Hay una habitación que no existe.');
    if (habitaciones.includes(FULL_HOUSE) && habitaciones.length > 1) return error('Full House no se combina con habitaciones sueltas.');
    datos.habitaciones = habitaciones;
  }
  if ('personas' in cambios) {
    const personas = aEntero(cambios.personas);
    if (!(personas >= 1 && personas <= 60)) return error('El número de personas debe estar entre 1 y 60.');
    datos.personas = personas;
  }
  if ('valorTotal' in cambios) {
    const valorTotal = aEntero(cambios.valorTotal);
    if (!(valorTotal > 0)) return error('El valor total acordado es requerido.');
    datos.valorTotal = valorTotal;
  }
  if ('notas' in cambios) datos.notas = texto(cambios.notas, 1000);
  return { ok: true, datos: { id, cambios: datos } };
}

export function validarCancelacion(body) {
  const id = idValido(body?.id);
  if (!id) return error('La reserva indicada no es válida.');
  const motivo = texto(body.cancelar?.motivo, 300);
  if (!motivo) return error('Indica el motivo de la cancelación.');
  return { ok: true, datos: { id, motivo } };
}

const CLAVES_PAGO = ['monto', 'fecha', 'medio', 'nota'];

export function validarCambiosPago(body) {
  const id = idValido(body?.id);
  if (!id) return error('El abono indicado no es válido.');
  const cambios = objetoDeCambios(body.cambios);
  if (!cambios) return error('No hay cambios.');
  const desconocida = Object.keys(cambios).find((k) => !CLAVES_PAGO.includes(k));
  if (desconocida) return error(`Campo desconocido: ${desconocida}.`);
  const datos = {};
  if ('monto' in cambios) {
    const monto = aEntero(cambios.monto);
    if (!(monto > 0)) return error('El monto del abono debe ser un número entero mayor que cero.');
    datos.monto = monto;
  }
  if ('fecha' in cambios) {
    if (!esFechaISO(cambios.fecha)) return error('La fecha del abono no es válida.');
    datos.fecha = cambios.fecha;
  }
  if ('medio' in cambios) {
    if (!MEDIOS.includes(cambios.medio)) return error(`El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.`);
    datos.medio = cambios.medio;
  }
  if ('nota' in cambios) {
    if (typeof cambios.nota === 'string' && cambios.nota.trim().length > 500) return error('La nota no puede superar 500 caracteres.');
    datos.nota = texto(cambios.nota, 500);
  }
  return { ok: true, datos: { id, cambios: datos } };
}

export function validarAnulacion(body) {
  const id = idValido(body?.id);
  if (!id) return error('El abono indicado no es válido.');
  const motivo = texto(body.anular?.motivo, 300);
  if (!motivo) return error('Indica el motivo de la anulación.');
  return { ok: true, datos: { id, motivo } };
}
