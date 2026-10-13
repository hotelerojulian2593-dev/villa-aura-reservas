# Villa Aura — Sincronización iCal con Airbnb (y Booking.com) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda reserva de Villa Aura bloquee Airbnb sola (calendario `.ics` exportado) y que toda reserva real de Airbnb aparezca sola en el mini-PMS como Full House, con lectura automática cada pocos minutos, estado visible para gerencia y Booking.com conectable después sin programar.

**Architecture:** Dos módulos puros nuevos (`lib/ical.js` para leer/escribir iCalendar, `lib/sincronizar.js` para el diff contra Airtable) y dos funciones serverless nuevas (`api/ical/[archivo].js` exporta, `api/sincronizar.js` importa). La configuración y el estado de cada canal viven en una tabla `Canales` de Airtable; las reservas de canal son registros normales de `Reservas` con `Fuente`, `UID canal` y `Enlace canal`, así que la validación de choques y el calendario las ven sin cambios. La lectura se dispara por UptimeRobot (cada 5 min), por el calendario al abrirse (si pasaron más de 10 min) y por un cron diario de Vercel.

**Tech Stack:** Node 24 ESM sin dependencias, Vercel (hobby), Airtable REST v0 (+ MCP para el esquema), vitest 5, Airtable falso en memoria.

**Spec:** `docs/superpowers/specs/2026-10-13-villa-aura-sincronizacion-ical-design.md` (la copia en `formulario/docs/` se hace en la Tarea 11).

## Global Constraints

- Node 24, ESM, sin build ni dependencias de ejecución; tests con vitest (`npm test` en verde al cerrar cada tarea).
- Repo público: cero tokens, ids de Airtable (`app…`, `tbl…`, `fld…`, `rec…` reales), PINs, `ICAL_CLAVE`, `CRON_SECRET` o enlaces privados en código, tests o docs. Ids y claves solo en `Villa aura/MEMORY.md` y Vercel.
- La API nunca borra: cancelar = `Estado = 'Cancelada'`.
- Nombres exactos de Airtable: tabla `Canales` con `Canal`, `Activo`, `Enlace ICS`, `Última lectura`, `Último resultado`; en `Reservas` los campos `Fuente` (opciones `Directo`, `Airbnb`, `Booking.com`), `UID canal`, `Enlace canal`.
- Historial: una línea por operación, `YYYY-MM-DD HH:mm · <quien> · texto`, hora `America/Bogota`; la sincronización firma `sincronización`.
- Las señoras no ven acciones nuevas; todo lo nuevo de pantalla exige PIN de gerencia salvo las barras/tarjetas de Airbnb.
- ICS: líneas CRLF, `DTEND` exclusivo, `SUMMARY:Villa Aura - ocupado` (ASCII), sin nombres de huéspedes.
- Mensajes de error exactos del spec §7.5 y §9.
- Commits terminan con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. ICS real de Airbnb con `DTSTART;VALUE=DATE`, `DESCRIPTION` plegada en dos líneas y `\n` escapado → se parsea completo (Tarea 1).
2. Calendario válido pero vacío (sin `VEVENT`) → cancela las activas del canal (el huésped canceló); ICS inválido o error HTTP → no toca nada y `Último resultado` empieza por `error:` (Tareas 4 y 5).
3. Evento de Airbnb sobre fechas con reserva directa → se crea igual, historial con `⚠ choca con <huésped>` y `choques` = 1 (Tarea 4).
4. `GET /api/reservas` cuando `Canales` no existe o Airtable falla al leerla → sigue respondiendo 200 con `sincronizacion: []` (Tarea 8).
5. `/api/sincronizar?clave=` incorrecta → 401 sin leer ningún canal; `forzar=1` con PIN de señoras pero sin gerencia → 401 (Tarea 7).

---

### Task 0: Rama, esquema de Airtable y variables de Vercel

**Files:**
- Ninguno del repo (Airtable por MCP, Vercel por CLI, `.env.local` ignorado por git, `Villa aura/MEMORY.md` fuera del repo).

**Interfaces:**
- Produces: campos `Fuente`, `UID canal`, `Enlace canal` en `Reservas`; tabla `Canales` con una fila `Airbnb` (`Activo` apagado, `Enlace ICS` vacío); variables `ICAL_CLAVE` y `CRON_SECRET` en Vercel (3 entornos) y en `.env.local`.

- [ ] **Step 1: Rama**

Run: `cd "/Users/marketinghotelero/Villa aura/formulario" && git checkout -- .gitignore 2>/dev/null; git status --short && git checkout -b sincronizacion-ical && git branch --show-current`
Expected: árbol limpio y `sincronizacion-ical`.

- [ ] **Step 2: Esquema en Airtable (MCP `claude_ai_Airtable`)**

Con `ToolSearch` cargar `mcp__claude_ai_Airtable__create_field`, `mcp__claude_ai_Airtable__create_table`, `mcp__claude_ai_Airtable__create_records_for_table`. Base y tabla `Reservas`: ids en `Villa aura/MEMORY.md`.
1. `create_field` en `Reservas`: `Fuente`, tipo `singleSelect`, opciones `Directo`, `Airbnb`, `Booking.com`.
2. `create_field` en `Reservas`: `UID canal`, tipo `singleLineText`.
3. `create_field` en `Reservas`: `Enlace canal`, tipo `url`.
4. `create_table` `Canales` con campos: `Canal` (`singleLineText`, principal), `Activo` (`checkbox`), `Enlace ICS` (`url`), `Última lectura` (`dateTime`, formato ISO, zona `utc`), `Último resultado` (`singleLineText`).
5. `create_records_for_table` en `Canales`: `{ "Canal": "Airbnb", "Activo": false }`.
Expected: cada llamada devuelve el id creado. Anotar en `Villa aura/MEMORY.md` (sección "Estado actual") los ids del campo `Fuente`, de la tabla `Canales` y de la fila `Airbnb`.

- [ ] **Step 3: Claves y variables**

Run:
```bash
cd "/Users/marketinghotelero/Villa aura/formulario" && ICAL=$(openssl rand -hex 16) && CRON=$(openssl rand -hex 16) \
&& for e in production preview development; do printf %s "$ICAL" | npx -y vercel@latest env add ICAL_CLAVE $e >/dev/null && printf %s "$CRON" | npx -y vercel@latest env add CRON_SECRET $e >/dev/null; done \
&& printf 'ICAL_CLAVE=%s\nCRON_SECRET=%s\n' "$ICAL" "$CRON" >> .env.local && git checkout -- .gitignore 2>/dev/null; npx -y vercel@latest env ls 2>&1 | grep -c -E "ICAL_CLAVE|CRON_SECRET"
```
Expected: `6`. Guardar `ICAL_CLAVE` en `Villa aura/MEMORY.md` (es el secreto del enlace de exportación). `CRON_SECRET` no hace falta guardarlo fuera de Vercel.

- [ ] **Step 4: Verificar que nada tocó el repo**

Run: `git status --short`
Expected: vacío (si `.gitignore` cambió, `git checkout -- .gitignore`).

---

### Task 1: `public/js/canales.js` y `lib/ical.js` — lectura de iCalendar

**Files:**
- Create: `public/js/canales.js`, `lib/ical.js`, `tests/canales.test.js`, `tests/ical.test.js`

**Interfaces:**
- Consumes: `sumarDias` (`public/js/fechas.js`).
- Produces: `FUENTES = { directo: 'Directo', airbnb: 'Airbnb', booking: 'Booking.com' }`, `CANALES = ['Airbnb', 'Booking.com']`, `esDeCanal(reserva): boolean` (en `public/js/canales.js`); `parsearIcs(texto) → [{ uid, inicio, fin, resumen, descripcion }]` (lanza `Error('ICS inválido')`), `eventosReserva(canal, eventos, hoy) → eventos` (Airbnb: solo `Reserved`; Booking: todos; descarta `fin <= hoy`, `fin <= inicio` y UIDs repetidos), `datosDeDescripcion(descripcion) → { codigo, enlace, telefonoFinal }`, `RESUMEN_RESERVA_AIRBNB = 'Reserved'` (en `lib/ical.js`).

- [ ] **Step 1: Tests**

`tests/canales.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { FUENTES, CANALES, esDeCanal } from '../public/js/canales.js';

describe('canales.js', () => {
  it('fuentes y canales con los nombres exactos de Airtable', () => {
    expect(FUENTES).toEqual({ directo: 'Directo', airbnb: 'Airbnb', booking: 'Booking.com' });
    expect(CANALES).toEqual(['Airbnb', 'Booking.com']);
  });
  it('esDeCanal: Airbnb y Booking sí; Directo, vacío o sin fuente no', () => {
    expect(esDeCanal({ fuente: 'Airbnb' })).toBe(true);
    expect(esDeCanal({ fuente: 'Booking.com' })).toBe(true);
    expect(esDeCanal({ fuente: 'Directo' })).toBe(false);
    expect(esDeCanal({ fuente: '' })).toBe(false);
    expect(esDeCanal({})).toBe(false);
    expect(esDeCanal(null)).toBe(false);
  });
});
```

`tests/ical.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parsearIcs, eventosReserva, datosDeDescripcion, RESUMEN_RESERVA_AIRBNB } from '../lib/ical.js';

// Forma real del calendario exportado por Airbnb: fechas VALUE=DATE, DESCRIPTION plegada y con \n escapado.
const ICS_AIRBNB = [
  'BEGIN:VCALENDAR', 'PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 0.8.8//EN', 'CALSCALE:GREGORIAN', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261219', 'DTSTART;VALUE=DATE:20261217', 'UID:1440a2f9c7b5-abc123@airbnb.com', 'SUMMARY:Reserved',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de', ' tails/HMABC123XY\\nPhone Number (Last 4 Digits): 1234', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261231', 'DTSTART;VALUE=DATE:20261224', 'UID:bloqueo-1@airbnb.com', 'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261001T150000Z', 'UID:viejo@airbnb.com', 'SUMMARY:Reserved', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261217', 'DTEND;VALUE=DATE:20261219', 'UID:1440a2f9c7b5-abc123@airbnb.com', 'SUMMARY:Reserved', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

describe('parsearIcs', () => {
  it('lee eventos con fechas VALUE=DATE, desdobla líneas plegadas y desescapa \\n', () => {
    const eventos = parsearIcs(ICS_AIRBNB);
    expect(eventos).toHaveLength(4);
    expect(eventos[0]).toEqual({
      uid: '1440a2f9c7b5-abc123@airbnb.com', inicio: '2026-12-17', fin: '2026-12-19', resumen: 'Reserved',
      descripcion: 'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC123XY\nPhone Number (Last 4 Digits): 1234',
    });
    expect(eventos[1]).toMatchObject({ uid: 'bloqueo-1@airbnb.com', inicio: '2026-12-24', fin: '2026-12-31', resumen: 'Airbnb (Not available)', descripcion: '' });
  });
  it('fecha-hora UTC → fecha; sin DTEND → una noche', () => {
    expect(parsearIcs(ICS_AIRBNB)[2]).toMatchObject({ inicio: '2026-10-01', fin: '2026-10-02' });
  });
  it('acepta LF y tolera líneas sin dos puntos; sin VCALENDAR es inválido', () => {
    expect(parsearIcs('BEGIN:VCALENDAR\nX\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20261101\nEND:VEVENT\nEND:VCALENDAR\n')).toHaveLength(1);
    expect(parsearIcs('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')).toEqual([]);
    expect(() => parsearIcs('hola')).toThrow('ICS inválido');
    expect(() => parsearIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nEND:VEVENT')).toThrow('ICS inválido');
  });
  it('ignora eventos sin UID o sin DTSTART', () => {
    expect(parsearIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261101\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nEND:VEVENT\nEND:VCALENDAR')).toEqual([]);
  });
});

describe('eventosReserva', () => {
  const eventos = parsearIcs(ICS_AIRBNB);
  it('Airbnb: solo Reserved, futuros y sin UID repetido', () => {
    expect(RESUMEN_RESERVA_AIRBNB).toBe('Reserved');
    expect(eventosReserva('Airbnb', eventos, '2026-10-13').map((e) => e.uid)).toEqual(['1440a2f9c7b5-abc123@airbnb.com']);
  });
  it('Booking.com: todos los eventos futuros (su iCal no distingue reserva de bloqueo)', () => {
    expect(eventosReserva('Booking.com', eventos, '2026-10-13').map((e) => e.uid)).toEqual(['1440a2f9c7b5-abc123@airbnb.com', 'bloqueo-1@airbnb.com']);
  });
  it('un evento que termina hoy ya no cuenta; uno que termina mañana sí', () => {
    const e = { uid: 'x', inicio: '2026-10-12', fin: '2026-10-13', resumen: 'Reserved', descripcion: '' };
    expect(eventosReserva('Airbnb', [e], '2026-10-13')).toEqual([]);
    expect(eventosReserva('Airbnb', [{ ...e, fin: '2026-10-14' }], '2026-10-13')).toHaveLength(1);
    expect(eventosReserva('Airbnb', [{ ...e, inicio: '2026-11-02', fin: '2026-11-01' }], '2026-10-13')).toEqual([]);
  });
});

describe('datosDeDescripcion', () => {
  it('extrae enlace, código y últimos 4 dígitos', () => {
    expect(datosDeDescripcion('Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC123XY\nPhone Number (Last 4 Digits): 1234'))
      .toEqual({ codigo: 'HMABC123XY', enlace: 'https://www.airbnb.com/hosting/reservations/details/HMABC123XY', telefonoFinal: '1234' });
  });
  it('vacío cuando no hay datos', () => {
    expect(datosDeDescripcion('')).toEqual({ codigo: '', enlace: '', telefonoFinal: '' });
    expect(datosDeDescripcion(undefined)).toEqual({ codigo: '', enlace: '', telefonoFinal: '' });
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/canales.test.js tests/ical.test.js`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar**

