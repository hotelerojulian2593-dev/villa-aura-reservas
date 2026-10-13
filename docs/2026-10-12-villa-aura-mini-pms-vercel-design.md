# Villa Aura — Reservas + Mini-PMS en Vercel (diseño)

**Fecha:** 2026-10-12
**Estado:** aprobado en conversación; pendiente revisión final del documento
**Reemplaza parcialmente a:** `2026-05-18-villa-aura-reservas-design.md` (sigue vigente para precios, reglas de revenue y branding)

---

## 1. Contexto y problema

El formulario de reservas publicado en GitHub Pages (`hotelerojulian2593-dev.github.io/villa-aura-reservas/`) envía cada reserva a un webhook de **n8n alojado en Railway** (`primary-production-abbe.up.railway.app`). Ese n8n (proyecto Railway `vibrant-contentment`: Primary, Worker, Postgres, Redis) **no tiene ningún despliegue activo desde el 2026-05-28**: el último redeploy del Primary quedó `FAILED` y el siguiente `REMOVED`. Railway responde `404 Application not found`, el navegador bloquea la respuesta y el formulario muestra "Error de conexión. Verifica el internet". Nadie se enteró durante más de cuatro meses.

Además, la operación necesita algo que el sistema nunca tuvo: que las señoras vean **qué está ocupado** y **cuánto se ha pagado** de cada reserva, y puedan **registrar abonos**. Hoy solo existe un campo `Anticipo COP` por reserva; no hay valor total ni historial de pagos.

## 2. Objetivos

1. El formulario vuelve a guardar reservas en Airtable, sin exponer el token de Airtable en el navegador.
2. Las señoras abren un enlace en el celular y ven, de un vistazo, la ocupación por habitación y el estado de pago de cada reserva (mini-PMS sencillo, visualmente agradable, línea MH).
3. Las señoras registran abonos desde ese mini-PMS; gerencia sigue haciendo revenue en Airtable.
4. Si el sistema se cae, gerencia recibe un correo el mismo día.
5. Costo operativo: $0/mes.

## 3. Fuera de alcance (fase 2)

- Editar o cancelar reservas desde el mini-PMS (se hace en Airtable con la cuenta de gerencia).
- Cálculo automático de tarifas por temporada / festivos colombianos.
- Aviso de mínimo de noches (fin de semana 2, Semana Santa/diciembre 3).
- Notificación por email/WhatsApp al crear una reserva.
- PIN individual por persona.
- Dominio propio (se puede agregar en Vercel cuando se quiera).
- Revivir el n8n de Railway (decisión: no; la complejidad de 4 servicios fue lo que lo tumbó).

## 4. Decisiones tomadas con gerencia (2026-10-12)

| Pregunta | Decisión |
|---|---|
| ¿Qué es "el cotizador"? | El formulario de reservas. Síntoma: "Error de conexión". |
| ¿Cómo reemplazar el webhook? | Función serverless en **Vercel** (gratis). |
| ¿Dónde viven las páginas? | **Todo en un solo proyecto Vercel** (formulario + mini-PMS + API). El enlace viejo de GitHub Pages redirige al nuevo. |
| ¿Pagos? | **Varios abonos por reserva; las señoras los registran** desde el mini-PMS. El anticipo del formulario es el primer abono. |
| ¿Valor total? | **Lo escribe la señora** (lo acordado por WhatsApp). Sin motor de tarifas. |
| ¿Seguridad? | PIN de 6 dígitos para todo, API sin borrar/editar, token solo en servidor, monitor con alerta por email. |
| ¿Repo? | Sigue **público** (GitHub plan gratuito exige repo público para Pages). Sin secretos en el código ni en el historial. |

---

## 5. Arquitectura

