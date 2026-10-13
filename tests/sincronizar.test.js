import { describe, it, expect, beforeEach } from 'vitest';
import { sincronizarCanal, camposReservaCanal, descargarIcs, QUIEN } from '../lib/sincronizar.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { aCanalApi, aReservaApi, tablasDesdeEnv } from '../lib/reservas.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { icsDe } from './ayudas.js';

const AHORA = new Date('2026-10-13T19:05:00Z'); // 14:05 Bogotá
const hoy = hoyBogota(AHORA);
const d = (n) => sumarDias(hoy, n);
const tablas = tablasDesdeEnv({});
const responde = (texto, status = 200) => async () => ({ ok: status < 300, status, text: async () => texto });
const falla = async () => { throw new TypeError('fetch failed'); };

let cliente; let ids; let canal;
beforeEach(async () => {
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  canal = aCanalApi(await cliente.obtener('Canales', ids.canalAirbnb));
});
const correr = (fetchImpl) => sincronizarCanal({ cliente, tablas, canal, fetchImpl, ahora: AHORA });
const deAirbnb = async () => (await cliente.listar('Reservas')).map((r) => aReservaApi(r)).filter((r) => r.fuente === 'Airbnb');
const estadoCanalDemo = async () => aCanalApi(await cliente.obtener('Canales', ids.canalAirbnb));
const EVENTO = { uid: 'u1@airbnb.com', inicio: d(20), fin: d(22), descripcion: 'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC1\\nPhone Number (Last 4 Digits): 1234' };

describe('sincronizarCanal — reservas nuevas', () => {
  it('crea la reserva como Full House de Airbnb con historial, notas y enlace; actualiza Canales', async () => {
    const r = await correr(responde(icsDe([EVENTO])));
    expect(r).toEqual({ ok: true, canal: 'Airbnb', activas: 1, nuevas: 1, cambiadas: 0, canceladas: 0, choques: 0 });
    const [reserva] = await deAirbnb();
    expect(reserva).toMatchObject({
      huesped: 'Airbnb', entrada: d(20), salida: d(22), habitaciones: ['FULL HOUSE'], estado: 'Confirmado', fuente: 'Airbnb',
      uidCanal: 'u1@airbnb.com', enlaceCanal: 'https://www.airbnb.com/hosting/reservations/details/HMABC1',
      notas: 'Reserva de Airbnb · código HMABC1 · teléfono termina en 1234', historial: '2026-10-13 14:05 · sincronización · llegó por Airbnb',
      personas: 0, valorTotal: null, pagos: [],
    });
    expect(await estadoCanalDemo()).toMatchObject({ ultimaLectura: '2026-10-13T19:05:00.000Z', ultimoResultado: 'ok · 1 activas · 1 nuevas · 0 cambiadas · 0 canceladas' });
    expect(QUIEN).toBe('sincronización');
  });
  it('la misma lectura dos veces no duplica', async () => {
    await correr(responde(icsDe([EVENTO])));
    const r = await correr(responde(icsDe([EVENTO])));
    expect(r).toMatchObject({ nuevas: 0, activas: 1 });
    expect(await deAirbnb()).toHaveLength(1);
  });
  it('si choca con una reserva directa igual se crea y queda marcado', async () => {
    const r = await correr(responde(icsDe([{ uid: 'u2', inicio: d(5), fin: d(7) }]))); // Ana Pérez ocupa Rosaura+Clara d5–d7
    expect(r).toMatchObject({ nuevas: 1, choques: 1 });
    expect((await deAirbnb())[0].historial).toBe('2026-10-13 14:05 · sincronización · llegó por Airbnb · ⚠ choca con Ana Pérez');
  });
  it('Booking.com importa todo evento como reserva del canal', async () => {
    const booking = aCanalApi(await cliente.crear('Canales', { 'Canal': 'Booking.com', 'Activo': true, 'Enlace ICS': 'https://admin.booking.com/x.ics' }));
    const r = await sincronizarCanal({ cliente, tablas, canal: booking, fetchImpl: responde(icsDe([{ uid: 'b1', inicio: d(30), fin: d(32), resumen: 'CLOSED - Not available' }])), ahora: AHORA });
    expect(r).toMatchObject({ ok: true, canal: 'Booking.com', nuevas: 1 });
    const [b] = (await cliente.listar('Reservas')).map((x) => aReservaApi(x)).filter((x) => x.fuente === 'Booking.com');
    expect(b).toMatchObject({ huesped: 'Booking.com', notas: 'Reserva de Booking.com' });
  });
  it('ignora eventos pasados y bloqueos de Airbnb', async () => {
    const r = await correr(responde(icsDe([{ uid: 'p', inicio: d(-10), fin: d(-8) }, { uid: 'n', inicio: d(40), fin: d(42), resumen: 'Airbnb (Not available)' }])));
    expect(r).toMatchObject({ nuevas: 0, activas: 0 });
    expect(await deAirbnb()).toHaveLength(0);
  });
});

