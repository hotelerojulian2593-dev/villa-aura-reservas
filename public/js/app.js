// Cliente del navegador: PIN guardado en el celular, fetch con cabecera X-Pin,
// utilidades de DOM compartidas por el formulario y el calendario.
import { hoyBogota, sumarDias } from './fechas.js';
import { parsearCOP, formatearCOP } from './dinero.js';

export const CLAVE_PIN = 'va_pin';

export function obtenerPin() {
  try { return localStorage.getItem(CLAVE_PIN) || ''; } catch { return ''; }
}
export function guardarPin(pin) {
  try { localStorage.setItem(CLAVE_PIN, pin); } catch { /* modo privado: se pedirá cada vez */ }
}
export function borrarPin() {
  try { localStorage.removeItem(CLAVE_PIN); } catch { /* nada */ }
}
export function pinValido(pin) {
  return /^\d{4,6}$/.test(pin);
}

export const CLAVE_PIN_GERENCIA = 'va_pin_gerencia';

export function obtenerPinGerencia() {
  try { return localStorage.getItem(CLAVE_PIN_GERENCIA) || ''; } catch { return ''; }
}
export function guardarPinGerencia(pin) {
  try { localStorage.setItem(CLAVE_PIN_GERENCIA, pin); } catch { /* modo privado */ }
}
export function borrarPinGerencia() {
  try { localStorage.removeItem(CLAVE_PIN_GERENCIA); } catch { /* nada */ }
}

export function encabezados({ gerencia = false } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Pin': obtenerPin() };
  if (gerencia) h['X-Pin-Gerencia'] = obtenerPinGerencia();
  return h;
}

export function esErrorDeGerencia(mensaje) {
  return /gerencia/i.test(String(mensaje ?? ''));
}

export class ErrorApi extends Error {
  constructor(mensaje, status, datos = {}) {
    super(mensaje);
    this.status = status;
    this.datos = datos;
  }
}

export async function api(ruta, { method = 'GET', body, gerencia = false } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method,
      headers: encabezados({ gerencia }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ErrorApi('Sin conexión. Revisa el internet e intenta de nuevo; lo que escribiste sigue aquí.', 0);
  }
  let datos = {};
  try { datos = await respuesta.json(); } catch { /* respuesta sin JSON */ }
  if (respuesta.status === 401) {
    if (esErrorDeGerencia(datos.error)) borrarPinGerencia(); else borrarPin();
    throw new ErrorApi(datos.error || 'PIN incorrecto.', 401, datos);
  }
  if (!respuesta.ok) throw new ErrorApi(datos.error || 'Error inesperado. Intenta de nuevo.', respuesta.status, datos);
  return datos;
}

export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function mostrarError(el, mensaje) {
  el.textContent = mensaje;
  el.classList.add('visible');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
export function ocultarError(el) {
  el.classList.remove('visible');
}

// Dibuja la pantalla de PIN dentro de `raiz` si no hay PIN guardado. Valida el PIN
// con una consulta mínima a la API y, si pasa, limpia `raiz` y llama `alListo()`.
export function asegurarPin({ raiz, alListo }) {
  if (obtenerPin()) { alListo(); return; }
  raiz.innerHTML = `
    <div class="pin">
      <h2>Ingresa el PIN</h2>
      <p>Lo tiene gerencia. Queda guardado en este celular.</p>
      <input class="entrada" id="pin-entrada" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" aria-label="PIN">
      <div class="error" id="pin-error"></div>
      <button class="boton" id="pin-boton" type="button">Entrar</button>
    </div>`;
  const entrada = raiz.querySelector('#pin-entrada');
  const error = raiz.querySelector('#pin-error');
  const boton = raiz.querySelector('#pin-boton');
  async function intentar() {
    const pin = entrada.value.trim();
    if (!pinValido(pin)) { mostrarError(error, 'El PIN tiene entre 4 y 6 dígitos.'); return; }
    boton.disabled = true;
    guardarPin(pin);
    try {
      const hoy = hoyBogota();
      await api(`/api/reservas?desde=${hoy}&hasta=${sumarDias(hoy, 1)}`);
      raiz.innerHTML = '';
      alListo();
    } catch (e) {
      boton.disabled = false;
      mostrarError(error, e.status === 401 ? 'PIN incorrecto. Intenta de nuevo.' : e.message);
    }
  }
  boton.addEventListener('click', intentar);
  entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') intentar(); });
  entrada.focus();
}

// Formatea "$ 1.060.000" mientras la señora escribe.
export function formatoCOPEnVivo(input) {
  input.addEventListener('input', () => {
    const n = parsearCOP(input.value);
    input.value = n ? formatearCOP(n) : '';
  });
}
