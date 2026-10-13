import { clienteDesdeEnv, AirtableError } from '../lib/airtable.js';
import { tablasDesdeEnv } from '../lib/reservas.js';
import { responder, sinCache } from '../lib/http.js';

// Lo vigila UptimeRobot. Sin PIN; no devuelve datos, solo si Airtable responde.
export function crearHandler(deps = {}) {
  return async function handler(req, res) {
    sinCache(res);
    if (req.method !== 'GET') return responder(res, 405, { ok: false, error: 'Método no permitido.' });
    try {
      const cliente = deps.cliente ?? clienteDesdeEnv(deps.env);
      await cliente.listar(tablasDesdeEnv(deps.env).reservas, { fields: ['Huésped'], maxRecords: 1 });
      return responder(res, 200, { ok: true, airtable: 'ok', hora: new Date().toISOString() });
    } catch (e) {
      return responder(res, 503, { ok: false, airtable: 'error', error: e instanceof AirtableError ? e.message : 'Error inesperado.' });
    }
  };
}

export default crearHandler();