describe('sincronizarCanal — cambios, cancelaciones y duplicados', () => {
  it('cambio de fechas: actualiza y anota', async () => {
    await correr(responde(icsDe([EVENTO])));
    const r = await correr(responde(icsDe([{ ...EVENTO, inicio: d(21), fin: d(23) }])));
    expect(r).toMatchObject({ cambiadas: 1, nuevas: 0 });
    const [reserva] = await deAirbnb();
    expect(reserva).toMatchObject({ entrada: d(21), salida: d(23) });
    expect(reserva.historial.split('\n')[0]).toBe(`2026-10-13 14:05 · sincronización · Airbnb cambió fechas: ${d(20)} → ${d(22)} pasa a ${d(21)} → ${d(23)}`);
  });
  it('desaparecida del calendario: se cancela con rastro; calendario vacío pero válido cuenta', async () => {
    await correr(responde(icsDe([EVENTO])));
    const r = await correr(responde(icsDe([])));
    expect(r).toMatchObject({ canceladas: 1, activas: 0 });
    const [reserva] = await deAirbnb();
    expect(reserva.estado).toBe('Cancelada');
    expect(reserva.historial.split('\n')[0]).toBe('2026-10-13 14:05 · sincronización · canceló · ya no aparece en el calendario de Airbnb');
  });
  it('reaparecida: vuelve a Confirmado sin crear otra', async () => {
    await correr(responde(icsDe([EVENTO])));
    await correr(responde(icsDe([])));
    const r = await correr(responde(icsDe([EVENTO])));
    expect(r).toMatchObject({ nuevas: 1, activas: 1 });
    const todas = await deAirbnb();
    expect(todas).toHaveLength(1);
    expect(todas[0].estado).toBe('Confirmado');
    expect(todas[0].historial.split('\n')[0]).toBe('2026-10-13 14:05 · sincronización · reapareció en Airbnb');
  });
  it('duplicada: conserva la más antigua y cancela la otra', async () => {
    const primera = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(30), 'Fecha salida': d(32), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u9' });
    const segunda = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(30), 'Fecha salida': d(32), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u9' });
    const r = await correr(responde(icsDe([{ uid: 'u9', inicio: d(30), fin: d(32) }])));
    expect(r).toMatchObject({ canceladas: 1, activas: 1, nuevas: 0 });
    expect((await cliente.obtener('Reservas', primera.id)).fields['Estado']).toBe('Confirmado');
    const dup = await cliente.obtener('Reservas', segunda.id);
    expect(dup.fields['Estado']).toBe('Cancelada');
    expect(dup.fields['Historial']).toBe('2026-10-13 14:05 · sincronización · duplicada');
  });
});