`public/js/canales.js`:
```js
// Fuentes de una reserva. Compartido por navegador y servidor. Los nombres coinciden
// con las opciones del campo `Fuente` de Airtable y con `Canal` en la tabla Canales.
export const FUENTES = { directo: 'Directo', airbnb: 'Airbnb', booking: 'Booking.com' };
export const CANALES = [FUENTES.airbnb, FUENTES.booking];

export function esDeCanal(reserva) {
  const fuente = reserva?.fuente;
  return Boolean(fuente) && fuente !== FUENTES.directo;
}
```

`lib/ical.js`:
```js
// iCalendar mínimo (RFC 5545) para sincronizar disponibilidad con las OTAs. Puro: sin red.
import { sumarDias } from '../public/js/fechas.js';
import { FUENTES } from '../public/js/canales.js';

export const RESUMEN_RESERVA_AIRBNB = 'Reserved';
export const HOST = 'villa-aura-reservas.vercel.app';

// Desdobla líneas plegadas: CRLF (o LF) seguido de espacio o tabulación.
function lineasDe(texto) {
  return String(texto ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n').map((l) => l.replace(/\r$/, ''));
}

function desescapar(valor) {
  return valor.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}

// 20261017 | 20261017T150000Z → 2026-10-17
function aFechaISO(valor) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parsearIcs(texto) {
  const lineas = lineasDe(texto);
  if (!lineas.includes('BEGIN:VCALENDAR') || !lineas.includes('END:VCALENDAR')) throw new Error('ICS inválido');
  const eventos = [];
  let actual = null;
  for (const linea of lineas) {
    if (linea === 'BEGIN:VEVENT') { actual = {}; continue; }
    if (linea === 'END:VEVENT') {
      if (actual?.uid && actual.inicio) {
        eventos.push({ uid: actual.uid, inicio: actual.inicio, fin: actual.fin ?? sumarDias(actual.inicio, 1), resumen: actual.resumen ?? '', descripcion: actual.descripcion ?? '' });
      }
      actual = null;
      continue;
    }
    if (!actual) continue;
    const dosPuntos = linea.indexOf(':');
    if (dosPuntos < 0) continue;
    const nombre = linea.slice(0, dosPuntos).split(';')[0].toUpperCase();
    const valor = linea.slice(dosPuntos + 1);
    if (nombre === 'UID') actual.uid = valor.trim();
    else if (nombre === 'DTSTART') actual.inicio = aFechaISO(valor);
    else if (nombre === 'DTEND') actual.fin = aFechaISO(valor);
    else if (nombre === 'SUMMARY') actual.resumen = desescapar(valor).trim();
    else if (nombre === 'DESCRIPTION') actual.descripcion = desescapar(valor).trim();
  }
  return eventos;
}

// Qué eventos del canal son reservas que nos interesan. Airbnb marca las reales como
// "Reserved" y mezcla bloqueos y ecos en "Airbnb (Not available)"; Booking no distingue.
export function eventosReserva(canal, eventos, hoy) {
  const vistos = new Set();
  return eventos.filter((e) => {
    if (canal === FUENTES.airbnb && e.resumen !== RESUMEN_RESERVA_AIRBNB) return false;
    if (!e.inicio || !e.fin || e.fin <= hoy || e.fin <= e.inicio) return false;
    if (vistos.has(e.uid)) return false;
    vistos.add(e.uid);
    return true;
  });
}

export function datosDeDescripcion(descripcion) {
  const texto = String(descripcion ?? '');
  const enlace = /https?:\/\/\S+/.exec(texto)?.[0] ?? '';
  const codigo = /\/details\/([A-Za-z0-9]+)/.exec(enlace)?.[1] ?? '';
  const telefonoFinal = /Last 4 Digits\)\s*:\s*(\d{4})/i.exec(texto)?.[1] ?? '';
  return { codigo, enlace, telefonoFinal };
}
```

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run tests/canales.test.js tests/ical.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add public/js/canales.js lib/ical.js tests/canales.test.js tests/ical.test.js
git commit -m "iCal: lectura del calendario de las OTAs y fuentes de reserva

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `lib/ical.js` — exportar nuestro calendario (`generarIcs`)

**Files:**
- Modify: `lib/ical.js`
- Test: `tests/ical.test.js`

**Interfaces:**
- Produces: `generarIcs(reservas, ahora = new Date()): string` (`reservas` = objetos de `aReservaApi` con `id`, `entrada`, `salida`), `plegar(linea): string`.

- [ ] **Step 1: Tests (añadir al final de `tests/ical.test.js`)**

```js
import { generarIcs, plegar, HOST } from '../lib/ical.js';

describe('generarIcs', () => {
  const AHORA = new Date('2026-10-13T19:05:00Z');
  const r = { id: 'recAAAAAAAAAAAAAA', huesped: 'Ana Pérez', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'] };
  it('un VEVENT por reserva, fechas VALUE=DATE con salida exclusiva, sin nombres, CRLF', () => {
    const ics = generarIcs([r], AHORA);
    const lineas = ics.split('\r\n');
    expect(lineas.slice(0, 5)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Villa Aura//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']);
    expect(lineas).toContain(`UID:recAAAAAAAAAAAAAA@${HOST}`);
    expect(lineas).toContain('DTSTAMP:20261013T190500Z');
    expect(lineas).toContain('DTSTART;VALUE=DATE:20261017');
    expect(lineas).toContain('DTEND;VALUE=DATE:20261019');
    expect(lineas).toContain('SUMMARY:Villa Aura - ocupado');
    expect(ics).not.toMatch(/Ana|Rosaura/);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
  it('ida y vuelta con parsearIcs; sin reservas sigue siendo un calendario válido', () => {
    expect(parsearIcs(generarIcs([r], AHORA))).toEqual([{ uid: `recAAAAAAAAAAAAAA@${HOST}`, inicio: '2026-10-17', fin: '2026-10-19', resumen: 'Villa Aura - ocupado', descripcion: '' }]);
    expect(parsearIcs(generarIcs([], AHORA))).toEqual([]);
  });
  it('plegar corta a 75 octetos y continúa con espacio', () => {
    expect(plegar('corta')).toBe('corta');
    expect(plegar('a'.repeat(100))).toBe(`${'a'.repeat(75)}\r\n ${'a'.repeat(25)}`);
    expect(plegar('a'.repeat(160)).split('\r\n ')).toEqual(['a'.repeat(75), 'a'.repeat(74), 'a'.repeat(11)]);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/ical.test.js`
Expected: FAIL (`generarIcs` no exportada).

- [ ] **Step 3: Implementar (añadir al final de `lib/ical.js`)**

```js
const compacta = (iso) => iso.replace(/-/g, '');
const marcaUtc = (fecha) => fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545: máximo 75 octetos por línea; cada continuación empieza con un espacio.
export function plegar(linea) {
  const partes = [];
  let resto = linea;
  let limite = 75;
  while (Buffer.byteLength(resto, 'utf8') > limite) {
    let corte = Math.min(limite, resto.length);
    while (Buffer.byteLength(resto.slice(0, corte), 'utf8') > limite) corte -= 1;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte);
    limite = 74;
  }
  partes.push(resto);
  return partes.join('\r\n ');
}

// Todas las reservas activas como noches ocupadas de la casa completa. Nunca nombres.
export function generarIcs(reservas, ahora = new Date()) {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Villa Aura//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const r of reservas) {
    if (!r.entrada || !r.salida) continue;
    lineas.push('BEGIN:VEVENT', `UID:${r.id}@${HOST}`, `DTSTAMP:${marcaUtc(ahora)}`,
      `DTSTART;VALUE=DATE:${compacta(r.entrada)}`, `DTEND;VALUE=DATE:${compacta(r.salida)}`, 'SUMMARY:Villa Aura - ocupado', 'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}
```

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run tests/ical.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ical.js tests/ical.test.js
git commit -m "iCal: exportar las noches ocupadas de Villa Aura

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Datos — `Fuente`, `UID canal`, tabla `Canales`, firma del historial y Airtable falso

**Files:**
- Modify: `lib/reservas.js`, `lib/historial.js`, `lib/airtable-falso.js`, `tests/reservas.test.js`, `tests/historial.test.js`, `tests/airtable-falso.test.js`

**Interfaces:**
- Consumes: `FUENTES` (`public/js/canales.js`).
- Produces: `tablasDesdeEnv(env).canales` (`AIRTABLE_TABLA_CANALES` || `'Canales'`); `formulaCanal(canal, hoy)`; `aReservaApi(...)` con `fuente`, `uidCanal`, `enlaceCanal`; `camposReservaNueva` con `'Fuente': 'Directo'`; `aCanalApi(reg) → { id, canal, activo, enlace, ultimaLectura, ultimoResultado }`; `estadoCanal(c) → { canal, ultimaLectura, ultimoResultado }`; `FUENTES` reexportado; `lineaHistorial(texto, ahora, quien = 'gerencia')`; falso: tabla `Canales`, fórmula de canal, `sembrarDemo` devuelve `canalAirbnb` (fila `Airbnb` activa con enlace de demo).

- [ ] **Step 1: Tests**

En `tests/reservas.test.js`, ampliar el import con `formulaCanal, aCanalApi, estadoCanal, FUENTES` y cambiar dos expectativas existentes:
- en `'campos para crear reserva y pago'`, el `toEqual` de `camposReservaNueva(datos)` pasa a incluir `'Fuente': 'Directo'` (añadir al final del objeto esperado);
- en `'tablas por defecto y por env'`: `expect(tablasDesdeEnv({})).toEqual({ reservas: 'Reservas', pagos: 'Pagos', canales: 'Canales' });` y `expect(tablasDesdeEnv({ AIRTABLE_TABLA_RESERVAS: 'tbl1', AIRTABLE_TABLA_PAGOS: 'tbl2', AIRTABLE_TABLA_CANALES: 'tbl3' })).toEqual({ reservas: 'tbl1', pagos: 'tbl2', canales: 'tbl3' });`

