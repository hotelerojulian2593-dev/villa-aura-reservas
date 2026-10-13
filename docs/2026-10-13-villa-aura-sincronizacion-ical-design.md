# Villa Aura — Sincronización de disponibilidad con Airbnb (y Booking.com) por iCal (diseño)

**Fecha:** 2026-10-13
**Estado:** implementado el 2026-10-13. **Ajuste del mismo día (plan Free de Airtable, 1.000 llamadas/mes):** sin monitores de 5 min; el calendario pide sincronizar como máximo una vez por hora (`siViejo=60`, recordado en `localStorage`), `GET /api/reservas` ya no devuelve `sincronizacion` ni lee `Canales`, y al volver a la pestaña solo recarga si pasaron 5 min. Lo demás sigue vigente.
**Base:** `2026-10-12-villa-aura-mini-pms-vercel-design.md` (sistema en producción) y `2026-10-13-villa-aura-edicion-reservas-design.md` (gerencia, historial). Este documento solo describe lo que cambia.

---

## 1. Contexto y problema

Villa Aura se vende por dos caminos: directo (WhatsApp → formulario → Airtable) y Airbnb (más adelante Booking.com). Hoy nada conecta los dos: una venta directa no bloquea Airbnb y una reserva de Airbnb no aparece en el mini-PMS, así que el riesgo de doble reserva depende de que alguien lo recuerde. Las OTAs publican **un solo anuncio: la casa completa**.

## 2. Objetivos

1. Toda reserva activa en Villa Aura (de una habitación o de la casa) bloquea las mismas noches en Airbnb, sin intervención de nadie.
2. Toda reserva real de Airbnb aparece en el mini-PMS como Full House, bloquea la disponibilidad directa y, si el huésped la cancela en Airbnb, se cancela sola aquí con rastro en el Historial.
3. Todo se sincroniza solo, cada pocos minutos hacia adentro y en el ciclo de Airbnb hacia afuera; gerencia puede ver cuándo fue la última sincronización y forzar una.
4. Booking.com se conecta después pegando dos enlaces, sin volver a programar.
5. Las señoras no hacen nada distinto: ven las reservas de Airbnb en el calendario y el sistema les impide vender encima.

## 3. Fuera de alcance

- Precios, tarifas, mínimos de noches o mensajes hacia las OTAs (iCal solo transporta fechas).
- Registrar en el mini-PMS los pagos de reservas de canal (las cobra la plataforma).
- Importar los **bloqueos** manuales de Airbnb (decisión §4).
- Sincronización instantánea hacia Airbnb (límite de la plataforma, §9).
- API oficial de Airbnb o Booking, channel managers.

## 4. Decisiones tomadas con gerencia (2026-10-13)

| Pregunta | Decisión |
|---|---|
| ¿Qué canales? | **Airbnb ahora**; Booking.com cuando exista el anuncio (misma mecánica, solo configuración). |
| ¿Qué anuncian las OTAs? | **Solo la casa completa.** Cualquier reserva directa bloquea el anuncio; una reserva OTA = Full House aquí. |
| ¿Cada cuánto? | **Solo, cada 5 minutos** hacia adentro (UptimeRobot dispara la lectura; Vercel hobby solo permite una tarea propia al día) y al abrir el calendario si la última lectura tiene más de 10 minutos. Hacia afuera, el ciclo de Airbnb (~3 h, con botón "Actualizar" en Airbnb). |
| ¿Bloqueos manuales de Airbnb? | **No se importan.** Airbnb mezcla en "Airbnb (Not available)" los bloqueos manuales con días de preparación, estadía mínima, límite de meses y el eco de nuestro propio calendario; importarlos bloquearía la casa entera por una venta directa de una habitación. **Los bloqueos se hacen desde Villa Aura**: una reserva Full House con nombre "BLOQUEO …" en el formulario bloquea Airbnb sola. |
| ¿Qué entra de Airbnb? | Solo eventos con `SUMMARY` = `Reserved` (reservas reales). De Booking.com entra todo (su iCal no distingue reserva de bloqueo; se documenta). |

---

## 5. Permisos y seguridad

