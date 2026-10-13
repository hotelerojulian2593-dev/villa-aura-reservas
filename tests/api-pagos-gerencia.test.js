import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/pagos.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes } from './ayudas.js';

const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321' };
const AHORA = new Date('2026-10-13T19:05:00Z');
const hoy = hoyBogota();
let cliente; let ids; let handler; let pagoA; let pagosC;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  pagoA = (await cliente.obtener('Reservas', ids.a)).fields['Pagos'][0];
  pagosC = (await cliente.obtener('Reservas', ids.c)).fields['Pagos'];
  handler = crearHandler({ cliente, env: ENV, dormir: vi.fn(async () => {}), ahora: () => AHORA });
});

const req = (extra = {}, gerencia = '654321') => {
  const r = crearReq(extra);
  if (gerencia) r.headers['x-pin-gerencia'] = gerencia;
  return r;
};
const llamar = async (r) => { const res = crearRes(); await handler(r, res); return res; };
const patch = (body, gerencia) => llamar(req({ method: 'PATCH', body }, gerencia));
const historialDe = async (id) => (await cliente.obtener('Reservas', id)).fields['Historial'];

describe('PATCH /api/pagos — permisos y forma', () => {
  it('401 sin PIN de gerencia', async () => {
    const res = await patch({ id: pagoA, cambios: { monto: 1 } }, null);
    expect(res.statusCode).toBe(401);
    expect((await cliente.obtener('Pagos', pagoA)).fields['Monto']).toBe(530000);
  });
  it('400 ambos; 400 sin cambios; 404 abono inexistente', async () => {
    expect((await patch({ id: pagoA, cambios: { monto: 1 }, anular: { motivo: 'x' } })).body.error).toBe('Indica cambios o anular, no ambos.');
    expect((await patch({ id: pagoA, cambios: { monto: 530000 } })).body.error).toBe('No hay cambios.');
    const res = await patch({ id: 'recNoExiste000000', cambios: { monto: 1 } });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('El abono no existe.');
  });
});

describe('PATCH /api/pagos — corregir', () => {
  it('200: cambia el abono, recalcula el resumen y escribe historial en la reserva', async () => {
    const res = await patch({ id: pagoA, cambios: { monto: 500000, medio: 'Efectivo' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.pago).toMatchObject({ id: pagoA, monto: 500000, medio: 'Efectivo', anulado: false });
    expect(res.body.resumen).toEqual({ valorTotal: 1060000, pagado: 500000, saldo: 560000, estadoPago: 'parcial', estado: 'Confirmado' });
    expect(await historialDe(ids.a)).toBe(`2026-10-13 14:05 · gerencia · corrigió abono del ${hoy}: Monto: $ 530.000 → $ 500.000; Medio: Nequi → Efectivo`);
  });
});

describe('PATCH /api/pagos — anular', () => {
  it('200: Monto 0, nota ANULADO, resumen sin anticipo y Estado intacto', async () => {
    const res = await patch({ id: pagoA, anular: { motivo: 'duplicado' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.pago).toMatchObject({ monto: 0, anulado: true, nota: 'ANULADO · antes $ 530.000 · duplicado' });
    expect(res.body.resumen).toEqual({ valorTotal: 1060000, pagado: 0, saldo: 1060000, estadoPago: 'sin_anticipo', estado: 'Confirmado' });
    expect(await historialDe(ids.a)).toBe(`2026-10-13 14:05 · gerencia · anuló abono del ${hoy} ($ 530.000 Nequi) · motivo: duplicado`);
  });
  it('conserva la nota anterior detrás de " | "', async () => {
    const conNota = pagosC[1]; // 'Pago al llegar'
    const res = await patch({ id: conNota, anular: { motivo: 'error de digitación' } });
    expect(res.body.pago.nota).toBe('ANULADO · antes $ 315.000 · error de digitación | Pago al llegar');
  });
  it('409 al anular dos veces o corregir un anulado', async () => {
    await patch({ id: pagoA, anular: { motivo: 'x' } });
    expect((await patch({ id: pagoA, anular: { motivo: 'y' } })).body).toEqual({ ok: false, error: 'El abono ya está anulado.' });
    expect((await patch({ id: pagoA, cambios: { monto: 5 } })).body).toEqual({ ok: false, error: 'El abono está anulado.' });
  });
  it('400 sin motivo', async () => {
    expect((await patch({ id: pagoA, anular: {} })).body.error).toBe('Indica el motivo de la anulación.');
  });
});

describe('POST /api/pagos en reserva cancelada', () => {
  it('409 y no crea el pago', async () => {
    await cliente.actualizar('Reservas', ids.b, { 'Estado': 'Cancelada' });
    const res = await llamar(req({ method: 'POST', body: { reservaId: ids.b, monto: 1000, medio: 'Nequi' } }, null));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ ok: false, error: 'La reserva está cancelada.' });
    expect((await cliente.obtener('Reservas', ids.b)).fields['Pagos'] ?? []).toHaveLength(0);
  });
});