Añadir al final de `tests/reservas.test.js`:
```js
describe('canales (sincronización)', () => {
  it('formulaCanal filtra por Fuente y salida futura, incluidas canceladas; rechaza lo desconocido', () => {
    expect(formulaCanal('Airbnb', '2026-10-13')).toBe("AND({Fuente} = 'Airbnb', IS_AFTER({Fecha salida}, DATETIME_PARSE('2026-10-13', 'YYYY-MM-DD')))");
    expect(() => formulaCanal('Directo', '2026-10-13')).toThrow();
    expect(() => formulaCanal("x' OR 1", '2026-10-13')).toThrow();
    expect(() => formulaCanal('Airbnb', 'hoy')).toThrow();
  });
  it('aReservaApi expone fuente, uidCanal y enlaceCanal; Directo por defecto', () => {
    const r = aReservaApi({ id: 'r', fields: { 'Fuente': 'Airbnb', 'UID canal': 'u1@airbnb.com', 'Enlace canal': 'https://www.airbnb.com/hosting/reservations/details/HM1' } });
    expect(r).toMatchObject({ fuente: 'Airbnb', uidCanal: 'u1@airbnb.com', enlaceCanal: 'https://www.airbnb.com/hosting/reservations/details/HM1' });
    expect(aReservaApi({ id: 'r', fields: {} })).toMatchObject({ fuente: 'Directo', uidCanal: '', enlaceCanal: '' });
    expect(aReservaApi({ id: 'r', fields: { 'Fuente': { name: 'Booking.com' } } }).fuente).toBe('Booking.com');
    expect(FUENTES.directo).toBe('Directo');
  });
  it('aCanalApi y estadoCanal', () => {
    const c = aCanalApi({ id: 'c1', fields: { 'Canal': 'Airbnb', 'Activo': true, 'Enlace ICS': 'https://x/y.ics', 'Última lectura': '2026-10-13T14:00:00.000Z', 'Último resultado': 'ok · 1 activas' } });
    expect(c).toEqual({ id: 'c1', canal: 'Airbnb', activo: true, enlace: 'https://x/y.ics', ultimaLectura: '2026-10-13T14:00:00.000Z', ultimoResultado: 'ok · 1 activas' });
    expect(estadoCanal(c)).toEqual({ canal: 'Airbnb', ultimaLectura: '2026-10-13T14:00:00.000Z', ultimoResultado: 'ok · 1 activas' });
    expect(aCanalApi({ id: 'c2', fields: { 'Canal': 'Booking.com' } })).toEqual({ id: 'c2', canal: 'Booking.com', activo: false, enlace: '', ultimaLectura: null, ultimoResultado: '' });
  });
});
```

Añadir al final de `tests/historial.test.js`:
```js
describe('firma', () => {
  it('por defecto firma gerencia; la sincronización firma con su nombre', () => {
    expect(lineaHistorial('llegó por Airbnb', T, 'sincronización')).toBe('2026-10-13 14:05 · sincronización · llegó por Airbnb');
    expect(lineaHistorial('x', T)).toBe('2026-10-13 14:05 · gerencia · x');
  });
});
```

Añadir al final de `tests/airtable-falso.test.js` (dentro del `describe('cliente falso')` o como describe nuevo):
```js
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
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/reservas.test.js tests/historial.test.js tests/airtable-falso.test.js`
Expected: FAIL (exports ausentes, `Fuente` ausente, tabla `Canales` no existe).

- [ ] **Step 3: Implementar**

`lib/reservas.js`:
- Tras los imports: `import { FUENTES, CANALES } from '../public/js/canales.js';` y `export { FUENTES };`
- `tablasDesdeEnv`: `return { reservas: env.AIRTABLE_TABLA_RESERVAS || 'Reservas', pagos: env.AIRTABLE_TABLA_PAGOS || 'Pagos', canales: env.AIRTABLE_TABLA_CANALES || 'Canales' };`
- Después de `formulaIds` añadir:
```js
// Reservas de un canal con salida futura, incluidas las canceladas (para reconocer un UID que vuelve).
export function formulaCanal(canal, hoy) {
  if (!CANALES.includes(canal)) throw new Error('formulaCanal requiere un canal conocido.');
  if (!esFechaISO(hoy)) throw new Error('formulaCanal requiere una fecha ISO.');
  return `AND({Fuente} = '${canal}', IS_AFTER({Fecha salida}, DATETIME_PARSE('${hoy}', 'YYYY-MM-DD')))`;
}
```
- En `aReservaApi`, después de `historial: f['Historial'] ?? '',` añadir:
```js
    fuente: nombreOpcion(f['Fuente']) ?? FUENTES.directo,
    uidCanal: f['UID canal'] ?? '',
    enlaceCanal: f['Enlace canal'] ?? '',
```
- En `camposReservaNueva`, después de `'Estado': ...,` añadir `'Fuente': FUENTES.directo,`.
- Al final del archivo:
```js
export function aCanalApi(reg) {
  const f = reg.fields ?? {};
  return {
    id: reg.id, canal: f['Canal'] ?? '', activo: Boolean(f['Activo']), enlace: f['Enlace ICS'] ?? '',
    ultimaLectura: f['Última lectura'] ?? null, ultimoResultado: f['Último resultado'] ?? '',
  };
}

export const estadoCanal = (c) => ({ canal: c.canal, ultimaLectura: c.ultimaLectura, ultimoResultado: c.ultimoResultado });

export async function listarCanalesActivos(cliente, tablas) {
  return (await cliente.listar(tablas.canales)).map(aCanalApi).filter((c) => c.activo);
}
```

`lib/historial.js`: `export function lineaHistorial(texto, ahora = new Date(), quien = 'gerencia') { return \`${marcaDeTiempo(ahora)} · ${quien} · ${aplanar(texto)}\`; }` (sustituye la función actual; `aplanar` se conserva).

`lib/airtable-falso.js`:
- `const tablas = { Reservas: new Map(), Pagos: new Map(), Canales: new Map() };`
- Añadir junto a `RE_IDS`: `const RE_CANAL = /\{Fuente\} = '([^']+)'.*IS_AFTER\(\{Fecha salida\}, DATETIME_PARSE\('(\d{4}-\d{2}-\d{2})'/;`
- En `filtrar`, antes de `const ids = ...`:
```js
  const canal = formula.match(RE_CANAL);
  if (canal) {
    const [, fuente, hoy] = canal;
    return registros.filter((r) => r.fields['Fuente'] === fuente && String(r.fields['Fecha salida'] ?? '') > hoy);
  }
```
- En `sembrarDemo`, antes del `return`: `const canal = await cliente.crear('Canales', { 'Canal': 'Airbnb', 'Activo': true, 'Enlace ICS': 'https://www.airbnb.com/calendar/ical/demo.ics' });` y `return { a: a.id, b: b.id, c: c.id, canalAirbnb: canal.id };`

- [ ] **Step 4: Ver pasar y suite completa**

Run: `npx vitest run tests/reservas.test.js tests/historial.test.js tests/airtable-falso.test.js && npm test`
Expected: PASS; suite completa en verde (si algún test comparaba `tablasDesdeEnv` o `camposReservaNueva` con `toEqual` en otro archivo, ampliar su expectativa con `canales`/`Fuente` y anotar ruling).

- [ ] **Step 5: Commit**

