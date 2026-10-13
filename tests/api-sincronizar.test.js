import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/sincronizar.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes, icsDe } from './ayudas.js';

const CLAVE = 'a'.repeat(32);
const CRON = 'c'.repeat(32);
const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321', ICAL_CLAVE: CLAVE, CRON_SECRET: CRON };
const AHORA = new Date('2026-10-13T19:05:00Z');
const hoy = hoyBogota(AHORA);
const d = (n) => sumarDias(hoy, n);
const EVENTO = { uid: 'u1@airbnb.com', inicio: d(20), fin: d(22) };
let cliente; let ids; let fetchImpl;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => icsDe([EVENTO]) }));
});
const llamar = async (extra = {}, deps = {}) => {
  const res = crearRes();
  const req = crearReq({ pin: '', ...extra });
  if (extra.gerencia) req.headers['x-pin-gerencia'] = extra.gerencia;
  if (extra.bearer) req.headers.authorization = `Bearer ${extra.bearer}`;
  await crearHandler({ cliente, env: ENV, fetchImpl, dormir: vi.fn(async () => {}), ahora: () => AHORA, ...deps })(req, res);
  return res;
};

describe('/api/sincronizar — autorización', () => {
  it('405 en PUT; 401 con clave mala sin leer ningún canal', async () => {
    expect((await llamar({ method: 'PUT', query: { clave: CLAVE } })).statusCode).toBe(405);
    const res = await llamar({ query: { clave: 'b'.repeat(32) } });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Clave incorrecta.' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('200 con clave (UptimeRobot) y con Bearer CRON_SECRET (Vercel); 401 con Bearer malo', async () => {
    const res = await llamar({ query: { clave: CLAVE } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, canales: [{ ok: true, canal: 'Airbnb', activas: 1, nuevas: 1, cambiadas: 0, canceladas: 0, choques: 0 }] });
    expect(res.body.enlaceIcal).toBeUndefined();
    expect((await llamar({ method: 'POST', bearer: CRON })).statusCode).toBe(200);
    expect((await llamar({ bearer: 'x' })).statusCode).toBe(401);
  });
  it('500 si falta ICAL_CLAVE o CRON_SECRET para la vía usada', async () => {
    expect((await llamar({ query: { clave: CLAVE } }, { env: { PIN_SENORAS: '123456' } })).body.error).toBe('ICAL_CLAVE no configurada en el servidor.');
    expect((await llamar({ bearer: CRON }, { env: { PIN_SENORAS: '123456' } })).body.error).toBe('CRON_SECRET no configurada en el servidor.');
  });
  it('PIN de señoras: lee con siViejo y omite si es reciente; PIN malo → 401', async () => {
    const primero = await llamar({ pin: '123456', query: { siViejo: '10' } });
    expect(primero.statusCode).toBe(200);
    expect(primero.body.canales[0]).toMatchObject({ nuevas: 1 });
    const segundo = await llamar({ pin: '123456', query: { siViejo: '10' } });
    expect(segundo.body).toMatchObject({ ok: true, omitido: true });
    expect(segundo.body.error).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await llamar({ pin: '000000' })).statusCode).toBe(401);
  });
  it('forzar=1 y estado=1 exigen gerencia; devuelven enlaceIcal', async () => {
    const sin = await llamar({ pin: '123456', query: { forzar: '1' } });
    expect(sin.statusCode).toBe(401);
    expect(sin.body.error).toBe('PIN de gerencia incorrecto.');
    const estado = await llamar({ pin: '123456', gerencia: '654321', query: { estado: '1' } });
    expect(estado.statusCode).toBe(200);
    expect(estado.body).toEqual({ ok: true, canales: [{ canal: 'Airbnb', ultimaLectura: null, ultimoResultado: '' }], enlaceIcal: `https://villa-aura-reservas.vercel.app/api/ical/${CLAVE}.ics` });
    expect(fetchImpl).not.toHaveBeenCalled();
    const forzado = await llamar({ method: 'POST', pin: '123456', gerencia: '654321', query: { forzar: '1', siViejo: '10' } });
    expect(forzado.statusCode).toBe(200);
    expect(forzado.body.canales[0]).toMatchObject({ nuevas: 1 });
    expect(forzado.body.enlaceIcal).toContain('/api/ical/');
    const otraVez = await llamar({ method: 'POST', pin: '123456', gerencia: '654321', query: { forzar: '1', siViejo: '10' } });
    expect(otraVez.body.omitido).toBeUndefined();
  });
});

describe('/api/sincronizar — resultados', () => {
  it('502 con error legible cuando un canal falla', async () => {
    fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const res = await llamar({ query: { clave: CLAVE } });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, canales: [{ ok: false, canal: 'Airbnb', error: 'fetch failed' }], error: 'Airbnb: fetch failed' });
  });
  it('sin canales activos → 200 vacío', async () => {
    await cliente.actualizar('Canales', ids.canalAirbnb, { 'Activo': false });
    expect((await llamar({ query: { clave: CLAVE } })).body).toEqual({ ok: true, canales: [] });
  });
  it('502 si Airtable falla (p. ej. la tabla Canales no existe), con mensaje de Airtable', async () => {
    const roto = { ...cliente, listar: async () => { throw new AirtableError('Invalid permissions, or the requested model was not found.', 403, { error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' } }); } };
    const res = await llamar({ query: { clave: CLAVE } }, { cliente: roto });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'Airtable: Invalid permissions, or the requested model was not found.' });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
