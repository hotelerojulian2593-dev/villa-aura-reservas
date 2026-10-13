import { describe, it, expect } from 'vitest';
import { resumenPagos, nochesEnRango, kpisMes } from '../public/js/pagos.js';

describe('resumenPagos', () => {
  it('parcial: hay abono pero falta', () => {
    expect(resumenPagos(1060000, [{ monto: 530000 }])).toEqual({ pagado: 530000, saldo: 530000, estadoPago: 'parcial' });
  });
  it('sin anticipo', () => {
    expect(resumenPagos(1060000, [])).toEqual({ pagado: 0, saldo: 1060000, estadoPago: 'sin_anticipo' });
  });
  it('pagado completo o de más', () => {
    expect(resumenPagos(1060000, [{ monto: 530000 }, { monto: 530000 }])).toEqual({ pagado: 1060000, saldo: 0, estadoPago: 'pagado' });
    expect(resumenPagos(500000, [{ monto: 600000 }])).toEqual({ pagado: 600000, saldo: -100000, estadoPago: 'pagado' });
  });
  it('sin valor total: no inventa saldo', () => {
    expect(resumenPagos(null, [{ monto: 200000 }])).toEqual({ pagado: 200000, saldo: null, estadoPago: 'sin_valor' });
  });
  it('tolera pagos sin lista o con montos raros', () => {
    expect(resumenPagos(100, undefined)).toEqual({ pagado: 0, saldo: 100, estadoPago: 'sin_anticipo' });
    expect(resumenPagos(100, [{ monto: 'x' }])).toEqual({ pagado: 0, saldo: 100, estadoPago: 'sin_anticipo' });
  });
});

const MES = { desde: '2026-10-01', hasta: '2026-11-01' };
const A = { entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'], valorTotal: 1060000, pagos: [{ fecha: '2026-10-12', monto: 530000 }] };
const B = { entrada: '2026-10-30', salida: '2026-11-02', habitaciones: ['FULL HOUSE'], valorTotal: 3000000, pagos: [{ fecha: '2026-09-28', monto: 1500000 }] };
const C = { entrada: '2026-10-05', salida: '2026-10-06', habitaciones: ['La Clara'], valorTotal: null, pagos: [] };
const D = { entrada: '2026-09-29', salida: '2026-10-02', habitaciones: ['La Elsa'], valorTotal: 400000, pagos: [{ fecha: '2026-10-01', monto: 400000 }] };

describe('nochesEnRango', () => {
  it('solo cuenta noches dentro del rango', () => {
    expect(nochesEnRango(A, MES.desde, MES.hasta)).toBe(2);
    expect(nochesEnRango(B, MES.desde, MES.hasta)).toBe(2);   // 30 y 31 de octubre
    expect(nochesEnRango(D, MES.desde, MES.hasta)).toBe(1);   // 1 de octubre
    expect(nochesEnRango(B, '2026-11-01', '2026-12-01')).toBe(1); // 1 de noviembre
    expect(nochesEnRango(A, '2026-11-01', '2026-12-01')).toBe(0);
  });
});

describe('kpisMes', () => {
  it('ocupación, cobrado y por cobrar del mes', () => {
    const k = kpisMes([A, B, C, D], MES.desde, MES.hasta);
    expect(k.nochesOcupadas).toBe(2 + 2 * 5 + 1 + 1);        // Full House cuenta 5 habitaciones
    expect(k.ocupacion).toBe(9);                             // 14 / (5 × 31) = 9,03 %
    expect(k.cobrado).toBe(530000 + 400000);                 // pagos con fecha dentro del mes
    expect(k.porCobrar).toBe(530000 + 1500000);              // saldos de reservas que llegan en el mes
    expect(k.sinValor).toBe(1);                              // C
  });
  it('las reservas de canal cuentan en ocupación pero no en cobrado, por cobrar ni sin valor', () => {
    const airbnb = { id: 'X', entrada: '2026-10-20', salida: '2026-10-22', habitaciones: ['FULL HOUSE'], fuente: 'Airbnb', valorTotal: 900000, pagos: [{ fecha: '2026-10-05', monto: 100 }] };
    const sin = kpisMes([A, B, C, D], MES.desde, MES.hasta);
    const con = kpisMes([A, B, C, D, airbnb], MES.desde, MES.hasta);
    expect(con.nochesOcupadas).toBe(sin.nochesOcupadas + 10);
    expect(con).toMatchObject({ cobrado: sin.cobrado, porCobrar: sin.porCobrar, sinValor: sin.sinValor });
  });
  it('mes vacío', () => {
    expect(kpisMes([], MES.desde, MES.hasta)).toEqual({ ocupacion: 0, nochesOcupadas: 0, cobrado: 0, porCobrar: 0, sinValor: 0 });
  });
});
