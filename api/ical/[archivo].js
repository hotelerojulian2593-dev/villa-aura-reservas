import { clienteDesdeEnv } from '../../lib/airtable.js';
import { tablasDesdeEnv, listarReservasEnRango, aReservaApi } from '../../lib/reservas.js';
import { generarIcs } from '../../lib/ical.js';
import { pinCorrecto } from '../../lib/pin.js';
import { hoyBogota, sumarDias } from '../../public/js/fechas.js';

// Calendario que importan Airbnb y Booking.com: GET /api/ical/<ICAL_CLAVE>.ics
// La clave va en la URL porque las OTAs no envían cabeceras. Sin nombres de huéspedes.
const DIAS_ADELANTE = 730;

function texto(res, status, cuerpo) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(status).send(cuerpo);
}

export function crearHandler(deps = {}) {
  const ahora = () => (deps.ahora ? deps.ahora() : new Date());
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método no permitido.');
    const env = deps.env ?? process.env;
    if (!env.ICAL_CLAVE) return texto(res, 500, 'ICAL_CLAVE no configurada en el servidor.');
    const archivo = String(req.query?.archivo ?? '');
    if (!archivo.endsWith('.ics') || !pinCorrecto(archivo.slice(0, -4), env.ICAL_CLAVE)) return texto(res, 401, 'Clave incorrecta.');
    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      return res.status(200).send('');
    }
    try {
      console.log('[ical] lectura', String(req.headers?.['user-agent'] ?? '').slice(0, 80));
      const cliente = deps.cliente ?? clienteDesdeEnv(env);
      const tablas = tablasDesdeEnv(env);
      const hoy = hoyBogota(ahora());
      const reservas = (await listarReservasEnRango(cliente, tablas, hoy, sumarDias(hoy, DIAS_ADELANTE))).map((r) => aReservaApi(r));
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      return res.status(200).send(generarIcs(reservas, ahora()));
    } catch (e) {
      console.error('[ical]', e.message);
      return texto(res, 502, 'Airtable no está disponible en este momento.');
    }
  };
}

export default crearHandler();
