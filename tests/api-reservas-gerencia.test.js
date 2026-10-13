import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/reservas.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { reiniciarFallos } from '../lib/pin.js';
import { AirtableError } from '../lib/airtable.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes } from './ayudas.js';

const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321' };
const AHORA = new Date('2026-10-13T19:05:00Z'); // 14:05 Bogotá
const hoy = hoyBogota();
const d = (n) => sumarDias(hoy, n);
let cliente; let ids; let handler;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  handler = crearHandler({ cliente, env: ENV, dormir: vi.fn(async () => {}), ahora: () => AHORA });
});

const req = (extra = {}, gerencia = '654321') => {
  const r = crearReq(extra);
  if (gerencia) r.headers['x-pin-gerencia'] = gerencia;
  return r;
};
const llamar = async (r) => { const res = crearRes(); await handler(r, res); return res; };
const patch = (body, gerencia) => llamar(req({ method: 'PATCH', body }, gerencia));

describe('PATCH /api/reservas — permisos y forma', () => {
  it('401 sin PIN de gerencia y nada cambia', async () => {
    const res = await patch({ id: ids.a, cambios: { personas: 5 } }, null);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'PIN de gerencia incorrecto.' });
    expect((await cliente.obtener('Reservas', ids.a)).fields['Personas']).toBe(11);
  });
  it('400 si vienen cambios y cancelar a la vez', async () => {
    const res = await patch({ id: ids.a, cambios: { personas: 5 }, cancelar: { motivo: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Indica cambios o cancelar, no ambos.');
    expect((await cliente.obtener('Reservas', ids.a)).fields['Estado']).toBe('Confirmado');
  });
  it('404 también cuando Airtable responde 403 "modelo no encontrado" (id inexistente real)', async () => {
    const roto = { ...cliente, obtener: async () => { throw new AirtableError('Invalid permissions, or the requested model was not found.', 403, { error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' } }); } };
    const res = crearRes();
    await crearHandler({ cliente: roto, env: ENV, dormir: vi.fn(async () => {}) })(req({ method: 'PATCH', body: { id: 'recAAAAAAAAAAAAAA', cambios: { personas: 2 } } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'La reserva no existe.' });
  });
  it('400 sin cambios; 404 si la reserva no existe', async () => {
    expect((await patch({ id: ids.a, cambios: {} })).body.error).toBe('No hay cambios.');
    const res = await patch({ id: 'recNoExiste000000', cambios: { personas: 2 } });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/reservas — editar', () => {
  it('200: cambia campos, escribe historial y devuelve la reserva completa', async () => {
    const res = await patch({ id: ids.a, cambios: { personas: 5, notas: 'llegan tarde', huesped: 'Ana Pérez' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva).toMatchObject({ id: ids.a, personas: 5, notas: 'llegan tarde', pagado: 530000 });
    expect(res.body.reserva.historial).toBe('2026-10-13 14:05 · gerencia · editó Personas: 11 → 5; Notas: Llegan tarde → llegan tarde');
    const reg = await cliente.obtener('Reservas', ids.a);
    expect(reg.fields).toMatchObject({ 'Personas': 5, 'Notas': 'llegan tarde', 'Huésped': 'Ana Pérez' });
  });
  it('400 si ningún valor cambia de verdad', async () => {
    expect((await patch({ id: ids.a, cambios: { personas: 11 } })).body.error).toBe('No hay cambios.');
  });
  it('400 si al cambiar solo la salida queda igual o antes de la entrada', async () => {
    const res = await patch({ id: ids.a, cambios: { salida: d(5) } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('La fecha de salida debe ser posterior a la llegada.');
  });
  it('mover fechas sobre sí misma no es conflicto', async () => {
    const res = await patch({ id: ids.a, cambios: { entrada: d(6), salida: d(8) } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva).toMatchObject({ entrada: d(6), salida: d(8) });
  });
  it('409 si las fechas nuevas chocan con otra reserva', async () => {
    const res = await patch({ id: ids.c, cambios: { entrada: d(12), salida: d(14) } });
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicto).toMatchObject({ huesped: 'Familia Gómez' });
    expect((await cliente.obtener('Reservas', ids.c)).fields['Fecha entrada']).toBe(d(-2));
  });
  it('el historial se antepone (lo reciente arriba)', async () => {
    await patch({ id: ids.a, cambios: { personas: 5 } });
    const res = await patch({ id: ids.a, cambios: { personas: 6 } });
    expect(res.body.reserva.historial.split('\n')).toEqual([
      '2026-10-13 14:05 · gerencia · editó Personas: 5 → 6',
      '2026-10-13 14:05 · gerencia · editó Personas: 11 → 5',
    ]);
  });
});

describe('PATCH /api/reservas — cancelar', () => {
  it('200: Estado Cancelada con historial; luego no se puede editar ni cancelar otra vez', async () => {
    const res = await patch({ id: ids.b, cancelar: { motivo: 'el cliente no viajó' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva).toMatchObject({ estado: 'Cancelada', historial: '2026-10-13 14:05 · gerencia · canceló · motivo: el cliente no viajó' });
    expect((await patch({ id: ids.b, cancelar: { motivo: 'otra vez' } })).body).toEqual({ ok: false, error: 'La reserva ya está cancelada.' });
    expect((await patch({ id: ids.b, cambios: { personas: 3 } })).body).toEqual({ ok: false, error: 'La reserva está cancelada.' });
  });
  it('400 sin motivo', async () => {
    expect((await patch({ id: ids.b, cancelar: { motivo: ' ' } })).body.error).toBe('Indica el motivo de la cancelación.');
  });
});

describe('GET /api/reservas y canceladas', () => {
  it('una cancelada deja de aparecer y de bloquear; con incluirCanceladas=1 y PIN de gerencia vuelve a verse', async () => {
    await patch({ id: ids.b, cancelar: { motivo: 'no viajó' } });
    const sin = await llamar(req({ query: { desde: hoy, hasta: d(31) } }, null));
    expect(sin.body.reservas.map((r) => r.id)).toEqual([ids.c, ids.a]);
    const con = await llamar(req({ query: { desde: hoy, hasta: d(31), incluirCanceladas: '1' } }));
    expect(con.statusCode).toBe(200);
    expect(con.body.reservas.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]);
    expect(con.body.reservas[2].estado).toBe('Cancelada');
    const nueva = await llamar(req({ method: 'POST', body: { huesped: 'Z', telefono: '1', entrada: d(12), salida: d(14), habitaciones: ['La Elsa'], personas: 2, valorTotal: 100000 } }, null));
    expect(nueva.statusCode).toBe(201);
  });
  it('incluirCanceladas=1 con PIN de gerencia malo → 401 sin datos', async () => {
    const res = await llamar(req({ query: { desde: hoy, hasta: d(31), incluirCanceladas: '1' } }, '000000'));
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'PIN de gerencia incorrecto.' });
  });
});

describe('revisión final — freno, historial y habitaciones', () => {
  it('tres PATCH con PIN de gerencia malo desde la misma IP → el tercero espera 1 s', async () => {
    const dormir = vi.fn(async () => {});
    const h = crearHandler({ cliente, env: ENV, dormir, ahora: () => AHORA });
    for (const pin of ['000001', '000002', '000003']) {
      const res = crearRes();
      await h(req({ method: 'PATCH', body: { id: ids.a, cambios: { personas: 5 } } }, pin), res);
      expect(res.statusCode).toBe(401);
    }
    expect(dormir).toHaveBeenCalledWith(1000);
  });
  it('notas con saltos de línea → el historial sigue siendo una línea por operación', async () => {
    const res = await patch({ id: ids.a, cambios: { notas: 'línea uno\n2026-01-01 00:00 · gerencia · canceló · motivo: FORJADO' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva.historial.split('\n')).toHaveLength(1);
    expect(res.body.reserva.notas).toBe('línea uno\n2026-01-01 00:00 · gerencia · canceló · motivo: FORJADO');
  });
  it('motivo de cancelación con salto de línea → una sola línea de historial', async () => {
    const res = await patch({ id: ids.b, cancelar: { motivo: 'no viajó\npor lluvia' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva.historial).toBe('2026-10-13 14:05 · gerencia · canceló · motivo: no viajó por lluvia');
  });
  it('cambiar solo las habitaciones a una ocupada (FULL HOUSE sobre otra reserva) → 409 y nada cambia', async () => {
    await cliente.crear('Reservas', { 'Huésped': 'Otro', 'Teléfono': '300', 'Fecha entrada': d(5), 'Fecha salida': d(7), 'Habitaciones': ['La Luis'], 'Personas': 2, 'Estado': 'Confirmado' });
    const res = await patch({ id: ids.a, cambios: { habitaciones: ['FULL HOUSE'] } });
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicto).toBeTruthy();
    expect((await cliente.obtener('Reservas', ids.a)).fields['Habitaciones']).toEqual(['La Rosaura', 'La Clara']);
  });
});
