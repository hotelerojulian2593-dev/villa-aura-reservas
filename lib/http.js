import { verificarPin, ipDe } from './pin.js';
import { AirtableError } from './airtable.js';

export function responder(res, status, cuerpo) {
  res.status(status).json(cuerpo);
  return cuerpo;
}

export const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export function sinCache(res) {
  res.setHeader('Cache-Control', 'no-store');
}

// Devuelve true si el PIN es correcto. Si no, espera el freno que corresponda,
// responde 401 (o 500 si el servidor no tiene PIN) y devuelve false.
export async function exigirPin(req, res, deps = {}) {
  const resultado = verificarPin(req.headers?.['x-pin'], ipDe(req), deps.env ?? process.env);
  if (resultado.ok) return true;
  if (resultado.esperaMs > 0) await (deps.dormir ?? dormir)(resultado.esperaMs);
  responder(res, resultado.status, { ok: false, error: resultado.error });
  return false;
}

export function manejarError(res, e) {
  if (e instanceof AirtableError) {
    if (e.status === 404) return responder(res, 404, { ok: false, error: 'La reserva no existe.' });
    if (e.status === 500) return responder(res, 500, { ok: false, error: e.message });
    console.error('[airtable]', e.status, e.message);
    return responder(res, 502, { ok: false, error: 'Airtable no está disponible en este momento. Intenta en un minuto.' });
  }
  console.error('[api]', e);
  return responder(res, 500, { ok: false, error: 'Error inesperado. Intenta de nuevo.' });
}
