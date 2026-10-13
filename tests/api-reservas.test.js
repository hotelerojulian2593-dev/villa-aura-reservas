import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/reservas.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes, ENV } from './ayudas.js';

const hoy = hoyBogota();
const d = (n) => sumarDias(hoy, n);
let cliente; let ids; let handler; let dormir;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  dormir = vi.fn(async () => {});
  handler = crearHandler({ cliente, env: ENV, dormir });
});

const llamar = async (req) => { const res = crearRes(); await handler(req, res); return res; };

const nueva = (extra = {}) => ({
  huesped: 'Luisa Mora', telefono: '320 555 1234', entrada: d(5), salida: d(7),
  habitaciones: ['La Elsa'], personas: 5, valorTotal: 480000, abono: { monto: 240000, medio: 'Nequi' }, ...extra,
});

describe('método y PIN', () => {
  it('405 para PUT', async () => {
    expect((await llamar(crearReq({ method: 'PUT' }))).statusCode).toBe(405);
  });
  it('401 con PIN malo, sin espera las dos primeras veces y con espera a la tercera', async () => {
    const res1 = await llamar(crearReq({ pin: '000000', query: { desde: hoy, hasta: d(1) } }));
    expect(res1.statusCode).toBe(401);
    expect(res1.body).toEqual({ ok: false, error: 'PIN incorrecto.' });
    await llamar(crearReq({ pin: '000000' }));
    await llamar(crearReq({ pin: '000000' }));
    expect(dormir).toHaveBeenCalledTimes(1);
    expect(dormir).toHaveBeenCalledWith(1000);
  });
  it('500 si el servidor no tiene PIN configurado', async () => {
    const res = crearRes();
    await crearHandler({ cliente, env: {} })(crearReq(), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('GET', () => {
  it('400 sin rango', async () => {
    const res = await llamar(crearReq());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/desde y hasta/);
  });
  it('200 con las reservas del rango y sus pagos', async () => {
    const res = await llamar(crearReq({ query: { desde: hoy, hasta: d(31) } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, desde: hoy, hasta: d(31) });
    expect(res.body.reservas.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]);
    expect(res.body.reservas[1]).toMatchObject({ huesped: 'Ana Pérez', pagado: 530000, saldo: 530000, estadoPago: 'parcial' });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});

describe('POST', () => {
  it('400 con datos inválidos', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva({ personas: 0 }) }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('El número de personas debe estar entre 1 y 60.');
  });
  it('409 si la habitación ya está tomada en esas noches', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva({ habitaciones: ['La Rosaura'], entrada: d(6), salida: d(8) }) }));
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicto).toMatchObject({ huesped: 'Ana Pérez', entrada: d(5), salida: d(7) });
    expect(res.body.error).toMatch(/La Rosaura, La Clara ya está reservada/);
  });
  it('409 si hay Full House en esas noches, aunque sea otra habitación', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva({ entrada: d(13), salida: d(15) }) }));
    expect(res.statusCode).toBe(409);
  });
  it('201 con abono: crea reserva Confirmada y su primer pago', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva() }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true, id: expect.stringMatching(/^rec/), estado: 'Confirmado', abonoRegistrado: true });
    const reg = await cliente.obtener('Reservas', res.body.id);
    expect(reg.fields).toMatchObject({ 'Huésped': 'Luisa Mora', 'Valor total': 480000, 'Estado': 'Confirmado' });
    const pago = await cliente.obtener('Pagos', reg.fields['Pagos'][0]);
    expect(pago.fields).toMatchObject({ 'Concepto': 'Anticipo · Luisa Mora', 'Monto': 240000, 'Medio': 'Nequi', 'Fecha': hoy });
  });
  it('201 sin abono: queda Anticipo pendiente', async () => {
    const { abono, ...sinAbono } = nueva();
    const res = await llamar(crearReq({ method: 'POST', body: sinAbono }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ estado: 'Anticipo pendiente', abonoRegistrado: false });
    expect(res.body.advertencia).toBeUndefined();
  });
  it('201 con advertencia si la reserva se creó pero el pago falló; el estado vuelve a pendiente', async () => {
    const roto = { ...cliente, crear: (tabla, f) => (tabla === 'Pagos' ? Promise.reject(new AirtableError('caído', 503)) : cliente.crear(tabla, f)) };
    const res = crearRes();
    await crearHandler({ cliente: roto, env: ENV, dormir })(crearReq({ method: 'POST', body: nueva() }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ abonoRegistrado: false, estado: 'Anticipo pendiente', advertencia: expect.stringMatching(/Regístralo desde el calendario/) });
    expect((await cliente.obtener('Reservas', res.body.id)).fields['Estado']).toBe('Anticipo pendiente');
  });
  it('502 si Airtable no responde', async () => {
    const caido = { listar: async () => { throw new AirtableError('Airtable respondió 503.', 503); } };
    const res = crearRes();
    await crearHandler({ cliente: caido, env: ENV, dormir })(crearReq({ method: 'POST', body: nueva() }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/Airtable no está disponible/);
  });
});
