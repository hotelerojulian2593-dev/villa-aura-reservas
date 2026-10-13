import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/pagos.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes, ENV } from './ayudas.js';

const hoy = hoyBogota();
let cliente; let ids; let handler;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  handler = crearHandler({ cliente, env: ENV, dormir: vi.fn(async () => {}) });
});

const llamar = async (body, extra = {}) => { const res = crearRes(); await handler(crearReq({ method: 'POST', body, ...extra }), res); return res; };

describe('POST /api/pagos', () => {
  it('405 para GET', async () => {
    const res = crearRes();
    await handler(crearReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
  it('401 con PIN malo', async () => {
    expect((await llamar({ reservaId: ids.b, monto: 1000, medio: 'Nequi' }, { pin: '999999' })).statusCode).toBe(401);
  });
  it('400 con datos inválidos', async () => {
    const res = await llamar({ reservaId: ids.b, monto: 'mil', medio: 'Nequi' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('El monto del abono debe ser un número entero mayor que cero.');
  });
  it('404 si la reserva no existe', async () => {
    const res = await llamar({ reservaId: 'recNoExiste000000', monto: 1000, medio: 'Nequi' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'La reserva no existe.' });
  });
  it('201: primer abono de una reserva pendiente → Concepto "Anticipo", pasa a Confirmado', async () => {
    const res = await llamar({ reservaId: ids.b, monto: 1000000, medio: 'Bancolombia', nota: 'Transferencia' });
    expect(res.statusCode).toBe(201);
    expect(res.body.pago).toMatchObject({ id: expect.stringMatching(/^rec/), fecha: hoy, monto: 1000000, medio: 'Bancolombia', nota: 'Transferencia' });
    expect(res.body.resumen).toEqual({ valorTotal: 2100000, pagado: 1000000, saldo: 1100000, estadoPago: 'parcial', estado: 'Confirmado' });
    const reg = await cliente.obtener('Reservas', ids.b);
    expect(reg.fields['Estado']).toBe('Confirmado');
    expect((await cliente.obtener('Pagos', reg.fields['Pagos'][0])).fields['Concepto']).toBe('Anticipo · Familia Gómez');
  });
  it('201: segundo abono → Concepto "Abono", fecha explícita, resumen acumulado', async () => {
    await llamar({ reservaId: ids.b, monto: 1000000, medio: 'Bancolombia' });
    const res = await llamar({ reservaId: ids.b, monto: 1100000, medio: 'Efectivo', fecha: '2026-12-24' });
    expect(res.body.resumen).toMatchObject({ pagado: 2100000, saldo: 0, estadoPago: 'pagado' });
    expect(res.body.pago.fecha).toBe('2026-12-24');
    const reg = await cliente.obtener('Reservas', ids.b);
    expect((await cliente.obtener('Pagos', reg.fields['Pagos'][1])).fields['Concepto']).toBe('Abono · Familia Gómez');
  });
  it('no toca el Estado de una reserva ya confirmada', async () => {
    const espia = vi.spyOn(cliente, 'actualizar');
    const res = await llamar({ reservaId: ids.a, monto: 530000, medio: 'Nequi' });
    expect(res.statusCode).toBe(201);
    expect(res.body.resumen).toMatchObject({ pagado: 1060000, saldo: 0, estadoPago: 'pagado', estado: 'Confirmado' });
    expect(espia).not.toHaveBeenCalled();
  });
  it('acepta abonos aunque la reserva no tenga valor total', async () => {
    const vieja = await cliente.crear('Reservas', { 'Huésped': 'Vieja', 'Fecha entrada': hoy, 'Fecha salida': hoy, 'Habitaciones': ['La Luis'], 'Estado': 'Anticipo pendiente' });
    const res = await llamar({ reservaId: vieja.id, monto: 50000, medio: 'Otro' });
    expect(res.body.resumen).toEqual({ valorTotal: null, pagado: 50000, saldo: null, estadoPago: 'sin_valor', estado: 'Confirmado' });
  });
});

describe('pagos de reservas de canal', () => {
  const d = (n) => sumarDias(hoy, n);
  it('409: los pagos de Airbnb no se registran aquí', async () => {
    const r = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(20), 'Fecha salida': d(22), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u1' });
    const res = await llamar({ reservaId: r.id, monto: 1000, medio: 'Nequi' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Los pagos de Airbnb no se registran aquí.');
    expect((await cliente.obtener('Reservas', r.id)).fields['Pagos'] ?? []).toEqual([]);
  });
});