```
Celular de la señora
   │  HTTPS + cabecera X-Pin
   ▼
Vercel (proyecto villa-aura-reservas)
   ├─ public/index.html        formulario
   ├─ public/calendario.html   mini-PMS
   └─ api/*.js                 funciones serverless (Node)
         │  Authorization: Bearer AIRTABLE_TOKEN (variable de entorno)
         ▼
Airtable — base "Villa Aura — Reservas": tablas Reservas y Pagos

GitHub Pages (enlace viejo) ──redirección──▶ Vercel
UptimeRobot ──cada 5 min──▶ GET /api/salud ──falla──▶ email gerencia@
```

- **Sin servidores propios.** Páginas estáticas + funciones que solo corren al usarse. No hay proceso que se cuelgue, base de datos propia ni disco que llenar.
- **Un solo punto con datos: Airtable**, con historial de cambios y snapshots.
- **Mismo origen** para páginas y API: no hay CORS.
- Vercel plan Hobby: HTTPS automático, mitigación DDoS incluida. Riesgo conocido: el plan Hobby es formalmente "no comercial"; si Vercel objetara, el mismo código se despliega en Cloudflare Workers o Railway (funciones estándar `(req, res)`, sin dependencias de plataforma salvo el adaptador).

### 5.1 Estructura del repo (`formulario/`, remoto `villa-aura-reservas`)

```
formulario/
  public/
    index.html          formulario de reserva
    calendario.html     mini-PMS
    brand.css           tokens MH compartidos (colores, Poppins, componentes base)
    app.js              cliente compartido: PIN (localStorage), fetch con X-Pin, formato COP, fechas Bogotá
  api/
    reservas.js         GET lista por rango · POST crear
    pagos.js            POST registrar abono
    salud.js            GET verificación para el monitor
  lib/
    airtable.js         cliente REST Airtable (token desde env, typecast, reintento 429)
    disponibilidad.js   lógica pura de solapamientos
    pagos.js            lógica pura: resumen pagado/saldo/estadoPago
    fechas.js           hoy en America/Bogota, noches, rangos de mes
    dinero.js           parseo y formato COP
    pin.js              verificación de PIN y freno de intentos
    validar.js          validación de payloads
  tests/                vitest (una suite por módulo de lib + tests de API con fetch simulado)
  vercel.json           { "cleanUrls": true }
  package.json          "type": "module", scripts: test
  README.md             operación: cambiar PIN, rotar token, qué hacer ante una alerta
```

- JavaScript ESM con JSDoc, sin build, sin framework, sin TypeScript. Node 20+.
- Vercel sirve `public/` como raíz (preset "Other") y `api/` como funciones. `cleanUrls` hace que `/calendario` sirva `calendario.html`.
- URL de producción: `https://villa-aura-reservas.vercel.app` (nombre del proyecto; si está tomado, Vercel sugiere otro y se documenta el definitivo).

---

## 6. Modelo de datos (Airtable, misma base)

IDs de base y tablas: ver `MEMORY.md` del proyecto (no se escriben aquí porque este repo es público).

### 6.1 Tabla `Reservas` (existente)

Campos que se **agregan**:

| Campo | Tipo | Notas |
|---|---|---|
| `Valor total` | Moneda COP, 0 decimales | Obligatorio en el formulario. Vacío en reservas anteriores a este cambio hasta que gerencia lo complete. |
| `Pagos` | Vínculo a `Pagos` | Lo crea Airtable al crear el vínculo desde `Pagos`. |
| `Pagado` | Rollup `SUM(values)` sobre `Pagos.Monto` | Para vistas de gerencia. |
| `Saldo` | Fórmula `IF({Valor total}, {Valor total} - {Pagado}, BLANK())` | Para vistas de gerencia. |

Campos que **cambian**:

| Campo | Cambio |
|---|---|
| `Anticipo COP` | Se renombra a `Anticipo COP (legado)`. La API deja de escribirlo. Sus valores se migran a `Pagos` (ver §11). |
| `Estado` | Se mantienen `Confirmado` y `Anticipo pendiente`. Las opciones `Todo / In progress / Done` son basura heredada: quitarlas a mano en Airtable (la API no borra opciones). No afecta el funcionamiento. |

