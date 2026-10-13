# Villa Aura — Reservas + Mini-PMS en Vercel · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el webhook muerto de n8n por un proyecto Vercel que sirve el formulario de reservas, un mini-PMS (calendario de ocupación + abonos) y una API que escribe en Airtable, con PIN, monitor y migración de los anticipos existentes.

**Architecture:** Páginas estáticas en `public/` + funciones serverless en `api/` dentro de un solo proyecto Vercel (sin framework, sin build). La lógica pura (fechas, dinero, disponibilidad, pagos, geometría del calendario) vive en `public/js/` y la importan tanto el navegador (módulos ES) como el servidor. Airtable es la única base de datos; el token vive solo en variables de entorno de Vercel. Un cliente Airtable "falso" en memoria permite correr todo localmente y probar la API sin red.

**Tech Stack:** Node 24.x (ESM, JSDoc, sin TypeScript), Vercel Functions (Node runtime, firma `(req, res)`), vitest 5, HTML/CSS/JS sin dependencias de ejecución, Airtable REST API v0, Vercel CLI (`npx vercel`), GitHub CLI (`gh`), herramientas MCP de Airtable para el esquema.

**Spec:** `docs/superpowers/specs/2026-10-12-villa-aura-mini-pms-vercel-design.md` (en `/Users/marketinghotelero/Villa aura/`). El código y los commits viven en `/Users/marketinghotelero/Villa aura/formulario/` (repo git, remoto `hotelerojulian2593-dev/villa-aura-reservas`, público). La carpeta raíz `Villa aura/` NO es repo git.

## Global Constraints

- Node `24.x` (`engines.node` en `package.json`); vitest `^5.0.4` es la única devDependency; **cero dependencias de ejecución**.
- Repo público: **ningún secreto ni ID de Airtable** en código, tests, docs del repo ni historial. Nombres de variables: `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLA_RESERVAS` (por defecto `Reservas`), `AIRTABLE_TABLA_PAGOS` (por defecto `Pagos`), `PIN_SENORAS`.
- Fechas siempre `YYYY-MM-DD`; todo "hoy" en `America/Bogota`. Montos en pesos **enteros**.
- Nombres de campo Airtable exactos, con acentos: `Huésped`, `Teléfono`, `Fecha entrada`, `Fecha salida`, `Habitaciones`, `Personas`, `Estado`, `Notas`, `Valor total`, `Pagos`, `Pagado`, `Saldo`, `Anticipo COP`; en `Pagos`: `Concepto`, `Reserva`, `Fecha`, `Monto`, `Medio`, `Nota`, `Registrado`.
- Habitaciones: `La Rosaura`, `La Yaneth`, `La Clara`, `La Luis`, `La Elsa`, `FULL HOUSE`. Estados: `Confirmado`, `Anticipo pendiente`. Medios: `Nequi`, `Bancolombia`, `Daviplata`, `Efectivo`, `Otro`.
- La API **nunca borra ni edita** reservas (solo crea reservas, crea pagos y cambia `Estado` a `Confirmado`).
- Respuestas JSON: `{ ok: true, ... }` o `{ ok: false, error: "<español, listo para mostrar>" }`. Cabecera `X-Pin` obligatoria salvo en `/api/salud`.
- Textos de interfaz en español; paleta MH: navy `#151635`, dorado `#C49A2B`, fondo `#F4F4F6`, azul data `#4A6FA5`, Poppins; botones ≥ 44 px; diseño para 375 px de ancho.
- Commits en español, en la rama `vercel-mini-pms` del repo `formulario/`, terminando con la línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Pruebas: `npm test` (vitest) debe pasar al final de cada tarea.

## Review Focus

1. Teléfono con `+57`, espacios o guiones (`+57 310-000-0000`) → el botón de WhatsApp debe abrir `https://wa.me/573100000000`, sin `57` duplicado. (Test en Tarea 5.)
2. Reserva que cruza de mes (`30 oct → 2 nov`) → los KPIs cuentan solo las noches dentro del mes y la barra se dibuja recortada al borde, sin desaparecer ni duplicarse. (Tests en Tareas 4 y 5.)
3. Montos con decimales, negativos o texto (`500000.5`, `-1`, `"500.000"`) enviados a la API → `400` con mensaje claro, nunca `NaN` guardado en Airtable. (Test en Tarea 6.)
4. Hora 19:00–23:59 en Colombia (en UTC ya es mañana) → `hoyBogota()` devuelve la fecha colombiana y el formulario no bloquea "hoy". (Test en Tarea 1.)
5. Dos reservas consecutivas de la misma habitación (`salida` de una = `entrada` de la otra) → no es conflicto; Full House contra una habitación suelta sí lo es. (Tests en Tarea 3.)

---

## Estructura de archivos

```
formulario/
  package.json, vercel.json, .gitignore, .env.example, README.md
  public/
    index.html            formulario (Tarea 16)
    calendario.html       mini-PMS (Tarea 17)
    brand.css             tokens y componentes MH (Tarea 15)
    js/
      app.js              navegador: PIN, fetch con X-Pin, utilidades DOM (Tarea 15)
      fechas.js           compartido (Tarea 1)
      dinero.js           compartido (Tarea 2)
      disponibilidad.js   compartido (Tarea 3)
      pagos.js            compartido: resumen y KPIs (Tarea 4)
      calendario-logica.js compartido: barras, orden, WhatsApp, etiquetas (Tarea 5)
  lib/
    validar.js            (Tarea 6)
    pin.js                (Tarea 7)
    airtable.js           cliente REST real (Tarea 8)
    airtable-falso.js     cliente en memoria para dev y tests (Tarea 9)
    reservas.js           mapeo Airtable ⇄ API y consultas (Tarea 10)
    http.js               responder, exigirPin, manejarError (Tarea 11)
    migracion.js          plan de migración de anticipos (Tarea 20)
  api/
    salud.js (Tarea 11) · reservas.js (Tarea 12) · pagos.js (Tarea 13)
  scripts/
    dev.mjs               servidor local estático + API (Tarea 14)
    migrar-anticipos.mjs  (Tarea 20)
  tests/                  un archivo por módulo: fechas.test.js, dinero.test.js, …
  docs/                   copia del spec y de este plan (Tarea 23)
```

Deviación respecto al spec (§5.1): los módulos puros van en `public/js/` en vez de `lib/` para que el navegador los importe sin paso de build; el servidor los importa con rutas relativas (`../public/js/...`). Nada en `public/js/` contiene secretos.

---

### Task 0: Preparar el repo (limpiar historial, rama, esqueleto, vitest)

**Files:**
- Create: `package.json`, `vercel.json`, `.gitignore`, `.env.example`, `tests/humo.test.js`
- Backup fuera del repo: `/Users/marketinghotelero/Villa aura/docs/legacy/index-local-2026-05-19.html`

**Interfaces:**
- Produces: proyecto con `npm test` funcionando; rama `vercel-mini-pms` partiendo de `origin/master` (sin el commit local `970d3bf` que contiene el token).

- [ ] **Step 1: Guardar copia del formulario local (tiene mejoras no publicadas) fuera del repo público**

```bash
mkdir -p "/Users/marketinghotelero/Villa aura/docs/legacy"
cp "/Users/marketinghotelero/Villa aura/formulario/index.html" "/Users/marketinghotelero/Villa aura/docs/legacy/index-local-2026-05-19.html"
```

- [ ] **Step 2: Dejar `master` igual al remoto (descarta el commit con el token y los cambios sin commit) y crear la rama de trabajo**

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
git status --short            # solo index.html modificado y .DS_Store
git reset --hard origin/master
git log --oneline -3          # debe mostrar solo aedfbe8 como HEAD
git checkout -b vercel-mini-pms
rm -f .DS_Store
```

Verificar que el token no está en ningún commit alcanzable: `git log --all -p | grep -c "patWvwhl"` → `0`.

- [ ] **Step 3: Crear `package.json`**

```json
{
  "name": "villa-aura-reservas",
  "private": true,
  "version": "2.0.0",
  "description": "Villa Aura — formulario de reservas, mini-PMS y API sobre Airtable (Vercel)",
  "type": "module",
  "engines": { "node": "24.x" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "node --env-file=.env.local scripts/dev.mjs",
    "dev:falso": "node scripts/dev.mjs --falso",
    "migrar": "node --env-file=.env.local scripts/migrar-anticipos.mjs",
    "migrar:aplicar": "node --env-file=.env.local scripts/migrar-anticipos.mjs --aplicar",
    "deploy": "vercel deploy --prod"
  },
  "devDependencies": { "vitest": "^5.0.4" }
}
```

- [ ] **Step 4: Crear `vercel.json`, `.gitignore` y `.env.example`**

`vercel.json`:
```json
{ "cleanUrls": true, "trailingSlash": false }
```

`.gitignore`:
```
node_modules/
.vercel/
.env
.env.*
!.env.example
.DS_Store
```

`.env.example`:
```
# Copia a .env.local (ignorado por git) o usa `npx vercel env pull .env.local`
AIRTABLE_TOKEN=
AIRTABLE_BASE_ID=
AIRTABLE_TABLA_RESERVAS=Reservas
AIRTABLE_TABLA_PAGOS=Pagos
PIN_SENORAS=
```

- [ ] **Step 5: Instalar vitest y escribir un test de humo**

```bash
npm install
```

`tests/humo.test.js`:
```js
import { it, expect } from 'vitest';

it('vitest corre', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: Correr los tests**

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vercel.json .gitignore .env.example tests/humo.test.js
git commit -m "Esqueleto del proyecto Vercel: package.json, vercel.json, vitest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: `public/js/fechas.js` — fechas ISO en hora de Colombia

**Files:**
- Create: `public/js/fechas.js`, `tests/fechas.test.js`

**Interfaces:**
- Produces: `ZONA`, `DIAS_CORTOS`, `hoyBogota(ahora?: Date): string`, `deISO(iso): Date`, `aISO(fecha): string`, `esFechaISO(valor): boolean`, `sumarDias(iso, n): string`, `noches(entrada, salida): number`, `rangoMes(anio, mes1a12): { desde, hasta, dias }`, `mesDeISO(iso): { anio, mes }`, `diaSemana(iso): 0..6 (0 = domingo)`, `esFinDeSemana(iso): boolean`, `nombreMes(mes): string`, `fechaCorta(iso): '17 oct'`, `fechaLarga(iso): '17 de octubre de 2026'`.

- [ ] **Step 1: Escribir los tests**

`tests/fechas.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  hoyBogota, esFechaISO, sumarDias, noches, rangoMes, esFinDeSemana,
  fechaCorta, fechaLarga, mesDeISO, nombreMes, diaSemana, DIAS_CORTOS,
} from '../public/js/fechas.js';

describe('hoyBogota', () => {
  it('a las 23:30 de Bogotá sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    // 2026-10-12 23:30 Bogotá (UTC-5) = 2026-10-13T04:30:00Z
    expect(hoyBogota(new Date('2026-10-13T04:30:00Z'))).toBe('2026-10-12');
  });
  it('a las 00:10 de Bogotá ya es el día siguiente', () => {
    expect(hoyBogota(new Date('2026-10-13T05:10:00Z'))).toBe('2026-10-13');
  });
  it('devuelve formato YYYY-MM-DD', () => {
    expect(hoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('esFechaISO', () => {
  it('acepta fechas reales', () => {
    expect(esFechaISO('2026-02-28')).toBe(true);
    expect(esFechaISO('2028-02-29')).toBe(true);
  });
  it('rechaza fechas inexistentes, otros formatos y tipos', () => {
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('2026-13-01')).toBe(false);
    expect(esFechaISO('12/10/2026')).toBe(false);
    expect(esFechaISO(20261012)).toBe(false);
    expect(esFechaISO(undefined)).toBe(false);
  });
});

describe('sumarDias y noches', () => {
  it('cruza mes y año', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('cuenta noches', () => {
    expect(noches('2026-10-17', '2026-10-19')).toBe(2);
    expect(noches('2026-10-17', '2026-10-17')).toBe(0);
  });
});

describe('rangoMes', () => {
  it('octubre 2026 tiene 31 días y termina el 1 de noviembre', () => {
    expect(rangoMes(2026, 10)).toEqual({ desde: '2026-10-01', hasta: '2026-11-01', dias: 31 });
  });
  it('diciembre pasa al año siguiente', () => {
    expect(rangoMes(2026, 12)).toEqual({ desde: '2026-12-01', hasta: '2027-01-01', dias: 31 });
  });
  it('febrero bisiesto', () => {
    expect(rangoMes(2028, 2).dias).toBe(29);
  });
});

describe('días de la semana y nombres', () => {
  it('sábado y domingo son fin de semana; lunes no', () => {
    expect(esFinDeSemana('2026-10-17')).toBe(true);
    expect(esFinDeSemana('2026-10-18')).toBe(true);
    expect(esFinDeSemana('2026-10-19')).toBe(false);
  });
  it('diaSemana y DIAS_CORTOS', () => {
    expect(diaSemana('2026-10-18')).toBe(0);
    expect(DIAS_CORTOS[diaSemana('2026-10-17')]).toBe('S');
  });
  it('formatos legibles', () => {
    expect(fechaCorta('2026-10-07')).toBe('7 oct');
    expect(fechaLarga('2026-10-17')).toBe('17 de octubre de 2026');
    expect(nombreMes(10)).toBe('octubre');
    expect(mesDeISO('2026-10-17')).toEqual({ anio: 2026, mes: 10 });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/fechas.test.js`
Expected: FAIL — `Cannot find module '../public/js/fechas.js'`.

- [ ] **Step 3: Implementar `public/js/fechas.js`**

```js
// Fechas en formato ISO 'YYYY-MM-DD'. Todo "hoy" se calcula en hora de Colombia,
// porque de noche la hora UTC ya está en el día siguiente (bug del formulario viejo).
export const ZONA = 'America/Bogota';

const formatoISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
});

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function hoyBogota(ahora = new Date()) {
  return formatoISO.format(ahora);
}

export function deISO(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export function aISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

export function esFechaISO(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = deISO(valor);
  return !Number.isNaN(fecha.getTime()) && aISO(fecha) === valor;
}

export function sumarDias(iso, dias) {
  const fecha = deISO(iso);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return aISO(fecha);
}

export function noches(entrada, salida) {
  return Math.round((deISO(salida) - deISO(entrada)) / 86_400_000);
}

export function rangoMes(anio, mes) {
  const dos = (n) => String(n).padStart(2, '0');
  const desde = `${anio}-${dos(mes)}-01`;
  const hasta = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${dos(mes + 1)}-01`;
  return { desde, hasta, dias: noches(desde, hasta) };
}

export function mesDeISO(iso) {
  return { anio: Number(iso.slice(0, 4)), mes: Number(iso.slice(5, 7)) };
}

export function diaSemana(iso) {
  return deISO(iso).getUTCDay();
}

export function esFinDeSemana(iso) {
  const dia = diaSemana(iso);
  return dia === 0 || dia === 6;
}

export function nombreMes(mes) {
  return MESES[mes - 1];
}

export function fechaCorta(iso) {
  return `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
}

export function fechaLarga(iso) {
  const { anio, mes } = mesDeISO(iso);
  return `${Number(iso.slice(8, 10))} de ${MESES[mes - 1]} de ${anio}`;
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/fechas.test.js`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/fechas.js tests/fechas.test.js
git commit -m "Fechas ISO con hoy en hora de Colombia

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `public/js/dinero.js` — pesos colombianos

**Files:**
- Create: `public/js/dinero.js`, `tests/dinero.test.js`

**Interfaces:**
- Produces: `parsearCOP(texto): number` (entero ≥ 0; ignora todo lo que no sea dígito), `formatearCOP(n): string` (`'$ 1.060.000'`, `''` para null/NaN).

- [ ] **Step 1: Escribir los tests**

`tests/dinero.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parsearCOP, formatearCOP } from '../public/js/dinero.js';

describe('parsearCOP', () => {
  it('lee lo que escribe la señora con o sin formato', () => {
    expect(parsearCOP('$ 1.060.000')).toBe(1060000);
    expect(parsearCOP('530000')).toBe(530000);
    expect(parsearCOP('1,060,000')).toBe(1060000);
  });
  it('vacío, null o sin dígitos es 0', () => {
    expect(parsearCOP('')).toBe(0);
    expect(parsearCOP(null)).toBe(0);
    expect(parsearCOP('abc')).toBe(0);
  });
});

describe('formatearCOP', () => {
  it('separa miles con punto y antepone $', () => {
    expect(formatearCOP(1060000)).toBe('$ 1.060.000');
    expect(formatearCOP(530000)).toBe('$ 530.000');
    expect(formatearCOP(900)).toBe('$ 900');
    expect(formatearCOP(0)).toBe('$ 0');
  });
  it('redondea decimales y marca negativos', () => {
    expect(formatearCOP(530000.4)).toBe('$ 530.000');
    expect(formatearCOP(-100000)).toBe('-$ 100.000');
  });
  it('null o NaN devuelve cadena vacía', () => {
    expect(formatearCOP(null)).toBe('');
    expect(formatearCOP(NaN)).toBe('');
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/dinero.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `public/js/dinero.js`**

```js
// Pesos colombianos enteros. Formato manual (no toLocaleString) para que Node y
// todos los navegadores de celular produzcan exactamente lo mismo.
export function parsearCOP(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  return digitos ? Number(digitos) : 0;
}

export function formatearCOP(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  const entero = Math.round(Math.abs(Number(n)));
  const conPuntos = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}$ ${conPuntos}`;
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/dinero.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/dinero.js tests/dinero.test.js
git commit -m "Formato y parseo de pesos colombianos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `public/js/disponibilidad.js` — solapamientos y Full House

**Files:**
- Create: `public/js/disponibilidad.js`, `tests/disponibilidad.test.js`

**Interfaces:**
- Produces: `HABITACIONES: string[]` (las 5), `FULL_HOUSE = 'FULL HOUSE'`, `OPCIONES_HABITACION` (las 5 + Full House), `expandir(habs): string[]` (Full House → las 5), `seSolapan(a, b): boolean` con `a/b = { entrada, salida }`, `comparten(habsA, habsB): boolean`, `buscarConflicto(nueva, existentes): reserva | null` donde cada reserva tiene `{ id?, entrada, salida, habitaciones }`.

- [ ] **Step 1: Escribir los tests**

`tests/disponibilidad.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  HABITACIONES, FULL_HOUSE, OPCIONES_HABITACION, expandir, seSolapan, comparten, buscarConflicto,
} from '../public/js/disponibilidad.js';

const r = (entrada, salida, habitaciones, id) => ({ id, entrada, salida, habitaciones });

describe('constantes', () => {
  it('cinco habitaciones y la opción Full House', () => {
    expect(HABITACIONES).toEqual(['La Rosaura', 'La Yaneth', 'La Clara', 'La Luis', 'La Elsa']);
    expect(OPCIONES_HABITACION).toEqual([...HABITACIONES, FULL_HOUSE]);
    expect(expandir([FULL_HOUSE])).toEqual(HABITACIONES);
    expect(expandir(['La Clara'])).toEqual(['La Clara']);
  });
});

describe('seSolapan', () => {
  it('la salida de una puede ser la entrada de la otra', () => {
    expect(seSolapan({ entrada: '2026-10-17', salida: '2026-10-19' }, { entrada: '2026-10-19', salida: '2026-10-21' })).toBe(false);
  });
  it('comparten al menos una noche', () => {
    expect(seSolapan({ entrada: '2026-10-17', salida: '2026-10-19' }, { entrada: '2026-10-18', salida: '2026-10-20' })).toBe(true);
    expect(seSolapan({ entrada: '2026-10-10', salida: '2026-10-25' }, { entrada: '2026-10-18', salida: '2026-10-20' })).toBe(true);
  });
});

describe('comparten', () => {
  it('Full House choca con cualquier habitación y viceversa', () => {
    expect(comparten([FULL_HOUSE], ['La Elsa'])).toBe(true);
    expect(comparten(['La Elsa'], [FULL_HOUSE])).toBe(true);
    expect(comparten([FULL_HOUSE], [FULL_HOUSE])).toBe(true);
  });
  it('habitaciones distintas no chocan', () => {
    expect(comparten(['La Rosaura', 'La Clara'], ['La Elsa'])).toBe(false);
    expect(comparten(['La Rosaura', 'La Clara'], ['La Clara'])).toBe(true);
  });
});

