import { timingSafeEqual } from 'node:crypto';

// Fallos por IP en memoria de la instancia. Es un freno de mejor esfuerzo: cada
// instancia de Vercel tiene su propio mapa. Suficiente contra fuerza bruta de un
// PIN de 6 dígitos; si el PIN se filtra, se rota desde Vercel en segundos.
const fallos = new Map(); // ip -> { n, ultimo }
const UNA_HORA = 3_600_000;

export function pinCorrecto(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string' || !esperado) return false;
  const a = Buffer.from(recibido.trim());
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function esperaPorFallos(n) {
  if (n < 3) return 0;
  return Math.min(2 ** (n - 3), 30) * 1000;
}

const NOMBRES = { PIN_SENORAS: 'PIN', PIN_GERENCIA: 'PIN de gerencia' };

// `clave` es la variable de entorno que guarda el PIN esperado. Ambos PIN comparten
// el freno por IP: un fallo con cualquiera de los dos cuenta.
export function verificarPin(pinRecibido, ip, env = process.env, ahora = Date.now(), clave = 'PIN_SENORAS') {
  const nombre = NOMBRES[clave] ?? clave;
  const esperado = env[clave];
  if (!esperado) return { ok: false, esperaMs: 0, error: `${nombre} no configurado en el servidor.`, status: 500 };
  if (pinCorrecto(pinRecibido, esperado)) {
    fallos.delete(ip);
    return { ok: true, esperaMs: 0 };
  }
  const previo = fallos.get(ip);
  const n = previo && ahora - previo.ultimo < UNA_HORA ? previo.n + 1 : 1;
  fallos.set(ip, { n, ultimo: ahora });
  return { ok: false, esperaMs: esperaPorFallos(n), error: `${nombre} incorrecto.`, status: 401 };
}

export function reiniciarFallos() {
  fallos.clear();
}

export function ipDe(req) {
  const xff = req.headers?.['x-forwarded-for'];
  const primera = (Array.isArray(xff) ? xff[0] : xff || '').split(',')[0].trim();
  return primera || req.socket?.remoteAddress || 'desconocida';
}