Sin cambios: `Huésped`, `Teléfono`, `Fecha entrada`, `Fecha salida`, `Habitaciones` (La Rosaura, La Yaneth, La Clara, La Luis, La Elsa, FULL HOUSE), `Personas`, `Notas`, `Noches` (fórmula), `Temporada` (fórmula).

**Regla de `Estado`:** la API lo deriva, nunca la señora. `Confirmado` si la reserva tiene al menos un pago con monto > 0; `Anticipo pendiente` si no. Al registrar el primer abono de una reserva pendiente, la API la pasa a `Confirmado`.

### 6.2 Tabla `Pagos` (nueva)

| Campo | Tipo | Notas |
|---|---|---|
| `Concepto` | Texto (campo principal) | Lo arma la API: `Anticipo · {Huésped}` para el primer pago, `Abono · {Huésped}` para los demás, `Anticipo (migrado) · {Huésped}` en la migración. |
| `Reserva` | Vínculo a `Reservas` | Exactamente una reserva. |
| `Fecha` | Fecha (ISO) | Fecha del pago. Por defecto hoy (Bogotá). |
| `Monto` | Moneda COP, 0 decimales | > 0. |
| `Medio` | Selección única | `Nequi`, `Bancolombia`, `Daviplata`, `Efectivo`, `Otro`. Los chips del formulario y del mini-PMS llevan la misma lista fija; si gerencia agrega un medio en Airtable debe agregarse también en el código. |
| `Nota` | Texto largo | Opcional. |
| `Registrado` | Created time | Automático. |

### 6.3 Resumen de pagos (calculado por la API, no por Airtable)

El mini-PMS no depende de `Pagado`/`Saldo` de Airtable; la API calcula por reserva:

- `pagado` = suma de `Monto` de sus pagos.
- `saldo` = `valorTotal - pagado` si `valorTotal` existe; `null` si no.
- `estadoPago`: `sin_valor` (sin valor total) · `sin_anticipo` (pagado = 0) · `parcial` (0 < pagado < valorTotal) · `pagado` (pagado ≥ valorTotal).

---

## 7. API (funciones Vercel)

### 7.1 Convenciones

- Toda respuesta es JSON: éxito `{ "ok": true, ... }`; error `{ "ok": false, "error": "mensaje en español listo para mostrar" }`.
- Cabecera `X-Pin` obligatoria en `/api/reservas` y `/api/pagos`. Sin PIN o PIN incorrecto → `401`. `/api/salud` no pide PIN y no devuelve datos de huéspedes.
- Códigos: `200` OK, `201` creado, `400` datos inválidos, `401` PIN, `405` método no permitido, `409` conflicto de disponibilidad, `502` Airtable no disponible (tras reintento), `503` solo en `/api/salud` cuando Airtable no responde.
- Fechas siempre `YYYY-MM-DD`. Montos en pesos enteros.
- Cliente Airtable: REST `v0`, `typecast: true`, campos por nombre, timeout 8 s, **un reintento** tras 1 s si Airtable responde `429` o `5xx`.

### 7.2 `GET /api/reservas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`

Reservas que **tocan** el rango `[desde, hasta)`: `{Fecha entrada} < hasta AND {Fecha salida} > desde` (vía `filterByFormula`). Máximo 100 reservas por consulta (un mes nunca llega a eso con 5 habitaciones). Luego trae los pagos vinculados en lotes de 40 ids (`OR(RECORD_ID()='...', ...)`).

```json
{
  "ok": true, "desde": "2026-10-01", "hasta": "2026-11-01",
  "reservas": [{
    "id": "rec…", "huesped": "Ana Pérez", "telefono": "310 000 0000",
    "entrada": "2026-10-17", "salida": "2026-10-19", "noches": 2,
    "habitaciones": ["La Rosaura", "La Clara"], "personas": 11,
    "estado": "Confirmado", "notas": "",
    "valorTotal": 1060000, "pagado": 530000, "saldo": 530000, "estadoPago": "parcial",
    "pagos": [{ "id": "rec…", "fecha": "2026-10-12", "monto": 530000, "medio": "Nequi", "nota": "" }]
  }]
}
```