```bash
git add lib/reservas.js lib/historial.js lib/airtable-falso.js tests/reservas.test.js tests/historial.test.js tests/airtable-falso.test.js
git commit -m "Datos de canal: Fuente, UID canal, tabla Canales y firma de la sincronización

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `lib/sincronizar.js` — `sincronizarCanal`

**Files:**
- Create: `lib/sincronizar.js`, `tests/sincronizar.test.js`
- Modify: `tests/ayudas.js` (helper `icsDe`)

**Interfaces:**
- Consumes: `parsearIcs`, `eventosReserva`, `datosDeDescripcion` (Tarea 1); `aReservaApi`, `aCanalApi`, `formulaCanal`, `listarReservasEnRango`, `ESTADOS`, `FUENTES` (Tarea 3); `lineaHistorial`, `anteponer`; `buscarConflicto`, `FULL_HOUSE`; `hoyBogota`.
- Produces: `QUIEN = 'sincronización'`; `descargarIcs(url, fetchImpl, timeoutMs = 8000): Promise<string>`; `camposReservaCanal(canal, evento, linea): fields`; `sincronizarCanal({ cliente, tablas, canal, fetchImpl, ahora }) → { ok: true, canal, activas, nuevas, cambiadas, canceladas, choques } | { ok: false, canal, error }`.

- [ ] **Step 1: Tests**

Añadir al final de `tests/ayudas.js` (calendario de Airbnb simulado, lo usan las Tareas 4, 5 y 7):
```js
const compacta = (iso) => iso.replace(/-/g, '');
export function icsDe(eventos) {
  const cuerpo = eventos.map((e) => [
    'BEGIN:VEVENT', `DTSTART;VALUE=DATE:${compacta(e.inicio)}`, `DTEND;VALUE=DATE:${compacta(e.fin)}`, `UID:${e.uid}`,
    `SUMMARY:${e.resumen ?? 'Reserved'}`, ...(e.descripcion ? [`DESCRIPTION:${e.descripcion}`] : []), 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN', ...cuerpo, 'END:VCALENDAR', ''].join('\r\n');
}
```

`tests/sincronizar.test.js`:
```js
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
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/sincronizar.test.js`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/sincronizar.js`**

```js
// Lee el calendario de un canal (Airbnb, Booking.com) y lo refleja en Airtable:
// crea, mueve, cancela y reactiva reservas Full House del canal. Nunca borra.
import { parsearIcs, eventosReserva, datosDeDescripcion } from './ical.js';
import { aReservaApi, aCanalApi, formulaCanal, listarReservasEnRango, listarCanalesActivos, estadoCanal, ESTADOS, FUENTES } from './reservas.js';
import { lineaHistorial, anteponer } from './historial.js';
import { buscarConflicto, FULL_HOUSE } from '../public/js/disponibilidad.js';
import { hoyBogota } from '../public/js/fechas.js';

export const QUIEN = 'sincronización';
const TIMEOUT_MS = 8000;

export async function descargarIcs(url, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS) {
  if (!/^https:\/\//.test(String(url ?? ''))) throw new Error('El enlace del canal debe empezar por https://');
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetchImpl(url, { signal: control.signal, headers: { Accept: 'text/calendar' } });
    if (!respuesta.ok) throw new Error(`el canal respondió ${respuesta.status}`);
    return await respuesta.text();
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'el canal no respondió en 8 s' : e.message);
  } finally {
    clearTimeout(temporizador);
  }
}

export function camposReservaCanal(canal, evento, linea) {
  const { codigo, enlace, telefonoFinal } = datosDeDescripcion(evento.descripcion);
  const notas = [`Reserva de ${canal}`, codigo && `código ${codigo}`, telefonoFinal && `teléfono termina en ${telefonoFinal}`].filter(Boolean).join(' · ');
  return {
    'Huésped': canal, 'Fecha entrada': evento.inicio, 'Fecha salida': evento.fin, 'Habitaciones': [FULL_HOUSE],
    'Estado': ESTADOS.confirmado, 'Fuente': canal, 'UID canal': evento.uid, 'Notas': notas,
    ...(enlace ? { 'Enlace canal': enlace } : {}), 'Historial': linea,
  };
}

const resumen = (r) => `ok · ${r.activas} activas · ${r.nuevas} nuevas · ${r.cambiadas} cambiadas · ${r.canceladas} canceladas`;

async function buscarChoque(cliente, tablas, evento) {
  const existentes = (await listarReservasEnRango(cliente, tablas, evento.inicio, evento.fin)).map((reg) => aReservaApi(reg));
  return buscarConflicto({ entrada: evento.inicio, salida: evento.fin, habitaciones: [FULL_HOUSE] }, existentes);
}

function cancelar(cliente, tablas, r, texto, ahora) {
  return cliente.actualizar(tablas.reservas, r.id, { 'Estado': ESTADOS.cancelada, 'Historial': anteponer(r.historial, lineaHistorial(texto, ahora, QUIEN)) });
}

export async function sincronizarCanal({ cliente, tablas, canal, fetchImpl = globalThis.fetch, ahora = new Date() }) {
  const hoy = hoyBogota(ahora);
  const nombre = canal.canal;
  let eventos;
  try {
    eventos = eventosReserva(nombre, parsearIcs(await descargarIcs(canal.enlace, fetchImpl)), hoy);
  } catch (e) {
    await cliente.actualizar(tablas.canales, canal.id, { 'Último resultado': `error: ${e.message}` });
    return { ok: false, canal: nombre, error: e.message };
  }

  const resultado = { ok: true, canal: nombre, activas: eventos.length, nuevas: 0, cambiadas: 0, canceladas: 0, choques: 0 };
  const registros = await cliente.listar(tablas.reservas, { filterByFormula: formulaCanal(nombre, hoy) });
  const existentes = registros
    .map((reg) => ({ ...aReservaApi(reg), creada: reg.createdTime ?? '' }))
    .sort((a, b) => a.creada.localeCompare(b.creada));
  const porUid = new Map();
  for (const r of existentes) porUid.set(r.uidCanal, [...(porUid.get(r.uidCanal) ?? []), r]);
  const enCalendario = new Set(eventos.map((e) => e.uid));

  for (const evento of eventos) {
    const grupo = porUid.get(evento.uid) ?? [];
    const activas = grupo.filter((r) => r.estado !== ESTADOS.cancelada);
    if (grupo.length === 0) {
      const choque = await buscarChoque(cliente, tablas, evento);
      const texto = `llegó por ${nombre}${choque ? ` · ⚠ choca con ${choque.huesped}` : ''}`;
      await cliente.crear(tablas.reservas, camposReservaCanal(nombre, evento, lineaHistorial(texto, ahora, QUIEN)));
      resultado.nuevas += 1;
      if (choque) resultado.choques += 1;
      continue;
    }
    for (const duplicada of activas.slice(1)) {
      await cancelar(cliente, tablas, duplicada, 'duplicada', ahora);
      resultado.canceladas += 1;
    }
    const vigente = activas[0] ?? grupo[0];
    if (!activas[0]) {
      await cliente.actualizar(tablas.reservas, vigente.id, {
        'Estado': ESTADOS.confirmado, 'Fecha entrada': evento.inicio, 'Fecha salida': evento.fin,
        'Historial': anteponer(vigente.historial, lineaHistorial(`reapareció en ${nombre}`, ahora, QUIEN)),
      });
      resultado.nuevas += 1;
      continue;
    }
    if (vigente.entrada !== evento.inicio || vigente.salida !== evento.fin) {
      const texto = `${nombre} cambió fechas: ${vigente.entrada} → ${vigente.salida} pasa a ${evento.inicio} → ${evento.fin}`;
      await cliente.actualizar(tablas.reservas, vigente.id, {
        'Fecha entrada': evento.inicio, 'Fecha salida': evento.fin, 'Historial': anteponer(vigente.historial, lineaHistorial(texto, ahora, QUIEN)),
      });
      resultado.cambiadas += 1;
    }
  }

  for (const r of existentes) {
    if (r.estado !== ESTADOS.cancelada && !enCalendario.has(r.uidCanal)) {
      await cancelar(cliente, tablas, r, `canceló · ya no aparece en el calendario de ${nombre}`, ahora);
      resultado.canceladas += 1;
    }
  }

  await cliente.actualizar(tablas.canales, canal.id, { 'Última lectura': ahora.toISOString(), 'Último resultado': resumen(resultado) });
  return resultado;
}
```
(`listarCanalesActivos`, `estadoCanal`, `aCanalApi` y `FUENTES` se importan ya para la Tarea 5; vitest no falla por imports sin usar.)

- [ ] **Step 4: Ver pasar**

Run: `npx vitest run tests/sincronizar.test.js`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sincronizar.js tests/sincronizar.test.js tests/ayudas.js
git commit -m "Sincronización: reflejar el calendario de un canal en Airtable sin borrar nada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `lib/sincronizar.js` — `sincronizarTodo` (canales activos, `siViejo`)

**Files:**
- Modify: `lib/sincronizar.js`
- Test: `tests/sincronizar.test.js`

**Interfaces:**
- Produces: `sincronizarTodo({ cliente, tablas, fetchImpl, ahora, siViejoMin = 0 }) → { ok, canales: [resultado por canal], omitido?: true }`; con `siViejoMin > 0` y todos los canales activos leídos hace menos de ese tiempo devuelve `{ ok: true, omitido: true, canales: [estadoCanal…] }`.

- [ ] **Step 1: Tests (añadir al final de `tests/sincronizar.test.js`)**

```js
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
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/sincronizar.test.js`
Expected: FAIL (`sincronizarTodo` no exportada).

- [ ] **Step 3: Implementar (añadir al final de `lib/sincronizar.js`)**

```js
export async function sincronizarTodo({ cliente, tablas, fetchImpl = globalThis.fetch, ahora = new Date(), siViejoMin = 0 }) {
  const canales = await listarCanalesActivos(cliente, tablas);
  if (siViejoMin > 0 && canales.length > 0) {
    const frescos = canales.every((c) => c.ultimaLectura && ahora.getTime() - new Date(c.ultimaLectura).getTime() < siViejoMin * 60000);
    if (frescos) return { ok: true, omitido: true, canales: canales.map(estadoCanal) };
  }
  const resultados = [];
  for (const canal of canales) resultados.push(await sincronizarCanal({ cliente, tablas, canal, fetchImpl, ahora }));
  return { ok: resultados.every((r) => r.ok), canales: resultados };
}
```

- [ ] **Step 4: Ver pasar y suite**

Run: `npx vitest run tests/sincronizar.test.js && npm test`
Expected: PASS; suite en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/sincronizar.js tests/sincronizar.test.js
git commit -m "Sincronización: todos los canales activos, con omisión si la lectura es reciente

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `GET /api/ical/<clave>.ics` y servidor de desarrollo

**Files:**
- Create: `api/ical/[archivo].js`, `tests/api-ical.test.js`
- Modify: `tests/ayudas.js` (`send`), `scripts/dev.mjs`

**Interfaces:**
- Consumes: `generarIcs` (T2), `listarReservasEnRango`, `aReservaApi`, `tablasDesdeEnv` (T3), `pinCorrecto` (`lib/pin.js`), `hoyBogota`, `sumarDias`.
- Produces: `crearHandler(deps)` con `deps.cliente`, `deps.env`, `deps.ahora`; responde texto con `res.status(n).send(texto)`; `crearRes()` de tests gana `send`; `dev.mjs` enruta `/api/ical/<archivo>` y expone `res.send`.

- [ ] **Step 1: Tests**

En `tests/ayudas.js`, dentro de `crearRes()` añadir tras `json(...)`: `send(cuerpo) { this.body = cuerpo; return this; },`

`tests/api-ical.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { crearHandler } from '../api/ical/[archivo].js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { parsearIcs } from '../lib/ical.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearRes } from './ayudas.js';

const CLAVE = 'a'.repeat(32);
const ENV = { PIN_SENORAS: '123456', ICAL_CLAVE: CLAVE };
const AHORA = new Date('2026-10-13T19:05:00Z');
const hoy = hoyBogota(AHORA);
const d = (n) => sumarDias(hoy, n);
const req = (archivo, method = 'GET') => ({ method, query: { archivo }, headers: {} });
let cliente; let ids;

beforeEach(async () => {
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
});
const llamar = async (r, deps = {}) => { const res = crearRes(); await crearHandler({ cliente, env: ENV, ahora: () => AHORA, ...deps })(r, res); return res; };

describe('GET /api/ical/<clave>.ics', () => {
  it('401 con clave incorrecta o sin .ics; 405 en POST; 500 sin ICAL_CLAVE', async () => {
    expect((await llamar(req(`${'b'.repeat(32)}.ics`))).statusCode).toBe(401);
    expect((await llamar(req(CLAVE))).statusCode).toBe(401);
    expect((await llamar(req(`${CLAVE}.ics`, 'POST'))).statusCode).toBe(405);
    const res = await llamar(req(`${CLAVE}.ics`), { env: { PIN_SENORAS: '123456' } });
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('ICAL_CLAVE no configurada en el servidor.');
  });
  it('200 text/calendar con todas las activas (todas las fuentes), sin canceladas ni nombres', async () => {
    const cancelada = await cliente.crear('Reservas', { 'Huésped': 'Zoe', 'Fecha entrada': d(10), 'Fecha salida': d(12), 'Habitaciones': ['La Elsa'], 'Estado': 'Cancelada' });
    const airbnb = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(20), 'Fecha salida': d(22), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u1' });
    const res = await llamar(req(`${CLAVE}.ics`));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-store');
    const uids = parsearIcs(res.body).map((e) => e.uid.split('@')[0]);
    expect(uids.sort()).toEqual([ids.a, ids.b, ids.c, airbnb.id].sort());
    expect(uids).not.toContain(cancelada.id);
    expect(res.body).not.toMatch(/Ana|Gómez|Carlos|Zoe/);
  });
  it('502 en texto plano si Airtable falla', async () => {
    const roto = { listar: async () => { throw new AirtableError('Airtable respondió 503.', 503); } };
    const res = await llamar(req(`${CLAVE}.ics`), { cliente: roto });
    expect(res.statusCode).toBe(502);
    expect(res.body).toBe('Airtable no está disponible en este momento.');
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/api-ical.test.js`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`api/ical/[archivo].js`:
```js
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
    if (req.method !== 'GET') return texto(res, 405, 'Método no permitido.');
    const env = deps.env ?? process.env;
    if (!env.ICAL_CLAVE) return texto(res, 500, 'ICAL_CLAVE no configurada en el servidor.');
    const archivo = String(req.query?.archivo ?? '');
    if (!archivo.endsWith('.ics') || !pinCorrecto(archivo.slice(0, -4), env.ICAL_CLAVE)) return texto(res, 401, 'Clave incorrecta.');
    try {
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
```

`scripts/dev.mjs`:
- En el bloque `if (usarFalso)` añadir: `process.env.ICAL_CLAVE ||= 'demo'.repeat(8); process.env.CRON_SECRET ||= 'cron-demo';` y, tras `sembrarDemo`, un `fetch` de demo que devuelve una reserva de Airbnb dentro de 20 días:
```js
  const hoy = hoyBogota();
  const compacta = (iso) => iso.replace(/-/g, '');
  const icsDemo = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN', 'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${compacta(sumarDias(hoy, 20))}`, `DTEND;VALUE=DATE:${compacta(sumarDias(hoy, 22))}`, 'UID:demo-1@airbnb.com', 'SUMMARY:Reserved',
    'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMDEMO1\\nPhone Number (Last 4 Digits): 1234', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  deps.fetchImpl = async () => ({ ok: true, status: 200, text: async () => icsDemo });
```
  (importar `sumarDias` junto a `hoyBogota`).
- Enrutado: sustituir `const nombre = url.pathname.slice(5).replace(/[^a-z-]/g, '');` por:
```js
  const partes = url.pathname.slice(5).split('/');
  let nombre = partes[0].replace(/[^a-z-]/g, '');
  const extra = {};
  if (nombre === 'ical' && partes[1]) { nombre = 'ical/[archivo]'; extra.archivo = decodeURIComponent(partes[1]); }
```
  y `req.query = { ...Object.fromEntries(url.searchParams), ...extra };`. Añadir junto a `res.json`: `res.send = (cuerpo) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(cuerpo); return res; };`
- Mensaje de arranque: `… · Airtable FALSO (PIN 123456 · gerencia 654321 · ical demodemo…)`.

- [ ] **Step 4: Ver pasar, suite y prueba local**

Run: `npx vitest run tests/api-ical.test.js && npm test`
Expected: PASS; suite en verde.

Run: `(PORT=3123 node scripts/dev.mjs --falso > /tmp/dev-ical.log 2>&1 &) ; sleep 1; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3123/api/ical/demodemodemodemodemodemodemodemo.ics; curl -s http://localhost:3123/api/ical/demodemodemodemodemodemodemodemo.ics | grep -c BEGIN:VEVENT; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3123/api/ical/mala.ics; pkill -f "scripts/dev.mjs --falso"`
Expected: `200 text/calendar; charset=utf-8`, `3`, `401`.

- [ ] **Step 5: Commit**

```bash
git add api/ical tests/api-ical.test.js tests/ayudas.js scripts/dev.mjs
git commit -m "API: calendario .ics de exportación para las OTAs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `GET|POST /api/sincronizar`, cron de Vercel y `.env.example`

**Files:**
- Create: `api/sincronizar.js`, `tests/api-sincronizar.test.js`
- Modify: `vercel.json`, `.env.example`

**Interfaces:**
- Consumes: `sincronizarTodo` (T5), `listarCanalesActivos`, `estadoCanal` (T3), `pinCorrecto`, `exigirPin`, `exigirPinGerencia`, `responder`, `sinCache`, `HOST` (`lib/ical.js`), `AirtableError`.
- Produces: `crearHandler(deps)` con `deps.cliente`, `deps.env`, `deps.dormir`, `deps.fetchImpl`, `deps.ahora`. Autorización: `?clave=` (ICAL_CLAVE) · `Authorization: Bearer <CRON_SECRET>` · `X-Pin` (+ `X-Pin-Gerencia` si `forzar=1` o `estado=1`). Query: `siViejo=<min>`, `forzar=1`, `estado=1`. Respuestas: `200 { ok: true, canales, omitido? }`, `502 { ok: false, canales, error }`, gerencia añade `enlaceIcal`.

- [ ] **Step 1: Tests**

`tests/api-sincronizar.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/sincronizar.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes, icsDe } from './ayudas.js';