- **`ICAL_CLAVE`** (variable de Vercel, 32 hex aleatorios): forma parte del enlace de exportación y autoriza la lectura por URL. Las OTAs y UptimeRobot no pueden enviar cabeceras, por eso va en la URL. Comparación en tiempo constante (`pinCorrecto`). Cambiarla = editar la variable, redesplegar y volver a pegar el enlace en las OTAs.
- **`CRON_SECRET`** (variable de Vercel): Vercel la envía como `Authorization: Bearer …` en la tarea diaria; el endpoint la acepta como alternativa a `clave`.
- `GET /api/ical/<clave>.ics` → 401 si la clave no coincide (sin freno: 32 hex no se adivinan). Nunca expone nombres: cada evento dice solo "Villa Aura · ocupado".
- `GET|POST /api/sincronizar` acepta: `?clave=<ICAL_CLAVE>` (UptimeRobot), `Authorization: Bearer <CRON_SECRET>` (Vercel cron) o la cabecera `X-Pin` de las señoras (mini-PMS). Forzar desde la sección "Canales" exige además `X-Pin-Gerencia`.
- El enlace de exportación de Airbnb (que revela nuestras reservas de Airbnb) se guarda en Airtable, no en el repo público.
- La API sigue sin borrar nada: una reserva de Airbnb que desaparece de su calendario pasa a `Cancelada`.

## 6. Datos (Airtable)

**`Reservas` — campos nuevos**
- `Fuente` (selección única: `Directo`, `Airbnb`, `Booking.com`). Vacío = `Directo` (reservas existentes). El formulario y la API de creación directa escriben `Directo`.
- `UID canal` (texto): `UID` del evento iCal de la OTA. Con `Fuente` identifica la reserva sin duplicarla.
- `Enlace canal` (URL): enlace de la reserva en la OTA (lo trae `DESCRIPTION` de Airbnb); el mini-PMS lo muestra como botón "Ver en Airbnb".

Reserva creada por sincronización: `Huésped` = `Airbnb` (gerencia puede cambiarlo por el nombre real), `Teléfono` vacío, `Fecha entrada`/`Fecha salida` del evento (`DTEND` es exclusivo, igual que nuestra salida), `Habitaciones` = `[FULL HOUSE]`, `Personas` vacío, `Estado` = `Confirmado`, `Valor total` vacío, `Fuente`, `UID canal`, `Enlace canal`, `Notas` = `Reserva de Airbnb · código HMXXXXXXX · teléfono termina en 1234` (lo que traiga `DESCRIPTION`), `Historial` = línea `YYYY-MM-DD HH:mm · sincronización · llegó por Airbnb`.

**`Canales` — tabla nueva** (una fila por canal; gerencia la edita en Airtable)

| Campo | Tipo | Uso |
|---|---|---|
| `Canal` | texto (principal) | `Airbnb` o `Booking.com` (exacto) |
| `Activo` | casilla | Si está apagado no se lee ni se cuenta |
| `Enlace ICS` | URL | Enlace "Exportar calendario" de la OTA; gerencia lo pega aquí |
| `Última lectura` | fecha y hora | La escribe la sincronización |
| `Último resultado` | texto | `ok · 3 activas · 1 nueva · 0 cambiadas · 0 canceladas` o `error: …` |

Agregar Booking.com = una fila nueva con su enlace + pegar nuestro `.ics` en el extranet.

## 7. Módulos y API