Lo usan el mini-PMS (mes visible) y el formulario (rango de la reserva que se va a guardar, para la validación previa en el celular).

### 7.3 `POST /api/reservas`

```json
{
  "huesped": "Ana Pérez", "telefono": "310 000 0000",
  "entrada": "2026-10-17", "salida": "2026-10-19",
  "habitaciones": ["La Rosaura", "La Clara"], "personas": 11,
  "valorTotal": 1060000,
  "abono": { "monto": 530000, "medio": "Nequi", "fecha": "2026-10-12" },
  "notas": "Llegan tarde"
}
```

Pasos, en orden:
1. Validar (`400` con el primer error legible): nombre y teléfono no vacíos; fechas válidas, `entrada ≥ hoy (Bogotá)`, `salida > entrada`; ≥ 1 habitación de la lista permitida; `FULL HOUSE` no se mezcla con habitaciones sueltas; `personas` entero 1–60; `valorTotal` entero > 0; si hay `abono`: `monto` entero > 0, `medio` de la lista, `fecha` válida (por defecto hoy). `abono.monto > valorTotal` se acepta (el cliente ya pidió confirmación).
2. Consultar reservas que tocan `[entrada, salida)` y verificar solapamiento (ver §8). Si hay choque → `409` con `{ "conflicto": { "huesped", "habitaciones", "entrada", "salida" } }`. No es atómico (dos guardados en el mismo milisegundo podrían pasar), pero cierra el caso real: dos celulares guardando con segundos de diferencia.
3. Crear la reserva con `Estado` = `Confirmado` si hay abono, si no `Anticipo pendiente`.
4. Si hay abono, crear el `Pago` vinculado. Si este paso falla, responder `201` con `"abonoRegistrado": false` y `"advertencia": "Reserva guardada, pero el abono no quedó registrado. Regístralo desde el calendario."` — nunca fallar en silencio ni dejar la reserva como no guardada.

Respuesta: `201 { "ok": true, "id": "rec…", "estado": "Confirmado", "abonoRegistrado": true }`.

### 7.4 `POST /api/pagos`

```json
{ "reservaId": "rec…", "monto": 530000, "medio": "Efectivo", "fecha": "2026-10-19", "nota": "Pago al llegar" }
```

1. Validar (`400`): `reservaId` con forma `rec…`; `monto` entero > 0; `medio` de la lista; `fecha` válida (por defecto hoy); `nota` ≤ 500 caracteres.
2. Leer la reserva (`404` si no existe) para armar el `Concepto` y conocer su `Estado`.
3. Crear el `Pago`. Si la reserva estaba `Anticipo pendiente`, actualizarla a `Confirmado`.
4. Recalcular y responder `201 { "ok": true, "pago": {…}, "resumen": { "valorTotal", "pagado", "saldo", "estadoPago", "estado" } }`.

### 7.5 `GET /api/salud`

Hace una lectura mínima a Airtable (`maxRecords=1`, solo el campo `Huésped`, sin devolverlo). Responde `200 { "ok": true, "airtable": "ok", "hora": "…" }` o `503 { "ok": false, "airtable": "error", "error": "…" }`. Es lo que vigila UptimeRobot.

### 7.6 PIN y freno de intentos (`lib/pin.js`)

- Variable `PIN_SENORAS` (6 dígitos). Comparación en tiempo constante.
- Intentos fallidos por IP en memoria de la instancia: tras el 3.º fallo, cada respuesta `401` espera `min(2^(n-3), 30)` segundos antes de responder. Es un freno de mejor esfuerzo (cada instancia de Vercel tiene su propia memoria), suficiente contra fuerza bruta sobre 1.000.000 de combinaciones; el PIN se rota en segundos desde Vercel si se filtra.
- Lo que puede hacer alguien con el PIN: crear reservas y abonos. Nunca borrar ni editar: la API no expone esas operaciones.

