import { describe, it, expect, vi } from 'vitest';
import {
  formulaRango, formulaIds, aPagoApi, aReservaApi, cargarReservasConPagos, cargarPagosPorIds,
  camposReservaNueva, camposPagoNuevo, tablasDesdeEnv, ESTADOS, camposCambiosReserva, camposCambiosPago,
} from '../lib/reservas.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';

describe('fórmulas', () => {
  it('rango: entrada antes de hasta, salida después de desde y sin canceladas', () => {
    expect(formulaRango('2026-10-01', '2026-11-01')).toBe(
      "AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('2026-11-01', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('2026-10-01', 'YYYY-MM-DD')), {Estado} != 'Cancelada')",
    );
  });
  it('rango con canceladas incluidas (solo gerencia)', () => {
    expect(formulaRango('2026-10-01', '2026-11-01', { incluirCanceladas: true })).toBe(
      "AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('2026-11-01', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('2026-10-01', 'YYYY-MM-DD')))",
    );
  });
  it('rango rechaza lo que no sea fecha ISO (nunca interpola texto libre)', () => {
    expect(() => formulaRango("2026-10-01' OR 1", '2026-11-01')).toThrow();
  });
  it('ids: OR de RECORD_ID() y rechaza ids malformados', () => {
    expect(formulaIds(['recAAAAAAAAAAAAAA', 'recBBBBBBBBBBBBBB'])).toBe("OR(RECORD_ID()='recAAAAAAAAAAAAAA',RECORD_ID()='recBBBBBBBBBBBBBB')");
    expect(() => formulaIds(["rec'"])).toThrow();
  });
});