describe('buscarConflicto', () => {
  const existentes = [
    r('2026-10-17', '2026-10-19', ['La Rosaura'], 'recA'),
    r('2026-10-24', '2026-10-26', [FULL_HOUSE], 'recB'),
  ];
  it('misma habitación, noches cruzadas → devuelve la reserva que choca', () => {
    expect(buscarConflicto(r('2026-10-18', '2026-10-20', ['La Rosaura']), existentes)?.id).toBe('recA');
  });
  it('consecutivas (salida = entrada) → sin conflicto', () => {
    expect(buscarConflicto(r('2026-10-19', '2026-10-21', ['La Rosaura']), existentes)).toBeNull();
  });
  it('otra habitación en las mismas fechas → sin conflicto', () => {
    expect(buscarConflicto(r('2026-10-17', '2026-10-19', ['La Elsa']), existentes)).toBeNull();
  });
  it('una habitación suelta contra un Full House existente → conflicto', () => {
    expect(buscarConflicto(r('2026-10-25', '2026-10-27', ['La Yaneth']), existentes)?.id).toBe('recB');
  });
  it('Full House nuevo contra una habitación existente → conflicto', () => {
    expect(buscarConflicto(r('2026-10-16', '2026-10-18', [FULL_HOUSE]), existentes)?.id).toBe('recA');
  });
  it('ignora la propia reserva si tiene el mismo id', () => {
    expect(buscarConflicto(r('2026-10-17', '2026-10-19', ['La Rosaura'], 'recA'), existentes)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/disponibilidad.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `public/js/disponibilidad.js`**

```js
// Lógica pura de disponibilidad. Se usa idéntica en el celular (validación previa)
// y en el servidor (validación definitiva). Las fechas ISO se comparan como texto.
export const HABITACIONES = ['La Rosaura', 'La Yaneth', 'La Clara', 'La Luis', 'La Elsa'];
export const FULL_HOUSE = 'FULL HOUSE';
export const OPCIONES_HABITACION = [...HABITACIONES, FULL_HOUSE];

export function expandir(habitaciones) {
  return habitaciones.includes(FULL_HOUSE) ? [...HABITACIONES] : [...habitaciones];
}

export function seSolapan(a, b) {
  return a.entrada < b.salida && a.salida > b.entrada;
}

export function comparten(habsA, habsB) {
  const b = new Set(expandir(habsB));
  return expandir(habsA).some((h) => b.has(h));
}

export function buscarConflicto(nueva, existentes) {
  for (const existente of existentes) {
    if (nueva.id && existente.id === nueva.id) continue;
    if (seSolapan(nueva, existente) && comparten(nueva.habitaciones, existente.habitaciones)) return existente;
  }
  return null;
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/disponibilidad.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/disponibilidad.js tests/disponibilidad.test.js
git commit -m "Lógica de disponibilidad compartida (solapamientos y Full House)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `public/js/pagos.js` — resumen de pagos y KPIs del mes

**Files:**
- Create: `public/js/pagos.js`, `tests/pagos.test.js`

**Interfaces:**
- Consumes: `noches` (Tarea 1), `HABITACIONES`, `expandir` (Tarea 3).
- Produces: `resumenPagos(valorTotal: number|null, pagos: {monto}[]): { pagado, saldo: number|null, estadoPago: 'sin_valor'|'sin_anticipo'|'parcial'|'pagado' }`, `nochesEnRango(reserva, desde, hasta): number`, `kpisMes(reservas, desde, hasta): { ocupacion, nochesOcupadas, cobrado, porCobrar, sinValor }`. Las reservas traen `{ entrada, salida, habitaciones, valorTotal, pagos: [{ fecha, monto }] }`.

- [ ] **Step 1: Escribir los tests**

`tests/pagos.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { resumenPagos, nochesEnRango, kpisMes } from '../public/js/pagos.js';

describe('resumenPagos', () => {
  it('parcial: hay abono pero falta', () => {
    expect(resumenPagos(1060000, [{ monto: 530000 }])).toEqual({ pagado: 530000, saldo: 530000, estadoPago: 'parcial' });
  });
  it('sin anticipo', () => {
    expect(resumenPagos(1060000, [])).toEqual({ pagado: 0, saldo: 1060000, estadoPago: 'sin_anticipo' });
  });
  it('pagado completo o de más', () => {
    expect(resumenPagos(1060000, [{ monto: 530000 }, { monto: 530000 }])).toEqual({ pagado: 1060000, saldo: 0, estadoPago: 'pagado' });
    expect(resumenPagos(500000, [{ monto: 600000 }])).toEqual({ pagado: 600000, saldo: -100000, estadoPago: 'pagado' });
  });
  it('sin valor total: no inventa saldo', () => {
    expect(resumenPagos(null, [{ monto: 200000 }])).toEqual({ pagado: 200000, saldo: null, estadoPago: 'sin_valor' });
  });
  it('tolera pagos sin lista o con montos raros', () => {
    expect(resumenPagos(100, undefined)).toEqual({ pagado: 0, saldo: 100, estadoPago: 'sin_anticipo' });
    expect(resumenPagos(100, [{ monto: 'x' }])).toEqual({ pagado: 0, saldo: 100, estadoPago: 'sin_anticipo' });
  });
});

const MES = { desde: '2026-10-01', hasta: '2026-11-01' };
const A = { entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'], valorTotal: 1060000, pagos: [{ fecha: '2026-10-12', monto: 530000 }] };
const B = { entrada: '2026-10-30', salida: '2026-11-02', habitaciones: ['FULL HOUSE'], valorTotal: 3000000, pagos: [{ fecha: '2026-09-28', monto: 1500000 }] };
const C = { entrada: '2026-10-05', salida: '2026-10-06', habitaciones: ['La Clara'], valorTotal: null, pagos: [] };
const D = { entrada: '2026-09-29', salida: '2026-10-02', habitaciones: ['La Elsa'], valorTotal: 400000, pagos: [{ fecha: '2026-10-01', monto: 400000 }] };

describe('nochesEnRango', () => {
  it('solo cuenta noches dentro del rango', () => {
    expect(nochesEnRango(A, MES.desde, MES.hasta)).toBe(2);
    expect(nochesEnRango(B, MES.desde, MES.hasta)).toBe(2);   // 30 y 31 de octubre
    expect(nochesEnRango(D, MES.desde, MES.hasta)).toBe(1);   // 1 de octubre
    expect(nochesEnRango(B, '2026-11-01', '2026-12-01')).toBe(1); // 1 de noviembre
    expect(nochesEnRango(A, '2026-11-01', '2026-12-01')).toBe(0);
  });
});

describe('kpisMes', () => {
  it('ocupación, cobrado y por cobrar del mes', () => {
    const k = kpisMes([A, B, C, D], MES.desde, MES.hasta);
    expect(k.nochesOcupadas).toBe(2 + 2 * 5 + 1 + 1);        // Full House cuenta 5 habitaciones
    expect(k.ocupacion).toBe(9);                             // 14 / (5 × 31) = 9,03 %
    expect(k.cobrado).toBe(530000 + 400000);                 // pagos con fecha dentro del mes
    expect(k.porCobrar).toBe(530000 + 1500000);              // saldos de reservas que llegan en el mes
    expect(k.sinValor).toBe(1);                              // C
  });
  it('mes vacío', () => {
    expect(kpisMes([], MES.desde, MES.hasta)).toEqual({ ocupacion: 0, nochesOcupadas: 0, cobrado: 0, porCobrar: 0, sinValor: 0 });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/pagos.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `public/js/pagos.js`**

```js
import { noches } from './fechas.js';
import { HABITACIONES, expandir } from './disponibilidad.js';

// Resumen de pagos de una reserva. valorTotal null = reserva vieja sin valor definido.
export function resumenPagos(valorTotal, pagos) {
  const pagado = (pagos ?? []).reduce((suma, p) => suma + (Number(p.monto) || 0), 0);
  if (valorTotal == null) return { pagado, saldo: null, estadoPago: 'sin_valor' };
  const saldo = valorTotal - pagado;
  const estadoPago = pagado <= 0 ? 'sin_anticipo' : pagado >= valorTotal ? 'pagado' : 'parcial';
  return { pagado, saldo, estadoPago };
}

// Noches de la reserva que caen dentro de [desde, hasta).
export function nochesEnRango(reserva, desde, hasta) {
  const inicio = reserva.entrada > desde ? reserva.entrada : desde;
  const fin = reserva.salida < hasta ? reserva.salida : hasta;
  return fin > inicio ? noches(inicio, fin) : 0;
}

export function kpisMes(reservas, desde, hasta) {
  const capacidad = HABITACIONES.length * noches(desde, hasta);
  let nochesOcupadas = 0;
  let cobrado = 0;
  let porCobrar = 0;
  let sinValor = 0;
  for (const r of reservas) {
    nochesOcupadas += nochesEnRango(r, desde, hasta) * expandir(r.habitaciones).length;
    for (const p of r.pagos ?? []) {
      if (p.fecha >= desde && p.fecha < hasta) cobrado += Number(p.monto) || 0;
    }
    if (r.entrada >= desde && r.entrada < hasta) {
      const { saldo, estadoPago } = resumenPagos(r.valorTotal, r.pagos);
      if (estadoPago === 'sin_valor') sinValor += 1;
      else if (saldo > 0) porCobrar += saldo;
    }
  }
  return {
    ocupacion: capacidad ? Math.round((100 * nochesOcupadas) / capacidad) : 0,
    nochesOcupadas, cobrado, porCobrar, sinValor,
  };
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/pagos.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/pagos.js tests/pagos.test.js
git commit -m "Resumen de pagos por reserva y KPIs del mes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `public/js/calendario-logica.js` — barras, orden, WhatsApp, etiquetas

**Files:**
- Create: `public/js/calendario-logica.js`, `tests/calendario-logica.test.js`

**Interfaces:**
- Consumes: `noches` (T1), `formatearCOP` (T2), `expandir`, `FULL_HOUSE` (T3).
- Produces: `barraEnMes(reserva, desde, hasta): { diaInicio, span, cortadaIzq, cortadaDer } | null`, `filasDe(reserva): string[]`, `colorEstado(reserva): 'fullhouse'|'confirmado'|'pendiente'`, `ordenarProximas(reservas, hoy): reservas[]`, `telefonoWa(telefono): string | null`, `etiquetaPago(reserva): string`, `porcentajePago(reserva): 0..100`. Las reservas son las que devuelve la API (`entrada, salida, habitaciones, estado, valorTotal, pagado, saldo, estadoPago, telefono`).

- [ ] **Step 1: Escribir los tests**

`tests/calendario-logica.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  barraEnMes, filasDe, colorEstado, ordenarProximas, telefonoWa, etiquetaPago, porcentajePago,
} from '../public/js/calendario-logica.js';

const MES = { desde: '2026-10-01', hasta: '2026-11-01' };
const base = { estado: 'Confirmado', valorTotal: 1060000, pagado: 530000, saldo: 530000, estadoPago: 'parcial' };
const A = { ...base, id: 'A', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'] };
const B = { ...base, id: 'B', entrada: '2026-10-30', salida: '2026-11-02', habitaciones: ['FULL HOUSE'], estado: 'Anticipo pendiente' };
const D = { ...base, id: 'D', entrada: '2026-09-29', salida: '2026-10-02', habitaciones: ['La Elsa'] };

describe('barraEnMes', () => {
  it('reserva completa dentro del mes', () => {
    expect(barraEnMes(A, MES.desde, MES.hasta)).toEqual({ diaInicio: 17, span: 2, cortadaIzq: false, cortadaDer: false });
  });
  it('recortada a la derecha cuando sigue en el mes siguiente', () => {
    expect(barraEnMes(B, MES.desde, MES.hasta)).toEqual({ diaInicio: 30, span: 2, cortadaIzq: false, cortadaDer: true });
  });
  it('recortada a la izquierda cuando viene del mes anterior', () => {
    expect(barraEnMes(D, MES.desde, MES.hasta)).toEqual({ diaInicio: 1, span: 1, cortadaIzq: true, cortadaDer: false });
  });
  it('fuera del mes → null', () => {
    expect(barraEnMes(A, '2026-11-01', '2026-12-01')).toBeNull();
  });
});

describe('filas y color', () => {
  it('Full House ocupa las cinco filas y se pinta azul', () => {
    expect(filasDe(B)).toHaveLength(5);
    expect(colorEstado(B)).toBe('fullhouse');
  });
  it('confirmado navy, pendiente dorado', () => {
    expect(colorEstado(A)).toBe('confirmado');
    expect(colorEstado({ ...A, estado: 'Anticipo pendiente' })).toBe('pendiente');
  });
});

describe('ordenarProximas', () => {
  it('primero las que no han salido, por fecha de llegada; las pasadas al final', () => {
    const pasada = { ...A, id: 'P', entrada: '2026-10-05', salida: '2026-10-06' };
    const enCurso = { ...A, id: 'E', entrada: '2026-10-11', salida: '2026-10-13' };
    expect(ordenarProximas([pasada, A, B, enCurso], '2026-10-12').map((r) => r.id)).toEqual(['E', 'A', 'B', 'P']);
  });
});

describe('telefonoWa', () => {
  it('normaliza al formato wa.me con indicativo 57 sin duplicarlo', () => {
    expect(telefonoWa('310 000 0000')).toBe('https://wa.me/573100000000');
    expect(telefonoWa('+57 310-000-0000')).toBe('https://wa.me/573100000000');
    expect(telefonoWa('573100000000')).toBe('https://wa.me/573100000000');
  });
  it('números demasiado cortos no generan enlace', () => {
    expect(telefonoWa('123')).toBeNull();
    expect(telefonoWa('')).toBeNull();
  });
});

describe('etiqueta y porcentaje de pago', () => {
  it('cuatro estados', () => {
    expect(etiquetaPago(A)).toBe('Falta $ 530.000');
    expect(etiquetaPago({ ...A, estadoPago: 'pagado', saldo: 0 })).toBe('Pagado ✓');
    expect(etiquetaPago({ ...A, estadoPago: 'sin_anticipo' })).toBe('Sin anticipo');
    expect(etiquetaPago({ ...A, estadoPago: 'sin_valor', valorTotal: null, saldo: null })).toBe('Valor total sin definir');
  });
  it('porcentaje acotado a 0–100', () => {
    expect(porcentajePago(A)).toBe(50);
    expect(porcentajePago({ ...A, pagado: 2000000 })).toBe(100);
    expect(porcentajePago({ ...A, valorTotal: null })).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/calendario-logica.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `public/js/calendario-logica.js`**

```js
import { noches } from './fechas.js';
import { formatearCOP } from './dinero.js';
import { expandir, FULL_HOUSE } from './disponibilidad.js';

// Posición de la barra de una reserva dentro de un mes [desde, hasta).
export function barraEnMes(reserva, desde, hasta) {
  const inicio = reserva.entrada > desde ? reserva.entrada : desde;
  const fin = reserva.salida < hasta ? reserva.salida : hasta;
  if (fin <= inicio) return null;
  return {
    diaInicio: Number(inicio.slice(8, 10)),
    span: noches(inicio, fin),
    cortadaIzq: reserva.entrada < desde,
    cortadaDer: reserva.salida > hasta,
  };
}

export function filasDe(reserva) {
  return expandir(reserva.habitaciones);
}

export function colorEstado(reserva) {
  if (reserva.habitaciones.includes(FULL_HOUSE)) return 'fullhouse';
  return reserva.estado === 'Confirmado' ? 'confirmado' : 'pendiente';
}

// Activas y futuras primero (por llegada), luego las que ya salieron.
export function ordenarProximas(reservas, hoy) {
  const porLlegada = (a, b) => a.entrada.localeCompare(b.entrada);
  const vigentes = reservas.filter((r) => r.salida > hoy).sort(porLlegada);
  const pasadas = reservas.filter((r) => r.salida <= hoy).sort(porLlegada);
  return [...vigentes, ...pasadas];
}

export function telefonoWa(telefono) {
  let digitos = String(telefono ?? '').replace(/\D/g, '');
  if (digitos.length === 10) digitos = `57${digitos}`;
  if (digitos.length < 11) return null;
  return `https://wa.me/${digitos}`;
}

export function etiquetaPago(reserva) {
  switch (reserva.estadoPago) {
    case 'pagado': return 'Pagado ✓';
    case 'parcial': return `Falta ${formatearCOP(reserva.saldo)}`;
    case 'sin_anticipo': return 'Sin anticipo';
    default: return 'Valor total sin definir';
  }
}

export function porcentajePago(reserva) {
  if (!reserva.valorTotal) return 0;
  return Math.max(0, Math.min(100, Math.round((100 * reserva.pagado) / reserva.valorTotal)));
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/calendario-logica.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/calendario-logica.js tests/calendario-logica.test.js
git commit -m "Lógica del calendario: barras por mes, orden, WhatsApp y etiquetas de pago

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `lib/validar.js` — validación de entradas de la API

**Files:**
- Create: `lib/validar.js`, `tests/validar.test.js`

**Interfaces:**
- Consumes: `esFechaISO` (T1), `OPCIONES_HABITACION`, `FULL_HOUSE` (T3).
- Produces: `MEDIOS: string[]`, `MAX_DIAS_RANGO = 93`, `aEntero(valor): number|NaN`, `validarAbono(abono, hoy)`, `validarReservaNueva(body, hoy)`, `validarPagoNuevo(body, hoy)`, `validarRango(query)`. Todas devuelven `{ ok: true, datos }` o `{ ok: false, error }`. `datos` de reserva: `{ huesped, telefono, entrada, salida, habitaciones, personas, valorTotal, abono: { monto, medio, fecha, nota } | null, notas }`; de pago: `{ reservaId, monto, medio, fecha, nota }`; de rango: `{ desde, hasta }`.

- [ ] **Step 1: Escribir los tests**

`tests/validar.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validarReservaNueva, validarPagoNuevo, validarRango, aEntero, MEDIOS } from '../lib/validar.js';

const HOY = '2026-10-12';
const buena = {
  huesped: '  Ana Pérez ', telefono: '310 000 0000', entrada: '2026-10-17', salida: '2026-10-19',
  habitaciones: ['La Rosaura', 'La Clara'], personas: 11, valorTotal: 1060000,
  abono: { monto: 530000, medio: 'Nequi' }, notas: ' Llegan tarde ',
};

describe('aEntero', () => {
  it('acepta enteros y cadenas de dígitos; rechaza decimales, negativos y texto', () => {
    expect(aEntero(5)).toBe(5);
    expect(aEntero('500000')).toBe(500000);
    expect(aEntero(500000.5)).toBeNaN();
    expect(aEntero('500.000')).toBeNaN();
    expect(aEntero('-1')).toBeNaN();
    expect(aEntero(null)).toBeNaN();
  });
});

describe('validarReservaNueva', () => {
  it('caso feliz: recorta espacios, completa la fecha del abono con hoy', () => {
    const v = validarReservaNueva(buena, HOY);
    expect(v.ok).toBe(true);
    expect(v.datos).toEqual({
      huesped: 'Ana Pérez', telefono: '310 000 0000', entrada: '2026-10-17', salida: '2026-10-19',
      habitaciones: ['La Rosaura', 'La Clara'], personas: 11, valorTotal: 1060000,
      abono: { monto: 530000, medio: 'Nequi', fecha: HOY, nota: '' }, notas: 'Llegan tarde',
    });
  });
  it('sin abono → abono null', () => {
    const { abono, ...sinAbono } = buena;
    expect(validarReservaNueva(sinAbono, HOY).datos.abono).toBeNull();
  });
  it('acepta valorTotal y personas como cadenas de dígitos', () => {
    const v = validarReservaNueva({ ...buena, valorTotal: '1060000', personas: '11' }, HOY);
    expect(v.datos.valorTotal).toBe(1060000);
    expect(v.datos.personas).toBe(11);
  });
  it('abono mayor al valor total se acepta (el cliente ya confirmó)', () => {
    expect(validarReservaNueva({ ...buena, abono: { monto: 2000000, medio: 'Efectivo' } }, HOY).ok).toBe(true);
  });
  it.each([
    [{ huesped: '' }, 'El nombre del huésped es requerido.'],
    [{ telefono: '  ' }, 'El teléfono es requerido.'],
    [{ entrada: '17/10/2026' }, 'La fecha de llegada no es válida.'],
    [{ salida: undefined }, 'La fecha de salida no es válida.'],
    [{ entrada: '2026-10-11', salida: '2026-10-13' }, 'La fecha de llegada no puede ser anterior a hoy.'],
    [{ salida: '2026-10-17' }, 'La fecha de salida debe ser posterior a la llegada.'],
    [{ habitaciones: [] }, 'Selecciona al menos una habitación.'],
    [{ habitaciones: ['La Suite'] }, 'Hay una habitación que no existe.'],
    [{ habitaciones: ['FULL HOUSE', 'La Clara'] }, 'Full House no se combina con habitaciones sueltas.'],
    [{ personas: 0 }, 'El número de personas debe estar entre 1 y 60.'],
    [{ personas: 61 }, 'El número de personas debe estar entre 1 y 60.'],
    [{ valorTotal: 0 }, 'El valor total acordado es requerido.'],
    [{ valorTotal: 1060000.5 }, 'El valor total acordado es requerido.'],
    [{ abono: { monto: -1, medio: 'Nequi' } }, 'El monto del abono debe ser un número entero mayor que cero.'],
    [{ abono: { monto: '500.000', medio: 'Nequi' } }, 'El monto del abono debe ser un número entero mayor que cero.'],
    [{ abono: { monto: 1000, medio: 'PayPal' } }, `El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.`],
    [{ abono: { monto: 1000, medio: 'Nequi', fecha: 'ayer' } }, 'La fecha del abono no es válida.'],
    [{ abono: { monto: 1000, medio: 'Nequi', nota: 'x'.repeat(501) } }, 'La nota no puede superar 500 caracteres.'],
  ])('rechaza %o', (cambio, mensaje) => {
    expect(validarReservaNueva({ ...buena, ...cambio }, HOY)).toEqual({ ok: false, error: mensaje });
  });
  it('permite reservar para hoy mismo', () => {
    expect(validarReservaNueva({ ...buena, entrada: HOY, salida: '2026-10-13' }, HOY).ok).toBe(true);
  });
});

describe('validarPagoNuevo', () => {
  it('caso feliz con fecha explícita', () => {
    expect(validarPagoNuevo({ reservaId: 'recABCDEFGHIJKLMN', monto: '200000', medio: 'Efectivo', fecha: '2026-10-19', nota: 'Al llegar' }, HOY))
      .toEqual({ ok: true, datos: { reservaId: 'recABCDEFGHIJKLMN', monto: 200000, medio: 'Efectivo', fecha: '2026-10-19', nota: 'Al llegar' } });
  });
  it('rechaza ids que no son de Airtable', () => {
    expect(validarPagoNuevo({ reservaId: '123', monto: 1, medio: 'Nequi' }, HOY)).toEqual({ ok: false, error: 'La reserva indicada no es válida.' });
    expect(validarPagoNuevo({ reservaId: "rec' OR 1=1", monto: 1, medio: 'Nequi' }, HOY).ok).toBe(false);
  });
});

describe('validarRango', () => {
  it('caso feliz', () => {
    expect(validarRango({ desde: '2026-10-01', hasta: '2026-11-01' })).toEqual({ ok: true, datos: { desde: '2026-10-01', hasta: '2026-11-01' } });
  });
  it.each([
    [{}, 'Indica desde y hasta en formato YYYY-MM-DD.'],
    [{ desde: '2026-10-01', hasta: '2026-10-01' }, '"hasta" debe ser posterior a "desde".'],
    [{ desde: '2026-10-01', hasta: '2027-01-15' }, 'El rango no puede superar 93 días.'],
  ])('rechaza %o', (query, mensaje) => {
    expect(validarRango(query)).toEqual({ ok: false, error: mensaje });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/validar.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/validar.js`**

```js
import { esFechaISO } from '../public/js/fechas.js';
import { OPCIONES_HABITACION, FULL_HOUSE } from '../public/js/disponibilidad.js';

export const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Efectivo', 'Otro'];
export const MAX_DIAS_RANGO = 93;
const RE_RECORD = /^rec[A-Za-z0-9]{14}$/;

const error = (mensaje) => ({ ok: false, error: mensaje });

function texto(valor, max) {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

// Entero no negativo. Acepta cadenas de solo dígitos (vienen de inputs); rechaza lo demás.
export function aEntero(valor) {
  if (typeof valor === 'string') return /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : NaN;
  return Number.isInteger(valor) ? valor : NaN;
}

export function validarAbono(abono, hoy) {
  const monto = aEntero(abono?.monto);
  if (!(monto > 0)) return error('El monto del abono debe ser un número entero mayor que cero.');
  if (!MEDIOS.includes(abono?.medio)) return error(`El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.`);
  const fecha = abono.fecha == null || abono.fecha === '' ? hoy : abono.fecha;
  if (!esFechaISO(fecha)) return error('La fecha del abono no es válida.');
  if (typeof abono.nota === 'string' && abono.nota.trim().length > 500) return error('La nota no puede superar 500 caracteres.');
  return { ok: true, datos: { monto, medio: abono.medio, fecha, nota: texto(abono.nota, 500) } };
}

export function validarReservaNueva(body, hoy) {
  const huesped = texto(body.huesped, 120);
  if (!huesped) return error('El nombre del huésped es requerido.');
  const telefono = texto(body.telefono, 40);
  if (!telefono) return error('El teléfono es requerido.');
  const { entrada, salida } = body;
  if (!esFechaISO(entrada)) return error('La fecha de llegada no es válida.');
  if (!esFechaISO(salida)) return error('La fecha de salida no es válida.');
  if (entrada < hoy) return error('La fecha de llegada no puede ser anterior a hoy.');
  if (salida <= entrada) return error('La fecha de salida debe ser posterior a la llegada.');
  const habitaciones = Array.isArray(body.habitaciones) ? [...new Set(body.habitaciones)] : [];
  if (habitaciones.length === 0) return error('Selecciona al menos una habitación.');
  if (habitaciones.some((h) => !OPCIONES_HABITACION.includes(h))) return error('Hay una habitación que no existe.');
  if (habitaciones.includes(FULL_HOUSE) && habitaciones.length > 1) return error('Full House no se combina con habitaciones sueltas.');
  const personas = aEntero(body.personas);
  if (!(personas >= 1 && personas <= 60)) return error('El número de personas debe estar entre 1 y 60.');
  const valorTotal = aEntero(body.valorTotal);
  if (!(valorTotal > 0)) return error('El valor total acordado es requerido.');
  let abono = null;
  if (body.abono != null && body.abono !== '') {
    const v = validarAbono(body.abono, hoy);
    if (!v.ok) return v;
    abono = v.datos;
  }
  return {
    ok: true,
    datos: { huesped, telefono, entrada, salida, habitaciones, personas, valorTotal, abono, notas: texto(body.notas, 1000) },
  };
}

export function validarPagoNuevo(body, hoy) {
  const reservaId = typeof body.reservaId === 'string' ? body.reservaId.trim() : '';
  if (!RE_RECORD.test(reservaId)) return error('La reserva indicada no es válida.');
  const v = validarAbono(body, hoy);
  if (!v.ok) return v;
  return { ok: true, datos: { reservaId, ...v.datos } };
}

export function validarRango(query) {
  const { desde, hasta } = query ?? {};
  if (!esFechaISO(desde) || !esFechaISO(hasta)) return error('Indica desde y hasta en formato YYYY-MM-DD.');
  if (hasta <= desde) return error('"hasta" debe ser posterior a "desde".');
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
  if (dias > MAX_DIAS_RANGO) return error(`El rango no puede superar ${MAX_DIAS_RANGO} días.`);
  return { ok: true, datos: { desde, hasta } };
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/validar.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validar.js tests/validar.test.js
git commit -m "Validación de reservas, abonos y rangos para la API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `lib/pin.js` — verificación del PIN y freno a intentos

**Files:**
- Create: `lib/pin.js`, `tests/pin.test.js`

**Interfaces:**
- Produces: `pinCorrecto(recibido, esperado): boolean` (tiempo constante, recorta espacios), `esperaPorFallos(n): ms` (`0` si n < 3; `min(2^(n-3), 30) × 1000` si no), `verificarPin(pinRecibido, ip, env = process.env, ahora = Date.now()): { ok: true, esperaMs: 0 } | { ok: false, esperaMs, error, status: 401 | 500 }`, `reiniciarFallos()`, `ipDe(req): string`.

- [ ] **Step 1: Escribir los tests**

`tests/pin.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { pinCorrecto, esperaPorFallos, verificarPin, reiniciarFallos, ipDe } from '../lib/pin.js';

const ENV = { PIN_SENORAS: '123456' };

beforeEach(() => reiniciarFallos());

describe('pinCorrecto', () => {
  it('compara recortando espacios', () => {
    expect(pinCorrecto('123456', '123456')).toBe(true);
    expect(pinCorrecto(' 123456 ', '123456')).toBe(true);
  });
  it('rechaza distinto, incompleto, vacío o no texto', () => {
    expect(pinCorrecto('123457', '123456')).toBe(false);
    expect(pinCorrecto('12345', '123456')).toBe(false);
    expect(pinCorrecto('', '123456')).toBe(false);
    expect(pinCorrecto(undefined, '123456')).toBe(false);
    expect(pinCorrecto(123456, '123456')).toBe(false);
  });
});

describe('esperaPorFallos', () => {
  it('nada en los dos primeros fallos, luego crece y se topa en 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(esperaPorFallos)).toEqual([0, 0, 1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('verificarPin', () => {
  it('PIN correcto → ok y reinicia el contador de esa IP', () => {
    verificarPin('000000', '1.1.1.1', ENV);
    verificarPin('000000', '1.1.1.1', ENV);
    expect(verificarPin('123456', '1.1.1.1', ENV)).toEqual({ ok: true, esperaMs: 0 });
    expect(verificarPin('000000', '1.1.1.1', ENV).esperaMs).toBe(0); // vuelve a contar desde 1
  });
  it('fallos consecutivos de una IP acumulan espera; otra IP no se afecta', () => {
    const esperas = [1, 2, 3, 4].map(() => verificarPin('000000', '2.2.2.2', ENV).esperaMs);
    expect(esperas).toEqual([0, 0, 1000, 2000]);
    expect(verificarPin('000000', '3.3.3.3', ENV)).toEqual({ ok: false, esperaMs: 0, error: 'PIN incorrecto.', status: 401 });
  });
  it('olvida los fallos después de una hora', () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 4; i += 1) verificarPin('000000', '4.4.4.4', ENV, t0);
    expect(verificarPin('000000', '4.4.4.4', ENV, t0 + 3_600_001).esperaMs).toBe(0);
  });
  it('sin PIN configurado → error 500, nunca deja pasar', () => {
    expect(verificarPin('123456', '1.1.1.1', {})).toEqual({ ok: false, esperaMs: 0, error: 'PIN no configurado en el servidor.', status: 500 });
  });
});

describe('ipDe', () => {
  it('toma la primera IP de x-forwarded-for', () => {
    expect(ipDe({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4');
    expect(ipDe({ headers: { 'x-forwarded-for': ['9.9.9.9'] } })).toBe('9.9.9.9');
  });
  it('cae a remoteAddress o "desconocida"', () => {
    expect(ipDe({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
    expect(ipDe({ headers: {} })).toBe('desconocida');
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/pin.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/pin.js`**

```js
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

export function verificarPin(pinRecibido, ip, env = process.env, ahora = Date.now()) {
  const esperado = env.PIN_SENORAS;
  if (!esperado) return { ok: false, esperaMs: 0, error: 'PIN no configurado en el servidor.', status: 500 };
  if (pinCorrecto(pinRecibido, esperado)) {
    fallos.delete(ip);
    return { ok: true, esperaMs: 0 };
  }
  const previo = fallos.get(ip);
  const n = previo && ahora - previo.ultimo < UNA_HORA ? previo.n + 1 : 1;
  fallos.set(ip, { n, ultimo: ahora });
  return { ok: false, esperaMs: esperaPorFallos(n), error: 'PIN incorrecto.', status: 401 };
}

export function reiniciarFallos() {
  fallos.clear();
}

export function ipDe(req) {
  const xff = req.headers?.['x-forwarded-for'];
  const primera = (Array.isArray(xff) ? xff[0] : xff || '').split(',')[0].trim();
  return primera || req.socket?.remoteAddress || 'desconocida';
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/pin.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pin.js tests/pin.test.js
git commit -m "Verificación de PIN en tiempo constante con freno progresivo por IP

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `lib/airtable.js` — cliente REST con reintento y timeout

**Files:**
- Create: `lib/airtable.js`, `tests/airtable.test.js`

**Interfaces:**
- Produces: `class AirtableError extends Error { status, detalle }`, `crearCliente({ token, baseId, fetchImpl?, timeoutMs? = 8000, dormir? })` → `{ listar(tabla, { filterByFormula?, fields?, maxRecords?, sort? }): Promise<record[]>, obtener(tabla, id): Promise<record>, crear(tabla, fields): Promise<record>, actualizar(tabla, id, fields): Promise<record> }` donde `record = { id, createdTime, fields }`; `clienteDesdeEnv(env = process.env)`. Las tablas se pasan por nombre (`'Reservas'`) o id.

- [ ] **Step 1: Escribir los tests**

`tests/airtable.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { crearCliente, clienteDesdeEnv, AirtableError } from '../lib/airtable.js';

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
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/airtable.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/airtable.js`**

```js
// Cliente mínimo de la REST API de Airtable (v0). Sin dependencias.
// Un reintento tras 1 s en 429 / 5xx / error de red; timeout de 8 s por llamada.
export class AirtableError extends Error {
  constructor(mensaje, status = 0, detalle = null) {
    super(mensaje);
    this.name = 'AirtableError';
    this.status = status;
    this.detalle = detalle;
  }
}

const dormirReal = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function agregarQuery(url, query) {
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor == null) continue;
    if (clave === 'fields') valor.forEach((f) => url.searchParams.append('fields[]', f));
    else if (clave === 'sort') {
      valor.forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field);
        url.searchParams.set(`sort[${i}][direction]`, s.direction ?? 'asc');
      });
    } else url.searchParams.set(clave, String(valor));
  }
}

export function crearCliente({ token, baseId, fetchImpl = globalThis.fetch, timeoutMs = 8000, dormir = dormirReal }) {
  const base = `https://api.airtable.com/v0/${baseId}`;

  async function llamar(metodo, ruta, { query, body } = {}, intento = 0) {
    const url = new URL(`${base}/${ruta}`);
    agregarQuery(url, query);
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);
    let respuesta;
    try {
      respuesta = await fetchImpl(url.toString(), {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: control.signal,
      });
    } catch (e) {
      clearTimeout(temporizador);
      if (intento === 0) { await dormir(1000); return llamar(metodo, ruta, { query, body }, 1); }
      throw new AirtableError('Airtable no responde.', 0, e.message);
    }
    clearTimeout(temporizador);
    if (respuesta.status === 429 || respuesta.status >= 500) {
      if (intento === 0) { await dormir(1000); return llamar(metodo, ruta, { query, body }, 1); }
      throw new AirtableError(`Airtable respondió ${respuesta.status}.`, respuesta.status);
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new AirtableError(datos?.error?.message || `Error ${respuesta.status} de Airtable.`, respuesta.status, datos);
    }
    return datos;
  }

  return {
    async listar(tabla, { filterByFormula, fields, maxRecords, sort } = {}) {
      const registros = [];
      let offset;
      let paginas = 0;
      do {
        const datos = await llamar('GET', encodeURIComponent(tabla), {
          query: { filterByFormula, fields, maxRecords, sort, offset, pageSize: 100 },
        });
        registros.push(...(datos.records ?? []));
        offset = datos.offset;
        paginas += 1;
      } while (offset && paginas < 10);
      return registros;
    },
    obtener(tabla, id) {
      return llamar('GET', `${encodeURIComponent(tabla)}/${id}`);
    },
    crear(tabla, fields) {
      return llamar('POST', encodeURIComponent(tabla), { body: { fields, typecast: true } });
    },
    actualizar(tabla, id, fields) {
      return llamar('PATCH', `${encodeURIComponent(tabla)}/${id}`, { body: { fields, typecast: true } });
    },
  };
}

export function clienteDesdeEnv(env = process.env) {
  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) {
    throw new AirtableError('Faltan las variables AIRTABLE_TOKEN y/o AIRTABLE_BASE_ID.', 500);
  }
  return crearCliente({ token: env.AIRTABLE_TOKEN, baseId: env.AIRTABLE_BASE_ID });
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/airtable.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/airtable.js tests/airtable.test.js
git commit -m "Cliente REST de Airtable con reintento, timeout y paginación

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `lib/airtable-falso.js` — Airtable en memoria para desarrollo y tests

**Files:**
- Create: `lib/airtable-falso.js`, `tests/airtable-falso.test.js`

**Interfaces:**
- Consumes: `AirtableError` (T8), `seSolapan` (T3), `sumarDias` (T1).
- Produces: `crearClienteFalso(): cliente` con la misma interfaz que T8 (`listar/obtener/crear/actualizar`) más `_tablas` (Map por tabla, solo para inspección en tests); `sembrarDemo(cliente, hoy): Promise<{ a, b, c }>` crea 3 reservas de ejemplo y sus pagos. Soporta exactamente las dos fórmulas que genera `lib/reservas.js` (T10): la de rango de fechas y la de `RECORD_ID()`; cualquier otra lanza error.

- [ ] **Step 1: Escribir los tests**

`tests/airtable-falso.test.js`:
```js
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
    expect(Object.keys(ids)).toEqual(['a', 'b', 'c']);
    expect(await cliente.listar('Reservas')).toHaveLength(3);
    expect(await cliente.listar('Pagos')).toHaveLength(3);
    expect((await cliente.obtener('Reservas', ids.c)).fields['Pagos']).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/airtable-falso.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/airtable-falso.js`**

```js
// Airtable en memoria: misma interfaz que lib/airtable.js. Sirve para correr la app
// localmente sin token (npm run dev:falso) y para probar la API sin red.
import { AirtableError } from './airtable.js';
import { seSolapan } from '../public/js/disponibilidad.js';
import { sumarDias } from '../public/js/fechas.js';

let contador = 0;
const nuevoId = () => `rec${String((contador += 1)).padStart(14, '0')}`;

const RE_RANGO = /IS_BEFORE\(\{Fecha entrada\}, DATETIME_PARSE\('(\d{4}-\d{2}-\d{2})'.*IS_AFTER\(\{Fecha salida\}, DATETIME_PARSE\('(\d{4}-\d{2}-\d{2})'/;
const RE_IDS = /RECORD_ID\(\)='(rec[A-Za-z0-9]{14})'/g;

function filtrar(registros, formula) {
  if (!formula) return registros;
  const rango = formula.match(RE_RANGO);
  if (rango) {
    const [, hasta, desde] = rango;
    return registros.filter((r) => seSolapan(
      { entrada: r.fields['Fecha entrada'], salida: r.fields['Fecha salida'] },
      { entrada: desde, salida: hasta },
    ));
  }
  const ids = [...formula.matchAll(RE_IDS)].map((m) => m[1]);
  if (ids.length) return registros.filter((r) => ids.includes(r.id));
  throw new Error(`Fórmula no soportada por el Airtable falso: ${formula}`);
}

const copiar = (reg) => JSON.parse(JSON.stringify(reg));

export function crearClienteFalso() {
  const tablas = { Reservas: new Map(), Pagos: new Map() };

  function tablaDe(nombre) {
    const tabla = tablas[nombre];
    if (!tabla) throw new AirtableError(`La tabla ${nombre} no existe.`, 404);
    return tabla;
  }

  function insertar(nombre, fields) {
    const tabla = tablaDe(nombre);
    const reg = { id: nuevoId(), createdTime: new Date().toISOString(), fields: { ...fields } };
    if (nombre === 'Pagos') {
      for (const reservaId of fields['Reserva'] ?? []) {
        const reserva = tablas.Reservas.get(reservaId);
        if (!reserva) throw new AirtableError('La reserva vinculada no existe.', 422);
        reserva.fields['Pagos'] = [...(reserva.fields['Pagos'] ?? []), reg.id];
      }
    }
    tabla.set(reg.id, reg);
    return copiar(reg);
  }

  return {
    async listar(nombre, { filterByFormula, maxRecords, sort } = {}) {
      let regs = filtrar([...tablaDe(nombre).values()], filterByFormula);
      for (const s of [...(sort ?? [])].reverse()) {
        const signo = s.direction === 'desc' ? -1 : 1;
        regs.sort((a, b) => signo * String(a.fields[s.field] ?? '').localeCompare(String(b.fields[s.field] ?? '')));
      }
      if (maxRecords) regs = regs.slice(0, maxRecords);
      return regs.map(copiar);
    },
    async obtener(nombre, id) {
      const reg = tablaDe(nombre).get(id);
      if (!reg) throw new AirtableError('Registro no encontrado.', 404);
      return copiar(reg);
    },
    async crear(nombre, fields) {
      return insertar(nombre, fields);
    },
    async actualizar(nombre, id, fields) {
      const reg = tablaDe(nombre).get(id);
      if (!reg) throw new AirtableError('Registro no encontrado.', 404);
      Object.assign(reg.fields, fields);
      return copiar(reg);
    },
    _tablas: tablas,
  };
}

// Tres reservas alrededor de `hoy`: una confirmada con anticipo, un Full House
// pendiente y una en curso ya pagada.
export async function sembrarDemo(cliente, hoy) {
  const a = await cliente.crear('Reservas', {
    'Huésped': 'Ana Pérez', 'Teléfono': '310 000 0000', 'Fecha entrada': sumarDias(hoy, 5), 'Fecha salida': sumarDias(hoy, 7),
    'Habitaciones': ['La Rosaura', 'La Clara'], 'Personas': 11, 'Valor total': 1060000, 'Estado': 'Confirmado', 'Notas': 'Llegan tarde',
  });
  await cliente.crear('Pagos', { 'Concepto': 'Anticipo · Ana Pérez', 'Reserva': [a.id], 'Fecha': hoy, 'Monto': 530000, 'Medio': 'Nequi' });
  const b = await cliente.crear('Reservas', {
    'Huésped': 'Familia Gómez', 'Teléfono': '+57 300 111 2233', 'Fecha entrada': sumarDias(hoy, 12), 'Fecha salida': sumarDias(hoy, 14),
    'Habitaciones': ['FULL HOUSE'], 'Personas': 26, 'Valor total': 2100000, 'Estado': 'Anticipo pendiente',
  });
  const c = await cliente.crear('Reservas', {
    'Huésped': 'Carlos Ruiz', 'Teléfono': '3155550000', 'Fecha entrada': sumarDias(hoy, -2), 'Fecha salida': sumarDias(hoy, 1),
    'Habitaciones': ['La Yaneth'], 'Personas': 4, 'Valor total': 630000, 'Estado': 'Confirmado',
  });
  await cliente.crear('Pagos', { 'Concepto': 'Anticipo · Carlos Ruiz', 'Reserva': [c.id], 'Fecha': sumarDias(hoy, -10), 'Monto': 315000, 'Medio': 'Bancolombia' });
  await cliente.crear('Pagos', { 'Concepto': 'Abono · Carlos Ruiz', 'Reserva': [c.id], 'Fecha': sumarDias(hoy, -2), 'Monto': 315000, 'Medio': 'Efectivo', 'Nota': 'Pago al llegar' });
  return { a: a.id, b: b.id, c: c.id };
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/airtable-falso.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/airtable-falso.js tests/airtable-falso.test.js
git commit -m "Airtable falso en memoria con datos de demostración

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `lib/reservas.js` — mapeo Airtable ⇄ API, fórmulas y consultas

**Files:**
- Create: `lib/reservas.js`, `tests/reservas.test.js`

**Interfaces:**
- Consumes: `noches`, `esFechaISO` (T1), `resumenPagos` (T4), cliente (T8/T9).
- Produces: `ESTADOS = { confirmado: 'Confirmado', pendiente: 'Anticipo pendiente' }`, `tablasDesdeEnv(env): { reservas, pagos }`, `formulaRango(desde, hasta): string`, `formulaIds(ids): string`, `aPagoApi(reg): { id, fecha, monto, medio, nota }`, `aReservaApi(reg, pagos = []): reservaApi`, `ordenarPagos(pagos)`, `cargarPagosPorIds(cliente, tablaPagos, ids)`, `listarReservasEnRango(cliente, tablas, desde, hasta): reg[]`, `cargarReservasConPagos(cliente, tablas, desde, hasta): reservaApi[]`, `camposReservaNueva(datos)`, `camposPagoNuevo({ reservaId, huesped, esPrimero, monto, medio, fecha, nota })`.
- `reservaApi = { id, huesped, telefono, entrada, salida, noches, habitaciones, personas, estado, notas, valorTotal, pagado, saldo, estadoPago, pagos }`.

- [ ] **Step 1: Escribir los tests**

`tests/reservas.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import {
  formulaRango, formulaIds, aPagoApi, aReservaApi, cargarReservasConPagos, cargarPagosPorIds,
  camposReservaNueva, camposPagoNuevo, tablasDesdeEnv, ESTADOS,
} from '../lib/reservas.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';

describe('fórmulas', () => {
  it('rango: entrada antes de hasta y salida después de desde', () => {
    expect(formulaRango('2026-10-01', '2026-11-01')).toBe(
      "AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('2026-11-01', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('2026-10-01', 'YYYY-MM-DD')))",
    );
  });
  it('rango rechaza lo que no sea fecha ISO (nunca interpola texto libre)', () => {
    expect(() => formulaRango("2026-10-01' OR 1", '2026-11-01')).toThrow();
  });
  it('ids: OR de RECORD_ID() y rechaza ids malformados', () => {
    expect(formulaIds(['recAAAAAAAAAAAAAA', 'recBBBBBBBBBBBBBB'])).toBe("OR(RECORD_ID()='recAAAAAAAAAAAAAA',RECORD_ID()='recBBBBBBBBBBBBBB')");
    expect(() => formulaIds(["rec'"])).toThrow();
  });
});

describe('mapeo', () => {
  const reg = {
    id: 'recR', fields: {
      'Huésped': 'Ana', 'Teléfono': '310', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19',
      'Habitaciones': ['La Rosaura'], 'Personas': 4, 'Estado': 'Confirmado', 'Notas': 'x', 'Valor total': 1060000,
    },
  };
  it('reserva con pagos → resumen calculado', () => {
    const r = aReservaApi(reg, [{ id: 'p1', fecha: '2026-10-12', monto: 530000, medio: 'Nequi', nota: '' }]);
    expect(r).toMatchObject({ id: 'recR', huesped: 'Ana', noches: 2, estado: 'Confirmado', valorTotal: 1060000, pagado: 530000, saldo: 530000, estadoPago: 'parcial' });
    expect(r.pagos).toHaveLength(1);
  });
  it('tolera selects como objetos {name} y valor total ausente', () => {
    const r = aReservaApi({ id: 'r', fields: { 'Habitaciones': [{ name: 'La Elsa' }], 'Estado': { name: 'Anticipo pendiente' } } });
    expect(r.habitaciones).toEqual(['La Elsa']);
    expect(r.estado).toBe('Anticipo pendiente');
    expect(r).toMatchObject({ valorTotal: null, saldo: null, estadoPago: 'sin_valor', noches: 0, pagos: [] });
  });
  it('pago', () => {
    expect(aPagoApi({ id: 'p', fields: { 'Fecha': '2026-10-12', 'Monto': 1000, 'Medio': { name: 'Nequi' } } }))
      .toEqual({ id: 'p', fecha: '2026-10-12', monto: 1000, medio: 'Nequi', nota: '' });
  });
  it('campos para crear reserva y pago', () => {
    const datos = { huesped: 'Ana', telefono: '310', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'], personas: 4, valorTotal: 1060000, abono: { monto: 1 }, notas: '' };
    expect(camposReservaNueva(datos)).toEqual({
      'Huésped': 'Ana', 'Teléfono': '310', 'Fecha entrada': '2026-10-17', 'Fecha salida': '2026-10-19',
      'Habitaciones': ['La Rosaura'], 'Personas': 4, 'Valor total': 1060000, 'Estado': 'Confirmado',
    });
    expect(camposReservaNueva({ ...datos, abono: null, notas: 'tarde' })).toMatchObject({ 'Estado': 'Anticipo pendiente', 'Notas': 'tarde' });
    expect(camposPagoNuevo({ reservaId: 'recR', huesped: 'Ana', esPrimero: true, monto: 500, medio: 'Nequi', fecha: '2026-10-12', nota: '' }))
      .toEqual({ 'Concepto': 'Anticipo · Ana', 'Reserva': ['recR'], 'Fecha': '2026-10-12', 'Monto': 500, 'Medio': 'Nequi' });
    expect(camposPagoNuevo({ reservaId: 'recR', huesped: 'Ana', esPrimero: false, monto: 500, medio: 'Efectivo', fecha: '2026-10-19', nota: 'al llegar' }))
      .toMatchObject({ 'Concepto': 'Abono · Ana', 'Nota': 'al llegar' });
  });
  it('tablas por defecto y por env', () => {
    expect(tablasDesdeEnv({})).toEqual({ reservas: 'Reservas', pagos: 'Pagos' });
    expect(tablasDesdeEnv({ AIRTABLE_TABLA_RESERVAS: 'tbl1', AIRTABLE_TABLA_PAGOS: 'tbl2' })).toEqual({ reservas: 'tbl1', pagos: 'tbl2' });
    expect(ESTADOS.confirmado).toBe('Confirmado');
  });
});

describe('cargarReservasConPagos', () => {
  it('trae reservas del rango con sus pagos ordenados por fecha', async () => {
    const cliente = crearClienteFalso();
    const ids = await sembrarDemo(cliente, '2026-10-12');
    const reservas = await cargarReservasConPagos(cliente, tablasDesdeEnv({}), '2026-10-12', '2026-11-12');
    expect(reservas.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]); // orden por Fecha entrada
    const c = reservas.find((r) => r.id === ids.c);
    expect(c.pagos.map((p) => p.fecha)).toEqual(['2026-10-02', '2026-10-10']);
    expect(c).toMatchObject({ pagado: 630000, saldo: 0, estadoPago: 'pagado' });
    expect(reservas.find((r) => r.id === ids.b)).toMatchObject({ pagado: 0, estadoPago: 'sin_anticipo', pagos: [] });
  });
  it('pide los pagos en lotes de 40 ids', async () => {
    const ids = Array.from({ length: 41 }, (_, i) => `rec${String(i).padStart(14, '0')}`);
    const cliente = { listar: vi.fn(async (tabla, { filterByFormula }) => (
      [...filterByFormula.matchAll(/RECORD_ID\(\)='(rec\w{14})'/g)].map((m) => ({ id: m[1], fields: { 'Monto': 1, 'Fecha': '2026-10-01' } }))
    )) };
    const pagos = await cargarPagosPorIds(cliente, 'Pagos', ids);
    expect(pagos).toHaveLength(41);
    expect(cliente.listar).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/reservas.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/reservas.js`**

```js
import { noches, esFechaISO } from '../public/js/fechas.js';
import { resumenPagos } from '../public/js/pagos.js';

export const ESTADOS = { confirmado: 'Confirmado', pendiente: 'Anticipo pendiente' };
const RE_RECORD = /^rec[A-Za-z0-9]{14}$/;
const TAMANO_LOTE = 40;

export function tablasDesdeEnv(env = process.env) {
  return { reservas: env.AIRTABLE_TABLA_RESERVAS || 'Reservas', pagos: env.AIRTABLE_TABLA_PAGOS || 'Pagos' };
}

// Solo se interpolan fechas ISO validadas e ids con forma de Airtable: nunca texto libre.
export function formulaRango(desde, hasta) {
  if (!esFechaISO(desde) || !esFechaISO(hasta)) throw new Error('formulaRango requiere fechas ISO.');
  return `AND(IS_BEFORE({Fecha entrada}, DATETIME_PARSE('${hasta}', 'YYYY-MM-DD')), IS_AFTER({Fecha salida}, DATETIME_PARSE('${desde}', 'YYYY-MM-DD')))`;
}

export function formulaIds(ids) {
  if (!ids.length || ids.some((id) => !RE_RECORD.test(id))) throw new Error('formulaIds recibió un id inválido.');
  return `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
}

// La REST API devuelve selects como texto; otras rutas (MCP) como { name }.
const nombreOpcion = (valor) => (typeof valor === 'string' ? valor : valor?.name ?? null);

export function aPagoApi(reg) {
  const f = reg.fields ?? {};
  return { id: reg.id, fecha: f['Fecha'] ?? null, monto: Number(f['Monto']) || 0, medio: nombreOpcion(f['Medio']), nota: f['Nota'] ?? '' };
}

export function ordenarPagos(pagos) {
  return [...pagos].sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')));
}

export function aReservaApi(reg, pagos = []) {
  const f = reg.fields ?? {};
  const entrada = f['Fecha entrada'] ?? null;
  const salida = f['Fecha salida'] ?? null;
  const valorTotal = f['Valor total'] == null ? null : Number(f['Valor total']);
  const pagosOrdenados = ordenarPagos(pagos);
  return {
    id: reg.id,
    huesped: f['Huésped'] ?? '',
    telefono: f['Teléfono'] ?? '',
    entrada,
    salida,
    noches: entrada && salida ? noches(entrada, salida) : 0,
    habitaciones: (f['Habitaciones'] ?? []).map(nombreOpcion),
    personas: Number(f['Personas']) || 0,
    estado: nombreOpcion(f['Estado']) ?? ESTADOS.pendiente,
    notas: f['Notas'] ?? '',
    valorTotal,
    ...resumenPagos(valorTotal, pagosOrdenados),
    pagos: pagosOrdenados,
  };
}

export async function cargarPagosPorIds(cliente, tablaPagos, ids) {
  const pagos = [];
  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    const regs = await cliente.listar(tablaPagos, { filterByFormula: formulaIds(ids.slice(i, i + TAMANO_LOTE)) });
    pagos.push(...regs.map(aPagoApi));
  }
  return ordenarPagos(pagos);
}

export function listarReservasEnRango(cliente, tablas, desde, hasta) {
  return cliente.listar(tablas.reservas, {
    filterByFormula: formulaRango(desde, hasta),
    sort: [{ field: 'Fecha entrada', direction: 'asc' }],
  });
}

export async function cargarReservasConPagos(cliente, tablas, desde, hasta) {
  const regs = await listarReservasEnRango(cliente, tablas, desde, hasta);
  const pagos = await cargarPagosPorIds(cliente, tablas.pagos, regs.flatMap((r) => r.fields['Pagos'] ?? []));
  const porId = new Map(pagos.map((p) => [p.id, p]));
  return regs.map((r) => aReservaApi(r, (r.fields['Pagos'] ?? []).map((id) => porId.get(id)).filter(Boolean)));
}

export function camposReservaNueva(datos) {
  return {
    'Huésped': datos.huesped,
    'Teléfono': datos.telefono,
    'Fecha entrada': datos.entrada,
    'Fecha salida': datos.salida,
    'Habitaciones': datos.habitaciones,
    'Personas': datos.personas,
    'Valor total': datos.valorTotal,
    'Estado': datos.abono ? ESTADOS.confirmado : ESTADOS.pendiente,
    ...(datos.notas ? { 'Notas': datos.notas } : {}),
  };
}

export function camposPagoNuevo({ reservaId, huesped, esPrimero, monto, medio, fecha, nota }) {
  return {
    'Concepto': `${esPrimero ? 'Anticipo' : 'Abono'} · ${huesped}`,
    'Reserva': [reservaId],
    'Fecha': fecha,
    'Monto': monto,
    'Medio': medio,
    ...(nota ? { 'Nota': nota } : {}),
  };
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/reservas.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reservas.js tests/reservas.test.js
git commit -m "Mapeo Airtable ⇄ API, fórmulas seguras y carga de reservas con pagos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `lib/http.js` + `api/salud.js` — helpers HTTP y verificación para el monitor

**Files:**
- Create: `lib/http.js`, `api/salud.js`, `tests/ayudas.js`, `tests/salud.test.js`

**Interfaces:**
- Consumes: `verificarPin`, `ipDe` (T7), `AirtableError`, `clienteDesdeEnv` (T8), `tablasDesdeEnv` (T10).
- Produces (`lib/http.js`): `responder(res, status, cuerpo)`, `dormir(ms)`, `sinCache(res)`, `exigirPin(req, res, deps): Promise<boolean>` (responde 401/500 y devuelve `false` si falla), `manejarError(res, e)`.
- Produces (`api/salud.js`): `crearHandler(deps = { cliente?, env? })` y `export default crearHandler()`. Las funciones Vercel reciben `(req, res)` con `req.method`, `req.query`, `req.headers` (en minúsculas), `req.body` (JSON ya parseado) y `res.status(n).json(obj)`, `res.setHeader`.
- Produces (`tests/ayudas.js`): `crearReq({ method, query, body, pin, ip })`, `crearRes()`, `ENV = { PIN_SENORAS: '123456' }`.

- [ ] **Step 1: Escribir ayudas y tests**

`tests/ayudas.js`:
```js
export const ENV = { PIN_SENORAS: '123456' };

export function crearReq({ method = 'GET', query = {}, body, pin = '123456', ip = '1.1.1.1' } = {}) {
  return { method, query, body, headers: { 'x-pin': pin, 'x-forwarded-for': ip } };
}

export function crearRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(clave, valor) { this.headers[clave] = valor; },
    status(codigo) { this.statusCode = codigo; return this; },
    json(cuerpo) { this.body = cuerpo; return this; },
  };
}
```

`tests/salud.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { crearHandler } from '../api/salud.js';
import { crearClienteFalso } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { crearReq, crearRes } from './ayudas.js';

describe('GET /api/salud', () => {
  it('200 cuando Airtable responde; sin datos de huéspedes y sin caché', async () => {
    const res = crearRes();
    await crearHandler({ cliente: crearClienteFalso() })(crearReq({ pin: '' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, airtable: 'ok' });
    expect(JSON.stringify(res.body)).not.toMatch(/Huésped|reservas/);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
  it('503 cuando Airtable falla', async () => {
    const cliente = { listar: async () => { throw new AirtableError('Airtable respondió 503.', 503); } };
    const res = crearRes();
    await crearHandler({ cliente })(crearReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, airtable: 'error', error: 'Airtable respondió 503.' });
  });
  it('503 si faltan variables de entorno', async () => {
    const res = crearRes();
    await crearHandler({ env: {} })(crearReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/AIRTABLE_TOKEN/);
  });
  it('405 en otros métodos', async () => {
    const res = crearRes();
    await crearHandler({ cliente: crearClienteFalso() })(crearReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/salud.test.js` → FAIL (módulos no existen).

- [ ] **Step 3: Implementar `lib/http.js`**

```js
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
```

- [ ] **Step 4: Implementar `api/salud.js`**

```js
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
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run tests/salud.test.js` → PASS. Luego `npm test` completo → todo PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/http.js api/salud.js tests/ayudas.js tests/salud.test.js
git commit -m "Helpers HTTP y endpoint /api/salud para el monitor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `api/reservas.js` — GET por rango y POST con validación de disponibilidad

**Files:**
- Create: `api/reservas.js`, `tests/api-reservas.test.js`

**Interfaces:**
- Consumes: T3 `buscarConflicto`, T1 `hoyBogota`, T6 `validarRango`/`validarReservaNueva`, T8 `clienteDesdeEnv`, T10 todo, T11 helpers.
- Produces: `crearHandler(deps = { cliente?, env?, dormir?, ahora?: () => Date })`, `export default crearHandler()`. Contrato: §7.2 y §7.3 del spec.

- [ ] **Step 1: Escribir los tests**

`tests/api-reservas.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/reservas.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { AirtableError } from '../lib/airtable.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota, sumarDias } from '../public/js/fechas.js';
import { crearReq, crearRes, ENV } from './ayudas.js';

const hoy = hoyBogota();
const d = (n) => sumarDias(hoy, n);
let cliente; let ids; let handler; let dormir;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  dormir = vi.fn(async () => {});
  handler = crearHandler({ cliente, env: ENV, dormir });
});

const llamar = async (req) => { const res = crearRes(); await handler(req, res); return res; };

const nueva = (extra = {}) => ({
  huesped: 'Luisa Mora', telefono: '320 555 1234', entrada: d(5), salida: d(7),
  habitaciones: ['La Elsa'], personas: 5, valorTotal: 480000, abono: { monto: 240000, medio: 'Nequi' }, ...extra,
});

describe('método y PIN', () => {
  it('405 para PUT', async () => {
    expect((await llamar(crearReq({ method: 'PUT' }))).statusCode).toBe(405);
  });
  it('401 con PIN malo, sin espera las dos primeras veces y con espera a la tercera', async () => {
    const res1 = await llamar(crearReq({ pin: '000000', query: { desde: hoy, hasta: d(1) } }));
    expect(res1.statusCode).toBe(401);
    expect(res1.body).toEqual({ ok: false, error: 'PIN incorrecto.' });
    await llamar(crearReq({ pin: '000000' }));
    await llamar(crearReq({ pin: '000000' }));
    expect(dormir).toHaveBeenCalledTimes(1);
    expect(dormir).toHaveBeenCalledWith(1000);
  });
  it('500 si el servidor no tiene PIN configurado', async () => {
    const res = crearRes();
    await crearHandler({ cliente, env: {} })(crearReq(), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('GET', () => {
  it('400 sin rango', async () => {
    const res = await llamar(crearReq());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/desde y hasta/);
  });
  it('200 con las reservas del rango y sus pagos', async () => {
    const res = await llamar(crearReq({ query: { desde: hoy, hasta: d(31) } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, desde: hoy, hasta: d(31) });
    expect(res.body.reservas.map((r) => r.id)).toEqual([ids.c, ids.a, ids.b]);
    expect(res.body.reservas[1]).toMatchObject({ huesped: 'Ana Pérez', pagado: 530000, saldo: 530000, estadoPago: 'parcial' });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});

describe('POST', () => {
  it('400 con datos inválidos', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva({ personas: 0 }) }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('El número de personas debe estar entre 1 y 60.');
  });
  it('409 si la habitación ya está tomada en esas noches', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva({ habitaciones: ['La Rosaura'], entrada: d(6), salida: d(8) }) }));
    expect(res.statusCode).toBe(409);
    expect(res.body.conflicto).toMatchObject({ huesped: 'Ana Pérez', entrada: d(5), salida: d(7) });
    expect(res.body.error).toMatch(/La Rosaura, La Clara ya está reservada/);
  });
  it('409 si hay Full House en esas noches, aunque sea otra habitación', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva({ entrada: d(13), salida: d(15) }) }));
    expect(res.statusCode).toBe(409);
  });
  it('201 con abono: crea reserva Confirmada y su primer pago', async () => {
    const res = await llamar(crearReq({ method: 'POST', body: nueva() }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true, id: expect.stringMatching(/^rec/), estado: 'Confirmado', abonoRegistrado: true });
    const reg = await cliente.obtener('Reservas', res.body.id);
    expect(reg.fields).toMatchObject({ 'Huésped': 'Luisa Mora', 'Valor total': 480000, 'Estado': 'Confirmado' });
    const pago = await cliente.obtener('Pagos', reg.fields['Pagos'][0]);
    expect(pago.fields).toMatchObject({ 'Concepto': 'Anticipo · Luisa Mora', 'Monto': 240000, 'Medio': 'Nequi', 'Fecha': hoy });
  });
  it('201 sin abono: queda Anticipo pendiente', async () => {
    const { abono, ...sinAbono } = nueva();
    const res = await llamar(crearReq({ method: 'POST', body: sinAbono }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ estado: 'Anticipo pendiente', abonoRegistrado: false });
    expect(res.body.advertencia).toBeUndefined();
  });
  it('201 con advertencia si la reserva se creó pero el pago falló; el estado vuelve a pendiente', async () => {
    const roto = { ...cliente, crear: (tabla, f) => (tabla === 'Pagos' ? Promise.reject(new AirtableError('caído', 503)) : cliente.crear(tabla, f)) };
    const res = crearRes();
    await crearHandler({ cliente: roto, env: ENV, dormir })(crearReq({ method: 'POST', body: nueva() }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ abonoRegistrado: false, estado: 'Anticipo pendiente', advertencia: expect.stringMatching(/Regístralo desde el calendario/) });
    expect((await cliente.obtener('Reservas', res.body.id)).fields['Estado']).toBe('Anticipo pendiente');
  });
  it('502 si Airtable no responde', async () => {
    const caido = { listar: async () => { throw new AirtableError('Airtable respondió 503.', 503); } };
    const res = crearRes();
    await crearHandler({ cliente: caido, env: ENV, dormir })(crearReq({ method: 'POST', body: nueva() }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/Airtable no está disponible/);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/api-reservas.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `api/reservas.js`**

```js
import { clienteDesdeEnv } from '../lib/airtable.js';
import {
  tablasDesdeEnv, cargarReservasConPagos, listarReservasEnRango, aReservaApi,
  camposReservaNueva, camposPagoNuevo, ESTADOS,
} from '../lib/reservas.js';
import { validarRango, validarReservaNueva } from '../lib/validar.js';
import { responder, exigirPin, manejarError, sinCache } from '../lib/http.js';
import { buscarConflicto } from '../public/js/disponibilidad.js';
import { hoyBogota } from '../public/js/fechas.js';

export function crearHandler(deps = {}) {
  return async function handler(req, res) {
    sinCache(res);
    if (req.method !== 'GET' && req.method !== 'POST') return responder(res, 405, { ok: false, error: 'Método no permitido.' });
    if (!(await exigirPin(req, res, deps))) return undefined;
    try {
      const cliente = deps.cliente ?? clienteDesdeEnv(deps.env);
      const tablas = tablasDesdeEnv(deps.env);

      if (req.method === 'GET') {
        const v = validarRango(req.query ?? {});
        if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
        const reservas = await cargarReservasConPagos(cliente, tablas, v.datos.desde, v.datos.hasta);
        return responder(res, 200, { ok: true, ...v.datos, reservas });
      }

      const hoy = hoyBogota(deps.ahora ? deps.ahora() : new Date());
      const v = validarReservaNueva(req.body ?? {}, hoy);
      if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
      const datos = v.datos;

      // Validación definitiva de disponibilidad (la del celular es solo previa).
      const existentes = (await listarReservasEnRango(cliente, tablas, datos.entrada, datos.salida)).map((r) => aReservaApi(r));
      const conflicto = buscarConflicto({ entrada: datos.entrada, salida: datos.salida, habitaciones: datos.habitaciones }, existentes);
      if (conflicto) {
        return responder(res, 409, {
          ok: false,
          error: `${conflicto.habitaciones.join(', ')} ya está reservada del ${conflicto.entrada} al ${conflicto.salida} (${conflicto.huesped}). Verifica las fechas.`,
          conflicto: { huesped: conflicto.huesped, habitaciones: conflicto.habitaciones, entrada: conflicto.entrada, salida: conflicto.salida },
        });
      }

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
    } catch (e) {
      return manejarError(res, e);
    }
  };
}

export default crearHandler();
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/api-reservas.test.js` → PASS. `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add api/reservas.js tests/api-reservas.test.js
git commit -m "Endpoint /api/reservas: lista por rango y crea con validación de disponibilidad

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `api/pagos.js` — registrar un abono

**Files:**
- Create: `api/pagos.js`, `tests/api-pagos.test.js`

**Interfaces:**
- Consumes: T6 `validarPagoNuevo`, T10 (`aReservaApi`, `aPagoApi`, `camposPagoNuevo`, `cargarPagosPorIds`, `ESTADOS`, `tablasDesdeEnv`), T4 `resumenPagos`, T11 helpers.
- Produces: `crearHandler(deps)`, `export default crearHandler()`. Contrato §7.4 del spec: `201 { ok, pago: { id, fecha, monto, medio, nota }, resumen: { valorTotal, pagado, saldo, estadoPago, estado } }`.

- [ ] **Step 1: Escribir los tests**

`tests/api-pagos.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crearHandler } from '../api/pagos.js';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { reiniciarFallos } from '../lib/pin.js';
import { hoyBogota } from '../public/js/fechas.js';
import { crearReq, crearRes, ENV } from './ayudas.js';

const hoy = hoyBogota();
let cliente; let ids; let handler;

beforeEach(async () => {
  reiniciarFallos();
  cliente = crearClienteFalso();
  ids = await sembrarDemo(cliente, hoy);
  handler = crearHandler({ cliente, env: ENV, dormir: vi.fn(async () => {}) });
});

const llamar = async (body, extra = {}) => { const res = crearRes(); await handler(crearReq({ method: 'POST', body, ...extra }), res); return res; };

describe('POST /api/pagos', () => {
  it('405 para GET', async () => {
    const res = crearRes();
    await handler(crearReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
  it('401 con PIN malo', async () => {
    expect((await llamar({ reservaId: ids.b, monto: 1000, medio: 'Nequi' }, { pin: '999999' })).statusCode).toBe(401);
  });
  it('400 con datos inválidos', async () => {
    const res = await llamar({ reservaId: ids.b, monto: 'mil', medio: 'Nequi' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('El monto del abono debe ser un número entero mayor que cero.');
  });
  it('404 si la reserva no existe', async () => {
    const res = await llamar({ reservaId: 'recNoExiste000000', monto: 1000, medio: 'Nequi' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'La reserva no existe.' });
  });
  it('201: primer abono de una reserva pendiente → Concepto "Anticipo", pasa a Confirmado', async () => {
    const res = await llamar({ reservaId: ids.b, monto: 1000000, medio: 'Bancolombia', nota: 'Transferencia' });
    expect(res.statusCode).toBe(201);
    expect(res.body.pago).toMatchObject({ id: expect.stringMatching(/^rec/), fecha: hoy, monto: 1000000, medio: 'Bancolombia', nota: 'Transferencia' });
    expect(res.body.resumen).toEqual({ valorTotal: 2100000, pagado: 1000000, saldo: 1100000, estadoPago: 'parcial', estado: 'Confirmado' });
    const reg = await cliente.obtener('Reservas', ids.b);
    expect(reg.fields['Estado']).toBe('Confirmado');
    expect((await cliente.obtener('Pagos', reg.fields['Pagos'][0])).fields['Concepto']).toBe('Anticipo · Familia Gómez');
  });
  it('201: segundo abono → Concepto "Abono", fecha explícita, resumen acumulado', async () => {
    await llamar({ reservaId: ids.b, monto: 1000000, medio: 'Bancolombia' });
    const res = await llamar({ reservaId: ids.b, monto: 1100000, medio: 'Efectivo', fecha: '2026-12-24' });
    expect(res.body.resumen).toMatchObject({ pagado: 2100000, saldo: 0, estadoPago: 'pagado' });
    expect(res.body.pago.fecha).toBe('2026-12-24');
    const reg = await cliente.obtener('Reservas', ids.b);
    expect((await cliente.obtener('Pagos', reg.fields['Pagos'][1])).fields['Concepto']).toBe('Abono · Familia Gómez');
  });
  it('no toca el Estado de una reserva ya confirmada', async () => {
    const espia = vi.spyOn(cliente, 'actualizar');
    const res = await llamar({ reservaId: ids.a, monto: 530000, medio: 'Nequi' });
    expect(res.statusCode).toBe(201);
    expect(res.body.resumen).toMatchObject({ pagado: 1060000, saldo: 0, estadoPago: 'pagado', estado: 'Confirmado' });
    expect(espia).not.toHaveBeenCalled();
  });
  it('acepta abonos aunque la reserva no tenga valor total', async () => {
    const vieja = await cliente.crear('Reservas', { 'Huésped': 'Vieja', 'Fecha entrada': hoy, 'Fecha salida': hoy, 'Habitaciones': ['La Luis'], 'Estado': 'Anticipo pendiente' });
    const res = await llamar({ reservaId: vieja.id, monto: 50000, medio: 'Otro' });
    expect(res.body.resumen).toEqual({ valorTotal: null, pagado: 50000, saldo: null, estadoPago: 'sin_valor', estado: 'Confirmado' });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/api-pagos.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `api/pagos.js`**

```js
import { clienteDesdeEnv } from '../lib/airtable.js';
import { tablasDesdeEnv, aReservaApi, aPagoApi, camposPagoNuevo, cargarPagosPorIds, ESTADOS } from '../lib/reservas.js';
import { validarPagoNuevo } from '../lib/validar.js';
import { responder, exigirPin, manejarError, sinCache } from '../lib/http.js';
import { resumenPagos } from '../public/js/pagos.js';
import { hoyBogota } from '../public/js/fechas.js';

export function crearHandler(deps = {}) {
  return async function handler(req, res) {
    sinCache(res);
    if (req.method !== 'POST') return responder(res, 405, { ok: false, error: 'Método no permitido.' });
    if (!(await exigirPin(req, res, deps))) return undefined;
    try {
      const cliente = deps.cliente ?? clienteDesdeEnv(deps.env);
      const tablas = tablasDesdeEnv(deps.env);
      const hoy = hoyBogota(deps.ahora ? deps.ahora() : new Date());
      const v = validarPagoNuevo(req.body ?? {}, hoy);
      if (!v.ok) return responder(res, 400, { ok: false, error: v.error });
      const { reservaId, monto, medio, fecha, nota } = v.datos;

      const reg = await cliente.obtener(tablas.reservas, reservaId); // 404 → manejarError
      const reserva = aReservaApi(reg);
      const idsPrevios = reg.fields['Pagos'] ?? [];

      const pagoReg = await cliente.crear(tablas.pagos, camposPagoNuevo({
        reservaId, huesped: reserva.huesped, esPrimero: idsPrevios.length === 0, monto, medio, fecha, nota,
      }));

      let { estado } = reserva;
      if (estado !== ESTADOS.confirmado) {
        await cliente.actualizar(tablas.reservas, reservaId, { 'Estado': ESTADOS.confirmado });
        estado = ESTADOS.confirmado;
      }

      const pagos = await cargarPagosPorIds(cliente, tablas.pagos, [...idsPrevios, pagoReg.id]);
      return responder(res, 201, {
        ok: true,
        pago: aPagoApi(pagoReg),
        resumen: { valorTotal: reserva.valorTotal, ...resumenPagos(reserva.valorTotal, pagos), estado },
      });
    } catch (e) {
      return manejarError(res, e);
    }
  };
}

export default crearHandler();
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/api-pagos.test.js` → PASS. `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add api/pagos.js tests/api-pagos.test.js
git commit -m "Endpoint /api/pagos: registra abonos y confirma la reserva

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: `scripts/dev.mjs` — servidor local (estáticos + API) con Airtable real o falso

**Files:**
- Create: `scripts/dev.mjs`

**Interfaces:**
- Consumes: `api/*.js` (`crearHandler`, `default`), T9 (`crearClienteFalso`, `sembrarDemo`), T1 `hoyBogota`.
- Produces: `npm run dev:falso` → `http://localhost:3000` con datos de demostración y PIN `123456`; `npm run dev` → lo mismo contra Airtable real usando `.env.local`. Imita a Vercel: sirve `public/` con `cleanUrls` (`/calendario` → `calendario.html`) y adapta `req/res` de Node a la firma de las funciones (`req.query`, `req.body`, `res.status().json()`).

- [ ] **Step 1: Implementar `scripts/dev.mjs`**

```js
// Servidor de desarrollo. Imita lo justo de Vercel: estáticos de public/ con
// cleanUrls y funciones de api/ con req.query, req.body y res.status().json().
//   npm run dev:falso  → Airtable en memoria con datos demo (PIN 123456)
//   npm run dev        → Airtable real con las variables de .env.local
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { hoyBogota } from '../public/js/fechas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publico = path.join(raiz, 'public');
const usarFalso = process.argv.includes('--falso');
const puerto = Number(process.env.PORT || 3000);
const deps = {};

if (usarFalso) {
  process.env.PIN_SENORAS ||= '123456';
  deps.env = process.env;
  deps.cliente = crearClienteFalso();
  await sembrarDemo(deps.cliente, hoyBogota());
}

const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

async function servirEstatico(ruta, res) {
  let archivo = path.normalize(path.join(publico, decodeURIComponent(ruta)));
  if (!archivo.startsWith(publico)) { res.writeHead(403); return res.end('Prohibido'); }
  try {
    const info = await stat(archivo);
    if (info.isDirectory()) archivo = path.join(archivo, 'index.html');
  } catch {
    if (!path.extname(archivo)) archivo += '.html'; // cleanUrls
  }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
}

function leerCuerpo(req) {
  return new Promise((resolver) => {
    let datos = '';
    req.on('data', (trozo) => { datos += trozo; });
    req.on('end', () => {
      try { resolver(datos ? JSON.parse(datos) : undefined); } catch { resolver(undefined); }
    });
  });
}

const manejadores = new Map();
async function manejadorDe(nombre) {
  if (!manejadores.has(nombre)) {
    const modulo = await import(pathToFileURL(path.join(raiz, 'api', `${nombre}.js`)).href);
    manejadores.set(nombre, usarFalso ? modulo.crearHandler(deps) : modulo.default);
  }
  return manejadores.get(nombre);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${puerto}`);
  if (!url.pathname.startsWith('/api/')) return servirEstatico(url.pathname, res);

  const nombre = url.pathname.slice(5).replace(/[^a-z-]/g, '');
  let fn;
  try { fn = await manejadorDe(nombre); } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Endpoint no existe.' }));
  }
  req.query = Object.fromEntries(url.searchParams);
  req.body = await leerCuerpo(req);
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (objeto) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(objeto)); return res; };
  try {
    await fn(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Error del servidor de desarrollo.' });
  }
}).listen(puerto, () => {
  console.log(`Villa Aura en http://localhost:${puerto} ${usarFalso ? '· Airtable FALSO (PIN 123456)' : '· Airtable real (.env.local)'}`);
});
```

- [ ] **Step 2: Probar a mano con el Airtable falso**

En una terminal: `npm run dev:falso` (debe imprimir la URL). En otra:

```bash
curl -s http://localhost:3000/api/salud
# → {"ok":true,"airtable":"ok","hora":"..."}
curl -s -H "X-Pin: 123456" "http://localhost:3000/api/reservas?desde=$(date +%F)&hasta=2027-01-01" | head -c 400
# → {"ok":true,"desde":...,"reservas":[{...Carlos Ruiz...},{...Ana Pérez...},{...Familia Gómez...}]}
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Pin: 000000" "http://localhost:3000/api/reservas?desde=2026-10-01&hasta=2026-11-01"
# → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/calendario
# → 404 todavía (la página se crea en la Tarea 17); /api responde, los estáticos aún no existen
```

Detener el servidor con Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add scripts/dev.mjs
git commit -m "Servidor local de desarrollo con Airtable real o falso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: `public/brand.css` + `public/js/app.js` — estilos MH y cliente del navegador

**Files:**
- Create: `public/brand.css`, `public/js/app.js`, `tests/app.test.js`

**Interfaces:**
- Consumes: T1 (`hoyBogota`, `sumarDias`), T2 (`parsearCOP`, `formatearCOP`).
- Produces (`app.js`): `CLAVE_PIN`, `obtenerPin()`, `guardarPin(pin)`, `borrarPin()`, `pinValido(pin): boolean` (4–6 dígitos), `class ErrorApi extends Error { status, datos }`, `api(ruta, { method, body }): Promise<json>` (agrega `X-Pin`; en `401` borra el PIN y lanza `ErrorApi(401)`; sin red lanza `ErrorApi(0)`), `escapar(texto)`, `mostrarError(el, msg)`, `ocultarError(el)`, `asegurarPin({ raiz, alListo })` (dibuja la pantalla de PIN en `raiz` si no hay PIN guardado; valida contra la API y llama `alListo()`), `formatoCOPEnVivo(input)`.
- Produces (`brand.css`): tokens `--navy --dorado --fondo --gris --gris-claro --borde --azul-data --rojo --verde --radio --sombra` y clases `.encabezado .encabezado__tag .contenedor .campo .etiqueta .req .entrada .fila-2 .sub .chips .chips--medios .chip .chip--ancho .chip--medio .activo .boton .boton--secundario .boton--dorado .boton--chico .error .visible .aviso .tarjeta .pie .oculto .pin .hoja-fondo .hoja .hoja__asa .esqueleto .estado .estado--confirmado .estado--pendiente .estado--fullhouse .pago .pago__barra .pago__txt .pago--pagado .pago--parcial .pago--sin_anticipo .pago--sin_valor`.

- [ ] **Step 1: Escribir el test de las partes puras**

`tests/app.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { escapar, pinValido, ErrorApi } from '../public/js/app.js';

describe('app.js (partes puras)', () => {
  it('escapa HTML para no inyectar nombres de huéspedes', () => {
    expect(escapar('<b>Ana & "Luis"</b>')).toBe('&lt;b&gt;Ana &amp; &quot;Luis&quot;&lt;/b&gt;');
    expect(escapar(null)).toBe('');
  });
  it('PIN de 4 a 6 dígitos', () => {
    expect(pinValido('1234')).toBe(true);
    expect(pinValido('123456')).toBe(true);
    expect(pinValido('123')).toBe(false);
    expect(pinValido('12345a')).toBe(false);
  });
  it('ErrorApi guarda status y datos', () => {
    const e = new ErrorApi('x', 409, { conflicto: {} });
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(409);
    expect(e.datos).toEqual({ conflicto: {} });
  });
});
```

Run: `npx vitest run tests/app.test.js` → FAIL (módulo no existe).

- [ ] **Step 2: Crear `public/brand.css`**

```css
/* Villa Aura · Sistema de reservas · identidad Marketing Hotelero */
:root {
  --navy: #151635; --dorado: #C49A2B; --fondo: #F4F4F6; --blanco: #FFFFFF;
  --gris: #6B6D7A; --gris-claro: #BBBBC8; --borde: #E0E0E8; --azul-data: #4A6FA5;
  --rojo: #C0392B; --verde: #2E8B57; --radio: 12px; --sombra: 0 4px 16px rgba(21, 22, 53, .08);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body { font-family: 'Poppins', system-ui, sans-serif; background: var(--fondo); color: var(--navy); min-height: 100vh; }
button, input, textarea { font-family: inherit; }
a { color: inherit; }

/* Encabezado */
.encabezado { background: var(--navy); color: #fff; padding: 16px 20px 14px; position: sticky; top: 0; z-index: 20; }
.encabezado__tag { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: var(--gris-claro); margin-bottom: 2px; }
.encabezado h1 { font-size: 19px; font-weight: 700; letter-spacing: 1px; }
.encabezado p { font-size: 11px; color: var(--gris-claro); font-weight: 300; margin-top: 2px; }
.encabezado__fila { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.encabezado .boton--chico { background: var(--dorado); color: #fff; border: none; }

/* Contenedor y campos */
.contenedor { max-width: 560px; margin: 0 auto; padding: 16px 16px 48px; }
.campo { margin-bottom: 16px; }
.campo label, .etiqueta { display: block; font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gris); margin-bottom: 6px; }
.req { color: var(--dorado); margin-left: 2px; }
.entrada { width: 100%; background: #fff; border: 1.5px solid var(--borde); border-radius: 10px; padding: 12px 14px; font-size: 15px; color: var(--navy); -webkit-appearance: none; appearance: none; min-height: 46px; transition: border-color .15s; }
.entrada:focus { outline: none; border-color: var(--navy); }
.entrada::placeholder { color: var(--gris-claro); }
textarea.entrada { resize: vertical; min-height: 60px; }
.fila-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sub { font-size: 10px; color: var(--gris); margin-top: 4px; text-align: center; }

/* Chips (habitaciones, medios de pago) */
.chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.chips--medios { grid-template-columns: repeat(3, 1fr); }
.chip { background: #fff; border: 1.5px solid var(--borde); border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; min-height: 44px; color: var(--navy); -webkit-tap-highlight-color: transparent; transition: all .15s; }
.chip:active { transform: scale(.97); }
.chip.activo { background: var(--navy); border-color: var(--navy); color: #fff; }
.chip strong { display: block; font-size: 13px; font-weight: 600; }
.chip small { display: block; font-size: 10px; font-weight: 300; opacity: .75; margin-top: 1px; }
.chip--ancho { grid-column: span 2; border-style: dashed; border-color: var(--navy); text-align: center; }
.chip--ancho.activo { border-style: solid; }
.chip--medio { text-align: center; font-size: 12px; font-weight: 500; padding: 10px 6px; }

/* Botones */
.boton { display: inline-block; width: 100%; background: var(--navy); color: #fff; border: none; border-radius: var(--radio); padding: 15px; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; text-align: center; text-decoration: none; cursor: pointer; min-height: 48px; -webkit-tap-highlight-color: transparent; transition: opacity .15s; }
.boton:active { opacity: .85; }
.boton:disabled { opacity: .5; cursor: not-allowed; }
.boton--secundario { background: #fff; color: var(--navy); border: 1.5px solid var(--navy); }
.boton--dorado { background: var(--dorado); }
.boton--chico { width: auto; padding: 10px 16px; font-size: 12px; min-height: 40px; letter-spacing: .5px; }
.boton + .boton { margin-top: 10px; }

/* Mensajes */
.error { background: #FEECEC; border: 1px solid #F5C6C6; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: var(--rojo); margin: 12px 0; display: none; }
.error.visible { display: block; }
.aviso { background: #FFF7E0; border: 1px solid #F0DCA0; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #7A5A00; margin: 12px 0; }
.tarjeta { background: #fff; border-radius: var(--radio); box-shadow: var(--sombra); padding: 14px 16px; }
.pie { text-align: center; font-size: 9px; letter-spacing: 2px; color: var(--gris-claro); padding: 16px; text-transform: uppercase; }
.oculto { display: none !important; }

/* Pantalla de PIN */
.pin { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; text-align: center; }
.pin h2 { font-size: 18px; margin-bottom: 6px; }
.pin p { font-size: 13px; color: var(--gris); margin-bottom: 20px; max-width: 280px; }
.pin .entrada { text-align: center; font-size: 28px; letter-spacing: 10px; max-width: 260px; }
.pin .boton { max-width: 260px; margin-top: 14px; }
.pin .error { max-width: 260px; }

/* Hoja deslizante (detalle de reserva) */
.hoja-fondo { position: fixed; inset: 0; background: rgba(21, 22, 53, .45); display: flex; align-items: flex-end; z-index: 50; }
.hoja { background: #fff; width: 100%; max-width: 560px; margin: 0 auto; border-radius: 18px 18px 0 0; padding: 14px 18px 28px; max-height: 92vh; overflow-y: auto; }
.hoja__asa { width: 40px; height: 4px; border-radius: 2px; background: var(--borde); margin: 0 auto 14px; }

/* Esqueleto de carga */
.esqueleto { background: linear-gradient(90deg, #ECECF1 25%, #F7F7FA 50%, #ECECF1 75%); background-size: 200% 100%; animation: brillo 1.2s infinite; border-radius: 8px; min-height: 18px; }
@keyframes brillo { to { background-position: -200% 0; } }

/* Estado de reserva y de pago */
.estado { display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 4px 8px; border-radius: 6px; color: #fff; white-space: nowrap; }
.estado--confirmado { background: var(--navy); }
.estado--pendiente { background: var(--dorado); }
.estado--fullhouse { background: var(--azul-data); }
.pago { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.pago__barra { flex: 1; height: 6px; background: var(--borde); border-radius: 3px; overflow: hidden; }
.pago__barra span { display: block; height: 100%; background: var(--navy); border-radius: 3px; }
.pago__txt { font-size: 11px; font-weight: 600; white-space: nowrap; }
.pago--pagado { color: var(--verde); }
.pago--parcial { color: var(--navy); }
.pago--sin_anticipo { color: var(--dorado); }
.pago--sin_valor { color: var(--gris); }
```

- [ ] **Step 3: Crear `public/js/app.js`**

```js
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

export class ErrorApi extends Error {
  constructor(mensaje, status, datos = {}) {
    super(mensaje);
    this.status = status;
    this.datos = datos;
  }
}

export async function api(ruta, { method = 'GET', body } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Pin': obtenerPin() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ErrorApi('Sin conexión. Revisa el internet e intenta de nuevo; lo que escribiste sigue aquí.', 0);
  }
  let datos = {};
  try { datos = await respuesta.json(); } catch { /* respuesta sin JSON */ }
  if (respuesta.status === 401) {
    borrarPin();
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
```

- [ ] **Step 4: Correr tests y verificar sintaxis**

Run: `npx vitest run tests/app.test.js` → PASS. `node --check public/js/app.js` → sin salida (OK).

- [ ] **Step 5: Commit**

```bash
git add public/brand.css public/js/app.js tests/app.test.js
git commit -m "Estilos compartidos MH y cliente del navegador con PIN

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: `public/index.html` — formulario de reserva

**Files:**
- Create: `public/index.html`

**Interfaces:**
- Consumes: `/brand.css`, `/js/app.js` (`api, asegurarPin, escapar, mostrarError, ocultarError, formatoCOPEnVivo, ErrorApi`), `/js/fechas.js` (`hoyBogota, sumarDias`), `/js/dinero.js` (`parsearCOP, formatearCOP`), `/js/disponibilidad.js` (`FULL_HOUSE, buscarConflicto`), `GET/POST /api/reservas` (T12).
- Produces: la página `/` descrita en §9 del spec. Ids de DOM usados por el script: `pin, formulario, exito, huesped, telefono, fecha-entrada, fecha-salida, personas, valor-total, abono, campo-medio, medios, notas, error, guardar, exito-detalle, nueva`.

- [ ] **Step 1: Crear `public/index.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Villa Aura — Nueva reserva</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/brand.css">
  <style>
    .exito { min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .exito__icono { font-size: 56px; margin-bottom: 12px; }
    .exito h2 { font-size: 20px; margin-bottom: 8px; }
    .exito p { font-size: 13px; color: var(--gris); line-height: 1.7; margin-bottom: 20px; }
    .exito .boton { max-width: 320px; }
  </style>
</head>
<body>

<header class="encabezado">
  <div class="encabezado__fila">
    <div>
      <div class="encabezado__tag">Nueva reserva</div>
      <h1>VILLA AURA</h1>
      <p>Agua de Dios, Cundinamarca</p>
    </div>
    <a class="boton boton--chico" href="/calendario">Calendario</a>
  </div>
</header>

<div id="pin"></div>

<main id="formulario" class="contenedor oculto">
  <div class="campo">
    <label for="huesped">Nombre del huésped <span class="req">*</span></label>
    <input class="entrada" type="text" id="huesped" placeholder="Nombre completo" autocomplete="name">
  </div>

  <div class="campo">
    <label for="telefono">WhatsApp / Teléfono <span class="req">*</span></label>
    <input class="entrada" type="tel" id="telefono" placeholder="310 000 0000" autocomplete="tel">
  </div>

  <div class="campo">
    <span class="etiqueta">Fechas de la reserva <span class="req">*</span></span>
    <div class="fila-2">
      <div><input class="entrada" type="date" id="fecha-entrada" aria-label="Llegada"><div class="sub">Llegada</div></div>
      <div><input class="entrada" type="date" id="fecha-salida" aria-label="Salida"><div class="sub">Salida</div></div>
    </div>
  </div>

  <div class="campo">
    <span class="etiqueta">Habitación(es) <span class="req">*</span></span>
    <div class="chips">
      <button type="button" class="chip" data-hab="La Rosaura"><strong>La Rosaura</strong><small>7 personas · AC</small></button>
      <button type="button" class="chip" data-hab="La Yaneth"><strong>La Yaneth</strong><small>5 personas · AC</small></button>
      <button type="button" class="chip" data-hab="La Clara"><strong>La Clara</strong><small>5-6 personas · AC</small></button>
      <button type="button" class="chip" data-hab="La Luis"><strong>La Luis</strong><small>5-6 personas · AC</small></button>
      <button type="button" class="chip" data-hab="La Elsa"><strong>La Elsa</strong><small>5-6 personas · AC</small></button>
      <button type="button" class="chip chip--ancho" data-hab="FULL HOUSE"><strong>🏠 Full House</strong><small>Todas las habitaciones</small></button>
    </div>
  </div>

  <div class="fila-2">
    <div class="campo">
      <label for="personas">Personas <span class="req">*</span></label>
      <input class="entrada" type="number" id="personas" placeholder="0" min="1" max="60" inputmode="numeric">
    </div>
    <div class="campo">
      <label for="valor-total">Valor total acordado <span class="req">*</span></label>
      <input class="entrada" type="text" id="valor-total" placeholder="$ 0" inputmode="numeric" autocomplete="off">
    </div>
  </div>

  <div class="campo">
    <label for="abono">Abono inicial recibido</label>
    <input class="entrada" type="text" id="abono" placeholder="$ 0 (si aún no ha pagado, déjalo vacío)" inputmode="numeric" autocomplete="off">
  </div>

  <div class="campo oculto" id="campo-medio">
    <span class="etiqueta">Medio de pago del abono <span class="req">*</span></span>
    <div class="chips chips--medios" id="medios"></div>
  </div>

  <div class="campo">
    <label for="notas">Notas adicionales</label>
    <textarea class="entrada" id="notas" rows="2" placeholder="Extras, solicitudes especiales…"></textarea>
  </div>

  <div class="error" id="error" role="alert"></div>
  <button class="boton" id="guardar" type="button">Guardar reserva</button>
</main>

<section id="exito" class="contenedor exito oculto">
  <div class="exito__icono">✅</div>
  <h2>¡Reserva registrada!</h2>
  <p id="exito-detalle"></p>
  <a class="boton" href="/calendario">Ver calendario</a>
  <button class="boton boton--secundario" id="nueva" type="button">+ Nueva reserva</button>
</section>

<footer class="pie">Villa Aura · Sistema de reservas · Marketing Hotelero</footer>

<script type="module">
  import { api, asegurarPin, escapar, mostrarError, ocultarError, formatoCOPEnVivo, ErrorApi } from '/js/app.js';
  import { hoyBogota, sumarDias } from '/js/fechas.js';
  import { parsearCOP, formatearCOP } from '/js/dinero.js';
  import { FULL_HOUSE, buscarConflicto } from '/js/disponibilidad.js';

  const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Efectivo', 'Otro'];
  const $ = (id) => document.getElementById(id);
  let habitaciones = [];
  let medio = null;

  function iniciar() {
    $('formulario').classList.remove('oculto');
    const hoy = hoyBogota();
    $('fecha-entrada').min = hoy;
    $('fecha-salida').min = sumarDias(hoy, 1);
    $('fecha-entrada').addEventListener('change', () => {
      const entrada = $('fecha-entrada').value || hoy;
      $('fecha-salida').min = sumarDias(entrada, 1);
      if ($('fecha-salida').value && $('fecha-salida').value <= entrada) $('fecha-salida').value = '';
    });
    formatoCOPEnVivo($('valor-total'));
    formatoCOPEnVivo($('abono'));
    $('abono').addEventListener('input', () => {
      $('campo-medio').classList.toggle('oculto', parsearCOP($('abono').value) === 0);
    });
    document.querySelectorAll('[data-hab]').forEach((b) => b.addEventListener('click', () => alternarHabitacion(b)));
    $('medios').innerHTML = MEDIOS.map((m) => `<button type="button" class="chip chip--medio" data-medio="${m}">${m}</button>`).join('');
    document.querySelectorAll('[data-medio]').forEach((b) => b.addEventListener('click', () => elegirMedio(b)));
    $('guardar').addEventListener('click', guardar);
    $('nueva').addEventListener('click', nuevaReserva);
  }

  function alternarHabitacion(boton) {
    const hab = boton.dataset.hab;
    const todos = [...document.querySelectorAll('[data-hab]')];
    if (hab === FULL_HOUSE) {
      const activo = boton.classList.toggle('activo');
      todos.forEach((b) => { if (b !== boton) b.classList.remove('activo'); });
      habitaciones = activo ? [FULL_HOUSE] : [];
      return;
    }
    todos.find((b) => b.dataset.hab === FULL_HOUSE).classList.remove('activo');
    boton.classList.toggle('activo');
    habitaciones = todos.filter((b) => b.classList.contains('activo')).map((b) => b.dataset.hab);
  }

  function elegirMedio(boton) {
    medio = boton.dataset.medio;
    document.querySelectorAll('[data-medio]').forEach((b) => b.classList.toggle('activo', b === boton));
  }

  function leer() {
    return {
      huesped: $('huesped').value.trim(),
      telefono: $('telefono').value.trim(),
      entrada: $('fecha-entrada').value,
      salida: $('fecha-salida').value,
      habitaciones,
      personas: Number($('personas').value) || 0,
      valorTotal: parsearCOP($('valor-total').value),
      abonoMonto: parsearCOP($('abono').value),
      notas: $('notas').value.trim(),
    };
  }

  function validar(d) {
    if (!d.huesped) return 'El nombre del huésped es requerido.';
    if (!d.telefono) return 'El teléfono es requerido.';
    if (!d.entrada) return 'La fecha de llegada es requerida.';
    if (!d.salida) return 'La fecha de salida es requerida.';
    if (d.salida <= d.entrada) return 'La fecha de salida debe ser posterior a la llegada.';
    if (!d.habitaciones.length) return 'Selecciona al menos una habitación.';
    if (d.personas < 1) return 'El número de personas es requerido.';
    if (d.valorTotal <= 0) return 'El valor total acordado es requerido.';
    if (d.abonoMonto > 0 && !medio) return 'Indica el medio de pago del abono.';
    return null;
  }

  async function guardar() {
    const error = $('error');
    ocultarError(error);
    const d = leer();
    const falla = validar(d);
    if (falla) { mostrarError(error, falla); return; }
    if (d.abonoMonto > d.valorTotal
      && !confirm(`El abono (${formatearCOP(d.abonoMonto)}) supera el valor total (${formatearCOP(d.valorTotal)}). ¿Guardar así?`)) return;

    const boton = $('guardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      // Validación previa en el celular; el servidor vuelve a validar.
      const { reservas } = await api(`/api/reservas?desde=${d.entrada}&hasta=${d.salida}`);
      const conflicto = buscarConflicto({ entrada: d.entrada, salida: d.salida, habitaciones: d.habitaciones }, reservas);
      if (conflicto) {
        throw new ErrorApi(`⚠️ ${conflicto.habitaciones.join(', ')} ya está reservada del ${conflicto.entrada} al ${conflicto.salida} (${conflicto.huesped}). Verifica las fechas.`, 409);
      }
      const cuerpo = {
        huesped: d.huesped, telefono: d.telefono, entrada: d.entrada, salida: d.salida,
        habitaciones: d.habitaciones, personas: d.personas, valorTotal: d.valorTotal, notas: d.notas,
      };
      if (d.abonoMonto > 0) cuerpo.abono = { monto: d.abonoMonto, medio };
      const respuesta = await api('/api/reservas', { method: 'POST', body: cuerpo });
      mostrarExito(d, respuesta);
    } catch (e) {
      if (e.status === 401) {
        $('formulario').classList.add('oculto');
        asegurarPin({ raiz: $('pin'), alListo: () => $('formulario').classList.remove('oculto') });
      } else {
        mostrarError(error, e.message);
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar reserva';
    }
  }

  function mostrarExito(d, respuesta) {
    $('formulario').classList.add('oculto');
    const abono = d.abonoMonto > 0 && respuesta.abonoRegistrado ? `<br>Abono: ${formatearCOP(d.abonoMonto)} (${escapar(medio)})` : '';
    const aviso = respuesta.advertencia ? `<div class="aviso">${escapar(respuesta.advertencia)}</div>` : '';
    $('exito-detalle').innerHTML = `<strong>${escapar(d.huesped)}</strong><br>${escapar(d.habitaciones.join(' · '))}<br>`
      + `${d.entrada} → ${d.salida}<br>${d.personas} personas<br>Valor total: ${formatearCOP(d.valorTotal)}${abono}${aviso}`;
    $('exito').classList.remove('oculto');
    window.scrollTo(0, 0);
  }

  function nuevaReserva() {
    ['huesped', 'telefono', 'fecha-entrada', 'fecha-salida', 'personas', 'valor-total', 'abono', 'notas'].forEach((id) => { $(id).value = ''; });
    habitaciones = [];
    medio = null;
    document.querySelectorAll('.chip').forEach((b) => b.classList.remove('activo'));
    $('campo-medio').classList.add('oculto');
    $('exito').classList.add('oculto');
    $('formulario').classList.remove('oculto');
    ocultarError($('error'));
    window.scrollTo(0, 0);
  }

  asegurarPin({ raiz: $('pin'), alListo: iniciar });
</script>
</body>
</html>
```

- [ ] **Step 2: Probar a mano con el Airtable falso**

`npm run dev:falso` y abrir `http://localhost:3000` (ideal: en el navegador con el modo "dispositivo móvil" a 375 px):
1. Aparece la pantalla de PIN. Con `000000` → "PIN incorrecto". Con `123456` → aparece el formulario.
2. Recargar: ya no pide PIN (quedó guardado).
3. Escribir en Valor total `1060000` → se muestra `$ 1.060.000`. Escribir un abono → aparecen los chips de medio; borrarlo → desaparecen.
4. Tocar Full House → se desmarcan las demás; tocar La Clara → se desmarca Full House.
5. Guardar vacío → mensaje "El nombre del huésped es requerido."
6. Reserva en **La Rosaura** de hoy+6 a hoy+8 → mensaje "⚠️ La Rosaura, La Clara ya está reservada…" (choca con Ana Pérez).
7. Reserva en **La Elsa** hoy+5 a hoy+7, 5 personas, valor 480000, abono 240000 Nequi → pantalla "¡Reserva registrada!" con el resumen y el botón "Ver calendario".
8. "+ Nueva reserva" → formulario limpio.
9. Detener el servidor y tocar Guardar con datos válidos → "Sin conexión…" y los datos siguen en pantalla.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Formulario de reserva con PIN, valor total y abono inicial

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: `public/calendario.html` — mini-PMS (ocupación, próximas llegadas, abonos)

**Files:**
- Create: `public/calendario.html`

**Interfaces:**
- Consumes: `/brand.css`, `/js/app.js`, `/js/fechas.js` (`hoyBogota, rangoMes, mesDeISO, nombreMes, esFinDeSemana, diaSemana, fechaCorta, DIAS_CORTOS`), `/js/dinero.js`, `/js/disponibilidad.js` (`HABITACIONES`), `/js/pagos.js` (`kpisMes`), `/js/calendario-logica.js` (todo), `GET /api/reservas`, `POST /api/pagos`.
- Produces: la página `/calendario` descrita en §10 del spec. Ids de DOM: `pin, app, mes-ant, mes-sig, titulo-mes, actualizar, kpis, grilla, falla, falla-texto, reintentar, lista, hoja`.

- [ ] **Step 1: Crear `public/calendario.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Villa Aura — Calendario</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/brand.css">
  <style>
    .barra-mes { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 2px 0 12px; }
    .barra-mes h2 { font-size: 16px; text-transform: capitalize; }
    .barra-mes button { background: #fff; border: 1.5px solid var(--borde); border-radius: 10px; min-width: 44px; min-height: 44px; font-size: 20px; cursor: pointer; color: var(--navy); }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .kpi { padding: 10px 8px; text-align: center; display: flex; flex-direction: column; gap: 2px; min-height: 74px; justify-content: center; }
    .kpi__t { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gris); }
    .kpi__v { font-size: 15px; font-weight: 700; }
    .kpi__s { font-size: 9px; color: var(--gris-claro); }
    .grilla-wrap { background: #fff; border-radius: var(--radio); box-shadow: var(--sombra); overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; min-height: 120px; }
    table.grilla { border-collapse: separate; border-spacing: 0; font-size: 10px; }
    .grilla th, .grilla td { border-bottom: 1px solid var(--borde); height: 36px; }
    .grilla thead th { width: 28px; min-width: 28px; font-weight: 500; color: var(--gris); background: #fff; }
    .grilla thead th span { display: block; font-size: 8px; color: var(--gris-claro); }
    .grilla th.finde, .grilla td.finde { background: #F4F4F6; }
    .grilla thead th.hoy { color: var(--dorado); font-weight: 700; }
    .grilla td.hoy { box-shadow: inset 2px 0 0 var(--dorado); }
    .grilla__hab { position: sticky; left: 0; z-index: 2; background: #fff; text-align: left; padding: 0 10px; font-size: 11px; font-weight: 600; min-width: 100px; border-right: 1px solid var(--borde); }
    .celda-barra { padding: 4px 1px; }
    .barra { display: block; width: 100%; height: 28px; border: none; border-radius: 6px; color: #fff; font-size: 10px; font-weight: 600; text-align: left; padding: 0 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
    .barra--confirmado { background: var(--navy); }
    .barra--pendiente { background: var(--dorado); }
    .barra--fullhouse { background: var(--azul-data); }
    .barra.cortada-izq { border-radius: 0 6px 6px 0; }
    .barra.cortada-der { border-radius: 6px 0 0 6px; }
    .leyenda { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 10px; color: var(--gris); margin-bottom: 18px; }
    .leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: middle; }
    .leyenda .boton--chico { margin-left: auto; }
    .seccion { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--gris); margin: 0 0 10px; }
    .lista { display: flex; flex-direction: column; gap: 10px; }
    .reserva { width: 100%; text-align: left; border: none; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
    .reserva__cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 14px; }
    .reserva__sub { font-size: 12px; color: var(--gris); }
    .vacio { color: var(--gris); font-size: 13px; text-align: center; }
    .detalle__cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
    .detalle__cab h2 { font-size: 18px; }
    .detalle__cab p { font-size: 12px; color: var(--gris); }
    .detalle__notas { font-size: 12px; background: var(--fondo); border-radius: 8px; padding: 8px 10px; margin: 10px 0; }
    .totales { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
    .totales div { background: var(--fondo); border-radius: 8px; padding: 8px; text-align: center; }
    .totales span { display: block; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--gris); }
    .totales strong { font-size: 13px; }
    .pagos { list-style: none; margin: 0 0 14px; }
    .pagos li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 8px 0; border-bottom: 1px solid var(--borde); font-size: 12px; }
    .pagos li em { grid-column: 1 / -1; font-size: 11px; color: var(--gris); font-style: normal; }
    .form-abono { background: var(--fondo); border-radius: var(--radio); padding: 14px; margin: 12px 0; }
    .form-abono .boton { margin-top: 4px; }
  </style>
</head>
<body>

<header class="encabezado">
  <div class="encabezado__fila">
    <div>
      <div class="encabezado__tag">Calendario</div>
      <h1>VILLA AURA</h1>
      <p>Ocupación y pagos</p>
    </div>
    <a class="boton boton--chico" href="/">+ Nueva reserva</a>
  </div>
</header>

<div id="pin"></div>

<main id="app" class="contenedor oculto">
  <div class="barra-mes">
    <button type="button" id="mes-ant" aria-label="Mes anterior">‹</button>
    <h2 id="titulo-mes"></h2>
    <button type="button" id="mes-sig" aria-label="Mes siguiente">›</button>
  </div>
  <div class="kpis" id="kpis"></div>
  <div class="grilla-wrap" id="grilla"></div>
  <div class="leyenda">
    <span><i style="background:var(--navy)"></i>Confirmado</span>
    <span><i style="background:var(--dorado)"></i>Anticipo pendiente</span>
    <span><i style="background:var(--azul-data)"></i>Full House</span>
    <button type="button" class="boton boton--secundario boton--chico" id="actualizar">Actualizar</button>
  </div>
  <div class="error" id="falla" role="alert"><span id="falla-texto"></span><br><button type="button" class="boton boton--chico" id="reintentar" style="margin-top:8px">Reintentar</button></div>
  <h3 class="seccion">Próximas llegadas</h3>
  <div class="lista" id="lista"></div>
</main>

<div id="hoja"></div>
<footer class="pie">Villa Aura · Sistema de reservas · Marketing Hotelero</footer>

<script type="module">
  import { api, asegurarPin, escapar, mostrarError, ocultarError, formatoCOPEnVivo } from '/js/app.js';
  import { hoyBogota, rangoMes, mesDeISO, nombreMes, esFinDeSemana, diaSemana, fechaCorta, DIAS_CORTOS } from '/js/fechas.js';
  import { formatearCOP, parsearCOP } from '/js/dinero.js';
  import { HABITACIONES } from '/js/disponibilidad.js';
  import { kpisMes } from '/js/pagos.js';
  import { barraEnMes, filasDe, colorEstado, ordenarProximas, telefonoWa, etiquetaPago, porcentajePago } from '/js/calendario-logica.js';

  const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Efectivo', 'Otro'];
  const $ = (id) => document.getElementById(id);
  let hoy = hoyBogota();
  let { anio, mes } = mesDeISO(hoy);
  let reservas = [];
  let cargando = false;

  function iniciar() {
    $('app').classList.remove('oculto');
    $('mes-ant').addEventListener('click', () => cambiarMes(-1));
    $('mes-sig').addEventListener('click', () => cambiarMes(1));
    $('actualizar').addEventListener('click', cargar);
    $('reintentar').addEventListener('click', cargar);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargar(); });
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

  async function cargar() {
    if (cargando) return;
    cargando = true;
    hoy = hoyBogota();
    const { desde, hasta } = rangoMes(anio, mes);
    $('titulo-mes').textContent = `${nombreMes(mes)} ${anio}`;
    $('kpis').innerHTML = '<div class="tarjeta esqueleto"></div>'.repeat(3);
    $('grilla').innerHTML = '<div class="esqueleto" style="height:200px"></div>';
    $('lista').innerHTML = '';
    ocultarError($('falla'));
    try {
      ({ reservas } = await api(`/api/reservas?desde=${desde}&hasta=${hasta}`));
      dibujar();
    } catch (e) {
      if (e.status === 401) pedirPin();
      else { $('falla-texto').textContent = e.message; $('falla').classList.add('visible'); $('grilla').innerHTML = ''; $('kpis').innerHTML = ''; }
    } finally {
      cargando = false;
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

  function cerrarHoja() { $('hoja').innerHTML = ''; }

  function abrirDetalle(id) {
    const r = reservas.find((x) => x.id === id);
    if (!r) return;
    const wa = telefonoWa(r.telefono);
    const pagos = r.pagos.length
      ? r.pagos.map((p) => `<li><span>${fechaCorta(p.fecha)} · ${escapar(p.medio ?? '—')}</span><strong>${formatearCOP(p.monto)}</strong>${p.nota ? `<em>${escapar(p.nota)}</em>` : ''}</li>`).join('')
      : '<li class="vacio">Sin abonos registrados.</li>';
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
          ${r.valorTotal == null ? '<div class="aviso">Valor total sin definir — pídele a gerencia completarlo en Airtable.</div>' : ''}
          <ul class="pagos">${pagos}</ul>
          <button type="button" class="boton boton--dorado" id="abrir-abono">Registrar abono</button>
          <form id="form-abono" class="form-abono oculto">
            <div class="campo"><label for="abono-monto">Monto <span class="req">*</span></label><input class="entrada" id="abono-monto" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="${saldoSugerido}"></div>
            <div class="campo"><span class="etiqueta">Medio <span class="req">*</span></span><div class="chips chips--medios">${MEDIOS.map((m) => `<button type="button" class="chip chip--medio" data-medio="${m}">${m}</button>`).join('')}</div></div>
            <div class="fila-2">
              <div class="campo"><label for="abono-fecha">Fecha</label><input class="entrada" type="date" id="abono-fecha" value="${hoy}"></div>
              <div class="campo"><label for="abono-nota">Nota</label><input class="entrada" id="abono-nota" placeholder="Opcional"></div>
            </div>
            <div class="error" id="abono-error" role="alert"></div>
            <button type="submit" class="boton boton--dorado" id="guardar-abono">Guardar abono</button>
          </form>
          <button type="button" class="boton boton--secundario" id="cerrar">Cerrar</button>
        </div>
      </div>`;
    $('hoja-fondo').addEventListener('click', (ev) => { if (ev.target === $('hoja-fondo')) cerrarHoja(); });
    $('cerrar').addEventListener('click', cerrarHoja);
    $('abrir-abono').addEventListener('click', () => { $('form-abono').classList.remove('oculto'); $('abrir-abono').classList.add('oculto'); $('abono-monto').focus(); });
    formatoCOPEnVivo($('abono-monto'));
    $('form-abono').querySelectorAll('[data-medio]').forEach((b) => b.addEventListener('click', () => {
      $('form-abono').querySelectorAll('[data-medio]').forEach((x) => x.classList.toggle('activo', x === b));
    }));
    $('form-abono').addEventListener('submit', (ev) => { ev.preventDefault(); registrarAbono(r); });
  }

  async function registrarAbono(r) {
    const error = $('abono-error');
    ocultarError(error);
    const monto = parsearCOP($('abono-monto').value);
    const medio = $('form-abono').querySelector('[data-medio].activo')?.dataset.medio;
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
</body>
</html>
```

- [ ] **Step 2: Probar a mano con el Airtable falso**

`npm run dev:falso` y abrir `http://localhost:3000/calendario` a 375 px:
1. Título con el mes actual; tres indicadores (Ocupación, Cobrado, Por cobrar) con valores coherentes con los datos demo.
2. Cuadrícula: Carlos Ruiz (La Yaneth, en curso, navy), Ana Pérez en La Rosaura **y** La Clara (navy), Familia Gómez en las **cinco** filas (azul, Full House). Hoy marcado en dorado; la vista arranca desplazada a hoy. Fines de semana sombreados.
3. Lista "Próximas llegadas": Carlos (Pagado ✓), Ana (Falta $ 530.000), Familia Gómez (Sin anticipo), en ese orden.
4. Tocar la tarjeta de Familia Gómez → hoja con WhatsApp (`https://wa.me/573001112233`), Valor total $ 2.100.000, Pagado $ 0, Saldo $ 2.100.000, "Sin abonos registrados".
5. "Registrar abono" → monto sugerido $ 2.100.000; cambiar a `1000000`, elegir Bancolombia, Guardar → la hoja muestra Pagado $ 1.000.000, Saldo $ 1.100.000, un abono en la lista, estado **Confirmado**; detrás, la barra cambió de dorado a azul (sigue Full House) y la tarjeta dice "Falta $ 1.100.000".
6. Guardar sin medio → "Elige el medio de pago." Abono mayor al saldo → diálogo de confirmación.
7. `‹` / `›` cambian de mes; un mes sin reservas muestra "Mes libre — ninguna reserva." Al volver, Familia Gómez conserva el abono.
8. Detener el servidor y tocar "Actualizar" → caja roja "Sin conexión…" con "Reintentar"; al reiniciar el servidor, Reintentar vuelve a cargar.

- [ ] **Step 3: Commit**

```bash
git add public/calendario.html
git commit -m "Mini-PMS: cuadrícula de ocupación, próximas llegadas y registro de abonos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Airtable — tabla `Pagos` y campos nuevos en `Reservas` (herramientas MCP)

**Files:** ninguno en el repo. Se ejecuta con las herramientas MCP de Airtable (`mcp__claude_ai_Airtable__*`). Los IDs de base y de la tabla `Reservas` están en `MEMORY.md` del proyecto (`/Users/marketinghotelero/Villa aura/MEMORY.md`); no se copian a este documento porque el repo es público.

**Interfaces:**
- Produces: tabla `Pagos` (`Concepto`, `Reserva`, `Fecha`, `Monto`, `Medio`, `Nota`, `Registrado`) y en `Reservas` los campos `Pagos` (vínculo inverso), `Valor total`, `Pagado`, `Saldo`, tal como los espera `lib/reservas.js`.

Si el clasificador de permisos bloquea una llamada MCP, pedir a gerencia que la apruebe; no buscar atajos con el token.

- [ ] **Step 1: Crear la tabla `Pagos`** con `create_table`:

```json
{
  "baseId": "<BASE_ID de MEMORY.md>",
  "name": "Pagos",
  "description": "Abonos y pagos de cada reserva. Los crea la API (formulario y mini-PMS).",
  "fields": [
    { "name": "Concepto", "type": "singleLineText" },
    { "name": "Fecha", "type": "date", "options": { "dateFormat": { "name": "iso" } } },
    { "name": "Monto", "type": "currency", "options": { "precision": 0, "symbol": "$" } },
    { "name": "Medio", "type": "singleSelect", "options": { "choices": [
      { "name": "Nequi", "color": "purpleLight2" }, { "name": "Bancolombia", "color": "yellowLight2" },
      { "name": "Daviplata", "color": "redLight2" }, { "name": "Efectivo", "color": "greenLight2" }, { "name": "Otro", "color": "grayLight2" } ] } },
    { "name": "Nota", "type": "multilineText" }
  ]
}
```
Anotar el `tableId` devuelto (`tbl…`) en `MEMORY.md` del proyecto (fuera del repo).

- [ ] **Step 2: Vincular `Pagos` → `Reservas`** con `create_field` sobre la tabla `Pagos`:

```json
{ "baseId": "<BASE_ID>", "tableId": "<TABLE_ID de Pagos>", "field": { "name": "Reserva", "type": "multipleRecordLinks", "options": { "linkedTableId": "<TABLE_ID de Reservas>" } } }
```
Airtable crea solo el campo inverso en `Reservas`. Verificar con `list_tables_for_base` que ese campo inverso se llama exactamente **`Pagos`**; si se llamó distinto (p. ej. `Pagos 2` o `Reservas`), renombrarlo con `update_field` (`name: "Pagos"`).

- [ ] **Step 3: Campo `Registrado`** en `Pagos` con `create_field`: `{ "name": "Registrado", "type": "createdTime" }`.

- [ ] **Step 4: Campos nuevos en `Reservas`** con `create_field` (tres llamadas, en este orden):

```json
{ "name": "Valor total", "type": "currency", "options": { "precision": 0, "symbol": "$" }, "description": "Lo acordado con el huésped. Lo escribe la señora en el formulario." }
```
```json
{ "name": "Pagado", "type": "rollup", "options": { "recordLinkFieldId": "Pagos", "fieldIdInLinkedTable": "Monto", "formula": "SUM(values)" } }
```
```json
{ "name": "Saldo", "type": "formula", "options": { "formula": "IF({Valor total}, {Valor total} - {Pagado}, BLANK())" } }
```

- [ ] **Step 5: Verificar el esquema** con `get_table_schema` de ambas tablas: `Pagos` tiene 7 campos (`Concepto` principal, `Reserva` vínculo, `Fecha` iso, `Monto` currency, `Medio` 5 opciones, `Nota`, `Registrado`); `Reservas` tiene además `Pagos`, `Valor total`, `Pagado` (rollup válido), `Saldo` (fórmula `isValid: true`).

- [ ] **Step 6: Limpieza manual (gerencia, opcional, 1 minuto):** en Airtable, campo `Estado` → editar opciones → borrar `Todo`, `In progress`, `Done` (la API no puede borrar opciones). Si alguna reserva vieja las usa, primero cambiarla a `Confirmado` o `Anticipo pendiente`.

- [ ] **Step 7: Registrar en `MEMORY.md` del proyecto** (sección Novedades, fecha 2026-10-12): tabla `Pagos` creada con su id, campos nuevos en `Reservas`.

---

### Task 19: Vercel — sesión, proyecto, variables y `.env.local`

**Files:**
- Create (ignorado por git): `.env.local`

**Interfaces:**
- Produces: proyecto Vercel `villa-aura-reservas` vinculado a `formulario/` (`.vercel/` ignorado por git), variables `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `PIN_SENORAS` en Production + Preview + Development, y `.env.local` para `npm run dev` y `npm run migrar`.

- [ ] **Step 1: Gerencia crea el token nuevo de Airtable** (en el navegador): `airtable.com/create/tokens` → *Create new token* → nombre `Villa Aura Vercel` → scopes **`data.records:read`** y **`data.records:write`** únicamente → *Access*: solo la base de Villa Aura (`Villa Aura — Reservas`; si aún se llama `Untitled Base`, renombrarla primero) → *Create token* → copiarlo (empieza por `pat`). **No pegarlo en el chat ni en archivos.** También elige el **PIN de 6 dígitos** para las señoras.

- [ ] **Step 2: Iniciar sesión en Vercel** (gerencia confirma en el navegador):

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
npx vercel login
```
El CLI imprime una URL (y/o abre el navegador) para confirmar con la cuenta de Vercel donde ya vive `whatsapp-dashboard`. Si el CLI se niega por falta de terminal interactiva, alternativa: gerencia crea un token en `vercel.com/account/settings/tokens` y se usa `--token <TOKEN>` en cada comando siguiente (sin guardarlo en archivos). Verificar: `npx vercel whoami` muestra el usuario.

- [ ] **Step 3: Crear y vincular el proyecto**

```bash
npx vercel project add villa-aura-reservas
npx vercel link --yes --project villa-aura-reservas
cat .vercel/project.json      # debe tener projectId y orgId; la carpeta .vercel está en .gitignore
```
Si el nombre está ocupado, usar `villa-aura-reservas-mh` y anotar el nombre definitivo (define la URL `https://<nombre>.vercel.app`).

- [ ] **Step 4: Variables de entorno.** `AIRTABLE_BASE_ID` no es secreto: se agrega desde el CLI con el valor de `MEMORY.md` (una vez por entorno):

```bash
for entorno in production preview development; do
  printf '%s' '<BASE_ID de MEMORY.md>' | npx vercel env add AIRTABLE_BASE_ID "$entorno"
done
```
`AIRTABLE_TOKEN` y `PIN_SENORAS` los pega **gerencia** en `vercel.com` → proyecto `villa-aura-reservas` → *Settings* → *Environment Variables* → *Add New*: nombre `AIRTABLE_TOKEN`, valor el token, marcar **Production, Preview y Development** → *Save*; repetir con `PIN_SENORAS` y el PIN. (Si gerencia prefiere, puede agregar también `AIRTABLE_BASE_ID` ahí y saltarse el bucle anterior.)

- [ ] **Step 5: Bajar las variables para uso local y probar contra Airtable real**

```bash
npx vercel env pull .env.local        # crea .env.local (ignorado por git)
grep -c '=' .env.local                 # ≥ 3 líneas con valor; NO imprimir el archivo
npm run dev                            # servidor con Airtable real
```
En otra terminal: `curl -s http://localhost:3000/api/salud` → `{"ok":true,"airtable":"ok",...}`. Abrir `http://localhost:3000/calendario`, ingresar el PIN real: deben verse las reservas reales (todavía sin pagos ni valor total). Detener el servidor.

- [ ] **Step 6: Anotar en `MEMORY.md` del proyecto:** nombre definitivo del proyecto Vercel, URL prevista, fecha de creación del token nuevo (sin el token).

---

### Task 20: Migración de anticipos a `Pagos`

**Files:**
- Create: `lib/migracion.js`, `tests/migracion.test.js`, `scripts/migrar-anticipos.mjs`

**Interfaces:**
- Consumes: T1 `hoyBogota`, T8 `clienteDesdeEnv`, T10 `tablasDesdeEnv`, T2 `formatearCOP`.
- Produces: `planMigracion(registros): { reservaId, huesped, campos }[]` (solo reservas con `Anticipo COP > 0` y sin `Pagos`), `verificarMigracion(registros): { reservaId, huesped, anticipo, pagado }[]` (las que no cuadran). Script idempotente: simula por defecto, escribe con `--aplicar`.

- [ ] **Step 1: Escribir los tests**

`tests/migracion.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { planMigracion, verificarMigracion } from '../lib/migracion.js';

const reg = (id, fields, createdTime = '2026-05-20T02:30:00.000Z') => ({ id, createdTime, fields });

describe('planMigracion', () => {
  it('solo reservas con anticipo y sin pagos; la fecha es la de creación en Bogotá', () => {
    const plan = planMigracion([
      reg('recA00000000000001', { 'Huésped': 'Ana', 'Anticipo COP': 500000 }),             // 2026-05-19 21:30 Bogotá
      reg('recB00000000000002', { 'Huésped': 'Beto', 'Anticipo COP': 0 }),
      reg('recC00000000000003', { 'Huésped': 'Caro', 'Anticipo COP': 300000, 'Pagos': ['recP00000000000009'] }),
      reg('recD00000000000004', { 'Huésped': 'Dora' }),
    ]);
    expect(plan).toEqual([{
      reservaId: 'recA00000000000001', huesped: 'Ana',
      campos: { 'Concepto': 'Anticipo (migrado) · Ana', 'Reserva': ['recA00000000000001'], 'Fecha': '2026-05-19', 'Monto': 500000, 'Medio': 'Otro', 'Nota': 'Migrado desde Anticipo COP' },
    }]);
  });
});

describe('verificarMigracion', () => {
  it('lista las reservas cuyo Pagado no coincide con el anticipo', () => {
    const difs = verificarMigracion([
      reg('r1', { 'Huésped': 'Ana', 'Anticipo COP': 500000, 'Pagado': 500000 }),
      reg('r2', { 'Huésped': 'Caro', 'Anticipo COP': 300000, 'Pagado': 0 }),
      reg('r3', { 'Huésped': 'Beto', 'Anticipo COP': 0 }),
    ]);
    expect(difs).toEqual([{ reservaId: 'r2', huesped: 'Caro', anticipo: 300000, pagado: 0 }]);
  });
});
```

Run: `npx vitest run tests/migracion.test.js` → FAIL (módulo no existe).

- [ ] **Step 2: Implementar `lib/migracion.js`**

```js
import { hoyBogota } from '../public/js/fechas.js';

// Convierte el campo viejo "Anticipo COP" en un registro de Pagos por reserva.
// Idempotente: ignora las reservas que ya tienen pagos.
export function planMigracion(registros) {
  return registros
    .filter((r) => Number(r.fields['Anticipo COP']) > 0 && (r.fields['Pagos'] ?? []).length === 0)
    .map((r) => {
      const huesped = r.fields['Huésped'] ?? '';
      return {
        reservaId: r.id,
        huesped,
        campos: {
          'Concepto': `Anticipo (migrado) · ${huesped}`,
          'Reserva': [r.id],
          'Fecha': hoyBogota(new Date(r.createdTime)),
          'Monto': Number(r.fields['Anticipo COP']),
          'Medio': 'Otro',
          'Nota': 'Migrado desde Anticipo COP',
        },
      };
    });
}

export function verificarMigracion(registros) {
  return registros
    .filter((r) => Number(r.fields['Anticipo COP']) > 0)
    .map((r) => ({ reservaId: r.id, huesped: r.fields['Huésped'] ?? '', anticipo: Number(r.fields['Anticipo COP']), pagado: Number(r.fields['Pagado'] ?? 0) }))
    .filter((x) => x.anticipo !== x.pagado);
}
```

Run: `npx vitest run tests/migracion.test.js` → PASS.

- [ ] **Step 3: Implementar `scripts/migrar-anticipos.mjs`**

```js
// Migra "Anticipo COP" → tabla Pagos. Simula por defecto; escribe con --aplicar.
//   npm run migrar            (simulación)
//   npm run migrar:aplicar    (escribe en Airtable)
import { clienteDesdeEnv } from '../lib/airtable.js';
import { tablasDesdeEnv } from '../lib/reservas.js';
import { planMigracion, verificarMigracion } from '../lib/migracion.js';
import { formatearCOP } from '../public/js/dinero.js';

const aplicar = process.argv.includes('--aplicar');
const cliente = clienteDesdeEnv();
const tablas = tablasDesdeEnv();
const CAMPOS = ['Huésped', 'Anticipo COP', 'Pagos', 'Pagado'];

const registros = await cliente.listar(tablas.reservas, { fields: CAMPOS });
const plan = planMigracion(registros);
console.log(`Reservas: ${registros.length} · con anticipo y sin pagos: ${plan.length}`);
for (const p of plan) console.log(` · ${p.huesped.padEnd(28)} ${formatearCOP(p.campos.Monto).padStart(14)}  fecha ${p.campos.Fecha}`);

if (plan.length && !aplicar) {
  console.log('\nSimulación: nada se escribió. Para aplicar: npm run migrar:aplicar');
} else if (plan.length) {
  for (const p of plan) {
    await cliente.crear(tablas.pagos, p.campos);
    console.log(` ✓ ${p.huesped}`);
  }
}

if (aplicar || plan.length === 0) {
  const despues = await cliente.listar(tablas.reservas, { fields: CAMPOS });
  const diferencias = verificarMigracion(despues);
  if (diferencias.length) {
    console.log('\n⚠ Reservas cuyo Pagado no coincide con Anticipo COP:');
    for (const d of diferencias) console.log(` · ${d.huesped}: anticipo ${formatearCOP(d.anticipo)} vs pagado ${formatearCOP(d.pagado)}`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Pagado coincide con Anticipo COP en todas las reservas con anticipo.');
  }
}
```

- [ ] **Step 4: Ejecutar la migración contra Airtable real**

```bash
npm run migrar            # simulación: revisar la lista con gerencia si hay dudas
npm run migrar:aplicar    # escribe; termina con "✓ Pagado coincide…"
npm run migrar            # segunda vez: "con anticipo y sin pagos: 0" (idempotente)
```
Comprobar en Airtable (gerencia o `list_records_for_table` vía MCP) que las reservas con anticipo muestran `Pagado` = anticipo y `Saldo` vacío (sin valor total).

- [ ] **Step 5: Renombrar el campo viejo** con `update_field` sobre `Reservas`: campo `Anticipo COP` → `name: "Anticipo COP (legado)"`, `description: "Sustituido por la tabla Pagos el 2026-10-12. Ya no se escribe."`.

- [ ] **Step 6: Commit**

```bash
git add lib/migracion.js tests/migracion.test.js scripts/migrar-anticipos.mjs
git commit -m "Migración de anticipos a la tabla Pagos (simulación y aplicación)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 21: Despliegue a producción y verificación de extremo a extremo

**Files:** ninguno nuevo.

- [ ] **Step 1: Desplegar**

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
npm test                                   # todo verde antes de desplegar
npx vercel deploy --prod --yes             # imprime la URL de producción
```
Anotar la URL (`https://villa-aura-reservas.vercel.app` o la definitiva) como `URL_PROD`.

- [ ] **Step 2: Humo desde la terminal**

```bash
URL_PROD="https://villa-aura-reservas.vercel.app"
curl -s "$URL_PROD/api/salud"                                   # {"ok":true,"airtable":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" "$URL_PROD/"           # 200
curl -s -o /dev/null -w "%{http_code}\n" "$URL_PROD/calendario" # 200 (cleanUrls)
curl -s -o /dev/null -w "%{http_code}\n" "$URL_PROD/api/reservas?desde=2026-10-01&hasta=2026-11-01"  # 401 sin PIN
curl -s "$URL_PROD/" | grep -c "patWvwhl\|app[A-Za-z0-9]\{14\}"   # 0: ningún secreto ni id en la página
```
Si algo falla: `npx vercel logs "$URL_PROD"` muestra los `console.error` de las funciones.

- [ ] **Step 3: Lista de verificación en el celular** (gerencia, con el PIN real; spec §13):
1. Abrir `URL_PROD` → PIN → formulario.
2. Crear una reserva de prueba (huésped `PRUEBA borrar`) con abono.
3. `URL_PROD/calendario` → aparece la barra, la tarjeta y los indicadores cambian.
4. Registrar un segundo abono → saldo actualizado.
5. En Airtable: la reserva, dos registros en `Pagos`, `Pagado`, `Saldo` y `Estado = Confirmado`.
6. Intentar otra reserva de la misma habitación en esas fechas → mensaje de conflicto.
7. Borrar el PIN del celular (ajustes del navegador → datos del sitio) o usar otro celular con PIN incorrecto → vuelve a pedirlo.
8. Borrar en Airtable la reserva `PRUEBA borrar` y sus dos pagos.

- [ ] **Step 4: Registrar `URL_PROD` en `MEMORY.md` del proyecto** con fecha y hora del primer despliegue.

---

### Task 22: GitHub — publicar el código y redirigir el enlace viejo

**Files:**
- Create (rama `gh-pages`, un solo archivo): `index.html`

- [ ] **Step 1: Última revisión de secretos antes de publicar**

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
git grep -n -E "pat[A-Za-z0-9]{14}\.|app[A-Za-z0-9]{14}|tbl[A-Za-z0-9]{14}" -- . ':!package-lock.json' || echo "limpio"
git log --all -p | grep -c "patWvwhl"   # 0
```

- [ ] **Step 2: Crear la rama `gh-pages` con la redirección y cambiar la fuente de Pages ANTES de tocar `master`**

```bash
git checkout --orphan gh-pages
git rm -rf --quiet .
cat > index.html <<'HTML'
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=https://villa-aura-reservas.vercel.app/">
<title>Villa Aura — nueva dirección</title>
<script>location.replace('https://villa-aura-reservas.vercel.app/');</script>
</head><body style="font-family:Poppins,system-ui,sans-serif;text-align:center;padding:48px 24px;color:#151635">
<p>El formulario de Villa Aura se movió.</p>
<p><a href="https://villa-aura-reservas.vercel.app/">Toca aquí si no te redirige automáticamente.</a></p>
</body></html>
HTML
# Reemplazar las tres URLs por URL_PROD si el nombre del proyecto cambió.
git add index.html
git commit -m "Redirección del enlace viejo de GitHub Pages al sistema en Vercel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin gh-pages
gh api -X PUT repos/hotelerojulian2593-dev/villa-aura-reservas/pages -f "source[branch]=gh-pages" -f "source[path]=/"
git checkout vercel-mini-pms
```

- [ ] **Step 3: Integrar en `master` y publicar**

```bash
git checkout master
git merge --ff-only vercel-mini-pms
git push origin master
git branch -d vercel-mini-pms
```

- [ ] **Step 4: Verificar la redirección** (Pages tarda 1–2 minutos en reconstruir):

```bash
curl -s -L -o /dev/null -w "%{url_effective} %{http_code}\n" https://hotelerojulian2593-dev.github.io/villa-aura-reservas/
# → https://villa-aura-reservas.vercel.app/ 200   (curl sigue el meta refresh solo si hay Location; si imprime la URL de github con 200, abrir en el navegador y comprobar que salta a Vercel)
curl -s https://hotelerojulian2593-dev.github.io/villa-aura-reservas/ | grep -c "vercel.app"   # ≥ 1
```

---

### Task 23: Monitor, documentación, aviso a las señoras y rotación del token

**Files:**
- Create: `README.md`, `docs/2026-10-12-villa-aura-mini-pms-vercel-design.md`, `docs/2026-10-12-villa-aura-mini-pms-vercel.md` (copias del spec y de este plan, sin IDs)
- Modify: `/Users/marketinghotelero/Villa aura/CLAUDE.md` (sección "Sistema operativo" y "Archivos clave"), `/Users/marketinghotelero/Villa aura/MEMORY.md`

- [ ] **Step 1: Monitor UptimeRobot (gerencia, 3 minutos):** crear cuenta gratuita en `uptimerobot.com` con `gerencia@marketinghotelero.co` → *Add New Monitor* → tipo **HTTP(s)** → *Friendly Name* `Villa Aura API` → URL `URL_PROD/api/salud` → intervalo **5 minutos** → *Alert Contacts*: el email de gerencia → *Create Monitor*. Verificar que queda en verde ("Up"). Probar la alerta: pausar el monitor y reanudarlo no dispara alerta; para una prueba real, cambiar temporalmente la URL del monitor a `URL_PROD/api/no-existe` (devuelve 404), esperar el aviso por email, y volver a `/api/salud`.

- [ ] **Step 2: `README.md` del repo** (guía de operación, en español, sin secretos):

```markdown
# Villa Aura — Reservas y mini-PMS

Formulario de reservas (`/`), calendario de ocupación y abonos (`/calendario`) y API (`/api/*`) sobre Airtable, desplegados en Vercel. Diseño y plan en `docs/`.

## Comandos
- `npm test` — pruebas (vitest).
- `npm run dev:falso` — app local con Airtable en memoria (PIN `123456`).
- `npm run dev` — app local contra Airtable real (requiere `.env.local`: `npx vercel env pull .env.local`).
- `npx vercel deploy --prod` — publicar. No hay integración con Git: se despliega desde esta carpeta.

## Variables de entorno (Vercel → Settings → Environment Variables)
`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `PIN_SENORAS`; opcionales `AIRTABLE_TABLA_RESERVAS` (Reservas) y `AIRTABLE_TABLA_PAGOS` (Pagos). Tras cambiar una variable hay que redesplegar.

## Operación
- **Cambiar el PIN:** editar `PIN_SENORAS` en Vercel → `npx vercel deploy --prod` → avisar a las señoras. Los celulares pedirán el PIN nuevo solos.
- **Rotar el token de Airtable:** crear token nuevo (scopes `data.records:read/write`, solo esta base) → reemplazar `AIRTABLE_TOKEN` en Vercel → redesplegar → revocar el viejo.
- **Alerta de UptimeRobot:** abrir `URL_PROD/api/salud`. Si dice `airtable: error`, revisar el token y el estado de Airtable; si no responde, `npx vercel logs <URL_PROD>` y el panel de Vercel.
- **Agregar un medio de pago:** opción en el campo `Medio` de Airtable **y** en la constante `MEDIOS` de `lib/validar.js`, `public/index.html` y `public/calendario.html`.
- **Corregir o cancelar una reserva:** directamente en Airtable (la API no borra ni edita).
- **Reservas viejas sin valor total:** completar `Valor total` en Airtable para que el mini-PMS muestre el saldo.
```

- [ ] **Step 3: Copiar el spec y este plan al repo** (`formulario/docs/`) y verificar que no contengan IDs ni tokens:

```bash
mkdir -p docs
cp "/Users/marketinghotelero/Villa aura/docs/superpowers/specs/2026-10-12-villa-aura-mini-pms-vercel-design.md" docs/
cp "/Users/marketinghotelero/Villa aura/docs/superpowers/plans/2026-10-12-villa-aura-mini-pms-vercel.md" docs/
grep -n -E "pat[A-Za-z0-9]{14}\.|app[A-Za-z0-9]{14}|tbl[A-Za-z0-9]{14}" docs/*.md README.md || echo "limpio"
```

- [ ] **Step 4: Actualizar `CLAUDE.md` del proyecto** (`/Users/marketinghotelero/Villa aura/CLAUDE.md`), sección **Sistema operativo**: el flujo pasa a ser WhatsApp → anticipo → la señora abre `URL_PROD` (PIN) → llena el formulario incluyendo valor total y abono → Airtable se actualiza → el calendario `URL_PROD/calendario` lo muestra y permite registrar abonos. Agregar un bloque **Arquitectura técnica (2026-10-12)**: Vercel (páginas + API), Airtable (tablas `Reservas` y `Pagos`), PIN, UptimeRobot, repo y comandos; indicar que n8n/Railway quedó retirado. En **Archivos clave** añadir el spec y el plan del 2026-10-12 y el `README.md` del repo.

- [ ] **Step 5: Actualizar `MEMORY.md` del proyecto:** estado actual (sistema en producción en `URL_PROD`), novedad 2026-10-12 (caída de n8n desde 2026-05-28, migración a Vercel, tabla `Pagos`, PIN, monitor), pendientes (gerencia completa `Valor total` de reservas viejas; borrar opciones basura de `Estado`). Cuando gerencia confirme que **revocó el token viejo**, borrar la línea del token de `MEMORY.md` y de la memoria de Claude (`project_villa_aura.md`), dejando solo "token en Vercel".

- [ ] **Step 6: Commit y push finales**

```bash
cd "/Users/marketinghotelero/Villa aura/formulario"
git add README.md docs/
git commit -m "README de operación y documentación de diseño y plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin master
npx vercel deploy --prod --yes     # para que la versión publicada incluya el README (no cambia la app)
```

- [ ] **Step 7: Aviso a las señoras (gerencia):** mensaje de WhatsApp con el enlace `URL_PROD`, el PIN, y dos frases: "Guarden el enlace en la pantalla de inicio; el enlace viejo también sirve" y "En *Calendario* ven lo ocupado y registran los abonos".

---

## Orden de ejecución y dependencias

```
T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17
                                                                                      ↓
                                               T18 (Airtable) → T19 (Vercel) → T20 (migración) → T21 (deploy + E2E) → T22 (GitHub) → T23 (monitor + docs)
```
T18 puede hacerse en cualquier momento después de T0 (no depende del código), pero T19–T23 van en ese orden. Las tareas que requieren a gerencia (token nuevo, PIN, login en Vercel, pegar variables, UptimeRobot, prueba en el celular, revocar token viejo) están marcadas con "gerencia".

## Criterios de cierre (del spec §15)

1. Una señora guarda una reserva desde el celular en < 60 s y aparece en el calendario.
2. Registra un abono y el saldo cambia al instante en el mini-PMS y en Airtable.
3. Dos reservas de la misma habitación en noches cruzadas no se pueden guardar (409).
4. Si `/api/salud` deja de responder, gerencia recibe email en < 10 min.
5. `git grep` de tokens/IDs en el repo y su historial devuelve 0.
6. Costo mensual $0.
