# Villa Aura — Editar, cancelar y corregir abonos (gerencia) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que gerencia, con un PIN propio, pueda editar y cancelar reservas y corregir o anular abonos desde el mini-PMS, con historial y sin que nada se borre.

**Architecture:** Se extienden los endpoints existentes con el verbo `PATCH` (reservas y pagos) protegido por una segunda cabecera `X-Pin-Gerencia`; la lógica pura nueva (historial, validación de cambios) va en módulos pequeños de `lib/`; el mini-PMS gana un bloque "Gerencia" dentro de la hoja de detalle. Las canceladas salen de la disponibilidad por una cláusula más en la fórmula de Airtable; los abonos anulados quedan en `$ 0` con nota.

**Tech Stack:** igual que el sistema actual — Node 24 ESM sin dependencias, Vercel Functions `(req, res)`, vitest 5, Airtable REST v0, herramientas MCP de Airtable para el campo nuevo.

**Spec:** `/Users/marketinghotelero/Villa aura/docs/superpowers/specs/2026-10-13-villa-aura-edicion-reservas-design.md`. Repo y commits en `/Users/marketinghotelero/Villa aura/formulario/` (rama de trabajo `gerencia-edicion` desde `master`). El sistema base está descrito en `docs/2026-10-12-villa-aura-mini-pms-vercel-design.md` del repo.

## Global Constraints

- Cero dependencias de ejecución; Node `24.x`; vitest `^5.0.4`. `npm test` verde al cerrar cada tarea.
- Repo público: ningún secreto ni id de Airtable en código, tests ni docs. Variable nueva: `PIN_GERENCIA` (6 dígitos, distinta de `PIN_SENORAS`), en los 3 entornos de Vercel.
- **La API nunca borra ni expone borrado.** Cancelar = `Estado = Cancelada`; anular abono = `Monto = 0` + nota `ANULADO · antes $X · motivo`.
- Cabeceras: `X-Pin` (señoras) siempre; `X-Pin-Gerencia` además en `PATCH /api/reservas`, `PATCH /api/pagos` y `GET /api/reservas?incluirCanceladas=1`. Mensajes: `PIN de gerencia incorrecto.` (401), `PIN de gerencia no configurado en el servidor.` (500). El freno por IP es compartido entre ambos PIN.
- Nombres de campo Airtable exactos: en `Reservas` se agrega `Historial` (texto largo); `Estado` gana la opción `Cancelada` (la crea `typecast: true`). En `Pagos` no hay campos nuevos.
- Líneas de historial, siempre antepuestas, formato `YYYY-MM-DD HH:mm · gerencia · <texto>` en hora `America/Bogota`.
- Textos de interfaz en español; paleta MH; botones ≥ 44 px.
- Commits en español en la rama `gerencia-edicion`, terminando con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Editar solo `salida` dejándola igual o anterior a la `entrada` existente → `400 "La fecha de salida debe ser posterior a la llegada."` (la validación debe hacerse sobre la reserva fusionada, no sobre el cambio aislado). Test en Tarea 5.
2. Cambiar las fechas de una reserva a un rango que solo se solapa consigo misma → no es conflicto (exclusión por `id`). Test en Tarea 5.
3. Anular un abono que ya tenía nota → la nota anterior se conserva detrás de ` | `. Test en Tarea 6.
4. `GET /api/reservas?incluirCanceladas=1` con PIN de gerencia malo → `401` y **ninguna** reserva devuelta (ni siquiera las normales). Test en Tarea 5.
5. Cuerpo con `cambios` **y** `cancelar` a la vez → `400 "Indica cambios o cancelar, no ambos."`, nada se escribe. Test en Tarea 5.

---

## Estructura de archivos

```
formulario/
  lib/pin.js                 MOD  verificarPin(pin, ip, env, ahora, clave='PIN_SENORAS')       (T1)
  lib/http.js                MOD  + exigirPinGerencia(req, res, deps)                           (T1)
  lib/historial.js           NEW  marcaDeTiempo, lineaHistorial, anteponer, cambiosReales, describirCambios (T2)
  lib/validar.js             MOD  + validarCambiosReserva, validarCancelacion, validarCambiosPago, validarAnulacion (T3)
  lib/reservas.js            MOD  ESTADOS.cancelada, formulaRango(…,{incluirCanceladas}), anulado/historial en el mapeo, camposCambiosReserva, camposCambiosPago (T4)
  lib/airtable-falso.js      MOD  filtro {Estado} != 'Cancelada'                               (T4)
  api/reservas.js            MOD  PATCH (cambios | cancelar) + GET incluirCanceladas           (T5)
  api/pagos.js               MOD  PATCH (cambios | anular) + 409 en POST si la reserva está cancelada (T6)
  public/js/app.js           MOD  PIN de gerencia en localStorage; api(…, { gerencia: true })  (T7)
  public/calendario.html     MOD  bloque Gerencia en la hoja de detalle + "Canceladas del mes" (T8)
  tests/pin-gerencia.test.js, tests/historial.test.js, tests/validar-gerencia.test.js,
  tests/api-reservas-gerencia.test.js, tests/api-pagos-gerencia.test.js   NEW
  tests/reservas.test.js, tests/airtable-falso.test.js, tests/app.test.js  MOD
  README.md, docs/                                                          MOD (T9)
```

---

### Task 0: Rama de trabajo y campo `Historial` en Airtable

**Files:** ninguno en el repo (git + MCP).

**Interfaces:**
- Produces: rama `gerencia-edicion` limpia desde `master`; campo `Historial` (texto largo) en la tabla `Reservas` (id de base y tabla en `MEMORY.md` del proyecto, fuera del repo).

- [ ] **Step 1: Rama**

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
git status --short            # vacío (si .gitignore aparece modificado por el CLI de Vercel: git checkout -- .gitignore)
git checkout master && git pull -q origin master
git checkout -b gerencia-edicion
npm test                      # 143 passed
```

- [ ] **Step 2: Campo `Historial`** con `mcp__claude_ai_Airtable__create_field` sobre la tabla `Reservas`:

```json
{ "baseId": "<BASE_ID de MEMORY.md>", "tableId": "<TABLE_ID de Reservas>", "field": { "name": "Historial", "type": "multilineText", "description": "Cambios hechos por gerencia desde el mini-PMS. Lo escribe la API; la línea más reciente va arriba." } }
```
Verificar con `list_tables_for_base` que `Reservas` tiene `Historial` de tipo `multilineText`. La opción `Cancelada` de `Estado` no se crea aquí: la API la crea con `typecast: true` en la primera cancelación (verificada en T9).

- [ ] **Step 3: Anotar en `MEMORY.md` del proyecto** (sección Novedades): campo `Historial` creado el 2026-10-13.

---

### Task 1: PIN de gerencia — `lib/pin.js` generalizado y `exigirPinGerencia`

**Files:**
- Modify: `lib/pin.js` (función `verificarPin`)
- Modify: `lib/http.js` (agregar `exigirPinGerencia`)
- Create: `tests/pin-gerencia.test.js`

**Interfaces:**
- Consumes: `verificarPin`, `ipDe`, `reiniciarFallos` (lib/pin.js); `responder`, `dormir` (lib/http.js); `crearReq`, `crearRes` (tests/ayudas.js).
- Produces: `verificarPin(pinRecibido, ip, env = process.env, ahora = Date.now(), clave = 'PIN_SENORAS')` — con `clave = 'PIN_GERENCIA'` lee `env.PIN_GERENCIA` y responde `PIN de gerencia incorrecto.` / `PIN de gerencia no configurado en el servidor.`; `exigirPinGerencia(req, res, deps): Promise<boolean>` (lee `req.headers['x-pin-gerencia']`, responde 401/500 y devuelve `false` si falla). Los tests existentes de `tests/pin.test.js` siguen pasando sin cambios.

- [ ] **Step 1: Escribir el test**

`tests/pin-gerencia.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { verificarPin, reiniciarFallos } from '../lib/pin.js';
import { exigirPinGerencia } from '../lib/http.js';
import { crearReq, crearRes } from './ayudas.js';

const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321' };

beforeEach(() => reiniciarFallos());

describe('verificarPin con clave PIN_GERENCIA', () => {
  it('acepta el PIN de gerencia y rechaza el de las señoras', () => {
    expect(verificarPin('654321', '1.1.1.1', ENV, Date.now(), 'PIN_GERENCIA')).toEqual({ ok: true, esperaMs: 0 });
    expect(verificarPin('123456', '1.1.1.1', ENV, Date.now(), 'PIN_GERENCIA'))
      .toEqual({ ok: false, esperaMs: 0, error: 'PIN de gerencia incorrecto.', status: 401 });
  });
  it('sin PIN_GERENCIA configurado → 500 con su propio mensaje', () => {
    expect(verificarPin('654321', '1.1.1.1', { PIN_SENORAS: '123456' }, Date.now(), 'PIN_GERENCIA'))
      .toEqual({ ok: false, esperaMs: 0, error: 'PIN de gerencia no configurado en el servidor.', status: 500 });
  });
  it('los fallos de ambos PIN comparten el freno por IP', () => {
    verificarPin('000000', '2.2.2.2', ENV);
    verificarPin('000000', '2.2.2.2', ENV, Date.now(), 'PIN_GERENCIA');
    expect(verificarPin('000000', '2.2.2.2', ENV, Date.now(), 'PIN_GERENCIA').esperaMs).toBe(1000);
  });
  it('el mensaje de las señoras no cambia', () => {
    expect(verificarPin('000000', '3.3.3.3', ENV).error).toBe('PIN incorrecto.');
    expect(verificarPin('123456', '3.3.3.3', {}).error).toBe('PIN no configurado en el servidor.');
  });
});

