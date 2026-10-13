import { noches } from './fechas.js';
import { formatearCOP } from './dinero.js';
import { expandir, FULL_HOUSE } from './disponibilidad.js';

// Posición de la barra de una reserva dentro de un mes [desde, hasta).
export function barraEnMes(reserva, desde, hasta) {
  const inicio = reserva.entrada > desde ? reserva.entrada : desde;
  const fin = reserva.salida < hasta ? reserva.salida : hasta;
  if (fin <= inicio) return null;
  return {
    diaInicio: Number(inicio.slice(8, 10)),
    span: noches(inicio, fin),
    cortadaIzq: reserva.entrada < desde,
    cortadaDer: reserva.salida > hasta,
  };
}

export function filasDe(reserva) {
  return expandir(reserva.habitaciones);
}

export function colorEstado(reserva) {
  if (reserva.habitaciones.includes(FULL_HOUSE)) return 'fullhouse';
  return reserva.estado === 'Confirmado' ? 'confirmado' : 'pendiente';
}

// Activas y futuras primero (por llegada), luego las que ya salieron.
export function ordenarProximas(reservas, hoy) {
  const porLlegada = (a, b) => a.entrada.localeCompare(b.entrada);
  const vigentes = reservas.filter((r) => r.salida > hoy).sort(porLlegada);
  const pasadas = reservas.filter((r) => r.salida <= hoy).sort(porLlegada);
  return [...vigentes, ...pasadas];
}

export function telefonoWa(telefono) {
  let digitos = String(telefono ?? '').replace(/\D/g, '');
  if (digitos.length === 10) digitos = `57${digitos}`;
  if (digitos.length < 11) return null;
  return `https://wa.me/${digitos}`;
}

export function etiquetaPago(reserva) {
  switch (reserva.estadoPago) {
    case 'pagado': return 'Pagado ✓';
    case 'parcial': return `Falta ${formatearCOP(reserva.saldo)}`;
    case 'sin_anticipo': return 'Sin anticipo';
    default: return 'Valor total sin definir';
  }
}

export function porcentajePago(reserva) {
  if (!reserva.valorTotal) return 0;
  return Math.max(0, Math.min(100, Math.round((100 * reserva.pagado) / reserva.valorTotal)));
}