const CLAVE = 'a'.repeat(32);
const CRON = 'c'.repeat(32);
const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321', ICAL_CLAVE: CLAVE, CRON_SECRET: CRON };
const AHORA = new Date('2026-10-13T19:05:00Z');
const hoy = hoyBogota(AHORA);
const d = (n) => sumarDias(hoy, n);
const EVENTO = { uid: 'u1@airbnb.com', inicio: d(20), fin: d(22) };
let cliente; let ids; let fetchImpl;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => icsDe([EVENTO]) }));
});
const llamar = async (extra = {}, deps = {}) => {
  const res = crearRes();
  const req = crearReq({ pin: '', ...extra });
  if (extra.gerencia) req.headers['x-pin-gerencia'] = extra.gerencia;
  if (extra.bearer) req.headers.authorization = `Bearer ${extra.bearer}`;
  await crearHandler({ cliente, env: ENV, fetchImpl, dormir: vi.fn(async () => {}), ahora: () => AHORA, ...deps })(req, res);
  return res;
};

describe('/api/sincronizar — autorización', () => {
  it('405 en PUT; 401 con clave mala sin leer ningún canal', async () => {
    expect((await llamar({ method: 'PUT', query: { clave: CLAVE } })).statusCode).toBe(405);
    const res = await llamar({ query: { clave: 'b'.repeat(32) } });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Clave incorrecta.' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('200 con clave (UptimeRobot) y con Bearer CRON_SECRET (Vercel); 401 con Bearer malo', async () => {
    const res = await llamar({ query: { clave: CLAVE } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, canales: [{ ok: true, canal: 'Airbnb', activas: 1, nuevas: 1, cambiadas: 0, canceladas: 0, choques: 0 }] });
    expect(res.body.enlaceIcal).toBeUndefined();
    expect((await llamar({ method: 'POST', bearer: CRON })).statusCode).toBe(200);
    expect((await llamar({ bearer: 'x' })).statusCode).toBe(401);
  });
  it('500 si falta ICAL_CLAVE o CRON_SECRET para la vía usada', async () => {
    expect((await llamar({ query: { clave: CLAVE } }, { env: { PIN_SENORAS: '123456' } })).body.error).toBe('ICAL_CLAVE no configurada en el servidor.');
    expect((await llamar({ bearer: CRON }, { env: { PIN_SENORAS: '123456' } })).body.error).toBe('CRON_SECRET no configurada en el servidor.');
  });
  it('PIN de señoras: lee con siViejo y omite si es reciente; PIN malo → 401', async () => {
    const primero = await llamar({ pin: '123456', query: { siViejo: '10' } });
    expect(primero.statusCode).toBe(200);
    expect(primero.body.canales[0]).toMatchObject({ nuevas: 1 });
    const segundo = await llamar({ pin: '123456', query: { siViejo: '10' } });
    expect(segundo.body).toMatchObject({ ok: true, omitido: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await llamar({ pin: '000000' })).statusCode).toBe(401);
  });
  it('forzar=1 y estado=1 exigen gerencia; devuelven enlaceIcal', async () => {
    const sin = await llamar({ pin: '123456', query: { forzar: '1' } });
    expect(sin.statusCode).toBe(401);
    expect(sin.body.error).toBe('PIN de gerencia incorrecto.');
    const estado = await llamar({ pin: '123456', gerencia: '654321', query: { estado: '1' } });
    expect(estado.statusCode).toBe(200);
    expect(estado.body).toEqual({ ok: true, canales: [{ canal: 'Airbnb', ultimaLectura: null, ultimoResultado: '' }], enlaceIcal: `https://villa-aura-reservas.vercel.app/api/ical/${CLAVE}.ics` });
    expect(fetchImpl).not.toHaveBeenCalled();
    const forzado = await llamar({ method: 'POST', pin: '123456', gerencia: '654321', query: { forzar: '1', siViejo: '10' } });
    expect(forzado.statusCode).toBe(200);
    expect(forzado.body.canales[0]).toMatchObject({ nuevas: 1 });
    expect(forzado.body.enlaceIcal).toContain('/api/ical/');
    const otraVez = await llamar({ method: 'POST', pin: '123456', gerencia: '654321', query: { forzar: '1', siViejo: '10' } });
    expect(otraVez.body.omitido).toBeUndefined();
  });
});