### 7.1 `lib/ical.js` (puro)
- `parsearIcs(texto) → [{ uid, inicio, fin, resumen, descripcion }]`: desdobla líneas plegadas (CRLF + espacio), acepta `DTSTART;VALUE=DATE:20261017` y `DTSTART:20261017T150000Z` (toma la fecha), `DTEND` ausente → `inicio + 1 día`, desescapa `\n` `\,` `\;` `\\`. Exige `BEGIN:VCALENDAR`/`END:VCALENDAR`; si no, lanza `Error('ICS inválido')`.
- `eventosReserva(canal, eventos)`: Airbnb → solo `resumen === 'Reserved'`; Booking.com → todos. Descarta eventos con `fin <= hoy`.
- `datosDeDescripcion(descripcion)` → `{ codigo, telefonoFinal, enlace }` (regex sobre `Reservation URL` y `Phone Number (Last 4 Digits)`; vacíos si no están).
- `generarIcs(reservas, ahora)`: `VCALENDAR` con `PRODID:-//Villa Aura//Reservas//ES`, `VERSION:2.0`, `CALSCALE:GREGORIAN`, un `VEVENT` por reserva: `UID:<id>@villa-aura-reservas.vercel.app`, `DTSTAMP`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE` (salida, exclusiva), `SUMMARY:Villa Aura - ocupado` (solo ASCII, por compatibilidad). Líneas CRLF, plegado a 75 octetos.

### 7.2 `lib/sincronizar.js`
`sincronizarCanal({ cliente, tablas, canal, fetchImpl, ahora })`:
1. Descarga `Enlace ICS` (solo `https://`, timeout 8 s). Si falla la red, el HTTP no es 2xx o el ICS es inválido → **no toca ninguna reserva**; escribe en `Canales` solo `Último resultado = error: <motivo>` (`Última lectura` conserva la última lectura buena) y devuelve `{ ok: false, error }`.
2. `eventos = eventosReserva(canal, parsearIcs(texto))`.
3. Carga las reservas del canal con salida futura, **incluidas las canceladas**: `listar` con `formulaCanal(canal, hoy)` = `AND({Fuente} = '<canal>', IS_AFTER({Fecha salida}, DATETIME_PARSE('<hoy>', 'YYYY-MM-DD')))` (el falso la soporta). `hoy` = `hoyBogota(ahora)`.
4. Compara por `UID canal`:
   - **Nueva** (UID no existe): crea la reserva (§6). Si choca con otra reserva activa (`buscarConflicto` contra el rango), **igual se crea** (el huésped viene) y la línea de historial dice `llegó por Airbnb · ⚠ choca con <huésped>`.
   - **Cambiada** (mismo UID, otras fechas): actualiza fechas + historial `sincronización · Airbnb cambió fechas: a → b`.
   - **Desaparecida** (activa aquí, no está en el ICS): `Estado = Cancelada` + historial `sincronización · canceló · ya no aparece en el calendario de Airbnb`.
   - **Reaparecida** (mismo UID, cancelada aquí, presente en el ICS): vuelve a `Confirmado` + historial `sincronización · reapareció en Airbnb`. Así una omisión pasajera del calendario de Airbnb nunca deja fechas sin bloquear.
   - **Duplicada** (dos activas con el mismo UID, por dos lecturas simultáneas): conserva la más antigua (`createdTime`) y cancela las demás con historial `sincronización · duplicada`.
5. Escribe en `Canales`: `Última lectura = ahora`, `Último resultado = ok · N activas · n nuevas · c cambiadas · x canceladas`.
6. Devuelve `{ ok: true, canal, activas, nuevas, cambiadas, canceladas, choques }`.

`sincronizarTodo({ cliente, tablas, fetchImpl, ahora, soloSiViejoMin })`: lee `Canales` activos; si `soloSiViejoMin` y todos tienen `Última lectura` más reciente que ese umbral → `{ ok: true, omitido: true }`; si no, sincroniza cada canal en serie y devuelve `{ ok: todos ok, canales: [...] }`.

### 7.3 `GET /api/ical/[archivo].js` → `/api/ical/<clave>.ics`
- `archivo` debe ser `<ICAL_CLAVE>.ics`; si no, 401 `{ error: 'Clave incorrecta.' }`.
- Lista todas las reservas activas con `formulaRango(hoy, hoy + 730 días)` (sin canceladas, **todas las fuentes**: así Booking verá también las de Airbnb y viceversa) y responde `200`, `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: no-store`, cuerpo `generarIcs(...)`.
- Error de Airtable → 502 texto plano (las OTAs reintentan).

### 7.4 `GET|POST /api/sincronizar`
- Autorización §5. Query opcional `siViejo=10` (minutos): solo sincroniza si hace falta (lo usa el calendario al abrir). `forzar=1` (gerencia): sincroniza ya. `estado=1` (gerencia): no sincroniza; devuelve el estado de los canales y `enlaceIcal` (el enlace de exportación completo) para la sección "Canales". Las respuestas de gerencia incluyen `enlaceIcal`.
- Respuesta `200 { ok: true, canales: [...] }` si todos los canales activos leyeron bien; **`502`** `{ ok: false, canales: [...] }` si alguno falló (así UptimeRobot avisa por email a gerencia). Sin canales activos → `200 { ok: true, canales: [] }`.
- `vercel.json`: `"crons": [{ "path": "/api/sincronizar", "schedule": "0 10 * * *" }]` (diaria; respaldo del monitor).

