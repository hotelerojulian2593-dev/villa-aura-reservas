import { noches } from './fechas.js';
import { HABITACIONES, expandir } from './disponibilidad.js';

// Resumen de pagos de una reserva. valorTotal null = reserva vieja sin valor definido.
export function resumenPagos(valorTotal, pagos) {
  const pagado = (pagos ?? []).reduce((suma, p) => suma + (Number(p.monto) || 0), 0);
  if (valorTotal == null) return { pagado, saldo: null, estadoPago: 'sin_valor' };
  const saldo = valorTotal - pagado;
  const estadoPago = pagado <= 0 ? 'sin_anticipo' : pagado >= valorTotal ? 'pagado' : 'parcial';
  return { pagado, saldo, estadoPago };
}

// Noches de la reserva que caen dentro de [desde, hasta).
export function nochesEnRango(reserva, desde, hasta) {
  const inicio = reserva.entrada > desde ? reserva.entrada : desde;
  const fin = reserva.salida < hasta ? reserva.salida : hasta;
  return fin > inicio ? noches(inicio, fin) : 0;
}

export function kpisMes(reservas, desde, hasta) {
  const capacidad = HABITACIONES.length * noches(desde, hasta);
  let nochesOcupadas = 0;
  let cobrado = 0;
  let porCobrar = 0;
  let sinValor = 0;
  for (const r of reservas) {
    nochesOcupadas += nochesEnRango(r, desde, hasta) * expandir(r.habitaciones).length;
    for (const p of r.pagos ?? []) {
      if (p.fecha >= desde && p.fecha < hasta) cobrado += Number(p.monto) || 0;
    }
    if (r.entrada >= desde && r.entrada < hasta) {
      const { saldo, estadoPago } = resumenPagos(r.valorTotal, r.pagos);
      if (estadoPago === 'sin_valor') sinValor += 1;
      else if (saldo > 0) porCobrar += saldo;
    }
  }
  return {
    ocupacion: capacidad ? Math.round((100 * nochesOcupadas) / capacidad) : 0,
    nochesOcupadas, cobrado, porCobrar, sinValor,
  };
}