describe('/api/sincronizar — resultados', () => {
  it('502 con error legible cuando un canal falla', async () => {
    fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const res = await llamar({ query: { clave: CLAVE } });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, canales: [{ ok: false, canal: 'Airbnb', error: 'fetch failed' }], error: 'Airbnb: fetch failed' });
  });
  it('sin canales activos → 200 vacío', async () => {
    await cliente.actualizar('Canales', ids.canalAirbnb, { 'Activo': false });
    expect((await llamar({ query: { clave: CLAVE } })).body).toEqual({ ok: true, canales: [] });
  });
  it('502 si Airtable falla (p. ej. la tabla Canales no existe), con mensaje de Airtable', async () => {
    const roto = { ...cliente, listar: async () => { throw new AirtableError('Invalid permissions, or the requested model was not found.', 403, { error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' } }); } };
    const res = await llamar({ query: { clave: CLAVE } }, { cliente: roto });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'Airtable: Invalid permissions, or the requested model was not found.' });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/api-sincronizar.test.js`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`api/sincronizar.js`:
```js
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
```

`vercel.json`:
```json
{ "cleanUrls": true, "trailingSlash": false, "crons": [{ "path": "/api/sincronizar", "schedule": "0 10 * * *" }] }
```

`.env.example`: añadir al final
```
PIN_GERENCIA=
AIRTABLE_TABLA_CANALES=Canales
ICAL_CLAVE=
CRON_SECRET=
```

- [ ] **Step 4: Ver pasar y suite**

Run: `npx vitest run tests/api-sincronizar.test.js && npm test`
Expected: PASS; suite en verde.

- [ ] **Step 5: Commit**

```bash
git add api/sincronizar.js tests/api-sincronizar.test.js vercel.json .env.example
git commit -m "API: /api/sincronizar (UptimeRobot, cron de Vercel y mini-PMS) y cron diario

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Endpoints existentes — `fuente` en GET, reglas para reservas de canal en PATCH y pagos

**Files:**
- Modify: `api/reservas.js`, `api/pagos.js`
- Test: `tests/api-reservas.test.js`, `tests/api-reservas-gerencia.test.js`, `tests/api-pagos.test.js`, `tests/api-pagos-gerencia.test.js`

**Interfaces:**
- Consumes: `listarCanalesActivos`, `estadoCanal`, `FUENTES` (T3).
- Produces: `GET /api/reservas` → `{ ok, desde, hasta, reservas, sincronizacion }`; `PATCH /api/reservas` sobre reserva de canal: `cancelar` → 409, cambios de `entrada`/`salida`/`habitaciones` → 400; `POST|PATCH /api/pagos` sobre reserva de canal → 409.

- [ ] **Step 1: Tests**

En `tests/api-reservas.test.js`, añadir `import { AirtableError } from '../lib/airtable.js';` si no está (ya está) y al final:
```js
describe('GET — estado de sincronización', () => {
  it('incluye los canales activos; si Canales falla, sigue respondiendo con lista vacía', async () => {
    const res = await llamar(crearReq({ query: { desde: hoy, hasta: d(30) } }));
    expect(res.statusCode).toBe(200);
    expect(res.body.sincronizacion).toEqual([{ canal: 'Airbnb', ultimaLectura: null, ultimoResultado: '' }]);
    expect(res.body.reservas[0].fuente).toBe('Directo');
    const roto = { ...cliente, listar: (tabla, opciones) => (tabla === 'Canales'
      ? Promise.reject(new AirtableError('Invalid permissions, or the requested model was not found.', 403, { error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' } }))
      : cliente.listar(tabla, opciones)) };
    const res2 = crearRes();
    await crearHandler({ cliente: roto, env: ENV, dormir })(crearReq({ query: { desde: hoy, hasta: d(30) } }), res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.sincronizacion).toEqual([]);
    expect(res2.body.reservas.length).toBeGreaterThan(0);
  });
});
```

En `tests/api-reservas-gerencia.test.js`, al final:
```js
describe('PATCH sobre reservas de canal', () => {
  const crearDeAirbnb = () => cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(20), 'Fecha salida': d(22), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u1' });
  it('no se cancela aquí', async () => {
    const r = await crearDeAirbnb();
    const res = await patch({ id: r.id, cancelar: { motivo: 'x' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Esta reserva es de Airbnb: cancélala en Airbnb y desaparecerá aquí.');
    expect((await cliente.obtener('Reservas', r.id)).fields['Estado']).toBe('Confirmado');
  });
  it('fechas y habitaciones se cambian en Airbnb; nombre, teléfono, personas, valor y notas sí se editan', async () => {
    const r = await crearDeAirbnb();
    const malo = await patch({ id: r.id, cambios: { salida: d(23) } });
    expect(malo.statusCode).toBe(400);
    expect(malo.body.error).toBe('Las fechas y habitaciones de una reserva de Airbnb se cambian en Airbnb.');
    expect((await patch({ id: r.id, cambios: { habitaciones: ['La Elsa'] } })).statusCode).toBe(400);
    const bueno = await patch({ id: r.id, cambios: { huesped: 'Laura Díaz', telefono: '3001112233', personas: 8, valorTotal: 900000, notas: 'Llegan a las 3' } });
    expect(bueno.statusCode).toBe(200);
    expect(bueno.body.reserva).toMatchObject({ huesped: 'Laura Díaz', personas: 8, valorTotal: 900000, fuente: 'Airbnb', habitaciones: ['FULL HOUSE'] });
    expect(bueno.body.reserva.historial.split('\n')[0]).toContain('editó Huésped: Airbnb → Laura Díaz');
  });
});
```

En `tests/api-pagos.test.js`, al final:
```js
describe('pagos de reservas de canal', () => {
  it('409: los pagos de Airbnb no se registran aquí', async () => {
    const r = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': d(20), 'Fecha salida': d(22), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u1' });
    const res = await llamar({ reservaId: r.id, monto: 1000, medio: 'Nequi' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Los pagos de Airbnb no se registran aquí.');
    expect((await cliente.obtener('Reservas', r.id)).fields['Pagos'] ?? []).toEqual([]);
  });
});
```
(si `d` no existe en ese archivo, añadir `const d = (n) => sumarDias(hoy, n);` junto a `hoy`, importando `sumarDias`).

En `tests/api-pagos-gerencia.test.js`, al final:
```js
describe('PATCH de abonos de reservas de canal', () => {
  it('409 al corregir o anular un abono de una reserva de Airbnb', async () => {
    const r = await cliente.crear('Reservas', { 'Huésped': 'Airbnb', 'Fecha entrada': sumarDias(hoy, 20), 'Fecha salida': sumarDias(hoy, 22), 'Habitaciones': ['FULL HOUSE'], 'Estado': 'Confirmado', 'Fuente': 'Airbnb', 'UID canal': 'u1' });
    const p = await cliente.crear('Pagos', { 'Concepto': 'x', 'Reserva': [r.id], 'Fecha': hoy, 'Monto': 1000, 'Medio': 'Nequi' });
    expect((await patch({ id: p.id, cambios: { monto: 2000 } })).body.error).toBe('Los pagos de Airbnb no se registran aquí.');
    const res = await patch({ id: p.id, anular: { motivo: 'x' } });
    expect(res.statusCode).toBe(409);
    expect((await cliente.obtener('Pagos', p.id)).fields['Monto']).toBe(1000);
  });
});
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/api-reservas.test.js tests/api-reservas-gerencia.test.js tests/api-pagos.test.js tests/api-pagos-gerencia.test.js`
Expected: FAIL en los 4 tests nuevos (sin `sincronizacion`, 200 donde se espera 409/400).

- [ ] **Step 3: Implementar**

`api/reservas.js`:
- Import: añadir `listarCanalesActivos, estadoCanal, FUENTES` al import de `../lib/reservas.js`.
- Helper tras `reservaCompleta`:
```js
// El calendario nunca se cae por la tabla Canales: si falla, la lista va vacía.
async function estadoSincronizacion(cliente, tablas) {
  try {
    return (await listarCanalesActivos(cliente, tablas)).map(estadoCanal);
  } catch (e) {
    console.error('[canales]', e.message);
    return [];
  }
}
```
- En `editar`, después de `if (Object.keys(reales).length === 0) ...`:
```js
    if (actual.fuente !== FUENTES.directo && ['entrada', 'salida', 'habitaciones'].some((k) => k in reales)) {
      return responder(res, 400, { ok: false, error: `Las fechas y habitaciones de una reserva de ${actual.fuente} se cambian en ${actual.fuente}.` });
    }
```
- En `cancelar`, después del 409 de "ya está cancelada":
```js
    if (actual.fuente !== FUENTES.directo) return responder(res, 409, { ok: false, error: `Esta reserva es de ${actual.fuente}: cancélala en ${actual.fuente} y desaparecerá aquí.` });
```
- En GET: `return responder(res, 200, { ok: true, ...v.datos, reservas, sincronizacion: await estadoSincronizacion(cliente, tablas) });`

`api/pagos.js`:
- Import `FUENTES` desde `../lib/reservas.js`.
- Helper tras `obtenerPago`:
```js
  const esDeCanal = (reserva) => reserva.fuente !== FUENTES.directo;
  const rechazarCanal = (res, reserva) => responder(res, 409, { ok: false, error: `Los pagos de ${reserva.fuente} no se registran aquí.` });
```
- En `registrar`, tras el 409 de cancelada: `if (esDeCanal(reserva)) return rechazarCanal(res, reserva);`
- En `corregir` y en `anular`, después de obtener `reservaId` (y antes de escribir): 
```js
    const reserva = aReservaApi(await cliente.obtener(tablas.reservas, reservaId));
    if (esDeCanal(reserva)) return rechazarCanal(res, reserva);
```

- [ ] **Step 4: Ver pasar y suite**

Run: `npx vitest run tests/api-reservas.test.js tests/api-reservas-gerencia.test.js tests/api-pagos.test.js tests/api-pagos-gerencia.test.js && npm test`
Expected: PASS; suite en verde.

- [ ] **Step 5: Commit**

```bash
git add api/reservas.js api/pagos.js tests/api-reservas.test.js tests/api-reservas-gerencia.test.js tests/api-pagos.test.js tests/api-pagos-gerencia.test.js
git commit -m "Reservas de canal: estado de sincronización en GET y reglas de edición, cancelación y pagos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Lógica del navegador — choques, etiquetas y KPIs sin el dinero de los canales

**Files:**
- Modify: `public/js/calendario-logica.js`, `public/js/pagos.js`
- Test: `tests/calendario-logica.test.js`, `tests/pagos.test.js`

**Interfaces:**
- Consumes: `esDeCanal` (T1), `buscarConflicto`.
- Produces: `idsConChoque(reservas): Set<string>` (ids de reservas de canal que chocan con otra activa, y de esa otra); `etiquetaPago(reserva)` → `'Cobro en Airbnb'` para canal; `kpisMes` cuenta la ocupación de las reservas de canal pero no su dinero.

- [ ] **Step 1: Tests**

En `tests/calendario-logica.test.js`, ampliar el import con `idsConChoque` y añadir al final:
```js
describe('reservas de canal', () => {
  const AIRBNB = { ...base, id: 'X', entrada: '2026-10-18', salida: '2026-10-20', habitaciones: ['FULL HOUSE'], fuente: 'Airbnb', valorTotal: null, pagado: 0, saldo: null, estadoPago: 'sin_valor' };
  it('idsConChoque marca la reserva de canal y la directa con la que choca', () => {
    expect([...idsConChoque([A, AIRBNB, B])].sort()).toEqual(['A', 'X']);
    expect(idsConChoque([A, { ...AIRBNB, entrada: '2026-10-20', salida: '2026-10-22' }]).size).toBe(0);
    expect(idsConChoque([A, B]).size).toBe(0);
    expect(idsConChoque([]).size).toBe(0);
  });
  it('etiquetaPago para canal', () => {
    expect(etiquetaPago(AIRBNB)).toBe('Cobro en Airbnb');
    expect(etiquetaPago({ ...AIRBNB, fuente: 'Directo' })).toBe('Valor total sin definir');
  });
});
```

En `tests/pagos.test.js`, dentro de `describe('kpisMes')` añadir:
```js
  it('las reservas de canal cuentan en ocupación pero no en cobrado, por cobrar ni sin valor', () => {
    const airbnb = { id: 'X', entrada: '2026-10-20', salida: '2026-10-22', habitaciones: ['FULL HOUSE'], fuente: 'Airbnb', valorTotal: 900000, pagos: [{ fecha: '2026-10-05', monto: 100 }] };
    const sin = kpisMes([A, B, C, D], MES.desde, MES.hasta);
    const con = kpisMes([A, B, C, D, airbnb], MES.desde, MES.hasta);
    expect(con.nochesOcupadas).toBe(sin.nochesOcupadas + 10);
    expect(con).toMatchObject({ cobrado: sin.cobrado, porCobrar: sin.porCobrar, sinValor: sin.sinValor });
  });
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/calendario-logica.test.js tests/pagos.test.js`
Expected: FAIL (`idsConChoque` no existe; etiqueta y KPIs incorrectos).

- [ ] **Step 3: Implementar**

`public/js/calendario-logica.js`:
- Imports: `import { expandir, FULL_HOUSE, buscarConflicto } from './disponibilidad.js';` y `import { esDeCanal } from './canales.js';`
- En `etiquetaPago`, primera línea: `if (esDeCanal(reserva)) return \`Cobro en ${reserva.fuente}\`;`
- Al final:
```js
// Reservas de canal que se solapan con otra reserva activa del rango cargado (y esa otra).
export function idsConChoque(reservas) {
  const ids = new Set();
  for (const r of reservas) {
    if (!esDeCanal(r)) continue;
    const otra = buscarConflicto({ id: r.id, entrada: r.entrada, salida: r.salida, habitaciones: r.habitaciones }, reservas);
    if (otra) { ids.add(r.id); ids.add(otra.id); }
  }
  return ids;
}
```

`public/js/pagos.js`: `import { esDeCanal } from './canales.js';` y en el bucle de `kpisMes`, justo después de la línea de `nochesOcupadas += …`: `if (esDeCanal(r)) continue; // su dinero lo cobra la plataforma`.

- [ ] **Step 4: Ver pasar y suite**

Run: `npx vitest run tests/calendario-logica.test.js tests/pagos.test.js && npm test`
Expected: PASS; suite en verde.

- [ ] **Step 5: Commit**

```bash
git add public/js/calendario-logica.js public/js/pagos.js tests/calendario-logica.test.js tests/pagos.test.js
git commit -m "Calendario: choques con reservas de canal, etiqueta de cobro y KPIs sin dinero de plataformas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `public/calendario.html` — reservas de canal, sección Canales y lectura al abrir

**Files:**
- Modify: `public/calendario.html`
- Test: `tests/calendario-html.test.js`

**Interfaces:**
- Consumes: `esDeCanal` (`/js/canales.js`), `idsConChoque` (T9), `GET /api/reservas` con `sincronizacion` (T8), `/api/sincronizar?siViejo=10` · `?estado=1` · `?forzar=1` (T7), `enlaceCanal`/`fuente` de cada reserva.
- Produces: pantalla según spec §8. Las señoras ven barras/tarjetas de Airbnb y nada más nuevo.

- [ ] **Step 1: Tests (añadir a `tests/calendario-html.test.js`)**

```js
  it('sincroniza con los canales: sección Canales, lectura al abrir, forzar/estado y "Ver en"', () => {
    expect(html).toContain('id="canales"');
    expect(html).toContain('id="canales-cuerpo"');
    expect(html).toContain('Sincronizar ahora');
    expect(html).toContain("'/api/sincronizar?siViejo=10'");
    expect(html).toContain("'/api/sincronizar?estado=1'");
    expect(html).toContain("'/api/sincronizar?forzar=1'");
    expect(html).toContain("import { esDeCanal } from '/js/canales.js'");
    expect(html).toContain('choques = idsConChoque(reservas)');
    expect(html).toContain('Ver en ${escapar(r.fuente)}');
    expect(html).toContain('Cobro a través de ${escapar(r.fuente)}');
    expect(html).toMatch(/aviso--rojo/);
  });
```

- [ ] **Step 2: Ver fallar**

Run: `npx vitest run tests/calendario-html.test.js`
Expected: FAIL (ninguna cadena nueva existe).

- [ ] **Step 3: Implementar (ediciones sobre `public/calendario.html`, anclas exactas)**

E1 — CSS: después de la línea `.cancelada { opacity: .85; }` añadir:
```css
    #canales { margin-top: 18px; }
    #canales summary { cursor: pointer; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--gris); margin-bottom: 10px; }
    #canales-cuerpo { display: flex; flex-direction: column; gap: 10px; }
    .choque { color: var(--rojo); font-size: 12px; font-weight: 600; }
    .aviso--rojo { background: #FDECEC; border-color: #F2B8B5; color: var(--rojo); }
    .canal--error { color: var(--rojo); font-weight: 600; }
    .enlace-ical { font-size: 11px; word-break: break-all; background: var(--fondo); border-radius: 8px; padding: 8px 10px; }
```

E2 — HTML: después de la línea `<details id="canceladas" …></details>` añadir:
```html
  <details id="canales" class="oculto"><summary>Canales (Airbnb / Booking.com)</summary><div id="canales-cuerpo"></div></details>
```

E3 — imports del script: añadir `import { esDeCanal } from '/js/canales.js';` tras la línea de `/js/disponibilidad.js`, y en el import de `/js/calendario-logica.js` añadir `idsConChoque` al final de la lista.

E4 — estado: después de `let hojaAbierta = null;` añadir `let sincronizacion = [];` y `let choques = new Set();`.

E5 — `iniciar()`: después de la línea del `toggle` de `canceladas` añadir `$('canales').addEventListener('toggle', () => { if ($('canales').open) cargarCanales(); });`

E6 — sustituir `actualizarBloqueCanceladas` por:
```js
  function actualizarBloqueCanceladas() {
    for (const id of ['canceladas', 'canales']) {
      $(id).classList.toggle('oculto', !gerenciaActiva);
      if (!gerenciaActiva) $(id).open = false;
    }
  }
```

E7 — en `cargar()`: sustituir `({ reservas } = await api(\`/api/reservas?desde=${desde}&hasta=${hasta}\`));` por `({ reservas, sincronizacion = [] } = await api(\`/api/reservas?desde=${desde}&hasta=${hasta}\`));` y, tras `if ($('canceladas').open) cargarCanceladas();`, añadir `sincronizarSiViejo();`.

E8 — después de `cargarCanceladas` (antes de `function dibujar()`) añadir:
```js
  // Al abrir el calendario: si la última lectura de los canales tiene más de 10 min, el servidor
  // sincroniza; si hubo cambios se recarga. Si falla, las señoras no ven nada; gerencia lo ve en Canales.
  async function sincronizarSiViejo() {
    if (!sincronizacion.length) return;
    try {
      const r = await api('/api/sincronizar?siViejo=10');
      if (r.omitido) return;
      if ((r.canales ?? []).reduce((s, c) => s + (c.nuevas ?? 0) + (c.cambiadas ?? 0) + (c.canceladas ?? 0), 0) > 0) cargar();
    } catch { /* silencio para las señoras */ }
  }

  function haceCuanto(iso) {
    if (!iso) return 'nunca';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const horas = Math.round(min / 60);
    return horas < 48 ? `hace ${horas} h` : `hace ${Math.round(horas / 24)} días`;
  }

  function dibujarCanales(canales, enlaceIcal) {
    const filas = canales.length ? canales.map((c) => {
      const min = c.ultimaLectura ? (Date.now() - new Date(c.ultimaLectura).getTime()) / 60000 : Infinity;
      const mal = /^error/.test(c.ultimoResultado ?? '') || min > 30;
      return `<div class="tarjeta"><strong>${escapar(c.canal)}</strong>
        <div class="reserva__sub">Última lectura: ${haceCuanto(c.ultimaLectura)}</div>
        <div class="reserva__sub${mal ? ' canal--error' : ''}">${escapar(c.ultimoResultado || 'sin lecturas todavía')}</div></div>`;
    }).join('') : '<div class="tarjeta vacio">Sin canales activos. Se activan en la tabla Canales de Airtable.</div>';
    $('canales-cuerpo').innerHTML = `${filas}
      <button type="button" class="boton boton--secundario" id="sincronizar-ahora">Sincronizar ahora</button>
      <div class="error" id="canales-error" role="alert"></div>
      ${enlaceIcal ? `<p class="reserva__sub">Enlace para Airbnb / Booking.com (Calendario → Disponibilidad → Conectar calendarios → Importar):</p>
      <div class="enlace-ical">${escapar(enlaceIcal)}</div>
      <button type="button" class="boton boton--secundario boton--chico" id="copiar-ical">Copiar enlace</button>` : ''}`;
    $('sincronizar-ahora').addEventListener('click', sincronizarAhora);
    if ($('copiar-ical')) {
      $('copiar-ical').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(enlaceIcal); mostrarAviso('Enlace copiado.'); } catch { /* queda visible para copiarlo a mano */ }
      });
    }
  }

  async function cargarCanales() {
    $('canales-cuerpo').innerHTML = '<div class="tarjeta esqueleto"></div>';
    try {
      const r = await api('/api/sincronizar?estado=1', { gerencia: true });
      dibujarCanales(r.canales ?? [], r.enlaceIcal);
    } catch (e) {
      if (!manejarErrorGerencia(e, null)) $('canales-cuerpo').innerHTML = `<div class="error visible">${escapar(e.message)}</div>`;
    }
  }

  async function sincronizarAhora() {
    const boton = $('sincronizar-ahora');
    boton.disabled = true;
    boton.textContent = 'Sincronizando…';
    try {
      const r = await api('/api/sincronizar?forzar=1', { method: 'POST', gerencia: true });
      const total = (r.canales ?? []).reduce((s, c) => s + (c.nuevas ?? 0) + (c.cambiadas ?? 0) + (c.canceladas ?? 0), 0);
      mostrarAviso(total ? `Sincronizado: ${total} cambio(s).` : 'Sincronizado: sin cambios.');
      await cargar();
      cargarCanales();
    } catch (e) {
      if (!manejarErrorGerencia(e, null)) { mostrarError($('canales-error'), e.message); boton.disabled = false; boton.textContent = 'Sincronizar ahora'; }
    }
  }
```

E9 — `dibujar()`: primera línea del cuerpo: `choques = idsConChoque(reservas);`

E10 — en `dibujarGrilla`, en el `<button … class="barra …">`, sustituir el contenido `>${escapar(r.huesped)}</button>` por `>${choques.has(r.id) ? '⚠ ' : ''}${escapar(r.huesped)}</button>`.

E11 — sustituir la función `tarjeta(r)` completa por:
```js
  const etiquetaEstado = (r) => `<span class="estado estado--${colorEstado(r)}">${escapar(esDeCanal(r) ? r.fuente : r.estado)}</span>`;
  const personasTxt = (r) => (r.personas ? ` · ${r.personas} pers.` : '');

  function tarjeta(r) {
    const pago = esDeCanal(r)
      ? `<div class="reserva__sub">Cobro en ${escapar(r.fuente)}</div>`
      : `<div class="pago"><div class="pago__barra"><span style="width:${porcentajePago(r)}%"></span></div><span class="pago__txt pago--${r.estadoPago}">${escapar(etiquetaPago(r))}</span></div>`;
    return `<button type="button" class="tarjeta reserva" data-id="${r.id}">
      <div class="reserva__cab"><strong>${escapar(r.huesped)}</strong>${etiquetaEstado(r)}</div>
      <div class="reserva__sub">${fechaCorta(r.entrada)} → ${fechaCorta(r.salida)} · ${r.noches} ${r.noches === 1 ? 'noche' : 'noches'}${personasTxt(r)}</div>
      <div class="reserva__sub">${escapar(r.habitaciones.join(' · '))}</div>
      ${choques.has(r.id) ? '<div class="choque">⚠ Choque con otra reserva</div>' : ''}
      ${pago}
    </button>`;
  }
```

E12 — antes de `function abrirDetalle(id)` añadir:
```js
  function bloquePagos(r) {
    if (esDeCanal(r)) {
      return `<p class="detalle__notas">Cobro a través de ${escapar(r.fuente)}. Los datos del huésped y el pago están en la app de ${escapar(r.fuente)}.</p>`;
    }
    const saldoSugerido = r.saldo > 0 ? formatearCOP(r.saldo) : '';
    return `<div class="totales">
            <div><span>Valor total</span><strong>${r.valorTotal == null ? 'Sin definir' : formatearCOP(r.valorTotal)}</strong></div>
            <div><span>Pagado</span><strong>${formatearCOP(r.pagado)}</strong></div>
            <div><span>Saldo</span><strong class="pago--${r.estadoPago}">${r.saldo == null ? '—' : formatearCOP(r.saldo)}</strong></div>
          </div>
          ${r.valorTotal == null ? '<div class="aviso">Valor total sin definir — gerencia puede completarlo con "Editar reserva".</div>' : ''}
          <ul class="pagos">${listaPagos(r)}</ul>
          <button type="button" class="boton boton--dorado" id="abrir-abono">Registrar abono</button>
          <form id="form-abono" class="form-abono oculto">
            <div class="campo"><label for="abono-monto">Monto <span class="req">*</span></label><input class="entrada" id="abono-monto" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${saldoSugerido}"></div>
            <div class="campo"><span class="etiqueta">Medio <span class="req">*</span></span><div class="chips chips--medios">${chipsMedios('nuevo', null)}</div></div>
            <div class="fila-2">
              <div class="campo"><label for="abono-fecha">Fecha</label><input class="entrada" type="date" id="abono-fecha" value="${hoy}"></div>
              <div class="campo"><label for="abono-nota">Nota</label><input class="entrada" id="abono-nota" placeholder="Opcional"></div>
            </div>
            <div class="error" id="abono-error" role="alert"></div>
            <button type="submit" class="boton boton--dorado" id="guardar-abono">Guardar abono</button>
          </form>`;
  }
```

E13 — sustituir la función `abrirDetalle(id)` completa por:
```js
  function abrirDetalle(id) {
    const r = reservas.find((x) => x.id === id);
    if (!r) return;
    hojaAbierta = id;
    const wa = telefonoWa(r.telefono);
    $('hoja').innerHTML = `
      <div class="hoja-fondo" id="hoja-fondo">
        <div class="hoja" role="dialog" aria-modal="true" aria-label="Detalle de la reserva">
          <div class="hoja__asa"></div>
          <div class="detalle__cab">
            <div>
              <h2>${escapar(r.huesped)}</h2>
              <p>${fechaCorta(r.entrada)} → ${fechaCorta(r.salida)} · ${r.noches} ${r.noches === 1 ? 'noche' : 'noches'}${personasTxt(r)}</p>
              <p>${escapar(r.habitaciones.join(' · '))}</p>
            </div>
            ${etiquetaEstado(r)}
          </div>
          ${choques.has(r.id) ? '<div class="aviso aviso--rojo">⚠ Choca con otra reserva activa. Gerencia decide cuál se cancela: la directa aquí, la del canal en su plataforma.</div>' : ''}
          ${wa ? `<a class="boton boton--secundario boton--chico" href="${wa}" target="_blank" rel="noopener">WhatsApp · ${escapar(r.telefono)}</a>` : (r.telefono ? `<span class="reserva__sub">${escapar(r.telefono)}</span>` : '')}
          ${esDeCanal(r) && r.enlaceCanal ? `<a class="boton boton--secundario boton--chico" href="${escapar(r.enlaceCanal)}" target="_blank" rel="noopener">Ver en ${escapar(r.fuente)}</a>` : ''}
          ${r.notas ? `<p class="detalle__notas">${escapar(r.notas)}</p>` : ''}
          ${bloquePagos(r)}
          <button type="button" class="boton boton--secundario" id="btn-gerencia">${gerenciaActiva ? 'Gerencia ▾' : 'Gerencia'}</button>
          <div id="gerencia" class="${gerenciaActiva ? '' : 'oculto'}">${gerenciaActiva ? bloqueGerencia(r) : ''}</div>
          <button type="button" class="boton boton--secundario" id="cerrar">Cerrar</button>
        </div>
      </div>`;
    $('hoja-fondo').addEventListener('click', (ev) => { if (ev.target === $('hoja-fondo')) cerrarHoja(); });
    $('cerrar').addEventListener('click', cerrarHoja);
    if ($('abrir-abono')) {
      $('abrir-abono').addEventListener('click', () => { $('form-abono').classList.remove('oculto'); $('abrir-abono').classList.add('oculto'); $('abono-monto').focus(); });
      formatoCOPEnVivo($('abono-monto'));
      conectarChipsMedio('nuevo');
      $('form-abono').addEventListener('submit', (ev) => { ev.preventDefault(); registrarAbono(r); });
    }
    $('btn-gerencia').addEventListener('click', () => alternarGerencia(r));
    if (gerenciaActiva) conectarGerencia(r);
  }
```

E14 — sustituir la función `bloqueGerencia(r)` completa por:
```js
  function bloqueGerencia(r) {
    const canal = esDeCanal(r);
    return `<div class="gerencia">
      <h3 class="seccion">Gerencia</h3>
      ${canal ? `<p class="reserva__sub">Reserva de ${escapar(r.fuente)}: las fechas, las habitaciones y la cancelación se manejan en ${escapar(r.fuente)}; al siguiente ciclo se reflejan aquí.</p>` : ''}
      <button type="button" class="boton boton--secundario" id="g-editar">Editar reserva</button>
      <form id="g-form-editar" class="form-abono oculto">
        <div class="campo"><label for="g-huesped">Nombre del huésped</label><input class="entrada" id="g-huesped" value="${escapar(r.huesped)}"></div>
        <div class="campo"><label for="g-telefono">WhatsApp / Teléfono</label><input class="entrada" id="g-telefono" value="${escapar(r.telefono)}"></div>
        ${canal ? '' : `<div class="fila-2">
          <div class="campo"><label for="g-entrada">Llegada</label><input class="entrada" type="date" id="g-entrada" value="${r.entrada ?? ''}"></div>
          <div class="campo"><label for="g-salida">Salida</label><input class="entrada" type="date" id="g-salida" value="${r.salida ?? ''}"></div>
        </div>
        <div class="campo"><span class="etiqueta">Habitación(es)</span><div class="chips">${chipsHabitaciones(r.habitaciones)}</div></div>`}
        <div class="fila-2">
          <div class="campo"><label for="g-personas">Personas</label><input class="entrada" type="number" id="g-personas" min="1" max="60" inputmode="numeric" value="${r.personas || ''}"></div>
          <div class="campo"><label for="g-valor">Valor total</label><input class="entrada" id="g-valor" inputmode="numeric" placeholder="$ 0" value="${r.valorTotal == null ? '' : formatearCOP(r.valorTotal)}"></div>
        </div>
        <div class="campo"><label for="g-notas">Notas</label><textarea class="entrada" id="g-notas" rows="2">${escapar(r.notas)}</textarea></div>
        <div class="error" id="g-error" role="alert"></div>
        <button type="submit" class="boton" id="g-guardar">Guardar cambios</button>
      </form>
      ${canal ? '' : `<button type="button" class="boton boton--secundario" id="g-cancelar">Cancelar reserva</button>
      <form id="g-form-cancelar" class="form-abono oculto">
        <div class="campo"><label for="g-motivo">Motivo</label><input class="entrada" id="g-motivo" placeholder="Ej.: el cliente no viajó"></div>
        <div class="error" id="g-cancel-error" role="alert"></div>
        <button type="submit" class="boton boton--rojo" id="g-confirmar-cancelar">Confirmar cancelación</button>
      </form>`}
      <details class="historial"><summary>Historial</summary><pre>${escapar(r.historial || 'Sin cambios registrados.')}</pre></details>
      <button type="button" class="boton boton--secundario" id="g-salir">Salir de gerencia</button>
    </div>`;
  }
```

E15 — en `conectarGerencia(r)`: sustituir `$('g-cancelar').addEventListener('click', () => $('g-form-cancelar').classList.toggle('oculto'));` por `if ($('g-cancelar')) $('g-cancelar').addEventListener('click', () => $('g-form-cancelar').classList.toggle('oculto'));` y `$('g-form-cancelar').addEventListener('submit', (ev) => { ev.preventDefault(); cancelarReserva(r); });` por `if ($('g-form-cancelar')) $('g-form-cancelar').addEventListener('submit', (ev) => { ev.preventDefault(); cancelarReserva(r); });`

E16 — en `guardarEdicion(r)`: sustituir el bloque que arma `cambios` (desde `const cambios = {` hasta `if (valor > 0) cambios.valorTotal = valor;`) por:
```js
    const cambios = { huesped: $('g-huesped').value.trim(), notas: $('g-notas').value.trim() };
    const telefono = $('g-telefono').value.trim();
    if (telefono || !esDeCanal(r)) cambios.telefono = telefono;
    if ($('g-entrada')) Object.assign(cambios, { entrada: $('g-entrada').value, salida: $('g-salida').value, habitaciones: habitacionesElegidas() });
    const personas = Number($('g-personas').value) || 0;
    if (personas || !esDeCanal(r)) cambios.personas = personas;
    const valor = parsearCOP($('g-valor').value);
    if (valor > 0) cambios.valorTotal = valor;
```

- [ ] **Step 4: Sintaxis, tests y prueba local**

Run: `node -e "const s=require('fs').readFileSync('public/calendario.html','utf8'); const m=s.match(/<script type=\"module\">([\s\S]*?)<\/script>/); require('fs').writeFileSync(process.env.TMPDIR+'/cal.mjs', m[1]);" && node --check "$TMPDIR/cal.mjs" && npx vitest run tests/calendario-html.test.js && npm test`
Expected: sin errores de sintaxis; PASS; suite en verde.

Run (flujo con el falso):
```bash
(PORT=3124 node scripts/dev.mjs --falso > /tmp/dev-cal.log 2>&1 &) ; sleep 1; H=http://localhost:3124
curl -s -H 'X-Pin: 123456' "$H/api/reservas?desde=$(date +%Y-%m-01)&hasta=$(date -v+60d +%Y-%m-%d)" | grep -o '"sincronizacion":\[[^]]*\]'
curl -s -o /dev/null -w '%{http_code}\n' "$H/api/sincronizar?clave=demodemodemodemodemodemodemodemo"
curl -s -H 'X-Pin: 123456' "$H/api/reservas?desde=$(date +%Y-%m-01)&hasta=$(date -v+60d +%Y-%m-%d)" | grep -o '"huesped":"Airbnb"[^}]*"fuente":"Airbnb"' | head -c 200; echo
curl -s -X PATCH -H 'X-Pin: 123456' -H 'X-Pin-Gerencia: 654321' -H 'Content-Type: application/json' -d "{\"id\":\"$(curl -s -H 'X-Pin: 123456' "$H/api/reservas?desde=$(date +%Y-%m-01)&hasta=$(date -v+60d +%Y-%m-%d)" | grep -o '"id":"rec[^"]*","huesped":"Airbnb"' | head -1 | cut -d'"' -f4)\",\"cancelar\":{\"motivo\":\"x\"}}" "$H/api/reservas"; echo
pkill -f "scripts/dev.mjs --falso"
```
Expected: `"sincronizacion":[{"canal":"Airbnb",…}]`; `200`; una reserva `Airbnb` con `fuente` `Airbnb`; el PATCH responde el 409 "Esta reserva es de Airbnb…".

- [ ] **Step 5: Commit**

```bash
git add public/calendario.html tests/calendario-html.test.js
git commit -m "Mini-PMS: reservas de Airbnb, choques, sección Canales y lectura al abrir

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Documentación, despliegue, humo en producción y entrega a gerencia

**Files:**
- Modify: `README.md`; copiar spec y plan a `formulario/docs/`; fuera del repo: `Villa aura/CLAUDE.md`, `Villa aura/MEMORY.md`.

**Interfaces:**
- Consumes: todo lo anterior; variables de la Tarea 0.
- Produces: producción con `/api/ical/<clave>.ics` y `/api/sincronizar`; instrucciones para gerencia (Airbnb, Airtable, UptimeRobot).

- [ ] **Step 1: README**

- "Cómo está armado": `api/` → `reservas.js (GET/POST/PATCH), pagos.js (POST/PATCH), salud.js (GET, monitor), sincronizar.js (GET/POST, lee Airbnb/Booking), ical/[archivo].js (GET, calendario .ics para las OTAs)`; `lib/` añade `ical.js, sincronizar.js`.
- Tabla de variables: filas `ICAL_CLAVE` ("32 hex aleatorios; forma el enlace de exportación `/api/ical/<clave>.ics` y autoriza `/api/sincronizar?clave=`. Cambiarla = redesplegar y volver a pegar el enlace en las OTAs y en UptimeRobot."), `CRON_SECRET` ("la envía Vercel al cron diario de `/api/sincronizar`"), `AIRTABLE_TABLA_CANALES` ("opcional; por defecto `Canales`").
- "Operación", nueva viñeta **Canales (Airbnb / Booking.com)** con sub-viñetas: *Conectar Airbnb* (Exportar → pegar en Airtable `Canales` → fila `Airbnb` → `Enlace ICS` y marcar `Activo`; Importar → pegar el enlace que muestra `/calendario` → Gerencia → Canales); *Agregar Booking.com* (fila nueva en `Canales` + pegar nuestro `.ics` en el extranet; su iCal no distingue bloqueos: no bloquear a mano en Booking); *Bloquear la finca* (reserva Full House "BLOQUEO …" en el formulario; nunca bloquear en Airbnb); *Choques* (⚠ en calendario: cancelar la directa aquí o la del canal en su plataforma); *Alerta de UptimeRobot sobre `/api/sincronizar`* (abrir `/calendario` → Gerencia → Canales: el último resultado dice qué falló; si Airbnb cambió el enlace, pegarlo de nuevo); *Frecuencia* (UptimeRobot cada 5 min, calendario al abrir si > 10 min, Vercel 1 vez al día; Airbnb lee nuestro calendario ~cada 3 h, botón Actualizar en Airbnb).
- "Seguridad": sustituir la viñeta "La API no expone borrado ni edición…" por "La API nunca borra; la edición y la cancelación exigen el PIN de gerencia. Con el PIN de las señoras filtrado, lo peor posible es una reserva o un abono falsos, visibles y corregibles." y añadir "El `.ics` exportado no contiene nombres ni teléfonos; la clave de su URL vive solo en Vercel, Airbnb, UptimeRobot y `Villa aura/MEMORY.md`."

- [ ] **Step 2: Copias en `docs/` y commit**

```bash
cp "/Users/marketinghotelero/Villa aura/docs/superpowers/specs/2026-10-13-villa-aura-sincronizacion-ical-design.md" docs/
cp "/Users/marketinghotelero/Villa aura/docs/superpowers/plans/2026-10-13-villa-aura-sincronizacion-ical.md" docs/
git grep -n -E "pat[A-Za-z0-9]{14}\.|app[A-Za-z0-9]{14}|tbl[A-Za-z0-9]{14}|fld[A-Za-z0-9]{14}" -- . ':!package-lock.json' ; echo "exit $?"
git add README.md docs/ && git commit -m "Docs: canales iCal (README, spec y plan)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: el `git grep` no imprime nada (`exit 1`).

- [ ] **Step 3: Desplegar y humo**

```bash
npm test && npx -y vercel@latest deploy --prod --yes 2>&1 | grep -E "Aliased|Error"; git checkout -- .gitignore 2>/dev/null
CLAVE=$(grep '^ICAL_CLAVE=' .env.local | cut -d= -f2); URL=https://villa-aura-reservas.vercel.app
curl -s -o /dev/null -w 'ical: %{http_code} %{content_type}\n' "$URL/api/ical/$CLAVE.ics"
curl -s "$URL/api/ical/$CLAVE.ics" | grep -c BEGIN:VEVENT
curl -s -o /dev/null -w 'ical clave mala: %{http_code}\n' "$URL/api/ical/00000000000000000000000000000000.ics"
curl -s -w '\nsincronizar: %{http_code}\n' "$URL/api/sincronizar?clave=$CLAVE"
curl -s -o /dev/null -w 'sincronizar clave mala: %{http_code}\n' "$URL/api/sincronizar?clave=x"
curl -s -H "X-Pin: $(grep '^PIN_SENORAS=' .env.local | cut -d= -f2)" "$URL/api/reservas?desde=2026-10-01&hasta=2026-10-31" | grep -o '"sincronizacion":\[[^]]*\]'
curl -s "$URL/api/salud"
```
Expected: `ical: 200 text/calendar; charset=utf-8`; un número ≥ 1; `401`; `{"ok":true,"canales":[]}` con `200` (la fila Airbnb está inactiva hasta que gerencia pegue el enlace); `401`; `"sincronizacion":[]`; salud `ok`.
Comprobar en el panel de Vercel (Settings → Cron Jobs) que aparece `/api/sincronizar` diario.

- [ ] **Step 4: `CLAUDE.md`, `MEMORY.md` y memoria del proyecto**

- `CLAUDE.md`: en "Mini-PMS" añadir la viñeta de **Canales** (Airbnb por iCal: reservas reales entran como Full House "Airbnb"; nuestras reservas bloquean Airbnb; bloqueos solo desde Villa Aura; sección Canales para gerencia). En "Arquitectura técnica" añadir `sincronizar.js`, `ical/[archivo].js`, variables `ICAL_CLAVE`, `CRON_SECRET`, tabla `Canales`, campos `Fuente`/`UID canal`/`Enlace canal`. En "Estados de reserva" añadir **Cancelada**. Monitor: segundo monitor de UptimeRobot sobre `/api/sincronizar?clave=…`.
- `MEMORY.md`: novedad "2026-10-13 — Sincronización iCal con Airbnb EN PRODUCCIÓN" con: enlace de exportación completo (con la clave), ids nuevos de Airtable, pasos pendientes de gerencia (pegar enlaces, marcar Activo, UptimeRobot), limitación de ~3 h y botón Actualizar de Airbnb, Booking.com cuando exista.
- Memoria de Claude (`project_villa_aura.md`): estado del sub-proyecto 2 y pendientes de gerencia.

- [ ] **Step 5: Integrar**

```bash
git checkout -- .gitignore 2>/dev/null; git status --short
git checkout master && git merge --ff-only sincronizacion-ical && git push origin master && git branch -d sincronizacion-ical
git log --oneline -1 && git rev-parse --short origin/master
```
Expected: `master` = `origin/master` en el último commit de la rama.

- [ ] **Step 6: Entrega a gerencia (mensaje final)**

Incluir, además de rulings y minors diferidos: (1) Airbnb → Calendario → Disponibilidad → Conectar calendarios → **Exportar** → copiar enlace → Airtable → tabla `Canales` → fila `Airbnb` → pegar en `Enlace ICS` y marcar `Activo`; (2) en la misma pantalla de Airbnb → **Importar** → pegar `https://villa-aura-reservas.vercel.app/api/ical/<clave>.ics` (también visible en `/calendario` → Gerencia → Canales → Copiar enlace), nombre "Villa Aura"; (3) UptimeRobot → nuevo monitor HTTP(s) cada 5 min sobre `https://villa-aura-reservas.vercel.app/api/sincronizar?clave=<clave>`; (4) comprobar en `/calendario` → Gerencia → Canales que la última lectura dice `ok`; (5) regla de oro: los bloqueos se hacen desde Villa Aura, nunca en Airbnb.