### 7.5 Cambios en endpoints existentes
- `GET /api/reservas`: cada reserva trae `fuente` (`Directo`|`Airbnb`|`Booking.com`), `uidCanal` y `enlaceCanal` (vacíos si es directa). La respuesta trae además `sincronizacion: [{ canal, ultimaLectura, ultimoResultado }]` para los canales activos (si `Canales` no se puede leer, `[]`; el calendario nunca se cae por eso).
- `POST /api/reservas` (directa): escribe `Fuente = Directo`. Sin otros cambios: las reservas de canal ya están en Airtable como Full House, así que la validación de choque las ve.
- `PATCH /api/reservas` sobre una reserva de canal: `cancelar` → `409 "Esta reserva es de Airbnb: cancélala en Airbnb y desaparecerá aquí."`; `cambios` solo admite `huesped`, `telefono`, `personas`, `valorTotal`, `notas` (fechas y habitaciones → `400 "Las fechas y habitaciones de una reserva de Airbnb se cambian en Airbnb."`).
- `POST /api/pagos` y `PATCH /api/pagos` sobre una reserva de canal → `409 "Los pagos de Airbnb no se registran aquí."`.
- `lineaHistorial(texto, ahora, quien = 'gerencia')`: la sincronización firma `sincronización`.
- `camposReservaNueva` agrega `'Fuente': 'Directo'`; `aReservaApi` lee `Fuente`, `UID canal`, `Enlace canal`. `public/js/canales.js` (puro, compartido): `FUENTES`, `CANALES`, `esDeCanal(reserva)`.

## 8. Pantallas (mini-PMS)

- **Calendario:** una reserva de canal es Full House (azul) con el texto del huésped (`Airbnb` hasta que gerencia lo cambie). Si choca con otra reserva activa del rango cargado (`idsConChoque` en el navegador, sobre `buscarConflicto`), la barra y la tarjeta muestran `⚠ Choque`.
- **Próximas llegadas:** la tarjeta muestra la etiqueta `Airbnb` en vez del estado de pago, sin barra de pago; "pers." se oculta si no hay dato.
- **Detalle:** sin botón de WhatsApp si no hay teléfono; en lugar de Valor total / Pagado / Saldo, una línea "Cobro a través de Airbnb"; botón **Ver en Airbnb** (enlace de la reserva) si existe; sin **Registrar abono**. En el bloque de gerencia, **Editar** muestra solo nombre, teléfono, personas, valor total y notas; no hay **Cancelar** (texto: "Se cancela en Airbnb; al siguiente ciclo desaparece aquí").
- **KPIs del mes:** Ocupación cuenta las reservas de canal (5 noches-hab por noche); Cobrado y Por cobrar **no** las cuentan.
- **Sección "Canales"** (plegada al final, solo con PIN de gerencia, junto a "Canceladas del mes"; al abrirse pide `GET /api/sincronizar?estado=1`): por canal activo, nombre, "última lectura hace X min" y último resultado (en rojo si es error o si la última lectura tiene más de 30 min); botón **Sincronizar ahora** (`POST /api/sincronizar?forzar=1`); el enlace de exportación `https://villa-aura-reservas.vercel.app/api/ical/<clave>.ics` con botón **Copiar** y la instrucción de una línea "Pégalo en Airbnb → Calendario → Disponibilidad → Conectar calendarios → Importar".
- **Al abrir el calendario** (y al tocar Actualizar): tras dibujar, llama en segundo plano a `/api/sincronizar?siViejo=10` con el PIN de las señoras; si responde con nuevas/cambiadas/canceladas > 0, recarga y redibuja. Si falla, no muestra nada a las señoras (gerencia lo ve en "Canales").
- Las señoras ven exactamente lo de hoy más las barras de Airbnb; ninguna acción nueva.

## 9. Errores y casos borde

- Airbnb no responde / ICS inválido → nada se cancela, `Canales` guarda el error, `/api/sincronizar` responde 502 → UptimeRobot avisa a gerencia por email. El calendario sigue mostrando lo último sincronizado.
- Ventana de sincronización hacia Airbnb: hasta ~3 h (ciclo de Airbnb). Si entra una reserva de Airbnb sobre fechas recién vendidas directo, se crea igual marcada `⚠ Choque`; gerencia decide cuál cancelar (la directa aquí o la de Airbnb en Airbnb). Recomendación operativa: tras vender directo fechas cercanas, tocar "Actualizar" en el calendario conectado de Airbnb.
- Evento de Airbnb sin `DTEND` → una noche. Evento que ya terminó → se ignora. `UID` repetido en el mismo ICS → se toma el primero.
- Dos lecturas simultáneas (monitor + apertura del calendario) → posible duplicado que el siguiente ciclo cancela como `duplicada`.
- Booking.com: todo evento se trata como reserva `Booking.com`, incluidos bloqueos manuales del extranet (documentado en README; se recomienda no bloquear a mano en Booking).
- Reserva de canal editada por gerencia (nombre, personas, valor) conserva los cambios en ciclos siguientes (solo se tocan fechas y estado).
- `ICAL_CLAVE` o `CRON_SECRET` ausentes → `/api/ical` y `/api/sincronizar` responden 500 con mensaje claro; `/api/salud` no cambia.
- Historial de una reserva de canal usa la misma regla de una línea por operación.