### 7.7 Variables de entorno (Vercel)

`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLA_RESERVAS`, `AIRTABLE_TABLA_PAGOS`, `PIN_SENORAS`. Ninguna se escribe en el repo; las de IDs tampoco (repo público). `.env.example` documenta los nombres sin valores.

---

## 8. Disponibilidad (`lib/disponibilidad.js`, lógica pura)

Dos reservas **chocan** si sus rangos de noches se solapan — `entradaA < salidaB && salidaA > entradaB` (el día de salida de una puede ser el de entrada de otra) — **y** comparten habitación, donde `FULL HOUSE` cuenta como todas las habitaciones: choca con cualquier habitación suelta y cualquier habitación suelta choca con un Full House. Esta función se usa idéntica en el celular (`app.js`) y en el servidor.

---

## 9. Formulario (`public/index.html`)

Parte de la versión local actual (branding MH, chips de habitaciones, formato COP, fechas mínimas) con estos cambios:

1. **PIN**: al abrir sin PIN guardado, pantalla "Ingresa el PIN" (teclado numérico). Se guarda en `localStorage`. Si la API responde `401`, se borra y se vuelve a pedir.
2. **Fechas**: `min` = hoy en **America/Bogota** (la versión actual usa `toISOString()` → UTC, y de noche bloquea el día de hoy). Al cambiar la entrada, la salida mínima es entrada + 1 día.
3. **Valor total acordado** (nuevo, obligatorio): campo numérico con formato `$ 1.060.000` mientras escribe.
4. **Abono inicial** (opcional) y, solo si hay abono, **Medio de pago** en chips (Nequi · Bancolombia · Daviplata · Efectivo · Otro). Si `abono > valorTotal`, aviso con confirmación.
5. **Se eliminan los botones de Estado** (la API lo deriva).
6. **Validación de disponibilidad** antes de enviar: `GET /api/reservas?desde=entrada&hasta=salida` + `lib` compartida; si choca, mensaje con habitación y fechas. El servidor vuelve a validar.
7. Envío `POST /api/reservas`. Botón en "Guardando…" y deshabilitado mientras responde. Error de red → "Sin conexión. Lo que escribiste sigue aquí; intenta de nuevo." (no se limpia nada). `409` → mensaje del conflicto. `401` → volver a pedir PIN.
8. **Pantalla de éxito**: huésped, habitaciones, fechas, personas, valor total, abono (si hubo) y `advertencia` si el abono no quedó; botones **"Ver calendario"** y **"+ Nueva reserva"**.

Orden de campos: Huésped · WhatsApp · Fechas · Habitaciones · Personas · Valor total · Abono inicial · Medio (condicional) · Notas · Guardar.

---

## 10. Mini-PMS (`public/calendario.html`)

Pensado para celular (375 px) y usable en escritorio. Paleta MH: navy `#151635`, dorado `#C49A2B`, fondo `#F4F4F6`, Poppins. Todo se dibuja a partir de una sola llamada `GET /api/reservas` del mes visible (`desde` = día 1, `hasta` = día 1 del mes siguiente).

1. **Encabezado navy**: "VILLA AURA · Calendario", selector de mes `‹ Octubre 2026 ›`, botón "Actualizar", botón "+ Nueva reserva" (→ `/`).
2. **Tres indicadores del mes**:
   - **Ocupación**: noches-habitación ocupadas en el mes ÷ (5 × días del mes). Full House = 5 habitaciones. Solo se cuentan noches dentro del mes.
   - **Cobrado**: suma de pagos con `Fecha` dentro del mes.
   - **Por cobrar**: suma de `saldo` (> 0) de reservas con `Fecha entrada` dentro del mes. Las reservas sin valor total no suman y se indican con "n sin valor total".
