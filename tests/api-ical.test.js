import { describe, it, expect, beforeEach } from 'vitest';
import { crearHandler } from '../api/ical/[archivo].js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { parsearIcs } from '../lib/ical.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearRes } from './ayudas.js';

const CLAVE = 'a'.repeat(32);
const ENV = { PIN_SENORAS: '123456', ICAL_CLAVE: CLAVE };
const AHORA = new Date('2026-10-13T19:05:00Z');
const hoy = hoyBogota(AHORA);
const d = (n) => sumarDias(hoy, n);
const req = (archivo, method = 'GET') => ({ method, query: { archivo }, headers: {} });
let cliente; let ids;

beforeEach(async () => {
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
});
const llamar = async (r, deps = {}) => { const res = crearRes(); await crearHandler({ cliente, env: ENV, ahora: () => AHORA, ...deps })(r, res); return res; };

describe('GET /api/ical/<clave>.ics', () => {
  it('401 con clave incorrecta o sin .ics; 405 en POST; 500 sin ICAL_CLAVE', async () => {
    expect((await llamar(req(`${'b'.repeat(32)}.ics`))).statusCode).toBe(401);
    expect((await llamar(req(CLAVE))).statusCode).toBe(401);
    expect((await llamar(req(`${CLAVE}.ics`, 'POST'))).statusCode).toBe(405);
    const res = await llamar(req(`${CLAVE}.ics`), { env: { PIN_SENORAS: '123456' } });
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('ICAL_CLAVE no configurada en el servidor.');
  });
  it('200 text/calendar con todas las activas (todas las fuentes), sin canceladas ni nombres', async () => {
    const cancelada = await cliente.crear('Reservas', { 'Huésped': 'Zoe', 'Fecha entrada': d(10), 'Fecha salida': d(12), 'Habitaciones': ['La Elsa'], 'Estado': 'Cancelada' });
    const airbnb = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(20), 'Fecha salida': d(22), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u1' });
    const res = await llamar(req(`${CLAVE}.ics`));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-store');
    const uids = parsearIcs(res.body).map((e) => e.uid.split('@')[0]);
    expect(uids.sort()).toEqual([ids.a, ids.b, ids.c, airbnb.id].sort());
    expect(uids).not.toContain(cancelada.id);
    expect(res.body).not.toMatch(/Ana|Gómez|Carlos|Zoe/);
  });
  it('502 en texto plano si Airtable falla', async () => {
    const roto = { listar: async () => { throw new AirtableError('Airtable respondió 503.', 503); } };
    const res = await llamar(req(`${CLAVE}.ics`), { cliente: roto });
    expect(res.statusCode).toBe(502);
    expect(res.body).toBe('Airtable no está disponible en este momento.');
  });
});