describe('mapeo', () => {
  const reg = {
    id: 'recR', fields: {
      'Huésped': 'Ana', 'Teléfono': '310', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19',
      'Habitaciones': ['La Rosaura'], 'Personas': 4, 'Estado': 'Confirmado', 'Notas': 'x', 'Valor total': 1060000,
    },
  };
  it('reserva con pagos → resumen calculado', () => {
    const r = aReservaApi(reg, [{ id: 'p1', fecha: '2026-10-12', monto: 530000, medio: 'Nequi', nota: '' }]);
    expect(r).toMatchObject({ id: 'recR', huesped: 'Ana', noches: 2, estado: 'Confirmado', valorTotal: 1060000, pagado: 530000, saldo: 530000, estadoPago: 'parcial' });
    expect(r.pagos).toHaveLength(1);
  });
  it('tolera selects como objetos {name} y valor total ausente', () => {
    const r = aReservaApi({ id: 'r', fields: { 'Habitaciones': [{ name: 'La Elsa' }], 'Estado': { name: 'Anticipo pendiente' } } });
    expect(r.habitaciones).toEqual(['La Elsa']);
    expect(r.estado).toBe('Anticipo pendiente');
    expect(r).toMatchObject({ valorTotal: null, saldo: null, estadoPago: 'sin_valor', noches: 0, pagos: [] });
  });
  it('pago', () => {
    expect(aPagoApi({ id: 'p', fields: { 'Fecha': '2026-10-12', 'Monto': 1000, 'Medio': { name: 'Nequi' } } }))
      .toEqual({ id: 'p', fecha: '2026-10-12', monto: 1000, medio: 'Nequi', nota: '', anulado: false });
  });
  it('campos para crear reserva y pago', () => {
    const datos = { huesped: 'Ana', telefono: '310', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'], personas: 4, valorTotal: 1060000, abono: { monto: 1 }, notas: '' };
    expect(camposReservaNueva(datos)).toEqual({
      'Huésped': 'Ana', 'Teléfono': '310', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19',
      'Habitaciones': ['La Rosaura'], 'Personas': 4, 'Valor total': 1060000, 'Estado': 'Confirmado',
    });
    expect(camposReservaNueva({ ...datos, abono: null, notas: 'tarde' })).toMatchObject({ 'Estado': 'Anticipo pendiente', 'Notas': 'tarde' });
    expect(camposPagoNuevo({ reservaId: 'recR', huesped: 'Ana', esPrimero: true, monto: 500, medio: 'Nequi', fecha: '2026-10-12', nota: '' }))
      .toEqual({ 'Concepto': 'Anticipo · Ana', 'Reserva': ['recR'], 'Fecha': '2026-10-12', 'Monto': 500, 'Medio': 'Nequi' });
    expect(camposPagoNuevo({ reservaId: 'recR', huesped: 'Ana', esPrimero: false, monto: 500, medio: 'Efectivo', fecha: '2026-10-19', nota: 'al llegar' }))
      .toMatchObject({ 'Concepto': 'Abono · Ana', 'Nota': 'al llegar' });
  });
  it('pago anulado y historial de la reserva', () => {
    expect(aPagoApi({ id: 'p', fields: { 'Fecha': '2026-10-12', 'Monto': 0, 'Medio': 'Nequi', 'Nota': 'ANULADO · antes $ 250.000 · duplicado' } }).anulado).toBe(true);
    expect(aPagoApi({ id: 'p', fields: { 'Monto': 0 } }).anulado).toBe(false);
    expect(aPagoApi({ id: 'p', fields: { 'Monto': 100, 'Nota': 'ANULADO' } }).anulado).toBe(false);
    expect(aReservaApi({ id: 'r', fields: { 'Historial': 'linea1\nlinea0' } }).historial).toBe('linea1\nlinea0');
    expect(aReservaApi({ id: 'r', fields: {} }).historial).toBe('');
    expect(ESTADOS.cancelada).toBe('Cancelada');
  });
  it('campos de cambios: solo las claves presentes, con nombres de Airtable', () => {
    expect(camposCambiosReserva({ entrada: '2026-10-18', personas: 5, notas: '' }))
      .toEqual({ 'Fecha entrada': '2026-10-18', 'Personas': 5, 'Notas': '' });
    expect(camposCambiosReserva({ huesped: 'Ana', telefono: '3', salida: '2026-10-20', habitaciones: ['La Elsa'], valorTotal: 1 }))
      .toEqual({ 'Huésped': 'Ana', 'Teléfono': '3', 'Fecha salida': '2026-10-20', 'Habitaciones': ['La Elsa'], 'Valor total': 1 });
    expect(camposCambiosPago({ monto: 200000, nota: 'x' })).toEqual({ 'Monto': 200000, 'Nota': 'x' });
    expect(camposCambiosPago({ fecha: '2026-10-12', medio: 'Efectivo' })).toEqual({ 'Fecha': '2026-10-12', 'Medio': 'Efectivo' });
  });
  it('tablas por defecto y por env', () => {
    expect(tablasDesdeEnv({})).toEqual({ reservas: 'Reservas', pagos: 'Pagos' });
    expect(tablasDesdeEnv({ AIRTABLE_TABLA_RESERVAS: 'tbl1', AIRTABLE_TABLA_PAGOS: 'tbl2' })).toEqual({ reservas: 'tbl1', pagos: 'tbl2' });
    expect(ESTADOS.confirmado).toBe('Confirmado');
  });
});

describe('cargarReservasConPagos', () => {
  it('trae reservas del rango con sus pagos ordenados por fecha', async () => {
    const cliente = crearClienteFalso();
    const ids = await sembrarDemo(cliente, '2026-10-12');
    const reservas = await cargarReservasConPagos(cliente, tablasDesdeEnv({}), '2026-10-12', '2026-11-12');
    expect(reservas.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]); // orden por Fecha entrada
    const c = reservas.find((r) => r.id === ids.c);
    expect(c.pagos.map((p) => p.fecha)).toEqual(['2026-10-02', '2026-10-10']);
    expect(c).toMatchObject({ pagado: 630000, saldo: 0, estadoPago: 'pagado' });
    expect(reservas.find((r) => r.id === ids.b)).toMatchObject({ pagado: 0, estadoPago: 'sin_anticipo', pagos: [] });
  });
  it('excluye canceladas salvo que se pidan', async () => {
    const cliente = crearClienteFalso();
    const ids = await sembrarDemo(cliente, '2026-10-12');
    await cliente.actualizar('Reservas', ids.a, { 'Estado': 'Cancelada' });
    const sin = await cargarReservasConPagos(cliente, tablasDesdeEnv({}), '2026-10-12', '2026-11-12');
    expect(sin.map((r) => r.id)).toEqual([ids.c, ids.b]);
    const con = await cargarReservasConPagos(cliente, tablasDesdeEnv({}), '2026-10-12', '2026-11-12', { incluirCanceladas: true });
    expect(con.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]);
    expect(con.find((r) => r.id === ids.a).estado).toBe('Cancelada');
  });
  it('pide los pagos en lotes de 40 ids', async () => {
    const ids = Array.from({ length: 41 }, (_, i) => `rec${String(i).padStart(14, '0')}`);
    const cliente = { listar: vi.fn(async (tabla, { filterByFormula }) => (
      [...filterByFormula.matchAll(/RECORD_ID\(\)='(rec\w{14})'/g)].map((m) => ({ id: m[1], fields: { 'Monto': 1, 'Fecha': '2026-10-01' } }))
    )) };
    const pagos = await cargarPagosPorIds(cliente, 'Pagos', ids);
    expect(pagos).toHaveLength(41);
    expect(cliente.listar).toHaveBeenCalledTimes(2);
  });
});
