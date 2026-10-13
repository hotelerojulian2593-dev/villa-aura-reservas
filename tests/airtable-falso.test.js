import { describe, it, expect } from 'vitest';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';

const RANGO = (desde, hasta) => `AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('${hasta}', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('${desde}', 'YYYY-MM-DD')))`;

describe('cliente falso', () => {
  it('crear devuelve ids con forma de Airtable y obtener los recupera', async () => {
    const cliente = crearClienteFalso();
    const reg = await cliente.crear('Reservas', { 'Huésped': 'Ana', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Rosaura'] });
    expect(reg.id).toMatch(/^rec[A-Za-z0-9]{14}$/);
    expect(reg.createdTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await cliente.obtener('Reservas', reg.id)).fields['Huésped']).toBe('Ana');
  });
  it('un pago vinculado aparece en el campo Pagos de su reserva', async () => {
    const cliente = crearClienteFalso();
    const r = await cliente.crear('Reservas', { 'Huésped': 'Ana', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Rosaura'] });
    const p = await cliente.crear('Pagos', { 'Concepto': 'Anticipo · Ana', 'Reserva': [r.id], 'Monto': 1000, 'Fecha': '2026-10-12', 'Medio': 'Nequi' });
    expect((await cliente.obtener('Reservas', r.id)).fields['Pagos']).toEqual([p.id]);
  });
  it('filtra por rango de fechas y por RECORD_ID()', async () => {
    const cliente = crearClienteFalso();
    const dentro = await cliente.crear('Reservas', { 'Huésped': 'D', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Rosaura'] });
    await cliente.crear('Reservas', { 'Huésped': 'F', 'Fecha entrada': '2026-11-05', 'Fecha salida': '2026-11-07', 'Habitaciones': ['La Rosaura'] });
    const borde = await cliente.crear('Reservas', { 'Huésped': 'B', 'Fecha entrada': '2026-09-30', 'Fecha salida': '2026-10-01', 'Habitaciones': ['La Elsa'] });
    const regs = await cliente.listar('Reservas', { filterByFormula: RANGO('2026-10-01', '2026-11-01'), sort: [{ field: 'Fecha entrada' }] });
    expect(regs.map((r) => r.id)).toEqual([dentro.id]);
    const porId = await cliente.listar('Reservas', { filterByFormula: `OR(RECORD_ID()='${borde.id}',RECORD_ID()='recNoExiste000000')` });
    expect(porId.map((r) => r.id)).toEqual([borde.id]);
  });
  it('obtener inexistente → AirtableError 404; fórmula desconocida → error', async () => {
    const cliente = crearClienteFalso();
    await expect(cliente.obtener('Reservas', 'recNoExiste000000')).rejects.toMatchObject({ name: 'AirtableError', status: 404 });
    await expect(cliente.listar('Reservas', { filterByFormula: '{Estado}="x"' })).rejects.toThrow(/no soportada/);
  });
  it("excluye Estado = 'Cancelada' cuando la fórmula lo pide", async () => {
    const cliente = crearClienteFalso();
    const viva = await cliente.crear('Reservas', { 'Huésped': 'V', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Rosaura'], 'Estado': 'Confirmado' });
    const cancelada = await cliente.crear('Reservas', { 'Huésped': 'C', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Elsa'], 'Estado': 'Cancelada' });
    const sin = await cliente.listar('Reservas', { filterByFormula: `${RANGO('2026-10-01', '2026-11-01').slice(0, -1)}, {Estado} != 'Cancelada')` });
    expect(sin.map((r) => r.id)).toEqual([viva.id]);
    const con = await cliente.listar('Reservas', { filterByFormula: RANGO('2026-10-01', '2026-11-01') });
    expect(con.map((r) => r.id).sort()).toEqual([viva.id, cancelada.id].sort());
  });
  it('actualizar mezcla campos y respeta maxRecords', async () => {
    const cliente = crearClienteFalso();
    const r = await cliente.crear('Reservas', { 'Huésped': 'Ana', 'Estado': 'Anticipo pendiente', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': [] });
    await cliente.actualizar('Reservas', r.id, { 'Estado': 'Confirmado' });
    const [reg] = await cliente.listar('Reservas', { maxRecords: 1 });
    expect(reg.fields).toMatchObject({ 'Huésped': 'Ana', 'Estado': 'Confirmado' });
  });
});

describe('sembrarDemo', () => {
  it('crea tres reservas con sus pagos', async () => {
    const cliente = crearClienteFalso();
    const ids = await sembrarDemo(cliente, '2026-10-12');
    expect(Object.keys(ids)).toEqual(['a', 'b', 'c', 'canalAirbnb']);
    expect(await cliente.listar('Reservas')).toHaveLength(3);
    expect(await cliente.listar('Pagos')).toHaveLength(3);
    expect((await cliente.obtener('Reservas', ids.c)).fields['Pagos']).toHaveLength(2);
  });
});

describe('falso: tabla Canales y fórmula de canal', () => {
  it('crea y lista Canales; la fórmula de canal filtra por Fuente y salida futura sin excluir canceladas', async () => {
    const cliente = crearClienteFalso();
    const c = await cliente.crear('Canales', { 'Canal': 'Airbnb', 'Activo': true, 'Enlace ICS': 'https://x/y.ics' });
    expect((await cliente.listar('Canales')).map((r) => r.id)).toEqual([c.id]);
    const viva = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': '2026-12-17', 'Fecha salida': '2026-12-19', 'Habitaciones': ['FULL HOUSE'], 'Fuente': 'Airbnb', 'UID canal': 'u1' });
    const cancelada = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': '2026-12-20', 'Fecha salida': '2026-12-22', 'Habitaciones': ['FULL HOUSE'], 'Fuente': 'Airbnb', 'UID canal': 'u2', 'Estado': 'Cancelada' });
    await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': '2026-09-01', 'Fecha salida': '2026-09-03', 'Habitaciones': ['FULL HOUSE'], 'Fuente': 'Airbnb', 'UID canal': 'u0' });
    await cliente.crear('Reservas', { 'Huésped': 'Ana', 'Fecha entrada': '2026-12-17', 'Fecha salida': '2026-12-19', 'Habitaciones': ['La Elsa'], 'Fuente': 'Directo' });
    const regs = await cliente.listar('Reservas', { filterByFormula: "AND({Fuente} = 'Airbnb', IS_AFTER({Fecha salida}, DATETIME_PARSE('2026-10-13', 'YYYY-MM-DD')))" });
    expect(regs.map((r) => r.id).sort()).toEqual([viva.id, cancelada.id].sort());
  });
  it('sembrarDemo deja un canal Airbnb activo', async () => {
    const cliente = crearClienteFalso();
    const ids = await sembrarDemo(cliente, '2026-10-13');
    expect((await cliente.obtener('Canales', ids.canalAirbnb)).fields).toMatchObject({ 'Canal': 'Airbnb', 'Activo': true });
  });
});
