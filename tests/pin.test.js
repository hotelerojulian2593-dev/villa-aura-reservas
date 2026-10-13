import { describe, it, expect, beforeEach } from 'vitest';
import { pinCorrecto, esperaPorFallos, verificarPin, reiniciarFallos, ipDe } from '../lib/pin.js';

const ENV = { PIN_SENORAS: '123456' };

beforeEach(() => reiniciarFallos());

describe('pinCorrecto', () => {
  it('compara recortando espacios', () => {
    expect(pinCorrecto('123456', '123456')).toBe(true);
    expect(pinCorrecto(' 123456 ', '123456')).toBe(true);
  });
  it('rechaza distinto, incompleto, vacío o no texto', () => {
    expect(pinCorrecto('123457', '123456')).toBe(false);
    expect(pinCorrecto('12345', '123456')).toBe(false);
    expect(pinCorrecto('', '123456')).toBe(false);
    expect(pinCorrecto(undefined, '123456')).toBe(false);
    expect(pinCorrecto(123456, '123456')).toBe(false);
  });
});

describe('esperaPorFallos', () => {
  it('nada en los dos primeros fallos, luego crece y se topa en 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(esperaPorFallos)).toEqual([0, 0, 1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('verificarPin', () => {
  it('PIN correcto → ok y reinicia el contador de esa IP', () => {
    verificarPin('000000', '1.1.1.1', ENV);
    verificarPin('000000', '1.1.1.1', ENV);
    expect(verificarPin('123456', '1.1.1.1', ENV)).toEqual({ ok: true, esperaMs: 0 });
    expect(verificarPin('000000', '1.1.1.1', ENV).esperaMs).toBe(0); // vuelve a contar desde 1
  });
  it('fallos consecutivos de una IP acumulan espera; otra IP no se afecta', () => {
    const esperas = [1, 2, 3, 4].map(() => verificarPin('000000', '2.2.2.2', ENV).esperaMs);
    expect(esperas).toEqual([0, 0, 1000, 2000]);
    expect(verificarPin('000000', '3.3.3.3', ENV)).toEqual({ ok: false, esperaMs: 0, error: 'PIN incorrecto.', status: 401 });
  });
  it('olvida los fallos después de una hora', () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 4; i += 1) verificarPin('000000', '4.4.4.4', ENV, t0);
    expect(verificarPin('000000', '4.4.4.4', ENV, t0 + 3_600_001).esperaMs).toBe(0);
  });
  it('sin PIN configurado → error 500, nunca deja pasar', () => {
    expect(verificarPin('123456', '1.1.1.1', {})).toEqual({ ok: false, esperaMs: 0, error: 'PIN no configurado en el servidor.', status: 500 });
  });
});

describe('ipDe', () => {
  it('toma la primera IP de x-forwarded-for', () => {
    expect(ipDe({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4');
    expect(ipDe({ headers: { 'x-forwarded-for': ['9.9.9.9'] } })).toBe('9.9.9.9');
  });
  it('cae a remoteAddress o "desconocida"', () => {
    expect(ipDe({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
    expect(ipDe({ headers: {} })).toBe('desconocida');
  });
});