describe('sincronizarCanal — errores: nunca se cancela nada', () => {
  it('error de red → ok false, Último resultado con error y Última lectura intacta', async () => {
    await correr(responde(icsDe([EVENTO])));
    const r = await correr(falla);
    expect(r).toEqual({ ok: false, canal: 'Airbnb', error: 'fetch failed' });
    expect((await deAirbnb())[0].estado).toBe('Confirmado');
    expect(await estadoCanalDemo()).toMatchObject({ ultimaLectura: '2026-10-13T19:05:00.000Z', ultimoResultado: 'error: fetch failed' });
  });
  it('HTTP 500 e ICS inválido', async () => {
    expect(await correr(responde('', 500))).toMatchObject({ ok: false, error: 'el canal respondió 500' });
    expect(await correr(responde('<html>no soy un calendario</html>'))).toMatchObject({ ok: false, error: 'ICS inválido' });
    expect(await deAirbnb()).toHaveLength(0);
  });
  it('enlace que no es https', async () => {
    const malo = { ...canal, enlace: 'http://x/y.ics' };
    const r = await sincronizarCanal({ cliente, tablas, canal: malo, fetchImpl: responde(icsDe([])), ahora: AHORA });
    expect(r).toMatchObject({ ok: false, error: 'El enlace del canal debe empezar por https://' });
    expect(await sincronizarCanal({ cliente, tablas, canal: { ...canal, enlace: '' }, fetchImpl: responde(icsDe([])), ahora: AHORA })).toMatchObject({ ok: false });
  });
  it('descargarIcs: timeout se reporta con mensaje claro', async () => {
    const lento = (url, { signal }) => new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(descargarIcs('https://x/y.ics', lento, 5)).rejects.toThrow('el canal no respondió en 8 s');
  });
});

describe('camposReservaCanal', () => {
  it('campos exactos de Airtable', () => {
    expect(camposReservaCanal('Airbnb', { uid: 'u', inicio: '2026-12-17', fin: '2026-12-19', descripcion: '' }, 'L')).toEqual({
      'Huésped': 'Airbnb', 'Fecha entrada': '2026-12-17', 'Fecha salida': '2026-12-19', 'Habitaciones': ['FULL HOUSE'],
      'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u', 'Notas': 'Reserva de Airbnb', 'Historial': 'L',
    });
  });
});

import { sincronizarTodo } from '../lib/sincronizar.js';

describe('sincronizarTodo', () => {
  it('solo canales activos, en orden; ok false si alguno falla', async () => {
    await cliente.crear('Canales', { 'Canal': 'Booking.com', 'Activo': false, 'Enlace ICS': 'https://b/x.ics' });
    const r = await sincronizarTodo({ cliente, tablas, fetchImpl: responde(icsDe([EVENTO])), ahora: AHORA });
    expect(r.ok).toBe(true);
    expect(r.canales.map((c) => c.canal)).toEqual(['Airbnb']);
    expect(r.canales[0]).toMatchObject({ nuevas: 1 });
    const malo = await sincronizarTodo({ cliente, tablas, fetchImpl: falla, ahora: AHORA });
    expect(malo).toMatchObject({ ok: false, canales: [{ ok: false, canal: 'Airbnb', error: 'fetch failed' }] });
  });
  it('siViejoMin: omite si todos leyeron hace poco; lee si alguno está viejo o nunca leyó', async () => {
    const llamadas = [];
    const contar = async (...args) => { llamadas.push(args[0]); return responde(icsDe([]))(); };
    const primero = await sincronizarTodo({ cliente, tablas, fetchImpl: contar, ahora: AHORA, siViejoMin: 10 });
    expect(primero).toMatchObject({ ok: true, canales: [{ canal: 'Airbnb', ok: true }] });
    expect(llamadas).toHaveLength(1);
    const segundo = await sincronizarTodo({ cliente, tablas, fetchImpl: contar, ahora: new Date(AHORA.getTime() + 3 * 60000), siViejoMin: 10 });
    expect(segundo).toEqual({ ok: true, omitido: true, canales: [{ canal: 'Airbnb', ultimaLectura: '2026-10-13T19:05:00.000Z', ultimoResultado: 'ok · 0 activas · 0 nuevas · 0 cambiadas · 0 canceladas' }] });
    expect(llamadas).toHaveLength(1);
    const tercero = await sincronizarTodo({ cliente, tablas, fetchImpl: contar, ahora: new Date(AHORA.getTime() + 11 * 60000), siViejoMin: 10 });
    expect(tercero.omitido).toBeUndefined();
    expect(llamadas).toHaveLength(2);
  });
  it('sin canales activos → ok con lista vacía', async () => {
    await cliente.actualizar('Canales', ids.canalAirbnb, { 'Activo': false });
    expect(await sincronizarTodo({ cliente, tablas, fetchImpl: falla, ahora: AHORA })).toEqual({ ok: true, canales: [] });
  });
});
