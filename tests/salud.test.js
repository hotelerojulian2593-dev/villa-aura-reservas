import { describe, it, expect } from 'vitest';
import { crearHandler } from '../api/salud.js';
import { crearClienteFalso } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { crearReq, crearRes } from './ayudas.js';

describe('GET /api/salud', () => {
  it('200 cuando Airtable responde; sin datos de huéspedes y sin caché', async () => {
    const res = crearRes();
    await crearHandler({ cliente: crearClienteFalso() })(crearReq({ pin: '' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, airtable: 'ok' });
    expect(JSON.stringify(res.body)).not.toMatch(/Huésped|reservas/);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
  it('503 cuando Airtable falla', async () => {
    const cliente = { listar: async () => { throw new AirtableError('Airtable respondió 503.', 503); } };
    const res = crearRes();
    await crearHandler({ cliente })(crearReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, airtable: 'error', error: 'Airtable respondió 503.' });
  });
  it('503 si faltan variables de entorno', async () => {
    const res = crearRes();
    await crearHandler({ env: {} })(crearReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/AIRTABLE_TOKEN/);
  });
  it('405 en otros métodos', async () => {
    const res = crearRes();
    await crearHandler({ cliente: crearClienteFalso() })(crearReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