describe('exigirPinGerencia', () => {
  it('true con la cabecera correcta', async () => {
    const req = crearReq();
    req.headers['x-pin-gerencia'] = '654321';
    expect(await exigirPinGerencia(req, crearRes(), { env: ENV })).toBe(true);
  });
  it('sin cabecera → 401 y false', async () => {
    const res = crearRes();
    expect(await exigirPinGerencia(crearReq(), res, { env: ENV, dormir: async () => {} })).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'PIN de gerencia incorrecto.' });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/pin-gerencia.test.js`
Expected: FAIL — `exigirPinGerencia` no se exporta de `lib/http.js` (SyntaxError de importación) o, si vitest llega a ejecutar, los mensajes de gerencia no coinciden.

- [ ] **Step 3: Implementar en `lib/pin.js`** — reemplazar la función `verificarPin` completa por:

```js
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
```

- [ ] **Step 4: Implementar en `lib/http.js`** — después de `exigirPin`, agregar:

```js
// Segunda llave: solo las operaciones de gerencia (PATCH y ver canceladas) la exigen.
export async function exigirPinGerencia(req, res, deps = {}) {
  const resultado = verificarPin(req.headers?.['x-pin-gerencia'], ipDe(req), deps.env ?? process.env, Date.now(), 'PIN_GERENCIA');
  if (resultado.ok) return true;
  if (resultado.esperaMs > 0) await (deps.dormir ?? dormir)(resultado.esperaMs);
  responder(res, resultado.status, { ok: false, error: resultado.error });
  return false;
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run tests/pin-gerencia.test.js tests/pin.test.js` → PASS (ambos archivos). Luego `npm test` → todo PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pin.js lib/http.js tests/pin-gerencia.test.js
git commit -m "PIN de gerencia: verificarPin por clave y exigirPinGerencia

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `lib/historial.js` — líneas de historial y descripción de cambios

**Files:**
- Create: `lib/historial.js`, `tests/historial.test.js`

**Interfaces:**
- Consumes: `formatearCOP` (public/js/dinero.js), `ZONA` (public/js/fechas.js).
- Produces: `marcaDeTiempo(ahora = new Date()): 'YYYY-MM-DD HH:mm'` (Bogotá), `lineaHistorial(texto, ahora?): string` (`'2026-10-13 14:05 · gerencia · <texto>'`), `anteponer(historial, linea): string`, `cambiosReales(antes, despues): object` (solo claves cuyo valor difiere; arrays comparados por contenido), `describirCambios(antes, despues): string` (`'Fecha entrada: 2026-10-17 → 2026-10-18; Personas: 4 → 5'`; dinero con `formatearCOP`; vacío → `'—'`), `ETIQUETAS` (clave de API → nombre legible).

- [ ] **Step 1: Escribir los tests**

`tests/historial.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { marcaDeTiempo, lineaHistorial, anteponer, cambiosReales, describirCambios } from '../lib/historial.js';

const T = new Date('2026-10-13T19:05:00Z'); // 14:05 en Bogotá

describe('marca de tiempo y línea', () => {
  it('usa hora de Colombia y formato fijo', () => {
    expect(marcaDeTiempo(T)).toBe('2026-10-13 14:05');
    expect(marcaDeTiempo(new Date('2026-10-14T04:30:00Z'))).toBe('2026-10-13 23:30');
    expect(lineaHistorial('canceló · motivo: no viajó', T)).toBe('2026-10-13 14:05 · gerencia · canceló · motivo: no viajó');
  });
  it('antepone: lo reciente queda arriba', () => {
    expect(anteponer('', 'A')).toBe('A');
    expect(anteponer(undefined, 'A')).toBe('A');
    expect(anteponer('A', 'B')).toBe('B\nA');
  });
});

describe('cambiosReales y describirCambios', () => {
  const antes = { huesped: 'Ana', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'], personas: 4, valorTotal: 500000, notas: '' };
  it('ignora lo que no cambia y compara arrays por contenido', () => {
    expect(cambiosReales(antes, { huesped: 'Ana', habitaciones: ['La Rosaura'], personas: 5 })).toEqual({ personas: 5 });
    expect(cambiosReales(antes, { habitaciones: ['La Rosaura', 'La Clara'] })).toEqual({ habitaciones: ['La Rosaura', 'La Clara'] });
    expect(cambiosReales(antes, {})).toEqual({});
  });
  it('describe con etiquetas, flechas, dinero formateado y vacío como —', () => {
    expect(describirCambios(antes, { entrada: '2026-10-18', personas: 5, valorTotal: 600000, notas: 'tarde' }))
      .toBe('Fecha entrada: 2026-10-17 → 2026-10-18; Personas: 4 → 5; Valor total: $ 500.000 → $ 600.000; Notas: — → tarde');
    expect(describirCambios(antes, { habitaciones: ['FULL HOUSE'] })).toBe('Habitaciones: La Rosaura → FULL HOUSE');
    expect(describirCambios({ monto: 250000, medio: 'Nequi' }, { monto: 200000 })).toBe('Monto: $ 250.000 → $ 200.000');
  });
  it('no inventa texto cuando nada cambió', () => {
    expect(describirCambios(antes, { personas: 4 })).toBe('');
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/historial.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/historial.js`**

```js
// Historial legible de cambios hechos por gerencia. Puro: sin red ni Airtable.
import { formatearCOP } from '../public/js/dinero.js';
import { ZONA } from '../public/js/fechas.js';

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export const ETIQUETAS = {
  huesped: 'Huésped', telefono: 'Teléfono', entrada: 'Fecha entrada', salida: 'Fecha salida',
  habitaciones: 'Habitaciones', personas: 'Personas', valorTotal: 'Valor total', notas: 'Notas',
  monto: 'Monto', fecha: 'Fecha', medio: 'Medio', nota: 'Nota',
};
const DINERO = new Set(['valorTotal', 'monto']);

export function marcaDeTiempo(ahora = new Date()) {
  return formato.format(ahora).replace(', ', ' ');
}

export function lineaHistorial(texto, ahora = new Date()) {
  return `${marcaDeTiempo(ahora)} · gerencia · ${texto}`;
}

export function anteponer(historial, linea) {
  return historial ? `${linea}\n${historial}` : linea;
}

function igual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return [...(a ?? [])].join('|') === [...(b ?? [])].join('|');
  return (a ?? '') === (b ?? '');
}

function mostrar(clave, valor) {
  if (valor == null || valor === '' || (Array.isArray(valor) && valor.length === 0)) return '—';
  if (Array.isArray(valor)) return valor.join(', ');
  if (DINERO.has(clave)) return formatearCOP(valor);
  return String(valor);
}

export function cambiosReales(antes, despues) {
  const reales = {};
  for (const [clave, valor] of Object.entries(despues ?? {})) {
    if (!igual(antes?.[clave], valor)) reales[clave] = valor;
  }
  return reales;
}

export function describirCambios(antes, despues) {
  return Object.entries(cambiosReales(antes, despues))
    .map(([clave, valor]) => `${ETIQUETAS[clave] ?? clave}: ${mostrar(clave, antes?.[clave])} → ${mostrar(clave, valor)}`)
    .join('; ');
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/historial.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/historial.js tests/historial.test.js
git commit -m "Historial de cambios de gerencia: marca de tiempo, líneas y descripción de cambios

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: `lib/validar.js` — validación de cambios, cancelación, corrección y anulación

**Files:**
- Modify: `lib/validar.js` (agregar al final)
- Create: `tests/validar-gerencia.test.js`

**Interfaces:**
- Consumes: `texto`, `aEntero`, `error`, `RE_RECORD`, `MEDIOS`, `esFechaISO`, `OPCIONES_HABITACION`, `FULL_HOUSE` (ya en el módulo).
- Produces: `validarCambiosReserva(body) → { ok, datos: { id, cambios } }` (solo las claves presentes, ya normalizadas; **no** compara `salida > entrada` ni `entrada ≥ hoy`: eso lo hace la API sobre la reserva fusionada), `validarCancelacion(body) → { ok, datos: { id, motivo } }`, `validarCambiosPago(body) → { ok, datos: { id, cambios: { monto?, fecha?, medio?, nota? } } }`, `validarAnulacion(body) → { ok, datos: { id, motivo } }`.

- [ ] **Step 1: Escribir los tests**

`tests/validar-gerencia.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validarCambiosReserva, validarCancelacion, validarCambiosPago, validarAnulacion, MEDIOS } from '../lib/validar.js';

const ID = 'recAAAAAAAAAAAAAA';

describe('validarCambiosReserva', () => {
  it('normaliza solo las claves presentes', () => {
    expect(validarCambiosReserva({ id: ` ${ID} `, cambios: { huesped: ' Ana ', personas: '5', valorTotal: '600000', notas: ' tarde ' } }))
      .toEqual({ ok: true, datos: { id: ID, cambios: { huesped: 'Ana', personas: 5, valorTotal: 600000, notas: 'tarde' } } });
    expect(validarCambiosReserva({ id: ID, cambios: { entrada: '2026-10-18' } }).datos.cambios).toEqual({ entrada: '2026-10-18' });
  });
  it('permite fechas pasadas (una reserva en curso se puede corregir)', () => {
    expect(validarCambiosReserva({ id: ID, cambios: { entrada: '2020-01-01' } }).ok).toBe(true);
  });
  it.each([
    [{ id: '123', cambios: { personas: 2 } }, 'La reserva indicada no es válida.'],
    [{ id: ID }, 'No hay cambios.'],
    [{ id: ID, cambios: {} }, 'No hay cambios.'],
    [{ id: ID, cambios: [] }, 'No hay cambios.'],
    [{ id: ID, cambios: { estado: 'Confirmado' } }, 'Campo desconocido: estado.'],
    [{ id: ID, cambios: { huesped: '  ' } }, 'El nombre del huésped es requerido.'],
    [{ id: ID, cambios: { telefono: '' } }, 'El teléfono es requerido.'],
    [{ id: ID, cambios: { entrada: '18/10/2026' } }, 'La fecha de llegada no es válida.'],
    [{ id: ID, cambios: { salida: 'x' } }, 'La fecha de salida no es válida.'],
    [{ id: ID, cambios: { habitaciones: [] } }, 'Selecciona al menos una habitación.'],
    [{ id: ID, cambios: { habitaciones: ['La Suite'] } }, 'Hay una habitación que no existe.'],
    [{ id: ID, cambios: { habitaciones: ['FULL HOUSE', 'La Elsa'] } }, 'Full House no se combina con habitaciones sueltas.'],
    [{ id: ID, cambios: { personas: 0 } }, 'El número de personas debe estar entre 1 y 60.'],
    [{ id: ID, cambios: { valorTotal: 1.5 } }, 'El valor total acordado es requerido.'],
  ])('rechaza %o', (body, mensaje) => {
    expect(validarCambiosReserva(body)).toEqual({ ok: false, error: mensaje });
  });
});

describe('validarCancelacion', () => {
  it('exige id y motivo', () => {
    expect(validarCancelacion({ id: ID, cancelar: { motivo: ' no viajó ' } })).toEqual({ ok: true, datos: { id: ID, motivo: 'no viajó' } });
    expect(validarCancelacion({ id: ID, cancelar: {} })).toEqual({ ok: false, error: 'Indica el motivo de la cancelación.' });
    expect(validarCancelacion({ id: 'nope', cancelar: { motivo: 'x' } })).toEqual({ ok: false, error: 'La reserva indicada no es válida.' });
  });
});

describe('validarCambiosPago', () => {
  it('caso feliz y rechazos', () => {
    expect(validarCambiosPago({ id: ID, cambios: { monto: '200000', fecha: '2026-10-12', medio: 'Nequi', nota: ' ok ' } }))
      .toEqual({ ok: true, datos: { id: ID, cambios: { monto: 200000, fecha: '2026-10-12', medio: 'Nequi', nota: 'ok' } } });
    expect(validarCambiosPago({ id: ID, cambios: { monto: 0 } })).toEqual({ ok: false, error: 'El monto del abono debe ser un número entero mayor que cero.' });
    expect(validarCambiosPago({ id: ID, cambios: { medio: 'PayPal' } })).toEqual({ ok: false, error: `El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.` });
    expect(validarCambiosPago({ id: ID, cambios: { fecha: 'ayer' } })).toEqual({ ok: false, error: 'La fecha del abono no es válida.' });
    expect(validarCambiosPago({ id: ID, cambios: { nota: 'x'.repeat(501) } })).toEqual({ ok: false, error: 'La nota no puede superar 500 caracteres.' });
    expect(validarCambiosPago({ id: ID, cambios: { reserva: 'x' } })).toEqual({ ok: false, error: 'Campo desconocido: reserva.' });
    expect(validarCambiosPago({ id: ID, cambios: {} })).toEqual({ ok: false, error: 'No hay cambios.' });
    expect(validarCambiosPago({ id: 'x', cambios: { monto: 1 } })).toEqual({ ok: false, error: 'El abono indicado no es válido.' });
  });
});

describe('validarAnulacion', () => {
  it('exige id y motivo', () => {
    expect(validarAnulacion({ id: ID, anular: { motivo: 'duplicado' } })).toEqual({ ok: true, datos: { id: ID, motivo: 'duplicado' } });
    expect(validarAnulacion({ id: ID, anular: { motivo: '' } })).toEqual({ ok: false, error: 'Indica el motivo de la anulación.' });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/validar-gerencia.test.js` → FAIL (`validarCambiosReserva` no existe).

- [ ] **Step 3: Implementar** — agregar al final de `lib/validar.js`:

```js
// ── Operaciones de gerencia ──────────────────────────────────────────────────

function idValido(id) {
  return typeof id === 'string' && RE_RECORD.test(id.trim()) ? id.trim() : null;
}

function objetoDeCambios(cambios) {
  return cambios && typeof cambios === 'object' && !Array.isArray(cambios) && Object.keys(cambios).length > 0 ? cambios : null;
}

const CLAVES_RESERVA = ['huesped', 'telefono', 'entrada', 'salida', 'habitaciones', 'personas', 'valorTotal', 'notas'];

// Valida cada campo presente con las mismas reglas que al crear. No compara
// fechas entre sí ni con hoy: la API lo hace sobre la reserva ya fusionada.
export function validarCambiosReserva(body) {
  const id = idValido(body?.id);
  if (!id) return error('La reserva indicada no es válida.');
  const cambios = objetoDeCambios(body.cambios);
  if (!cambios) return error('No hay cambios.');
  const desconocida = Object.keys(cambios).find((k) => !CLAVES_RESERVA.includes(k));
  if (desconocida) return error(`Campo desconocido: ${desconocida}.`);
  const datos = {};
  if ('huesped' in cambios) {
    datos.huesped = texto(cambios.huesped, 120);
    if (!datos.huesped) return error('El nombre del huésped es requerido.');
  }
  if ('telefono' in cambios) {
    datos.telefono = texto(cambios.telefono, 40);
    if (!datos.telefono) return error('El teléfono es requerido.');
  }
  if ('entrada' in cambios) {
    if (!esFechaISO(cambios.entrada)) return error('La fecha de llegada no es válida.');
    datos.entrada = cambios.entrada;
  }
  if ('salida' in cambios) {
    if (!esFechaISO(cambios.salida)) return error('La fecha de salida no es válida.');
    datos.salida = cambios.salida;
  }
  if ('habitaciones' in cambios) {
    const habitaciones = Array.isArray(cambios.habitaciones) ? [...new Set(cambios.habitaciones)] : [];
    if (habitaciones.length === 0) return error('Selecciona al menos una habitación.');
    if (habitaciones.some((h) => !OPCIONES_HABITACION.includes(h))) return error('Hay una habitación que no existe.');
    if (habitaciones.includes(FULL_HOUSE) && habitaciones.length > 1) return error('Full House no se combina con habitaciones sueltas.');
    datos.habitaciones = habitaciones;
  }
  if ('personas' in cambios) {
    const personas = aEntero(cambios.personas);
    if (!(personas >= 1 && personas <= 60)) return error('El número de personas debe estar entre 1 y 60.');
    datos.personas = personas;
  }
  if ('valorTotal' in cambios) {
    const valorTotal = aEntero(cambios.valorTotal);
    if (!(valorTotal > 0)) return error('El valor total acordado es requerido.');
    datos.valorTotal = valorTotal;
  }
  if ('notas' in cambios) datos.notas = texto(cambios.notas, 1000);
  return { ok: true, datos: { id, cambios: datos } };
}

export function validarCancelacion(body) {
  const id = idValido(body?.id);
  if (!id) return error('La reserva indicada no es válida.');
  const motivo = texto(body.cancelar?.motivo, 300);
  if (!motivo) return error('Indica el motivo de la cancelación.');
  return { ok: true, datos: { id, motivo } };
}

const CLAVES_PAGO = ['monto', 'fecha', 'medio', 'nota'];

export function validarCambiosPago(body) {
  const id = idValido(body?.id);
  if (!id) return error('El abono indicado no es válido.');
  const cambios = objetoDeCambios(body.cambios);
  if (!cambios) return error('No hay cambios.');
  const desconocida = Object.keys(cambios).find((k) => !CLAVES_PAGO.includes(k));
  if (desconocida) return error(`Campo desconocido: ${desconocida}.`);
  const datos = {};
  if ('monto' in cambios) {
    const monto = aEntero(cambios.monto);
    if (!(monto > 0)) return error('El monto del abono debe ser un número entero mayor que cero.');
    datos.monto = monto;
  }
  if ('fecha' in cambios) {
    if (!esFechaISO(cambios.fecha)) return error('La fecha del abono no es válida.');
    datos.fecha = cambios.fecha;
  }
  if ('medio' in cambios) {
    if (!MEDIOS.includes(cambios.medio)) return error(`El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.`);
    datos.medio = cambios.medio;
  }
  if ('nota' in cambios) {
    if (typeof cambios.nota === 'string' && cambios.nota.trim().length > 500) return error('La nota no puede superar 500 caracteres.');
    datos.nota = texto(cambios.nota, 500);
  }
  return { ok: true, datos: { id, cambios: datos } };
}

export function validarAnulacion(body) {
  const id = idValido(body?.id);
  if (!id) return error('El abono indicado no es válido.');
  const motivo = texto(body.anular?.motivo, 300);
  if (!motivo) return error('Indica el motivo de la anulación.');
  return { ok: true, datos: { id, motivo } };
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/validar-gerencia.test.js tests/validar.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validar.js tests/validar-gerencia.test.js
git commit -m "Validación de cambios, cancelación, corrección y anulación

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `lib/reservas.js` y cliente falso — canceladas fuera de disponibilidad, `anulado`, `historial`, campos de cambios

**Files:**
- Modify: `lib/reservas.js`
- Modify: `lib/airtable-falso.js` (función `filtrar`)
- Modify: `tests/reservas.test.js` (expectativa de `formulaRango` + tests nuevos)
- Modify: `tests/airtable-falso.test.js` (test nuevo)

**Interfaces:**
- Produces: `ESTADOS.cancelada = 'Cancelada'`; `formulaRango(desde, hasta, { incluirCanceladas = false } = {})` (sin la opción agrega `, {Estado} != 'Cancelada'` dentro del `AND`); `aPagoApi` devuelve además `anulado: boolean` (`Monto` 0 y `Nota` empieza por `ANULADO`); `aReservaApi` devuelve además `historial: string`; `listarReservasEnRango(cliente, tablas, desde, hasta, opciones = {})` y `cargarReservasConPagos(cliente, tablas, desde, hasta, opciones = {})` pasan `opciones` a `formulaRango`; `camposCambiosReserva(cambios)` y `camposCambiosPago(cambios)` → objetos con nombres de campo Airtable solo para las claves presentes. El falso excluye `Estado = 'Cancelada'` cuando la fórmula contiene la cláusula.

- [ ] **Step 1: Ajustar y ampliar los tests**

En `tests/reservas.test.js`, reemplazar el primer `it` de `describe('fórmulas')` por estos dos:
```js
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
```
Agregar a la importación de `../lib/reservas.js`: `camposCambiosReserva, camposCambiosPago`. Agregar dentro de `describe('mapeo')`:
```js
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
```
Agregar a `describe('cargarReservasConPagos')`:
```js
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
```
En `tests/airtable-falso.test.js`, agregar dentro de `describe('cliente falso')`:
```js
  it("excluye Estado = 'Cancelada' cuando la fórmula lo pide", async () => {
    const cliente = crearClienteFalso();
    const viva = await cliente.crear('Reservas', { 'Huésped': 'V', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Rosaura'], 'Estado': 'Confirmado' });
    const cancelada = await cliente.crear('Reservas', { 'Huésped': 'C', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19', 'Habitaciones': ['La Elsa'], 'Estado': 'Cancelada' });
    const sin = await cliente.listar('Reservas', { filterByFormula: `${RANGO('2026-10-01', '2026-11-01').slice(0, -1)}, {Estado} != 'Cancelada')` });
    expect(sin.map((r) => r.id)).toEqual([viva.id]);
    const con = await cliente.listar('Reservas', { filterByFormula: RANGO('2026-10-01', '2026-11-01') });
    expect(con.map((r) => r.id).sort()).toEqual([viva.id, cancelada.id].sort());
  });
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/reservas.test.js tests/airtable-falso.test.js` → FAIL (la fórmula no tiene la cláusula; `camposCambiosReserva` no existe; el falso no filtra).

- [ ] **Step 3: Implementar en `lib/reservas.js`**

Reemplazar `export const ESTADOS = { confirmado: 'Confirmado', pendiente: 'Anticipo pendiente' };` por:
```js
export const ESTADOS = { confirmado: 'Confirmado', pendiente: 'Anticipo pendiente', cancelada: 'Cancelada' };
```
Reemplazar la función `formulaRango` por:
```js
export function formulaRango(desde, hasta, { incluirCanceladas = false } = {}) {
  if (!esFechaISO(desde) || !esFechaISO(hasta)) throw new Error('formulaRango requiere fechas ISO.');
  const canceladas = incluirCanceladas ? '' : `, {Estado} != '${ESTADOS.cancelada}'`;
  return `AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('${hasta}', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('${desde}', 'YYYY-MM-DD'))${canceladas})`;
}
```
Reemplazar el cuerpo de `aPagoApi` por:
```js
export function aPagoApi(reg) {
  const f = reg.fields ?? {};
  const monto = Number(f['Monto']) || 0;
  const nota = f['Nota'] ?? '';
  return { id: reg.id, fecha: f['Fecha'] ?? null, monto, medio: nombreOpcion(f['Medio']), nota, anulado: monto === 0 && nota.startsWith('ANULADO') };
}
```
En `aReservaApi`, después de la línea `notas: f['Notas'] ?? '',` agregar:
```js
    historial: f['Historial'] ?? '',
```
Reemplazar `listarReservasEnRango` y la primera línea de `cargarReservasConPagos` por:
```js
export function listarReservasEnRango(cliente, tablas, desde, hasta, opciones = {}) {
  return cliente.listar(tablas.reservas, {
    filterByFormula: formulaRango(desde, hasta, opciones),
    sort: [{ field: 'Fecha entrada', direction: 'asc' }],
  });
}

export async function cargarReservasConPagos(cliente, tablas, desde, hasta, opciones = {}) {
  const regs = await listarReservasEnRango(cliente, tablas, desde, hasta, opciones);
```
(el resto de `cargarReservasConPagos` queda igual). Agregar al final del archivo:
```js
const CAMPOS_RESERVA = {
  huesped: 'Huésped', telefono: 'Teléfono', entrada: 'Fecha entrada', salida: 'Fecha salida',
  habitaciones: 'Habitaciones', personas: 'Personas', valorTotal: 'Valor total', notas: 'Notas',
};
const CAMPOS_PAGO = { monto: 'Monto', fecha: 'Fecha', medio: 'Medio', nota: 'Nota' };

function mapear(cambios, mapa) {
  const campos = {};
  for (const [clave, valor] of Object.entries(cambios)) if (mapa[clave]) campos[mapa[clave]] = valor;
  return campos;
}

export function camposCambiosReserva(cambios) {
  return mapear(cambios, CAMPOS_RESERVA);
}

export function camposCambiosPago(cambios) {
  return mapear(cambios, CAMPOS_PAGO);
}
```

- [ ] **Step 4: Implementar en `lib/airtable-falso.js`** — en `filtrar`, reemplazar el bloque `if (rango) { … }` por:

```js
  if (rango) {
    const [, hasta, desde] = rango;
    const sinCanceladas = formula.includes("{Estado} != 'Cancelada'");
    return registros.filter((r) => seSolapan(
      { entrada: r.fields['Fecha entrada'], salida: r.fields['Fecha salida'] },
      { entrada: desde, salida: hasta },
    ) && !(sinCanceladas && r.fields['Estado'] === 'Cancelada'));
  }
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run tests/reservas.test.js tests/airtable-falso.test.js` → PASS. `npm test` → todo PASS (los tests de API existentes no cambian: el falso sigue devolviendo lo mismo para reservas no canceladas).

- [ ] **Step 6: Commit**

```bash
git add lib/reservas.js lib/airtable-falso.js tests/reservas.test.js tests/airtable-falso.test.js
git commit -m "Canceladas fuera de disponibilidad, abonos anulados e historial en el mapeo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: `api/reservas.js` — `PATCH` (editar / cancelar) y `GET ?incluirCanceladas=1`

**Files:**
- Modify: `api/reservas.js` (se reemplaza el archivo completo)
- Create: `tests/api-reservas-gerencia.test.js`

**Interfaces:**
- Consumes: T1 `exigirPinGerencia`, T2 (`lineaHistorial`, `anteponer`, `cambiosReales`, `describirCambios`), T3 (`validarCambiosReserva`, `validarCancelacion`), T4 (`camposCambiosReserva`, `ESTADOS.cancelada`, opciones de rango), `cargarPagosPorIds`, `buscarConflicto`.
- Produces: contrato §7.1 y §7.3 del spec. `crearHandler(deps = { cliente?, env?, dormir?, ahora?: () => Date })`.

- [ ] **Step 1: Escribir los tests**

`tests/api-reservas-gerencia.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/reservas.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes } from './ayudas.js';

const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321' };
const AHORA = new Date('2026-10-13T19:05:00Z'); // 14:05 Bogotá
const hoy = hoyBogota();
const d = (n) => sumarDias(hoy, n);
let cliente; let ids; let handler;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  handler = crearHandler({ cliente, env: ENV, dormir: vi.fn(async () => {}), ahora: () => AHORA });
});

const req = (extra = {}, gerencia = '654321') => {
  const r = crearReq(extra);
  if (gerencia) r.headers['x-pin-gerencia'] = gerencia;
  return r;
};
const llamar = async (r) => { const res = crearRes(); await handler(r, res); return res; };
const patch = (body, gerencia) => llamar(req({ method: 'PATCH', body }, gerencia));

describe('PATCH /api/reservas — permisos y forma', () => {
  it('401 sin PIN de gerencia y nada cambia', async () => {
    const res = await patch({ id: ids.a, cambios: { personas: 5 } }, null);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'PIN de gerencia incorrecto.' });
    expect((await cliente.obtener('Reservas', ids.a)).fields['Personas']).toBe(11);
  });
  it('400 si vienen cambios y cancelar a la vez', async () => {
    const res = await patch({ id: ids.a, cambios: { personas: 5 }, cancelar: { motivo: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Indica cambios o cancelar, no ambos.');
    expect((await cliente.obtener('Reservas', ids.a)).fields['Estado']).toBe('Confirmado');
  });
  it('400 sin cambios; 404 si la reserva no existe', async () => {
    expect((await patch({ id: ids.a, cambios: {} })).body.error).toBe('No hay cambios.');
    const res = await patch({ id: 'recNoExiste000000', cambios: { personas: 2 } });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/reservas — editar', () => {
  it('200: cambia campos, escribe historial y devuelve la reserva completa', async () => {
    const res = await patch({ id: ids.a, cambios: { personas: 5, notas: 'llegan tarde', huesped: 'Ana Pérez' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva).toMatchObject({ id: ids.a, personas: 5, notas: 'llegan tarde', pagado: 530000 });
    expect(res.body.reserva.historial).toBe('2026-10-13 14:05 · gerencia · editó Personas: 11 → 5; Notas: Llegan tarde → llegan tarde');
    const reg = await cliente.obtener('Reservas', ids.a);
    expect(reg.fields).toMatchObject({ 'Personas': 5, 'Notas': 'llegan tarde', 'Huésped': 'Ana Pérez' });
  });
  it('400 si ningún valor cambia de verdad', async () => {
    expect((await patch({ id: ids.a, cambios: { personas: 11 } })).body.error).toBe('No hay cambios.');
  });
  it('400 si al cambiar solo la salida queda igual o antes de la entrada', async () => {
    const res = await patch({ id: ids.a, cambios: { salida: d(5) } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('La fecha de salida debe ser posterior a la llegada.');
  });
  it('mover fechas sobre sí misma no es conflicto', async () => {
    const res = await patch({ id: ids.a, cambios: { entrada: d(6), salida: d(8) } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva).toMatchObject({ entrada: d(6), salida: d(8) });
  });
  it('409 si las fechas nuevas chocan con otra reserva', async () => {
    const res = await patch({ id: ids.c, cambios: { entrada: d(12), salida: d(14) } });
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicto).toMatchObject({ huesped: 'Familia Gómez' });
    expect((await cliente.obtener('Reservas', ids.c)).fields['Fecha entrada']).toBe(d(-2));
  });
  it('el historial se antepone (lo reciente arriba)', async () => {
    await patch({ id: ids.a, cambios: { personas: 5 } });
    const res = await patch({ id: ids.a, cambios: { personas: 6 } });
    expect(res.body.reserva.historial.split('\n')).toEqual([
      '2026-10-13 14:05 · gerencia · editó Personas: 5 → 6',
      '2026-10-13 14:05 · gerencia · editó Personas: 11 → 5',
    ]);
  });
});

describe('PATCH /api/reservas — cancelar', () => {
  it('200: Estado Cancelada con historial; luego no se puede editar ni cancelar otra vez', async () => {
    const res = await patch({ id: ids.b, cancelar: { motivo: 'el cliente no viajó' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.reserva).toMatchObject({ estado: 'Cancelada', historial: '2026-10-13 14:05 · gerencia · canceló · motivo: el cliente no viajó' });
    expect((await patch({ id: ids.b, cancelar: { motivo: 'otra vez' } })).body).toEqual({ ok: false, error: 'La reserva ya está cancelada.' });
    expect((await patch({ id: ids.b, cambios: { personas: 3 } })).body).toEqual({ ok: false, error: 'La reserva está cancelada.' });
  });
  it('400 sin motivo', async () => {
    expect((await patch({ id: ids.b, cancelar: { motivo: ' ' } })).body.error).toBe('Indica el motivo de la cancelación.');
  });
});

describe('GET /api/reservas y canceladas', () => {
  it('una cancelada deja de aparecer y de bloquear; con incluirCanceladas=1 y PIN de gerencia vuelve a verse', async () => {
    await patch({ id: ids.b, cancelar: { motivo: 'no viajó' } });
    const sin = await llamar(req({ query: { desde: hoy, hasta: d(31) } }, null));
    expect(sin.body.reservas.map((r) => r.id)).toEqual([ids.c, ids.a]);
    const con = await llamar(req({ query: { desde: hoy, hasta: d(31), incluirCanceladas: '1' } }));
    expect(con.statusCode).toBe(200);
    expect(con.body.reservas.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]);
    expect(con.body.reservas[2].estado).toBe('Cancelada');
    const nueva = await llamar(req({ method: 'POST', body: { huesped: 'Z', telefono: '1', entrada: d(12), salida: d(14), habitaciones: ['La Elsa'], personas: 2, valorTotal: 100000 } }, null));
    expect(nueva.statusCode).toBe(201);
  });
  it('incluirCanceladas=1 con PIN de gerencia malo → 401 sin datos', async () => {
    const res = await llamar(req({ query: { desde: hoy, hasta: d(31), incluirCanceladas: '1' } }, '000000'));
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'PIN de gerencia incorrecto.' });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/api-reservas-gerencia.test.js` → FAIL (PATCH devuelve 405).

- [ ] **Step 3: Reemplazar `api/reservas.js` completo por:**

```js
import { clienteDesdeEnv } from '../lib/airtable.js';
import {
  tablasDesdeEnv, cargarReservasConPagos, listarReservasEnRango, aReservaApi, cargarPagosPorIds,
  camposReservaNueva, camposPagoNuevo, camposCambiosReserva, ESTADOS,
} from '../lib/reservas.js';
import { validarRango, validarReservaNueva, validarCambiosReserva, validarCancelacion } from '../lib/validar.js';
import { responder, exigirPin, exigirPinGerencia, manejarError, sinCache } from '../lib/http.js';
import { lineaHistorial, anteponer, cambiosReales, describirCambios } from '../lib/historial.js';
import { buscarConflicto } from '../public/js/disponibilidad.js';
import { hoyBogota } from '../public/js/fechas.js';

const METODOS = ['GET', 'POST', 'PATCH'];

function responderConflicto(res, conflicto) {
  return responder(res, 409, {
    ok: false,
    error: `${conflicto.habitaciones.join(', ')} ya está reservada del ${conflicto.entrada} al ${conflicto.salida} (${conflicto.huesped}). Verifica las fechas.`,
    conflicto: { huesped: conflicto.huesped, habitaciones: conflicto.habitaciones, entrada: conflicto.entrada, salida: conflicto.salida },
  });
}

async function reservaCompleta(cliente, tablas, id) {
  const reg = await cliente.obtener(tablas.reservas, id);
  const pagos = await cargarPagosPorIds(cliente, tablas.pagos, reg.fields['Pagos'] ?? []);
  return aReservaApi(reg, pagos);
}

export function crearHandler(deps = {}) {
  const ahora = () => (deps.ahora ? deps.ahora() : new Date());

  async function crear(cliente, tablas, req, res) {
    const hoy = hoyBogota(ahora());
    const v = validarReservaNueva(req.body ?? {}, hoy);
    if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
    const datos = v.datos;

    // Validación definitiva de disponibilidad (la del celular es solo previa).
    const existentes = (await listarReservasEnRango(cliente, tablas, datos.entrada, datos.salida)).map((r) => aReservaApi(r));
    const conflicto = buscarConflicto({ entrada: datos.entrada, salida: datos.salida, habitaciones: datos.habitaciones }, existentes);
    if (conflicto) return responderConflicto(res, conflicto);

    const creada = await cliente.crear(tablas.reservas, camposReservaNueva(datos));
    let estado = datos.abono ? ESTADOS.confirmado : ESTADOS.pendiente;
    let abonoRegistrado = false;
    let advertencia;
    if (datos.abono) {
      try {
        await cliente.crear(tablas.pagos, camposPagoNuevo({ reservaId: creada.id, huesped: datos.huesped, esPrimero: true, ...datos.abono }));
        abonoRegistrado = true;
      } catch (e) {
        // La reserva ya existe: no fallar en silencio ni dejarla como confirmada sin pago.
        console.error('[reservas] abono no registrado', e.message);
        advertencia = 'Reserva guardada, pero el abono no quedó registrado. Regístralo desde el calendario.';
        estado = ESTADOS.pendiente;
        try { await cliente.actualizar(tablas.reservas, creada.id, { 'Estado': estado }); } catch { /* mejor esfuerzo */ }
      }
    }
    return responder(res, 201, { ok: true, id: creada.id, estado, abonoRegistrado, ...(advertencia ? { advertencia } : {}) });
  }

  async function editar(cliente, tablas, body, res) {
    const v = validarCambiosReserva(body);
    if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
    const actual = aReservaApi(await cliente.obtener(tablas.reservas, v.datos.id));
    if (actual.estado === ESTADOS.cancelada) return responder(res, 409, { ok: false, error: 'La reserva está cancelada.' });
    const antes = {
      huesped: actual.huesped, telefono: actual.telefono, entrada: actual.entrada, salida: actual.salida,
      habitaciones: actual.habitaciones, personas: actual.personas, valorTotal: actual.valorTotal, notas: actual.notas,
    };
    const reales = cambiosReales(antes, v.datos.cambios);
    if (Object.keys(reales).length === 0) return responder(res, 400, { ok: false, error: 'No hay cambios.' });
    const fusion = { ...antes, ...reales };
    if (fusion.salida <= fusion.entrada) return responder(res, 400, { ok: false, error: 'La fecha de salida debe ser posterior a la llegada.' });
    if ('entrada' in reales || 'salida' in reales || 'habitaciones' in reales) {
      const existentes = (await listarReservasEnRango(cliente, tablas, fusion.entrada, fusion.salida)).map((r) => aReservaApi(r));
      const conflicto = buscarConflicto({ id: actual.id, entrada: fusion.entrada, salida: fusion.salida, habitaciones: fusion.habitaciones }, existentes);
      if (conflicto) return responderConflicto(res, conflicto);
    }
    const linea = lineaHistorial(`editó ${describirCambios(antes, reales)}`, ahora());
    await cliente.actualizar(tablas.reservas, actual.id, { ...camposCambiosReserva(reales), 'Historial': anteponer(actual.historial, linea) });
    return responder(res, 200, { ok: true, reserva: await reservaCompleta(cliente, tablas, actual.id) });
  }

  async function cancelar(cliente, tablas, body, res) {
    const v = validarCancelacion(body);
    if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
    const actual = aReservaApi(await cliente.obtener(tablas.reservas, v.datos.id));
    if (actual.estado === ESTADOS.cancelada) return responder(res, 409, { ok: false, error: 'La reserva ya está cancelada.' });
    const linea = lineaHistorial(`canceló · motivo: ${v.datos.motivo}`, ahora());
    await cliente.actualizar(tablas.reservas, actual.id, { 'Estado': ESTADOS.cancelada, 'Historial': anteponer(actual.historial, linea) });
    return responder(res, 200, { ok: true, reserva: await reservaCompleta(cliente, tablas, actual.id) });
  }

  return async function handler(req, res) {
    sinCache(res);
    if (!METODOS.includes(req.method)) return responder(res, 405, { ok: false, error: 'Método no permitido.' });
    if (!(await exigirPin(req, res, deps))) return undefined;
    try {
      const cliente = deps.cliente ?? clienteDesdeEnv(deps.env);
      const tablas = tablasDesdeEnv(deps.env);

      if (req.method === 'GET') {
        const incluirCanceladas = String(req.query?.incluirCanceladas ?? '') === '1';
        if (incluirCanceladas && !(await exigirPinGerencia(req, res, deps))) return undefined;
        const v = validarRango(req.query ?? {});
        if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
        const reservas = await cargarReservasConPagos(cliente, tablas, v.datos.desde, v.datos.hasta, { incluirCanceladas });
        return responder(res, 200, { ok: true, ...v.datos, reservas });
      }

      if (req.method === 'PATCH') {
        if (!(await exigirPinGerencia(req, res, deps))) return undefined;
        const body = req.body ?? {};
        if (body.cambios && body.cancelar) return responder(res, 400, { ok: false, error: 'Indica cambios o cancelar, no ambos.' });
        return await (body.cancelar ? cancelar(cliente, tablas, body, res) : editar(cliente, tablas, body, res));
      }

      return await crear(cliente, tablas, req, res);
    } catch (e) {
      return manejarError(res, e);
    }
  };
}

export default crearHandler();
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/api-reservas-gerencia.test.js tests/api-reservas.test.js` → PASS (los 12 tests antiguos siguen igual). `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add api/reservas.js tests/api-reservas-gerencia.test.js
git commit -m "PATCH /api/reservas: editar y cancelar con PIN de gerencia e historial

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `api/pagos.js` — `PATCH` (corregir / anular) y bloqueo en reservas canceladas

**Files:**
- Modify: `api/pagos.js` (se reemplaza el archivo completo)
- Create: `tests/api-pagos-gerencia.test.js`

**Interfaces:**
- Consumes: T1, T2, T3 (`validarCambiosPago`, `validarAnulacion`), T4 (`camposCambiosPago`, `aPagoApi().anulado`), `AirtableError`.
- Produces: contrato §7.2 del spec; `POST` responde `409 "La reserva está cancelada."` si la reserva está cancelada.

- [ ] **Step 1: Escribir los tests**

`tests/api-pagos-gerencia.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/pagos.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes } from './ayudas.js';

const ENV = { PIN_SENORAS: '123456', PIN_GERENCIA: '654321' };
const AHORA = new Date('2026-10-13T19:05:00Z');
const hoy = hoyBogota();
let cliente; let ids; let handler; let pagoA; let pagosC;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  pagoA = (await cliente.obtener('Reservas', ids.a)).fields['Pagos'][0];
  pagosC = (await cliente.obtener('Reservas', ids.c)).fields['Pagos'];
  handler = crearHandler({ cliente, env: ENV, dormir: vi.fn(async () => {}), ahora: () => AHORA });
});

const req = (extra = {}, gerencia = '654321') => {
  const r = crearReq(extra);
  if (gerencia) r.headers['x-pin-gerencia'] = gerencia;
  return r;
};
const llamar = async (r) => { const res = crearRes(); await handler(r, res); return res; };
const patch = (body, gerencia) => llamar(req({ method: 'PATCH', body }, gerencia));
const historialDe = async (id) => (await cliente.obtener('Reservas', id)).fields['Historial'];

describe('PATCH /api/pagos — permisos y forma', () => {
  it('401 sin PIN de gerencia', async () => {
    const res = await patch({ id: pagoA, cambios: { monto: 1 } }, null);
    expect(res.statusCode).toBe(401);
    expect((await cliente.obtener('Pagos', pagoA)).fields['Monto']).toBe(530000);
  });
  it('400 ambos; 400 sin cambios; 404 abono inexistente', async () => {
    expect((await patch({ id: pagoA, cambios: { monto: 1 }, anular: { motivo: 'x' } })).body.error).toBe('Indica cambios o anular, no ambos.');
    expect((await patch({ id: pagoA, cambios: { monto: 530000 } })).body.error).toBe('No hay cambios.');
    const res = await patch({ id: 'recNoExiste000000', cambios: { monto: 1 } });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('El abono no existe.');
  });
});

describe('PATCH /api/pagos — corregir', () => {
  it('200: cambia el abono, recalcula el resumen y escribe historial en la reserva', async () => {
    const res = await patch({ id: pagoA, cambios: { monto: 500000, medio: 'Efectivo' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.pago).toMatchObject({ id: pagoA, monto: 500000, medio: 'Efectivo', anulado: false });
    expect(res.body.resumen).toEqual({ valorTotal: 1060000, pagado: 500000, saldo: 560000, estadoPago: 'parcial', estado: 'Confirmado' });
    expect(await historialDe(ids.a)).toBe(`2026-10-13 14:05 · gerencia · corrigió abono del ${hoy}: Monto: $ 530.000 → $ 500.000; Medio: Nequi → Efectivo`);
  });
});

describe('PATCH /api/pagos — anular', () => {
  it('200: Monto 0, nota ANULADO, resumen sin anticipo y Estado intacto', async () => {
    const res = await patch({ id: pagoA, anular: { motivo: 'duplicado' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.pago).toMatchObject({ monto: 0, anulado: true, nota: 'ANULADO · antes $ 530.000 · duplicado' });
    expect(res.body.resumen).toEqual({ valorTotal: 1060000, pagado: 0, saldo: 1060000, estadoPago: 'sin_anticipo', estado: 'Confirmado' });
    expect(await historialDe(ids.a)).toBe(`2026-10-13 14:05 · gerencia · anuló abono del ${hoy} ($ 530.000 Nequi) · motivo: duplicado`);
  });
  it('conserva la nota anterior detrás de " | "', async () => {
    const conNota = pagosC[1]; // 'Pago al llegar'
    const res = await patch({ id: conNota, anular: { motivo: 'error de digitación' } });
    expect(res.body.pago.nota).toBe('ANULADO · antes $ 315.000 · error de digitación | Pago al llegar');
  });
  it('409 al anular dos veces o corregir un anulado', async () => {
    await patch({ id: pagoA, anular: { motivo: 'x' } });
    expect((await patch({ id: pagoA, anular: { motivo: 'y' } })).body).toEqual({ ok: false, error: 'El abono ya está anulado.' });
    expect((await patch({ id: pagoA, cambios: { monto: 5 } })).body).toEqual({ ok: false, error: 'El abono está anulado.' });
  });
  it('400 sin motivo', async () => {
    expect((await patch({ id: pagoA, anular: {} })).body.error).toBe('Indica el motivo de la anulación.');
  });
});

describe('POST /api/pagos en reserva cancelada', () => {
  it('409 y no crea el pago', async () => {
    await cliente.actualizar('Reservas', ids.b, { 'Estado': 'Cancelada' });
    const res = await llamar(req({ method: 'POST', body: { reservaId: ids.b, monto: 1000, medio: 'Nequi' } }, null));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ ok: false, error: 'La reserva está cancelada.' });
    expect((await cliente.obtener('Reservas', ids.b)).fields['Pagos'] ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/api-pagos-gerencia.test.js` → FAIL (PATCH devuelve 405; POST en cancelada devuelve 201).

- [ ] **Step 3: Reemplazar `api/pagos.js` completo por:**

```js
import { clienteDesdeEnv, AirtableError } from '../lib/airtable.js';
import {
  tablasDesdeEnv, aReservaApi, aPagoApi, camposPagoNuevo, camposCambiosPago, cargarPagosPorIds, ESTADOS,
} from '../lib/reservas.js';
import { validarPagoNuevo, validarCambiosPago, validarAnulacion } from '../lib/validar.js';
import { responder, exigirPin, exigirPinGerencia, manejarError, sinCache } from '../lib/http.js';
import { lineaHistorial, anteponer, cambiosReales, describirCambios } from '../lib/historial.js';
import { formatearCOP } from '../public/js/dinero.js';
import { hoyBogota } from '../public/js/fechas.js';

export function crearHandler(deps = {}) {
  const ahora = () => (deps.ahora ? deps.ahora() : new Date());

  async function resumenDe(cliente, tablas, reservaId) {
    const reg = await cliente.obtener(tablas.reservas, reservaId);
    const r = aReservaApi(reg, await cargarPagosPorIds(cliente, tablas.pagos, reg.fields['Pagos'] ?? []));
    return { valorTotal: r.valorTotal, pagado: r.pagado, saldo: r.saldo, estadoPago: r.estadoPago, estado: r.estado };
  }

  async function obtenerPago(cliente, tablas, id, res) {
    try {
      return await cliente.obtener(tablas.pagos, id);
    } catch (e) {
      if (e instanceof AirtableError && e.status === 404) { responder(res, 404, { ok: false, error: 'El abono no existe.' }); return null; }
      throw e;
    }
  }

  async function anotarEnReserva(cliente, tablas, reservaId, texto) {
    const reg = await cliente.obtener(tablas.reservas, reservaId);
    await cliente.actualizar(tablas.reservas, reservaId, { 'Historial': anteponer(reg.fields['Historial'] ?? '', lineaHistorial(texto, ahora())) });
  }

  async function registrar(cliente, tablas, req, res) {
    const hoy = hoyBogota(ahora());
    const v = validarPagoNuevo(req.body ?? {}, hoy);
    if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
    const { reservaId, monto, medio, fecha, nota } = v.datos;

    const reg = await cliente.obtener(tablas.reservas, reservaId); // 404 → manejarError
    const reserva = aReservaApi(reg);
    if (reserva.estado === ESTADOS.cancelada) return responder(res, 409, { ok: false, error: 'La reserva está cancelada.' });
    const idsPrevios = reg.fields['Pagos'] ?? [];

    const pagoReg = await cliente.crear(tablas.pagos, camposPagoNuevo({
      reservaId, huesped: reserva.huesped, esPrimero: idsPrevios.length === 0, monto, medio, fecha, nota,
    }));

    let { estado } = reserva;
    if (estado !== ESTADOS.confirmado) {
      await cliente.actualizar(tablas.reservas, reservaId, { 'Estado': ESTADOS.confirmado });
      estado = ESTADOS.confirmado;
    }

    const resumen = await resumenDe(cliente, tablas, reservaId);
    return responder(res, 201, { ok: true, pago: aPagoApi(pagoReg), resumen: { ...resumen, estado } });
  }

  async function corregir(cliente, tablas, body, res) {
    const v = validarCambiosPago(body);
    if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
    const regPago = await obtenerPago(cliente, tablas, v.datos.id, res);
    if (!regPago) return undefined;
    const pago = aPagoApi(regPago);
    if (pago.anulado) return responder(res, 409, { ok: false, error: 'El abono está anulado.' });
    const antes = { monto: pago.monto, fecha: pago.fecha, medio: pago.medio, nota: pago.nota };
    const reales = cambiosReales(antes, v.datos.cambios);
    if (Object.keys(reales).length === 0) return responder(res, 400, { ok: false, error: 'No hay cambios.' });
    const reservaId = regPago.fields['Reserva']?.[0];
    if (!reservaId) return responder(res, 409, { ok: false, error: 'El abono no tiene reserva vinculada.' });
    const actualizado = await cliente.actualizar(tablas.pagos, pago.id, camposCambiosPago(reales));
    await anotarEnReserva(cliente, tablas, reservaId, `corrigió abono del ${pago.fecha ?? '—'}: ${describirCambios(antes, reales)}`);
    return responder(res, 200, { ok: true, pago: aPagoApi(actualizado), resumen: await resumenDe(cliente, tablas, reservaId) });
  }

  async function anular(cliente, tablas, body, res) {
    const v = validarAnulacion(body);
    if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
    const regPago = await obtenerPago(cliente, tablas, v.datos.id, res);
    if (!regPago) return undefined;
    const pago = aPagoApi(regPago);
    if (pago.anulado) return responder(res, 409, { ok: false, error: 'El abono ya está anulado.' });
    const reservaId = regPago.fields['Reserva']?.[0];
    if (!reservaId) return responder(res, 409, { ok: false, error: 'El abono no tiene reserva vinculada.' });
    const nota = `ANULADO · antes ${formatearCOP(pago.monto)} · ${v.datos.motivo}${pago.nota ? ` | ${pago.nota}` : ''}`;
    const actualizado = await cliente.actualizar(tablas.pagos, pago.id, { 'Monto': 0, 'Nota': nota });
    const detalle = [formatearCOP(pago.monto), pago.medio].filter(Boolean).join(' ');
    await anotarEnReserva(cliente, tablas, reservaId, `anuló abono del ${pago.fecha ?? '—'} (${detalle}) · motivo: ${v.datos.motivo}`);
    return responder(res, 200, { ok: true, pago: aPagoApi(actualizado), resumen: await resumenDe(cliente, tablas, reservaId) });
  }

  return async function handler(req, res) {
    sinCache(res);
    if (req.method !== 'POST' && req.method !== 'PATCH') return responder(res, 405, { ok: false, error: 'Método no permitido.' });
    if (!(await exigirPin(req, res, deps))) return undefined;
    try {
      const cliente = deps.cliente ?? clienteDesdeEnv(deps.env);
      const tablas = tablasDesdeEnv(deps.env);
      if (req.method === 'PATCH') {
        if (!(await exigirPinGerencia(req, res, deps))) return undefined;
        const body = req.body ?? {};
        if (body.cambios && body.anular) return responder(res, 400, { ok: false, error: 'Indica cambios o anular, no ambos.' });
        return body.anular ? await anular(cliente, tablas, body, res) : await corregir(cliente, tablas, body, res);
      }
      return await registrar(cliente, tablas, req, res);
    } catch (e) {
      return manejarError(res, e);
    }
  };
}

export default crearHandler();
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/api-pagos-gerencia.test.js tests/api-pagos.test.js` → PASS (los 8 tests antiguos siguen igual). `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add api/pagos.js tests/api-pagos-gerencia.test.js
git commit -m "PATCH /api/pagos: corregir y anular abonos con PIN de gerencia; sin abonos en canceladas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: `public/js/app.js` — PIN de gerencia en el navegador

**Files:**
- Modify: `public/js/app.js`
- Modify: `tests/app.test.js` (tests nuevos)

**Interfaces:**
- Produces: `CLAVE_PIN_GERENCIA = 'va_pin_gerencia'`, `obtenerPinGerencia()`, `guardarPinGerencia(pin)`, `borrarPinGerencia()`, `encabezados({ gerencia = false } = {})` (puro: `Content-Type`, `X-Pin` y, si `gerencia`, `X-Pin-Gerencia`), `esErrorDeGerencia(mensaje)` (puro: `/gerencia/i`), y `api(ruta, { method, body, gerencia })` que manda `X-Pin-Gerencia` cuando `gerencia: true` y, ante `401`, borra **solo** el PIN que falló (el de gerencia si el mensaje habla de gerencia; si no, el de las señoras).

- [ ] **Step 1: Agregar tests** al final de `tests/app.test.js` (y ampliar la importación con `encabezados, esErrorDeGerencia, CLAVE_PIN_GERENCIA`):

```js
describe('app.js (gerencia)', () => {
  it('encabezados: X-Pin siempre; X-Pin-Gerencia solo con gerencia', () => {
    expect(Object.keys(encabezados())).toEqual(['Content-Type', 'X-Pin']);
    expect(Object.keys(encabezados({ gerencia: true }))).toEqual(['Content-Type', 'X-Pin', 'X-Pin-Gerencia']);
  });
  it('distingue el 401 de gerencia del de las señoras', () => {
    expect(esErrorDeGerencia('PIN de gerencia incorrecto.')).toBe(true);
    expect(esErrorDeGerencia('PIN incorrecto.')).toBe(false);
    expect(esErrorDeGerencia(undefined)).toBe(false);
    expect(CLAVE_PIN_GERENCIA).toBe('va_pin_gerencia');
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/app.test.js` → FAIL (`encabezados` no se exporta).

- [ ] **Step 3: Implementar.** En `public/js/app.js`, después de `pinValido`, agregar:

```js
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
```
Y reemplazar la función `api` completa por:
```js
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
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/app.test.js` → PASS. `node --check public/js/app.js` → OK.

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js tests/app.test.js
git commit -m "Cliente del navegador: PIN de gerencia y cabecera X-Pin-Gerencia

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `public/calendario.html` — bloque Gerencia, correcciones de abonos, historial y canceladas

**Files:**
- Modify: `public/calendario.html` (estilos, dos bloques de HTML y el `<script type="module">` completo)

**Interfaces:**
- Consumes: T7 (`obtenerPinGerencia`, `guardarPinGerencia`, `pinValido`, `api(…, { gerencia: true })`, `esErrorDeGerencia`), `OPCIONES_HABITACION`, `FULL_HOUSE`, `PATCH /api/reservas`, `PATCH /api/pagos`, `GET /api/reservas?incluirCanceladas=1`.
- Produces: §8 del spec. Ids nuevos: `aviso`, `canceladas`, `lista-canceladas`, `btn-gerencia`, `gerencia`, `g-editar`, `g-form-editar`, `g-huesped`, `g-telefono`, `g-entrada`, `g-salida`, `g-personas`, `g-valor`, `g-notas`, `g-error`, `g-guardar`, `g-cancelar`, `g-form-cancelar`, `g-motivo`, `g-cancel-error`, `g-confirmar-cancelar`, `pin-g-entrada`, `pin-g-error`, `pin-g-boton`, y por pago `pago-form-<id>`.

- [ ] **Step 1: Estilos.** En el `<style>` de `public/calendario.html`, insertar **antes** de la línea `    /* El calendario aprovecha el ancho en pantallas grandes (el formulario conserva 560 px) */`:

```css
    .gerencia { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--borde); }
    .gerencia .boton + .boton, .gerencia form + .boton { margin-top: 10px; }
    .boton--rojo { background: var(--rojo); }
    .pagos li.anulado > span, .pagos li.anulado > strong { text-decoration: line-through; color: var(--gris-claro); }
    .pago-acciones { grid-column: 1 / -1; display: flex; gap: 8px; margin-top: 4px; }
    .pago-acciones .boton--chico { padding: 6px 10px; min-height: 34px; font-size: 11px; }
    .pago-form { grid-column: 1 / -1; }
    .historial { margin: 12px 0; font-size: 12px; }
    .historial summary { cursor: pointer; color: var(--gris); }
    .historial pre { white-space: pre-wrap; font-family: inherit; font-size: 11px; color: var(--gris); background: var(--fondo); border-radius: 8px; padding: 8px 10px; margin-top: 6px; }
    #canceladas { margin-top: 18px; }
    #canceladas summary { cursor: pointer; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--gris); margin-bottom: 10px; }
    .cancelada { opacity: .85; }
```

- [ ] **Step 2: HTML.** Reemplazar
```html
    <button type="button" id="mes-sig" aria-label="Mes siguiente">›</button>
  </div>
  <div class="kpis" id="kpis"></div>
```
por
```html
    <button type="button" id="mes-sig" aria-label="Mes siguiente">›</button>
  </div>
  <div class="aviso oculto" id="aviso" role="status"></div>
  <div class="kpis" id="kpis"></div>
```
y reemplazar `  <div class="lista" id="lista"></div>` por
```html
  <div class="lista" id="lista"></div>
  <details id="canceladas" class="oculto"><summary>Canceladas del mes</summary><div class="lista" id="lista-canceladas"></div></details>
```

- [ ] **Step 3: Script.** Reemplazar el bloque `<script type="module"> … </script>` completo por el siguiente (parte 1 de 2; la parte 2 continúa el mismo bloque sin cortes):

```html
<script type="module">
  import { api, asegurarPin, escapar, mostrarError, ocultarError, formatoCOPEnVivo, obtenerPinGerencia, guardarPinGerencia, pinValido, esErrorDeGerencia } from '/js/app.js';
  import { hoyBogota, rangoMes, mesDeISO, nombreMes, esFinDeSemana, diaSemana, fechaCorta, DIAS_CORTOS, sumarDias } from '/js/fechas.js';
  import { formatearCOP, parsearCOP } from '/js/dinero.js';
  import { HABITACIONES, FULL_HOUSE, OPCIONES_HABITACION } from '/js/disponibilidad.js';
  import { kpisMes } from '/js/pagos.js';
  import { barraEnMes, filasDe, colorEstado, ordenarProximas, telefonoWa, etiquetaPago, porcentajePago } from '/js/calendario-logica.js';

  const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Efectivo', 'Otro'];
  const $ = (id) => document.getElementById(id);
  let hoy = hoyBogota();
  let { anio, mes } = mesDeISO(hoy);
  let reservas = [];
  let cargando = false;
  let gerenciaActiva = Boolean(obtenerPinGerencia());
  let hojaAbierta = null;

  function iniciar() {
    $('app').classList.remove('oculto');
    $('mes-ant').addEventListener('click', () => cambiarMes(-1));
    $('mes-sig').addEventListener('click', () => cambiarMes(1));
    $('actualizar').addEventListener('click', cargar);
    $('reintentar').addEventListener('click', cargar);
    $('canceladas').addEventListener('toggle', () => { if ($('canceladas').open) cargarCanceladas(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargar(); });
    actualizarBloqueCanceladas();
    cargar();
  }

  function cambiarMes(delta) {
    mes += delta;
    if (mes === 0) { mes = 12; anio -= 1; }
    if (mes === 13) { mes = 1; anio += 1; }
    cargar();
  }

  function pedirPin() {
    $('app').classList.add('oculto');
    cerrarHoja();
    asegurarPin({ raiz: $('pin'), alListo: () => { $('app').classList.remove('oculto'); cargar(); } });
  }

  function mostrarAviso(texto) {
    const el = $('aviso');
    el.textContent = texto;
    el.classList.remove('oculto');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function actualizarBloqueCanceladas() {
    $('canceladas').classList.toggle('oculto', !gerenciaActiva);
    if (!gerenciaActiva) $('canceladas').open = false;
  }

  // Si la API rechaza el PIN de gerencia, app.js ya lo borró: volvemos al modo normal.
  function manejarErrorGerencia(e, r) {
    if (e.status === 401 && esErrorDeGerencia(e.message)) {
      gerenciaActiva = false;
      actualizarBloqueCanceladas();
      if (r) abrirDetalle(r.id);
      mostrarAviso('El PIN de gerencia no fue aceptado. Vuelve a ingresarlo.');
      return true;
    }
    if (e.status === 401) { pedirPin(); return true; }
    return false;
  }

  async function cargar() {
    if (cargando) return;
    cargando = true;
    hoy = hoyBogota();
    const { desde, hasta } = rangoMes(anio, mes);
    $('titulo-mes').textContent = `${nombreMes(mes)} ${anio}`;
    $('aviso').classList.add('oculto');
    $('kpis').innerHTML = '<div class="tarjeta esqueleto"></div>'.repeat(3);
    $('grilla').innerHTML = '<div class="esqueleto" style="height:200px"></div>';
    $('lista').innerHTML = '';
    ocultarError($('falla'));
    try {
      ({ reservas } = await api(`/api/reservas?desde=${desde}&hasta=${hasta}`));
      dibujar();
      if ($('canceladas').open) cargarCanceladas();
    } catch (e) {
      if (e.status === 401) pedirPin();
      else { $('falla-texto').textContent = e.message; $('falla').classList.add('visible'); $('grilla').innerHTML = ''; $('kpis').innerHTML = ''; }
    } finally {
      cargando = false;
    }
  }

  async function cargarCanceladas() {
    const { desde, hasta } = rangoMes(anio, mes);
    const cont = $('lista-canceladas');
    cont.innerHTML = '<div class="tarjeta esqueleto"></div>';
    try {
      const { reservas: todas } = await api(`/api/reservas?desde=${desde}&hasta=${hasta}&incluirCanceladas=1`, { gerencia: true });
      const canceladas = todas.filter((r) => r.estado === 'Cancelada');
      cont.innerHTML = canceladas.length
        ? canceladas.map((r) => `<div class="tarjeta cancelada"><strong>${escapar(r.huesped)}</strong>
            <div class="reserva__sub">${fechaCorta(r.entrada)} → ${fechaCorta(r.salida)} · ${escapar(r.habitaciones.join(' · '))}</div>
            <div class="reserva__sub">${escapar((r.historial || '').split('\n')[0])}</div></div>`).join('')
        : '<div class="tarjeta vacio">Sin canceladas este mes.</div>';
    } catch (e) {
      if (!manejarErrorGerencia(e, null)) cont.innerHTML = `<div class="error visible">${escapar(e.message)}</div>`;
    }
  }

  function dibujar() {
    const { desde, hasta } = rangoMes(anio, mes);
    dibujarKpis(desde, hasta);
    dibujarGrilla(desde, hasta);
    dibujarLista();
  }

  const kpi = (titulo, valor, sub) => `<div class="tarjeta kpi"><span class="kpi__t">${titulo}</span><strong class="kpi__v">${valor}</strong><span class="kpi__s">${escapar(sub)}</span></div>`;

  function dibujarKpis(desde, hasta) {
    const k = kpisMes(reservas, desde, hasta);
    $('kpis').innerHTML = kpi('Ocupación', `${k.ocupacion}%`, `${k.nochesOcupadas} noches-hab.`)
      + kpi('Cobrado', formatearCOP(k.cobrado), 'pagos del mes')
      + kpi('Por cobrar', formatearCOP(k.porCobrar), k.sinValor ? `${k.sinValor} sin valor total` : 'saldos del mes');
  }

  function dibujarGrilla(desde, hasta) {
    const { dias } = rangoMes(anio, mes);
    const isoDia = (d) => `${desde.slice(0, 8)}${String(d).padStart(2, '0')}`;
    const claseDia = (iso) => `${esFinDeSemana(iso) ? 'finde' : ''} ${iso === hoy ? 'hoy' : ''}`;
    let html = '<table class="grilla"><thead><tr><th class="grilla__hab"></th>';
    for (let d = 1; d <= dias; d += 1) {
      html += `<th class="${claseDia(isoDia(d))}"><span>${DIAS_CORTOS[diaSemana(isoDia(d))]}</span>${d}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const hab of HABITACIONES) {
      html += `<tr><th class="grilla__hab">${escapar(hab)}</th>`;
      const barras = reservas
        .filter((r) => filasDe(r).includes(hab))
        .map((r) => ({ r, b: barraEnMes(r, desde, hasta) }))
        .filter((x) => x.b)
        .sort((x, y) => x.b.diaInicio - y.b.diaInicio);
      let d = 1;
      for (const { r, b } of barras) {
        if (b.diaInicio < d) continue; // datos viejos solapados: se dibuja la primera
        while (d < b.diaInicio) { html += `<td class="${claseDia(isoDia(d))}"></td>`; d += 1; }
        const siguiente = barras.find((x) => x.b.diaInicio > b.diaInicio)?.b.diaInicio ?? dias + 1;
        const span = Math.min(b.span, siguiente - b.diaInicio, dias + 1 - b.diaInicio);
        html += `<td colspan="${span}" class="celda-barra"><button type="button" class="barra barra--${colorEstado(r)}${b.cortadaIzq ? ' cortada-izq' : ''}${b.cortadaDer ? ' cortada-der' : ''}" data-id="${r.id}" title="${escapar(r.huesped)}">${escapar(r.huesped)}</button></td>`;
        d += span;
      }
      while (d <= dias) { html += `<td class="${claseDia(isoDia(d))}"></td>`; d += 1; }
      html += '</tr>';
    }
    html += '</tbody></table>';
    $('grilla').innerHTML = html;
    $('grilla').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => abrirDetalle(b.dataset.id)));
    const columnaHoy = $('grilla').querySelector('thead th.hoy');
    if (columnaHoy) $('grilla').scrollLeft = Math.max(0, columnaHoy.offsetLeft - 130);
  }

  function tarjeta(r) {
    return `<button type="button" class="tarjeta reserva" data-id="${r.id}">
      <div class="reserva__cab"><strong>${escapar(r.huesped)}</strong><span class="estado estado--${colorEstado(r)}">${escapar(r.estado)}</span></div>
      <div class="reserva__sub">${fechaCorta(r.entrada)} → ${fechaCorta(r.salida)} · ${r.noches} ${r.noches === 1 ? 'noche' : 'noches'} · ${r.personas} pers.</div>
      <div class="reserva__sub">${escapar(r.habitaciones.join(' · '))}</div>
      <div class="pago"><div class="pago__barra"><span style="width:${porcentajePago(r)}%"></span></div><span class="pago__txt pago--${r.estadoPago}">${escapar(etiquetaPago(r))}</span></div>
    </button>`;
  }

  function dibujarLista() {
    const orden = ordenarProximas(reservas, hoy);
    $('lista').innerHTML = orden.length ? orden.map(tarjeta).join('') : '<div class="tarjeta vacio">Mes libre — ninguna reserva.</div>';
    $('lista').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => abrirDetalle(b.dataset.id)));
  }

  function cerrarHoja() { $('hoja').innerHTML = ''; hojaAbierta = null; }

  // ── parte 2 del mismo script ──

  function listaPagos(r) {
    if (!r.pagos.length) return '<li class="vacio">Sin abonos registrados.</li>';
    return r.pagos.map((p) => `
      <li class="${p.anulado ? 'anulado' : ''}">
        <span>${fechaCorta(p.fecha)} · ${escapar(p.medio ?? '—')}</span><strong>${formatearCOP(p.monto)}</strong>
        ${p.nota ? `<em>${escapar(p.nota)}</em>` : ''}
        ${gerenciaActiva && !p.anulado ? `<div class="pago-acciones">
          <button type="button" class="boton boton--secundario boton--chico" data-corregir="${p.id}">Corregir</button>
          <button type="button" class="boton boton--rojo boton--chico" data-anular="${p.id}">Anular</button>
        </div><div class="pago-form" id="pago-form-${p.id}"></div>` : ''}
      </li>`).join('');
  }

  function chipsHabitaciones(seleccion) {
    return OPCIONES_HABITACION.map((h) => `<button type="button" class="chip${h === FULL_HOUSE ? ' chip--ancho' : ''}${seleccion.includes(h) ? ' activo' : ''}" data-g-hab="${h}">${h === FULL_HOUSE ? '🏠 Full House' : h}</button>`).join('');
  }

  function chipsMedios(dueno, actual) {
    return MEDIOS.map((m) => `<button type="button" class="chip chip--medio${m === actual ? ' activo' : ''}" data-medio-de="${dueno}" data-medio="${m}">${m}</button>`).join('');
  }

  function bloqueGerencia(r) {
    return `<div class="gerencia">
      <h3 class="seccion">Gerencia</h3>
      <button type="button" class="boton boton--secundario" id="g-editar">Editar reserva</button>
      <form id="g-form-editar" class="form-abono oculto">
        <div class="campo"><label for="g-huesped">Nombre del huésped</label><input class="entrada" id="g-huesped" value="${escapar(r.huesped)}"></div>
        <div class="campo"><label for="g-telefono">WhatsApp / Teléfono</label><input class="entrada" id="g-telefono" value="${escapar(r.telefono)}"></div>
        <div class="fila-2">
          <div class="campo"><label for="g-entrada">Llegada</label><input class="entrada" type="date" id="g-entrada" value="${r.entrada ?? ''}"></div>
          <div class="campo"><label for="g-salida">Salida</label><input class="entrada" type="date" id="g-salida" value="${r.salida ?? ''}"></div>
        </div>
        <div class="campo"><span class="etiqueta">Habitación(es)</span><div class="chips">${chipsHabitaciones(r.habitaciones)}</div></div>
        <div class="fila-2">
          <div class="campo"><label for="g-personas">Personas</label><input class="entrada" type="number" id="g-personas" min="1" max="60" inputmode="numeric" value="${r.personas || ''}"></div>
          <div class="campo"><label for="g-valor">Valor total</label><input class="entrada" id="g-valor" inputmode="numeric" placeholder="$ 0" value="${r.valorTotal == null ? '' : formatearCOP(r.valorTotal)}"></div>
        </div>
        <div class="campo"><label for="g-notas">Notas</label><textarea class="entrada" id="g-notas" rows="2">${escapar(r.notas)}</textarea></div>
        <div class="error" id="g-error" role="alert"></div>
        <button type="submit" class="boton" id="g-guardar">Guardar cambios</button>
      </form>
      <button type="button" class="boton boton--secundario" id="g-cancelar">Cancelar reserva</button>
      <form id="g-form-cancelar" class="form-abono oculto">
        <div class="campo"><label for="g-motivo">Motivo</label><input class="entrada" id="g-motivo" placeholder="Ej.: el cliente no viajó"></div>
        <div class="error" id="g-cancel-error" role="alert"></div>
        <button type="submit" class="boton boton--rojo" id="g-confirmar-cancelar">Confirmar cancelación</button>
      </form>
      <details class="historial"><summary>Historial</summary><pre>${escapar(r.historial || 'Sin cambios registrados.')}</pre></details>
    </div>`;
  }

  function formularioPinGerencia() {
    return `<div class="gerencia">
      <p class="reserva__sub">Esta sección es solo para gerencia.</p>
      <div class="campo"><label for="pin-g-entrada">PIN de gerencia</label><input class="entrada" id="pin-g-entrada" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"></div>
      <div class="error" id="pin-g-error" role="alert"></div>
      <button type="button" class="boton" id="pin-g-boton">Entrar</button>
    </div>`;
  }

  function abrirDetalle(id) {
    const r = reservas.find((x) => x.id === id);
    if (!r) return;
    hojaAbierta = id;
    const wa = telefonoWa(r.telefono);
    const saldoSugerido = r.saldo > 0 ? formatearCOP(r.saldo) : '';
    $('hoja').innerHTML = `
      <div class="hoja-fondo" id="hoja-fondo">
        <div class="hoja" role="dialog" aria-modal="true" aria-label="Detalle de la reserva">
          <div class="hoja__asa"></div>
          <div class="detalle__cab">
            <div>
              <h2>${escapar(r.huesped)}</h2>
              <p>${fechaCorta(r.entrada)} → ${fechaCorta(r.salida)} · ${r.noches} ${r.noches === 1 ? 'noche' : 'noches'} · ${r.personas} pers.</p>
              <p>${escapar(r.habitaciones.join(' · '))}</p>
            </div>
            <span class="estado estado--${colorEstado(r)}">${escapar(r.estado)}</span>
          </div>
          ${wa ? `<a class="boton boton--secundario boton--chico" href="${wa}" target="_blank" rel="noopener">WhatsApp · ${escapar(r.telefono)}</a>` : `<span class="reserva__sub">${escapar(r.telefono)}</span>`}
          ${r.notas ? `<p class="detalle__notas">${escapar(r.notas)}</p>` : ''}
          <div class="totales">
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
          </form>
          <button type="button" class="boton boton--secundario" id="btn-gerencia">${gerenciaActiva ? 'Gerencia ▾' : 'Gerencia'}</button>
          <div id="gerencia" class="${gerenciaActiva ? '' : 'oculto'}">${gerenciaActiva ? bloqueGerencia(r) : ''}</div>
          <button type="button" class="boton boton--secundario" id="cerrar">Cerrar</button>
        </div>
      </div>`;
    $('hoja-fondo').addEventListener('click', (ev) => { if (ev.target === $('hoja-fondo')) cerrarHoja(); });
    $('cerrar').addEventListener('click', cerrarHoja);
    $('abrir-abono').addEventListener('click', () => { $('form-abono').classList.remove('oculto'); $('abrir-abono').classList.add('oculto'); $('abono-monto').focus(); });
    formatoCOPEnVivo($('abono-monto'));
    conectarChipsMedio('nuevo');
    $('form-abono').addEventListener('submit', (ev) => { ev.preventDefault(); registrarAbono(r); });
    $('btn-gerencia').addEventListener('click', () => alternarGerencia(r));
    if (gerenciaActiva) conectarGerencia(r);
  }

  function conectarChipsMedio(dueno) {
    const chips = document.querySelectorAll(`[data-medio-de="${dueno}"]`);
    chips.forEach((b) => b.addEventListener('click', () => chips.forEach((x) => x.classList.toggle('activo', x === b))));
  }
  const medioElegido = (dueno) => document.querySelector(`[data-medio-de="${dueno}"].activo`)?.dataset.medio;

  function alternarGerencia(r) {
    const cont = $('gerencia');
    if (gerenciaActiva) { cont.classList.toggle('oculto'); return; }
    cont.innerHTML = formularioPinGerencia();
    cont.classList.remove('oculto');
    const entrada = $('pin-g-entrada');
    async function intentar() {
      const pin = entrada.value.trim();
      if (!pinValido(pin)) { mostrarError($('pin-g-error'), 'El PIN tiene entre 4 y 6 dígitos.'); return; }
      $('pin-g-boton').disabled = true;
      guardarPinGerencia(pin);
      try {
        await api(`/api/reservas?desde=${hoy}&hasta=${sumarDias(hoy, 1)}&incluirCanceladas=1`, { gerencia: true });
        gerenciaActiva = true;
        actualizarBloqueCanceladas();
        abrirDetalle(r.id);
      } catch (e) {
        $('pin-g-boton').disabled = false;
        mostrarError($('pin-g-error'), e.status === 401 ? 'PIN de gerencia incorrecto.' : e.message);
      }
    }
    $('pin-g-boton').addEventListener('click', intentar);
    entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') intentar(); });
    entrada.focus();
  }

  function conectarGerencia(r) {
    $('g-editar').addEventListener('click', () => $('g-form-editar').classList.toggle('oculto'));
    $('g-cancelar').addEventListener('click', () => $('g-form-cancelar').classList.toggle('oculto'));
    formatoCOPEnVivo($('g-valor'));
    document.querySelectorAll('[data-g-hab]').forEach((b) => b.addEventListener('click', () => alternarChipHabitacion(b)));
    $('g-form-editar').addEventListener('submit', (ev) => { ev.preventDefault(); guardarEdicion(r); });
    $('g-form-cancelar').addEventListener('submit', (ev) => { ev.preventDefault(); cancelarReserva(r); });
    document.querySelectorAll('[data-corregir]').forEach((b) => b.addEventListener('click', () => mostrarFormCorregir(r, b.dataset.corregir)));
    document.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', () => mostrarFormAnular(r, b.dataset.anular)));
  }

  function alternarChipHabitacion(boton) {
    const todos = [...document.querySelectorAll('[data-g-hab]')];
    if (boton.dataset.gHab === FULL_HOUSE) {
      const activo = boton.classList.toggle('activo');
      todos.forEach((b) => { if (b !== boton) b.classList.remove('activo'); });
      return activo;
    }
    todos.find((b) => b.dataset.gHab === FULL_HOUSE).classList.remove('activo');
    return boton.classList.toggle('activo');
  }
  const habitacionesElegidas = () => [...document.querySelectorAll('[data-g-hab].activo')].map((b) => b.dataset.gHab);

  // Tras una operación de gerencia se recarga el mes completo (historial y resumen frescos) y se reabre la hoja.
  async function recargarYAbrir(id) {
    await cargar();
    if (reservas.some((x) => x.id === id)) abrirDetalle(id);
  }

  async function guardarEdicion(r) {
    const error = $('g-error');
    ocultarError(error);
    const cambios = {
      huesped: $('g-huesped').value.trim(), telefono: $('g-telefono').value.trim(),
      entrada: $('g-entrada').value, salida: $('g-salida').value, habitaciones: habitacionesElegidas(),
      personas: Number($('g-personas').value) || 0, notas: $('g-notas').value.trim(),
    };
    const valor = parsearCOP($('g-valor').value);
    if (valor > 0) cambios.valorTotal = valor;
    const boton = $('g-guardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      await api('/api/reservas', { method: 'PATCH', body: { id: r.id, cambios }, gerencia: true });
      await recargarYAbrir(r.id);
      mostrarAviso('Reserva actualizada.');
    } catch (e) {
      if (!manejarErrorGerencia(e, r)) { mostrarError(error, e.message); boton.disabled = false; boton.textContent = 'Guardar cambios'; }
    }
  }

  async function cancelarReserva(r) {
    const error = $('g-cancel-error');
    ocultarError(error);
    const motivo = $('g-motivo').value.trim();
    if (!motivo) { mostrarError(error, 'Indica el motivo de la cancelación.'); return; }
    if (!confirm(`¿Cancelar la reserva de ${r.huesped}? Saldrá del calendario (queda guardada en Airtable con su historial).`)) return;
    const boton = $('g-confirmar-cancelar');
    boton.disabled = true;
    try {
      await api('/api/reservas', { method: 'PATCH', body: { id: r.id, cancelar: { motivo } }, gerencia: true });
      cerrarHoja();
      await cargar();
      mostrarAviso(`Reserva de ${r.huesped} cancelada.`);
    } catch (e) {
      if (!manejarErrorGerencia(e, r)) { mostrarError(error, e.message); boton.disabled = false; }
    }
  }

  function mostrarFormCorregir(r, pagoId) {
    const p = r.pagos.find((x) => x.id === pagoId);
    if (!p) return;
    $(`pago-form-${pagoId}`).innerHTML = `<form class="form-abono" id="form-corregir-${pagoId}">
      <div class="fila-2">
        <div class="campo"><label for="c-monto-${pagoId}">Monto</label><input class="entrada" id="c-monto-${pagoId}" inputmode="numeric" value="${formatearCOP(p.monto)}"></div>
        <div class="campo"><label for="c-fecha-${pagoId}">Fecha</label><input class="entrada" type="date" id="c-fecha-${pagoId}" value="${p.fecha ?? hoy}"></div>
      </div>
      <div class="campo"><span class="etiqueta">Medio</span><div class="chips chips--medios">${chipsMedios(pagoId, p.medio)}</div></div>
      <div class="campo"><label for="c-nota-${pagoId}">Nota</label><input class="entrada" id="c-nota-${pagoId}" value="${escapar(p.nota)}"></div>
      <div class="error" id="c-error-${pagoId}" role="alert"></div>
      <button type="submit" class="boton boton--chico">Guardar corrección</button>
    </form>`;
    formatoCOPEnVivo($(`c-monto-${pagoId}`));
    conectarChipsMedio(pagoId);
    $(`form-corregir-${pagoId}`).addEventListener('submit', (ev) => { ev.preventDefault(); corregirPago(r, p); });
  }

  async function corregirPago(r, p) {
    const error = $(`c-error-${p.id}`);
    ocultarError(error);
    const cambios = {
      monto: parsearCOP($(`c-monto-${p.id}`).value), fecha: $(`c-fecha-${p.id}`).value || p.fecha,
      medio: medioElegido(p.id), nota: $(`c-nota-${p.id}`).value.trim(),
    };
    if (cambios.monto <= 0) { mostrarError(error, 'Escribe el monto del abono.'); return; }
    if (!cambios.medio) { mostrarError(error, 'Elige el medio de pago.'); return; }
    try {
      await api('/api/pagos', { method: 'PATCH', body: { id: p.id, cambios }, gerencia: true });
      await recargarYAbrir(r.id);
      mostrarAviso('Abono corregido.');
    } catch (e) {
      if (!manejarErrorGerencia(e, r)) mostrarError(error, e.message);
    }
  }

  function mostrarFormAnular(r, pagoId) {
    const p = r.pagos.find((x) => x.id === pagoId);
    if (!p) return;
    $(`pago-form-${pagoId}`).innerHTML = `<form class="form-abono" id="form-anular-${pagoId}">
      <div class="campo"><label for="a-motivo-${pagoId}">Motivo de la anulación</label><input class="entrada" id="a-motivo-${pagoId}" placeholder="Ej.: se registró dos veces"></div>
      <div class="error" id="a-error-${pagoId}" role="alert"></div>
      <button type="submit" class="boton boton--rojo boton--chico">Confirmar anulación</button>
    </form>`;
    $(`form-anular-${pagoId}`).addEventListener('submit', (ev) => { ev.preventDefault(); anularPago(r, p); });
    $(`a-motivo-${pagoId}`).focus();
  }

  async function anularPago(r, p) {
    const error = $(`a-error-${p.id}`);
    ocultarError(error);
    const motivo = $(`a-motivo-${p.id}`).value.trim();
    if (!motivo) { mostrarError(error, 'Indica el motivo de la anulación.'); return; }
    if (!confirm(`¿Anular el abono de ${formatearCOP(p.monto)}? Quedará en $ 0 con el motivo.`)) return;
    try {
      await api('/api/pagos', { method: 'PATCH', body: { id: p.id, anular: { motivo } }, gerencia: true });
      await recargarYAbrir(r.id);
      mostrarAviso('Abono anulado.');
    } catch (e) {
      if (!manejarErrorGerencia(e, r)) mostrarError(error, e.message);
    }
  }

  async function registrarAbono(r) {
    const error = $('abono-error');
    ocultarError(error);
    const monto = parsearCOP($('abono-monto').value);
    const medio = medioElegido('nuevo');
    const fecha = $('abono-fecha').value || hoy;
    const nota = $('abono-nota').value.trim();
    if (monto <= 0) { mostrarError(error, 'Escribe el monto del abono.'); return; }
    if (!medio) { mostrarError(error, 'Elige el medio de pago.'); return; }
    if (r.saldo != null && monto > r.saldo
      && !confirm(`El abono (${formatearCOP(monto)}) supera el saldo (${formatearCOP(r.saldo)}). ¿Registrar así?`)) return;
    const boton = $('guardar-abono');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const respuesta = await api('/api/pagos', { method: 'POST', body: { reservaId: r.id, monto, medio, fecha, nota } });
      r.pagos.push(respuesta.pago);
      Object.assign(r, respuesta.resumen);
      dibujar();
      abrirDetalle(r.id);
    } catch (e) {
      if (e.status === 401) { pedirPin(); return; }
      mostrarError(error, e.message);
      boton.disabled = false;
      boton.textContent = 'Guardar abono';
    }
  }

  asegurarPin({ raiz: $('pin'), alListo: iniciar });
</script>
```

- [ ] **Step 4: PIN de gerencia en el servidor local.** En `scripts/dev.mjs`, dentro del bloque `if (usarFalso) {`, después de `process.env.PIN_SENORAS ||= '123456';` agregar:
```js
  process.env.PIN_GERENCIA ||= '654321';
```
y en el `console.log` final cambiar `· Airtable FALSO (PIN 123456)` por `· Airtable FALSO (PIN 123456 · gerencia 654321)`.

- [ ] **Step 5: Verificar** (sintaxis + flujo con curl; la revisión visual la hace gerencia en T9):

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
sed -n '/<script type="module">/,/<\/script>/p' public/calendario.html | sed '1d;$d' > /tmp/cal.mjs && node --check /tmp/cal.mjs && echo "sintaxis OK"
for id in aviso canceladas lista-canceladas; do grep -q "id=\"$id\"" public/calendario.html || echo "FALTA id=$id"; done
PORT=3110 node scripts/dev.mjs --falso > /tmp/dev.log 2>&1 & PID=$!
curl -s --retry 10 --retry-delay 1 --retry-connrefused -o /dev/null http://localhost:3110/
curl -s -o /dev/null -w "calendario %{http_code}\n" http://localhost:3110/calendario
ID=$(curl -s -H "X-Pin: 123456" "http://localhost:3110/api/reservas?desde=$(date +%F)&hasta=$(date -v+31d +%F)" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(d.reservas.find(r=>r.huesped==="Ana Pérez").id)')
curl -s -o /dev/null -w "PATCH sin gerencia → %{http_code}\n" -X PATCH -H "X-Pin: 123456" -H "Content-Type: application/json" -d "{\"id\":\"$ID\",\"cambios\":{\"personas\":5}}" http://localhost:3110/api/reservas
curl -s -w "\nPATCH con gerencia → %{http_code}\n" -X PATCH -H "X-Pin: 123456" -H "X-Pin-Gerencia: 654321" -H "Content-Type: application/json" -d "{\"id\":\"$ID\",\"cambios\":{\"personas\":5}}" http://localhost:3110/api/reservas | head -c 300; echo
curl -s -w "\ncancelar → %{http_code}\n" -X PATCH -H "X-Pin: 123456" -H "X-Pin-Gerencia: 654321" -H "Content-Type: application/json" -d "{\"id\":\"$ID\",\"cancelar\":{\"motivo\":\"prueba\"}}" http://localhost:3110/api/reservas | head -c 200; echo
curl -s -H "X-Pin: 123456" "http://localhost:3110/api/reservas?desde=$(date +%F)&hasta=$(date -v+31d +%F)" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log("sin canceladas:", d.reservas.map(r=>r.huesped).join(", "))'
curl -s -H "X-Pin: 123456" -H "X-Pin-Gerencia: 654321" "http://localhost:3110/api/reservas?desde=$(date +%F)&hasta=$(date -v+31d +%F)&incluirCanceladas=1" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log("con canceladas:", d.reservas.map(r=>`${r.huesped} [${r.estado}]`).join(", "))'
kill $PID
```
Expected: sintaxis OK; calendario 200; `PATCH sin gerencia → 401`; `PATCH con gerencia → 200` con `"personas":5` y `historial` con `editó Personas: 11 → 5`; `cancelar → 200`; "sin canceladas" no incluye a Ana Pérez; "con canceladas" la incluye con `[Cancelada]`.

- [ ] **Step 6: Commit**

```bash
git add public/calendario.html scripts/dev.mjs
git commit -m "Mini-PMS: bloque Gerencia para editar, cancelar, corregir y anular, con historial y canceladas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: `PIN_GERENCIA`, despliegue, prueba de gerencia, documentación y merge

**Files:**
- Modify: `README.md`, `docs/` (copias del spec y de este plan), `/Users/marketinghotelero/Villa aura/CLAUDE.md`, `/Users/marketinghotelero/Villa aura/MEMORY.md`
- Create (ignorado): línea `PIN_GERENCIA` en `.env.local`

**Interfaces:**
- Produces: producción con los `PATCH` activos y protegidos; documentación al día; `master` = GitHub.

- [ ] **Step 1: PIN de gerencia (gerencia lo elige y lo pasa por chat; 6 dígitos, distinto del de las señoras).** Cargarlo en Vercel y en local sin pegarlo en archivos del repo:

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
PIN_G='<PIN de gerencia>'
for e in production preview development; do printf '%s' "$PIN_G" | npx -y vercel@latest env add PIN_GERENCIA "$e"; done
printf 'PIN_GERENCIA="%s"\n' "$PIN_G" >> .env.local
git checkout -- .gitignore 2>/dev/null   # el CLI de Vercel vuelve a tocarlo
npx -y vercel@latest env ls | grep -c PIN_GERENCIA   # 3
```
Anotar el PIN de gerencia en `MEMORY.md` del proyecto (fuera del repo), igual que el de las señoras.

- [ ] **Step 2: Desplegar y humo en producción**

```bash
npm test                                      # todo verde
npx -y vercel@latest deploy --prod --yes
URL=https://villa-aura-reservas.vercel.app
curl -s "$URL/api/salud"                                                                                   # ok
curl -s -o /dev/null -w "PATCH sin gerencia %{http_code}\n" -X PATCH -H "X-Pin: <PIN señoras>" -H "Content-Type: application/json" -d '{"id":"recAAAAAAAAAAAAAA","cambios":{"personas":2}}' "$URL/api/reservas"   # 401
curl -s -o /dev/null -w "canceladas sin gerencia %{http_code}\n" -H "X-Pin: <PIN señoras>" "$URL/api/reservas?desde=2026-10-01&hasta=2026-11-01&incluirCanceladas=1"   # 401
curl -s -o /dev/null -w "PATCH id inexistente con gerencia %{http_code}\n" -X PATCH -H "X-Pin: <PIN señoras>" -H "X-Pin-Gerencia: $PIN_G" -H "Content-Type: application/json" -d '{"id":"recAAAAAAAAAAAAAA","cambios":{"personas":2}}' "$URL/api/reservas"   # 404
```

- [ ] **Step 3: Prueba de gerencia en el celular** (`$URL/calendario`):
1. Abrir una reserva (si no hay de prueba, crear `PRUEBA borrar` desde el formulario con un abono). Tocar **Gerencia** → PIN de gerencia → aparecen *Editar reserva*, *Cancelar reserva*, *Corregir/Anular* en el abono e *Historial*.
2. *Editar reserva*: cambiar personas y notas → "Reserva actualizada" y el historial muestra `editó Personas: …`.
3. *Editar reserva*: mover las fechas encima de otra reserva → mensaje de conflicto; nada cambia.
4. *Corregir* el abono (otro monto) → saldo recalculado; *Anular* otro abono (o el mismo tras registrar uno nuevo) → queda tachado con `ANULADO · antes …`.
5. *Cancelar reserva* con motivo → desaparece del calendario; abrir **Canceladas del mes** al final → aparece con su motivo. En Airtable, `Estado` muestra la opción nueva `Cancelada` y `Historial` tiene las líneas.
6. En otro celular (o borrando el PIN de gerencia del navegador): la hoja muestra el botón **Gerencia** pero pide PIN; con el PIN de las señoras no entra.
7. Borrar la reserva de prueba en Airtable (gerencia) si la creó.

- [ ] **Step 4: README.** Reemplazar en `README.md` la viñeta `- **Corregir o cancelar una reserva:** directamente en Airtable con la cuenta de gerencia. La API no borra ni edita reservas: solo crea reservas, crea pagos y pasa el \`Estado\` a \`Confirmado\` al registrar el primer abono.` por:

```markdown
- **Corregir o cancelar una reserva, corregir o anular un abono:** desde `/calendario` → detalle de la reserva → botón **Gerencia** (pide `PIN_GERENCIA`, se guarda en ese celular). Cancelar deja `Estado = Cancelada` (sale del calendario y de la disponibilidad; el registro queda); anular deja el abono en `$ 0` con la nota `ANULADO · antes $X · motivo`. Todo cambio se anota en el campo `Historial` de la reserva. La API **nunca borra**: ni reservas ni pagos. Restaurar una cancelada = cambiar `Estado` en Airtable.
- **Cambiar el PIN de gerencia:** editar `PIN_GERENCIA` en Vercel (3 entornos) → `npx vercel deploy --prod`.
```
En la tabla de variables agregar la fila `| \`PIN_GERENCIA\` | PIN de 6 dígitos de gerencia: habilita editar/cancelar reservas y corregir/anular abonos. |`. En "Seguridad" agregar: `- Las operaciones de gerencia exigen las dos cabeceras (\`X-Pin\` y \`X-Pin-Gerencia\`); con el PIN de las señoras solamente responden 401.`

- [ ] **Step 5: Copiar documentación al repo y barrido**

```bash
cp "/Users/marketinghotelero/Villa aura/docs/superpowers/specs/2026-10-13-villa-aura-edicion-reservas-design.md" docs/
cp "/Users/marketinghotelero/Villa aura/docs/superpowers/plans/2026-10-13-villa-aura-edicion-reservas.md" docs/
grep -n -E "pat[A-Za-z0-9]{14}\.|app[A-Za-z0-9]{14}|tbl[A-Za-z0-9]{14}" docs/*.md README.md || echo "limpio"
git add README.md docs/
git commit -m "Documentación: gerencia edita, cancela y corrige abonos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: `CLAUDE.md` y `MEMORY.md` del proyecto.** En `CLAUDE.md`, sección "Mini-PMS (`/calendario`)", reemplazar la viñeta `- La API no borra ni edita reservas: corregir o cancelar se hace en Airtable con la cuenta de gerencia.` por `- **Gerencia** (PIN propio, \`PIN_GERENCIA\`): desde el detalle puede editar la reserva, cancelarla (\`Estado = Cancelada\`, sale del calendario, no se borra), corregir o anular abonos (quedan en $ 0 con nota ANULADO) y ver el historial de cambios y las canceladas del mes. La API nunca borra.`; en "Arquitectura técnica" agregar `PIN_GERENCIA` a la lista de variables y `Historial` a los campos de `Reservas`; en "Archivos clave" agregar el spec y el plan del 2026-10-13. En `MEMORY.md`: novedad 2026-10-13 (sub-proyecto 1 en producción, campo `Historial`, opción `Cancelada`, PIN de gerencia anotado) y pendientes actualizados.

- [ ] **Step 7: Merge y push**

```bash
git checkout -- .gitignore 2>/dev/null
git checkout master && git merge --ff-only gerencia-edicion && git push origin master && git branch -d gerencia-edicion
```

---

## Orden de ejecución

T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9. T0 paso 2 (campo `Historial`) debe existir antes del humo en producción (T9), no antes de los tests (el falso no lo necesita). T9 paso 1 necesita el PIN de gerencia de gerencia.

## Criterios de cierre (spec §12)

1. Gerencia cambia fechas desde el celular; el calendario lo refleja; fechas ocupadas se rechazan con el conflicto.
2. Una cancelada desaparece del calendario, no bloquea y sigue en Airtable con motivo e historial.
3. Un abono anulado deja el saldo correcto y se ve tachado con su motivo.
4. Con el PIN de las señoras solamente, `PATCH` e `incluirCanceladas=1` responden 401 y la interfaz no ofrece las acciones.
5. `git grep -n -i -E "DELETE|eliminar\(|borrar\(" -- api lib` no devuelve operaciones de borrado.