## 10. Pruebas

- `lib/ical.js`: parseo (líneas plegadas, `VALUE=DATE`, fecha-hora UTC, sin `DTEND`, escapes, ICS inválido), filtro `Reserved`/todos, descarte de pasados, `datosDeDescripcion`, `generarIcs` (CRLF, plegado, fechas, sin nombres, canceladas excluidas por quien llama).
- `lib/sincronizar.js` con el Airtable falso y `fetch` simulado: nueva, cambiada, desaparecida, duplicada, choque (historial con ⚠), error de red/ICS inválido → cero escrituras en `Reservas` y `error:` en `Canales`, `siViejo` omite, canal inactivo se ignora, Booking importa todo.
- `api/ical`: 401 clave mala, 200 `text/calendar` con las activas de todas las fuentes y sin canceladas, 500 sin `ICAL_CLAVE`.
- `api/sincronizar`: 401 sin credencial, 200 con `clave`, 200 con `Bearer CRON_SECRET`, 200 con `X-Pin`, 502 si un canal falla, 405 otros métodos.
- Endpoints existentes: `fuente`/`canal`/`sincronizacion` en GET; `Fuente = Directo` al crear; 409/400 de PATCH y pagos sobre reservas de canal.
- Airtable falso: `formulaCanal`, tabla `Canales`.
- `calendario.html` (test textual): sección Canales, botón Sincronizar ahora, "Ver en Airbnb", llamada a `/api/sincronizar?siViejo=10`.
- Manual (gerencia): pegar enlaces, ver una reserva real de Airbnb en el calendario, intentar venderla directo (rechazo), forzar "Sincronizar ahora", comprobar en Airbnb que una reserva directa bloquea las noches tras "Actualizar".

## 11. Despliegue

1. Airtable (MCP): campos `Fuente`, `UID canal` y `Enlace canal` en `Reservas`; tabla `Canales` con la fila `Airbnb` (`Activo` **apagado** y `Enlace ICS` vacío: gerencia pega el enlace y marca `Activo`; así el monitor no alerta antes de tiempo).
2. Vercel: `ICAL_CLAVE` (la genera Claude Code con `openssl rand -hex 16`) y `CRON_SECRET` en los 3 entornos; `vercel.json` con el cron diario.
3. Código + tests → `npx vercel deploy --prod --yes` → humo: `GET /api/ical/<clave>.ics` → 200 `text/calendar`; `GET /api/sincronizar?clave=…` → 200 con `canales: []` o el error de Airbnb si el enlace aún no está.
4. Gerencia en Airbnb → Calendario → Disponibilidad → Conectar calendarios: **Exportar** (copiar enlace → pegarlo en Airtable `Canales` → `Airbnb` → `Enlace ICS`) e **Importar** (pegar `https://villa-aura-reservas.vercel.app/api/ical/<clave>.ics`, nombre "Villa Aura").
5. Gerencia en UptimeRobot: segundo monitor HTTP cada 5 min sobre `https://villa-aura-reservas.vercel.app/api/sincronizar?clave=<ICAL_CLAVE>`.
6. Verificación con una reserva real de Airbnb (si existe) y con una directa de prueba vista desde Airbnb. README: sección "Canales (Airbnb / Booking.com)". `CLAUDE.md` y `MEMORY.md` actualizados.

## 12. Criterios de éxito

1. Una reserva directa aparece bloqueada en Airbnb tras el siguiente ciclo (o al tocar "Actualizar" en Airbnb).
2. Una reserva de Airbnb aparece en el calendario como Full House en menos de 10 minutos y una señora no puede vender encima.
3. Si el huésped cancela en Airbnb, la reserva pasa a Cancelada aquí sola, con línea en el Historial.
4. Si Airbnb deja de responder, nada se cancela y gerencia recibe un email de UptimeRobot.
5. Booking.com se conecta sin tocar código: una fila en `Canales` y dos enlaces pegados.
6. El repo público sigue sin secretos ni enlaces privados.

## 13. Referencias

- Airbnb, "Sincronizar calendarios": lectura de calendarios importados ~cada 3 h, botón Actualizar con límite — https://www.airbnb.com/help/article/99
- Formato del calendario exportado por Airbnb (`Reserved` vs `Airbnb (Not available)`): observaciones de integradores — https://motopress.com/forums/topic/airbnb-ical-ics-sync-issue/ y https://github.com/antemimica80-cmd/Apartmani-Jadranka/pull/77
- Vercel cron jobs, plan Hobby: una ejecución al día como máximo — https://vercel.com/docs/cron-jobs/usage-and-pricing
