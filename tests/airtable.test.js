import { describe, it, expect, vi } from 'vitest';
import { crearCliente, clienteDesdeEnv, AirtableError, esNoEncontrado } from '../lib/airtable.js';

const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });

function clienteConRespuestas(...respuestas) {
  const fetchImpl = vi.fn();
  for (const r of respuestas) fetchImpl.mockResolvedValueOnce(r);
  const dormir = vi.fn(async () => {});
  const cliente = crearCliente({ token: 'tok', baseId: 'appXYZ', fetchImpl, dormir });
  return { cliente, fetchImpl, dormir };
}

describe('listar', () => {
  it('arma la URL con fields[], filterByFormula, sort y pageSize, y manda el token', async () => {
    const { cliente, fetchImpl } = clienteConRespuestas(respuesta(200, { records: [{ id: 'rec1', fields: {} }] }));
    const regs = await cliente.listar('Reservas', {
      filterByFormula: "{Estado}='Confirmado'", fields: ['Huésped', 'Fecha entrada'], maxRecords: 50,
      sort: [{ field: 'Fecha entrada', direction: 'asc' }],
    });
    expect(regs).toHaveLength(1);
    const [url, opciones] = fetchImpl.mock.calls[0];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://api.airtable.com/v0/appXYZ/Reservas');
    expect(u.searchParams.getAll('fields[]')).toEqual(['Huésped', 'Fecha entrada']);
    expect(u.searchParams.get('filterByFormula')).toBe("{Estado}='Confirmado'");
    expect(u.searchParams.get('sort[0][field]')).toBe('Fecha entrada');
    expect(u.searchParams.get('sort[0][direction]')).toBe('asc');
    expect(u.searchParams.get('maxRecords')).toBe('50');
    expect(u.searchParams.get('pageSize')).toBe('100');
    expect(opciones.method).toBe('GET');
    expect(opciones.headers.Authorization).toBe('Bearer tok');
  });
  it('sigue el offset hasta agotar las páginas', async () => {
    const { cliente, fetchImpl } = clienteConRespuestas(
      respuesta(200, { records: [{ id: 'a' }], offset: 'sig' }),
      respuesta(200, { records: [{ id: 'b' }] }),
    );
    const regs = await cliente.listar('Pagos');
    expect(regs.map((r) => r.id)).toEqual(['a', 'b']);
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('offset')).toBe('sig');
  });
});

describe('crear y actualizar', () => {
  it('crear hace POST con typecast', async () => {
    const { cliente, fetchImpl } = clienteConRespuestas(respuesta(200, { id: 'recN', fields: { Huésped: 'Ana' } }));
    const reg = await cliente.crear('Reservas', { Huésped: 'Ana' });
    expect(reg.id).toBe('recN');
    const [url, opciones] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.airtable.com/v0/appXYZ/Reservas');
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(opciones.body)).toEqual({ fields: { Huésped: 'Ana' }, typecast: true });
  });
  it('actualizar hace PATCH sobre el registro', async () => {
    const { cliente, fetchImpl } = clienteConRespuestas(respuesta(200, { id: 'recN', fields: {} }));
    await cliente.actualizar('Reservas', 'recN', { Estado: 'Confirmado' });
    const [url, opciones] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.airtable.com/v0/appXYZ/Reservas/recN');
    expect(opciones.method).toBe('PATCH');
  });
  it('codifica nombres de tabla con espacios', async () => {
    const { cliente, fetchImpl } = clienteConRespuestas(respuesta(200, { id: 'r', fields: {} }));
    await cliente.obtener('Mi tabla', 'r');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.airtable.com/v0/appXYZ/Mi%20tabla/r');
  });
});

describe('reintentos y errores', () => {
  it('reintenta una vez tras 429 esperando 1 s', async () => {
    const { cliente, fetchImpl, dormir } = clienteConRespuestas(respuesta(429, {}), respuesta(200, { records: [] }));
    await cliente.listar('Reservas');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(dormir).toHaveBeenCalledWith(1000);
  });
  it('dos fallos 5xx → AirtableError con el status', async () => {
    const { cliente } = clienteConRespuestas(respuesta(503, {}), respuesta(503, {}));
    await expect(cliente.listar('Reservas')).rejects.toMatchObject({ name: 'AirtableError', status: 503 });
  });
  it('404 no se reintenta y conserva el mensaje de Airtable', async () => {
    const { cliente, fetchImpl } = clienteConRespuestas(respuesta(404, { error: { type: 'NOT_FOUND', message: 'Could not find' } }));
    await expect(cliente.obtener('Reservas', 'recX')).rejects.toMatchObject({ status: 404, message: 'Could not find' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('error de red se reintenta y luego falla con status 0', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const cliente = crearCliente({ token: 't', baseId: 'app1', fetchImpl, dormir: async () => {} });
    await expect(cliente.listar('Reservas')).rejects.toMatchObject({ status: 0, message: 'Airtable no responde.' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('clienteDesdeEnv', () => {
  it('exige token y base', () => {
    expect(() => clienteDesdeEnv({})).toThrow(AirtableError);
    expect(clienteDesdeEnv({ AIRTABLE_TOKEN: 't', AIRTABLE_BASE_ID: 'app1' })).toHaveProperty('listar');
  });
});

describe('esNoEncontrado', () => {
  it('404, o 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND (así responde Airtable a un id inexistente)', () => {
    expect(esNoEncontrado(new AirtableError('x', 404))).toBe(true);
    expect(esNoEncontrado(new AirtableError('x', 403, { error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' } }))).toBe(true);
    expect(esNoEncontrado(new AirtableError('x', 403, { error: { type: 'OTRO' } }))).toBe(false);
    expect(esNoEncontrado(new AirtableError('x', 503))).toBe(false);
    expect(esNoEncontrado(new Error('x'))).toBe(false);
  });
});