3. **Cuadrícula de ocupación**: una fila por habitación (La Rosaura, La Yaneth, La Clara, La Luis, La Elsa), una columna por día del mes (28 px en celular). Fines de semana con fondo sombreado; hoy con una línea dorada. Cada reserva es una barra desde la noche de entrada hasta la noche anterior a la salida, con el nombre del huésped; color navy = `Confirmado`, dorado = `Anticipo pendiente`, azul claro `#4A6FA5` = Full House (una barra en cada una de las 5 filas). Columna de nombres fija (sticky) y desplazamiento horizontal con el dedo; al abrir, la vista se desplaza a hoy. Tocar una barra abre el detalle.
4. **Lista "Próximas llegadas"**: tarjetas de las reservas del mes ordenadas por `Fecha entrada` (primero las que no han salido aún): huésped, `17 → 19 oct · 2 noches`, habitaciones, personas, y una barra de progreso de pago con etiqueta `Pagado ✓` / `Falta $ 530.000` / `Sin anticipo` / `Valor total sin definir`. Tocar abre el detalle.
5. **Detalle de reserva** (hoja deslizante desde abajo): huésped y teléfono con botón **WhatsApp** (`https://wa.me/57<número solo dígitos>`), fechas y noches, habitaciones, personas, notas; bloque de pagos: Valor total · Pagado · Saldo, lista de abonos (fecha, monto, medio, nota); botón **"Registrar abono"**.
6. **Registrar abono**: monto (formato COP; sugiere el saldo si existe), medio (chips), fecha (hoy, editable), nota. `POST /api/pagos`; al responder, la hoja muestra el nuevo resumen y la cuadrícula/lista se actualizan sin recargar. Si `monto > saldo`, aviso con confirmación.
7. **Estados**: esqueleto mientras carga; "Mes libre — ninguna reserva" si no hay; "Sin conexión" con botón "Reintentar"; PIN incorrecto → pantalla de PIN. Al volver a la pestaña (`visibilitychange`) se refresca.

Accesibilidad mínima: botones de ≥ 44 px, contraste AA en textos sobre navy y dorado, nombres de huésped con `title` completo cuando la barra es corta.

---

## 11. Migración de datos

Se hace una vez, desde Claude Code con las herramientas de Airtable, antes de publicar el formulario nuevo:

1. Crear tabla `Pagos` (§6.2) y los campos nuevos de `Reservas` (§6.1).
2. Para cada reserva con `Anticipo COP` > 0: crear un `Pago` con `Concepto = "Anticipo (migrado) · {Huésped}"`, `Reserva` = la reserva, `Fecha` = fecha de creación del registro (Bogotá), `Monto` = anticipo, `Medio` = `Otro`, `Nota` = "Migrado desde Anticipo COP".
3. Verificar que `Pagado` coincide con `Anticipo COP` en todas las reservas migradas.
4. Renombrar `Anticipo COP` → `Anticipo COP (legado)`.
5. `Valor total` queda vacío en reservas anteriores; gerencia lo completa cuando quiera. El mini-PMS las muestra como "Valor total sin definir".

---

## 12. Seguridad y disponibilidad (resumen operativo)

| Riesgo | Medida |
|---|---|
| El servicio se cae y nadie se entera (lo que pasó con n8n) | Sin servidores propios; `GET /api/salud` vigilado por UptimeRobot cada 5 min con alerta por email a gerencia@. |
| Enlace público → reservas falsas | PIN de 6 dígitos en formulario, calendario y abonos. |
| Fuerza bruta del PIN | Freno progresivo por IP (§7.6); rotación inmediata desde Vercel. |
| PIN filtrado | Solo permite crear reservas/abonos; nada se borra ni edita. Gerencia corrige en Airtable. |
| Token de Airtable expuesto | Solo en variables de Vercel; token nuevo con permisos de lectura/escritura de registros **solo en esta base**; el token anterior se revoca. El commit local que lo contenía se elimina del historial antes de publicar. |
| Datos corruptos o borrados por error | Historial de revisiones y snapshots de Airtable. |
| Saturación (DDoS) | Mitigación incluida en Vercel; HTTPS automático. |
| Datos personales (nombres, teléfonos) | Nunca en la URL ni en logs; solo tras PIN; repo sin datos. |

