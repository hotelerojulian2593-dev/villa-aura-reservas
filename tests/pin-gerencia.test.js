import { describe, it, expect, beforeEach } from 'vitest';
import { verificarPin, reiniciarFallos } from '../lib/pin.js';
import { exigirPinGerencia } from '../lib/http.js';
import { crearReq, crearRes } from './ayudas.js';

const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321' };

beforeEach(() => reiniciarFallos());

describe('verificarPin con clave PIN_GERENCIA', () => {
  it('acepta el PIN de gerencia y rechaza el de las señoras', () => {
    expect(verificarPin('654321', '1.1.1.1', ENV, Date.now(), 'PIN_GERENCIA')).toEqual({ ok: true, esperaMs: 0 });
    expect(verificarPin('123456', '1.1.1.1', ENV, Date.now(), 'PIN_GERENCIA'))
      .toEqual({ ok: false, esperaMs: 0, error: 'PIN de gerencia incorrecto.', status: 401 });
  });
  it('sin PIN_GERENCIA configurado → 500 con su propio mensaje', () => {
    expect(verificarPin('654321', '1.1.1.1', { PIN_SENORAS: '123456' }, Date.now(), 'PIN_GERENCIA'))
      .toEqual({ ok: false, esperaMs: 0, error: 'PIN de gerencia no configurado en el servidor.', status: 500 });
  });
  it('los fallos de ambos PIN comparten el freno por IP', () => {
    verificarPin('000000', '2.2.2.2', ENV);
    verificarPin('000000', '2.2.2.2', ENV, Date.now(), 'PIN_GERENCIA');
    expect(verificarPin('000000', '2.2.2.2', ENV, Date.now(), 'PIN_GERENCIA').esperaMs).toBe(1000);
  });
  it('el mensaje de las señoras no cambia', () => {
    expect(verificarPin('000000', '3.3.3.3', ENV).error).toBe('PIN incorrecto.');
    expect(verificarPin('123456', '3.3.3.3', {}).error).toBe('PIN no configurado en el servidor.');
  });
});

describe('exigirPinGerencia', () => {
  it('true con la cabecera correcta', async () => {
    const req = crearReq();
    req.headers['x-pin-gerencia'] = '654321';
    expect(await exigirPinGerencia(req, crearRes(), { env: ENV })).toBe(true);
  });
  it('sin cabecera → 401 y false', async () => {
    const res = crearRes();
    expect(await exigirPinGerencia(crearReq(), res, { env: ENV, dormir: async () => {} })).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'PIN de gerencia incorrecto.' });
  });
});
