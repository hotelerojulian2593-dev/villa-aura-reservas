import { clienteDesdeEnv, AirtableError } from '../lib/airtable.js';
import { tablasDesdeEnv, listarCanalesActivos, estadoCanal } from '../lib/reservas.js';
import { sincronizarTodo } from '../lib/sincronizar.js';
import { HOST } from '../lib/ical.js';
import { responder, exigirPin, exigirPinGerencia, sinCache } from '../lib/http.js';
import { pinCorrecto } from '../lib/pin.js';

// Lee los calendarios de los canales. Lo disparan UptimeRobot (?clave=), el cron
// diario de Vercel (Bearer CRON_SECRET) y el mini-PMS (PIN; forzar/estado exigen gerencia).
const enlaceIcal = (env) => `https://${HOST}/api/ical/${env.ICAL_CLAVE}.ics`;

export function crearHandler(deps = {}) {
  const ahora = () => (deps.ahora ? deps.ahora() : new Date());
  return async function handler(req, res) {
    sinCache(res);
    if (req.method !== 'GET' && req.method !== 'POST') return responder(res, 405, { ok: false, error: 'Método no permitido.' });
    const env = deps.env ?? process.env;
    const query = req.query ?? {};
    const forzar = String(query.forzar ?? '') === '1';
    const soloEstado = String(query.estado ?? '') === '1';
    const auth = String(req.headers?.authorization ?? '');
    let gerencia = false;

    if (query.clave != null) {
      if (!env.ICAL_CLAVE) return responder(res, 500, { ok: false, error: 'ICAL_CLAVE no configurada en el servidor.' });
      if (!pinCorrecto(String(query.clave), env.ICAL_CLAVE)) return responder(res, 401, { ok: false, error: 'Clave incorrecta.' });
    } else if (auth.startsWith('Bearer ')) {
      if (!env.CRON_SECRET) return responder(res, 500, { ok: false, error: 'CRON_SECRET no configurada en el servidor.' });
      if (!pinCorrecto(auth.slice(7), env.CRON_SECRET)) return responder(res, 401, { ok: false, error: 'Clave incorrecta.' });
    } else {
      if (!(await exigirPin(req, res, deps))) return undefined;
      if ((forzar || soloEstado) && !(await exigirPinGerencia(req, res, deps))) return undefined;
      gerencia = forzar || soloEstado;
    }

    try {
      const cliente = deps.cliente ?? clienteDesdeEnv(env);
      const tablas = tablasDesdeEnv(env);
      const extra = gerencia && env.ICAL_CLAVE ? { enlaceIcal: enlaceIcal(env) } : {};
      if (soloEstado) {
        const canales = (await listarCanalesActivos(cliente, tablas)).map(estadoCanal);
        return responder(res, 200, { ok: true, canales, ...extra });
      }
      const siViejoMin = forzar ? 0 : Math.max(0, Number(query.siViejo) || 0);
      const resultado = await sincronizarTodo({ cliente, tablas, fetchImpl: deps.fetchImpl ?? globalThis.fetch, ahora: ahora(), siViejoMin });
      const fallidos = resultado.omitido ? [] : resultado.canales.filter((c) => !c.ok);
      const error = fallidos.length ? { error: fallidos.map((c) => `${c.canal}: ${c.error}`).join(' · ') } : {};
      return responder(res, resultado.ok ? 200 : 502, { ...resultado, ...error, ...extra });
    } catch (e) {
      console.error('[sincronizar]', e.message);
      return responder(res, 502, { ok: false, error: e instanceof AirtableError ? `Airtable: ${e.message}` : 'Error inesperado.' });
    }
  };
}

export default crearHandler();