---

## 13. Pruebas

**Automáticas (`npm test`, vitest):**
- `disponibilidad`: solapamientos, borde `salida = entrada` de otra (no choca), Full House contra habitación suelta y viceversa, varias habitaciones.
- `fechas`: hoy en Bogotá (incluida la ventana 19:00–24:00 UTC-5 donde UTC ya es mañana), noches, rangos de mes, meses de 28/30/31 días.
- `dinero`: parseo de `"$ 1.060.000"` → `1060000` y formato inverso; vacío → 0.
- `pagos`: resumen con y sin valor total; `estadoPago` en los cuatro casos; cobrado/por cobrar del mes.
- `validar`: cada regla de §7.3 y §7.4 con su mensaje.
- `pin`: correcto, incorrecto, ausente, freno tras 3 fallos.
- API (`fetch` simulado): `POST /api/reservas` feliz, con abono, choque → `409`, PIN malo → `401`, campos faltantes → `400`, `429` con reintento exitoso, fallo al crear el pago → `201` con advertencia; `POST /api/pagos` feliz y cambio de `Estado`; `GET /api/salud` 200/503.

**Manual tras desplegar (lista de verificación):**
1. Abrir el enlace nuevo en un celular; ingresar PIN.
2. Crear una reserva de prueba con abono.
3. Verla en el calendario (barra, tarjeta, indicadores).
4. Registrar un segundo abono; ver el saldo actualizado.
5. Verificar en Airtable: reserva, dos pagos, `Pagado`, `Saldo`, `Estado`.
6. Intentar una reserva que choque → mensaje de conflicto.
7. Abrir el enlace viejo de GitHub Pages → redirige.
8. Forzar un PIN incorrecto → vuelve a pedirlo.
9. Borrar la reserva de prueba y sus pagos en Airtable.

---

## 14. Despliegue (orden)

1. **Airtable** (desde Claude Code): tabla `Pagos`, campos nuevos, migración (§11).
2. **Gerencia**: crea el token nuevo de Airtable (scopes `data.records:read` y `data.records:write`, acceso solo a esta base) y elige el PIN de 6 dígitos. Los pega directamente en Vercel → Project → Settings → Environment Variables (no pasan por chat ni archivos). Revoca el token anterior cuando el sistema nuevo esté probado.
3. **Vercel**: gerencia inicia sesión una vez en el navegador (`npx vercel login`); Claude Code crea el proyecto, carga las variables de IDs, despliega (`vercel --prod`) y prueba `/api/salud`.
4. **GitHub**: limpiar el historial local (eliminar el commit con el token), publicar `master`; crear rama `gh-pages` con un `index.html` de redirección (`meta refresh` + JS) y cambiar la fuente de Pages a esa rama.
5. **Monitor**: gerencia crea cuenta gratuita en UptimeRobot con gerencia@; monitor HTTP a `/api/salud`, intervalo 5 min, alerta por email.
6. **Señoras**: enviar el enlace nuevo y el PIN por WhatsApp; el viejo redirige igual.
7. **Documentación**: `README.md` del repo (operación), `CLAUDE.md` (URLs, arquitectura nueva, cómo cambiar el PIN) y `MEMORY.md` del proyecto (novedad del 2026-10-12, token rotado, n8n retirado).

---

## 15. Criterios de éxito

1. Una señora guarda una reserva desde el celular en menos de 60 segundos y aparece en el calendario sin intervención técnica.
2. Una señora registra un abono y el saldo se actualiza al instante en el mini-PMS y en Airtable.
3. Dos reservas de la misma habitación en fechas que se cruzan no pueden guardarse.
4. Si `/api/salud` deja de responder, gerencia recibe un email en menos de 10 minutos.
5. Ningún secreto (token, IDs, PIN) en el repo público ni en su historial.
6. Costo mensual: $0.
