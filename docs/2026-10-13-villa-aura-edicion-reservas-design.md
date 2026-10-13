# Villa Aura — Editar, cancelar y corregir abonos desde el mini-PMS (diseño)

**Fecha:** 2026-10-13
**Estado:** aprobado en conversación; pendiente revisión del documento
**Base:** `2026-10-12-villa-aura-mini-pms-vercel-design.md` (sistema en producción). Este documento solo describe lo que cambia.

---

## 1. Contexto y problema

Hoy la API solo crea reservas y registra abonos; corregir o cancelar se hace en Airtable con la cuenta de gerencia. Gerencia quiere hacerlo desde el mini-PMS en el celular, sin perder la protección actual: un PIN de las señoras filtrado o un toque equivocado no debe poder alterar una reserva real.

## 2. Objetivos

1. Gerencia edita una reserva (huésped, teléfono, fechas, habitaciones, personas, valor total, notas) desde el detalle en `/calendario`, con la misma validación de disponibilidad que al crear.
2. Gerencia cancela una reserva: deja de ocupar fechas y desaparece del calendario, pero el registro, sus pagos y su historial quedan en Airtable.
3. Gerencia corrige un abono (monto, fecha, medio, nota) o lo anula dejando rastro; `Pagado` y `Saldo` cuadran solos.
4. Todo cambio queda escrito en un historial legible dentro de la reserva.
5. Las señoras no ven nada distinto: siguen creando reservas y registrando abonos con su PIN.

## 3. Fuera de alcance

- Reembolsos (un abono anulado no genera devolución; el motivo se anota).
- Restaurar una reserva cancelada (se hace en Airtable cambiando `Estado`).
- Eliminar registros (nunca; ni reservas ni pagos).
- Cambiar el PIN de gerencia desde la app (se cambia en Vercel + redeploy, como el otro).

## 4. Decisiones tomadas con gerencia (2026-10-13)

| Pregunta | Decisión |
|---|---|
| ¿Quién edita/cancela? | **Solo gerencia**, con un **PIN distinto** (`PIN_GERENCIA`). |
| ¿Dónde? | **Enfoque A:** dentro del mini-PMS actual, botón **Gerencia** en el detalle de la reserva. |
| ¿Cancelar borra? | No. `Estado = Cancelada` + línea de historial con motivo. |
| ¿Anular abono borra? | No. `Monto = 0` + nota `ANULADO · antes $X · motivo`. |

---

## 5. Permisos y seguridad

- Nueva variable de entorno **`PIN_GERENCIA`** (6 dígitos, distinto de `PIN_SENORAS`), en los 3 entornos de Vercel.
- Las operaciones de gerencia (`PATCH /api/reservas`, `PATCH /api/pagos`) exigen **ambas** cabeceras: `X-Pin` (señoras, como hoy) y **`X-Pin-Gerencia`**. Se verifica primero `X-Pin`; si pasa, `X-Pin-Gerencia` con el mismo mecanismo (`lib/pin.js`, comparación en tiempo constante, freno progresivo por IP compartido con el otro PIN: un fallo de cualquiera de los dos cuenta).
- Respuestas: `401 { error: "PIN de gerencia incorrecto." }`; `500` si `PIN_GERENCIA` no está configurado.
- El navegador guarda el PIN de gerencia en `localStorage` (`va_pin_gerencia`) al validarlo; lo borra al recibir `401` y lo vuelve a pedir.
- Sigue sin existir ningún borrado en la API.

## 6. Datos (Airtable)

**`Reservas`**
- `Estado`: se agrega la opción **`Cancelada`** (la API la crea con `typecast: true` en el primer uso; alternativamente gerencia la agrega a mano).
- Campo nuevo **`Historial`** (texto largo). La API **antepone** una línea por operación, formato fijo:
  - `2026-10-13 14:05 · gerencia · editó Fecha entrada: 2026-10-17 → 2026-10-18; Personas: 4 → 5`
  - `2026-10-13 14:07 · gerencia · canceló · motivo: el cliente no viajó`
  - `2026-10-13 14:09 · gerencia · anuló abono del 2026-10-12 ($ 250.000 Nequi) · motivo: se registró dos veces`
  - `2026-10-13 14:10 · gerencia · corrigió abono del 2026-10-12: Monto 250.000 → 200.000`
  Hora en `America/Bogota`. Una reserva cancelada no vuelve a cambiar de estado por un abono (registrar abono en una cancelada → `409 "La reserva está cancelada."`).
- Disponibilidad: `formulaRango` agrega `{Estado} != 'Cancelada'`; el cliente falso replica el filtro. Las canceladas no se devuelven en `GET /api/reservas` salvo con `?incluirCanceladas=1` (solo lo usa el bloque "Canceladas" del mini-PMS, que exige PIN de gerencia).

**`Pagos`**
- Sin campos nuevos. Anular = `Monto: 0` y `Nota` = `ANULADO · antes $ 250.000 · <motivo>` (se conserva la nota anterior detrás, separada por ` | `). Corregir = `PATCH` de `Monto`, `Fecha`, `Medio`, `Nota`.
- Un abono anulado sigue listándose en el detalle, tachado, con su nota.

## 7. API

### 7.1 `PATCH /api/reservas` (PIN señoras + PIN gerencia)

Cuerpo, una de dos formas:
```json
{ "id": "rec…", "cambios": { "huesped": "…", "telefono": "…", "entrada": "2026-10-18", "salida": "2026-10-20", "habitaciones": ["La Rosaura"], "personas": 5, "valorTotal": 500000, "notas": "…" } }
```
```json
{ "id": "rec…", "cancelar": { "motivo": "el cliente no viajó" } }
```
Pasos (cambios): `400` si `id` no es `rec…` o `cambios` está vacío o algún valor no pasa las mismas reglas de `validarReservaNueva` (la fecha de entrada **sí** puede ser anterior a hoy al editar: una reserva en curso puede corregirse); `404` si no existe; `409 "La reserva está cancelada."` si `Estado = Cancelada`; si cambian fechas o habitaciones → consulta el rango nuevo y `buscarConflicto` **excluyendo la propia reserva** (`id`) → `409` con `conflicto`; luego `actualizar` con solo los campos que cambian + `Historial` (línea antepuesta); `200 { ok, reserva }` (la `reservaApi` completa con pagos).
Pasos (cancelar): `400` si `motivo` vacío (máx. 300); `404`; `409` si ya está cancelada; `actualizar` `Estado = Cancelada` + `Historial`; `200 { ok, reserva }`.

### 7.2 `PATCH /api/pagos` (PIN señoras + PIN gerencia)

```json
{ "id": "rec…", "cambios": { "monto": 200000, "fecha": "2026-10-12", "medio": "Nequi", "nota": "…" } }
```
```json
{ "id": "rec…", "anular": { "motivo": "se registró dos veces" } }
```
`400` reglas de `validarAbono` para los campos presentes (`monto` entero > 0); `404` si el pago no existe; `409 "El abono ya está anulado."` si `Monto = 0` y la nota empieza por `ANULADO`; escribe el pago y antepone la línea en `Historial` de su reserva; `200 { ok, pago, resumen }` (mismo `resumen` que `POST /api/pagos`). Si tras anular/corregir la reserva queda sin pagos > 0 y su `Estado` es `Confirmado`, **no** se cambia el estado automáticamente (gerencia decide); se anota en historial.

### 7.3 `GET /api/reservas` — cambio

Excluye `Cancelada` por defecto. Con `incluirCanceladas=1` **y** `X-Pin-Gerencia` válido, las incluye con `estado: "Cancelada"`. `reservaApi` agrega `historial: string` (texto completo) y, en cada pago, `anulado: boolean`.

## 8. Pantallas (mini-PMS)

- En la hoja de detalle, debajo de "Registrar abono": botón **Gerencia** (gris, discreto). Al tocarlo sin PIN de gerencia guardado → campo de PIN dentro de la hoja; con PIN guardado → se despliega el bloque de gerencia:
  - **Editar reserva** → formulario dentro de la hoja con los mismos campos y chips del formulario principal, precargados; al guardar, `PATCH`; muestra conflicto si lo hay; al terminar, la hoja y el calendario se redibujan.
  - **Cancelar reserva** → campo "Motivo" + botón rojo "Cancelar reserva" con confirmación; al terminar, la reserva sale del calendario y aparece un aviso "Reserva cancelada".
  - En cada abono: **Corregir** (monto, fecha, medio, nota) y **Anular** (motivo + confirmación). Los anulados se ven tachados.
  - **Historial** plegable (líneas tal cual).
- Bloque **"Canceladas del mes"** plegado al final de la página, visible solo con PIN de gerencia; lista simple (huésped, fechas, motivo).
- Las señoras sin PIN de gerencia ven exactamente lo de hoy.

## 9. Errores y casos borde

- Fechas nuevas ocupadas → `409` con el conflicto; nada cambia.
- Editar sin cambios reales → `400 "No hay cambios."`.
- Cancelar dos veces → `409`; anular dos veces → `409`.
- Reserva cancelada: no acepta abonos (`409`), no cuenta en KPIs ni en disponibilidad.
- PIN de gerencia incorrecto → `401`, el navegador lo olvida y lo vuelve a pedir; el freno por IP aplica.
- Sin internet → mismo mensaje que hoy; lo escrito se conserva.
- `Historial` crece sin límite práctico (texto largo de Airtable: 100 000 caracteres); se antepone para que lo reciente quede arriba.

## 10. Pruebas

- `lib/validar.js`: `validarCambiosReserva` (cada campo, vacío, entrada pasada permitida), `validarCancelacion`, `validarCambiosPago`, `validarAnulacion`.
- `lib/historial.js` (puro): `lineaHistorial(fecha, quien, texto)`, `describirCambios(antes, despues)` → texto `Campo: a → b; …`, `anteponer(historial, linea)`.
- `lib/pin.js`: `verificarPinGerencia` (reutiliza `verificarPin` con `PIN_GERENCIA`).
- `api/reservas.js` PATCH: 401 sin PIN gerencia, 400, 404, 409 cancelada, 409 conflicto (y que la propia reserva no choca consigo misma), 200 con historial y campos cambiados, cancelar feliz y doble.
- `api/pagos.js` PATCH: 401, 400, 404, 409 ya anulado, corregir feliz (resumen recalculado), anular feliz (Monto 0 + nota + historial).
- `GET /api/reservas`: excluye canceladas; `incluirCanceladas=1` sin PIN gerencia → 401.
- Falso Airtable: filtro `{Estado} != 'Cancelada'`.
- Manual en celular (gerencia): editar fechas, cancelar, corregir y anular un abono, ver historial; comprobar que las señoras (sin PIN gerencia) no ven el bloque.

## 11. Despliegue

1. Gerencia elige el PIN de gerencia (6 dígitos, distinto del de las señoras) y lo pasa por chat (secreto de bajo riesgo, como el otro); Claude Code lo carga en Vercel (3 entornos) y en `.env.local`.
2. Campo `Historial` en `Reservas` (MCP `create_field`, `multilineText`).
3. Código + tests → `npx vercel deploy --prod --yes` → humo (`PATCH` sin PIN gerencia → 401) → prueba en celular.
4. README: sección "Gerencia: editar, cancelar, corregir abonos" y cómo cambiar `PIN_GERENCIA`. `CLAUDE.md` y `MEMORY.md` actualizados.

## 12. Criterios de éxito

1. Gerencia cambia las fechas de una reserva desde el celular y el calendario lo refleja al instante; si las fechas nuevas están ocupadas, no lo permite.
2. Una reserva cancelada desaparece del calendario, no bloquea fechas y sigue en Airtable con motivo e historial.
3. Un abono anulado deja el saldo correcto y queda visible tachado con su motivo.
4. Con el PIN de las señoras solamente, ninguna operación de gerencia es posible (401), y la interfaz no la ofrece.
5. Nada se borra: `git grep` de `DELETE`/borrado en `api/` y `lib/` devuelve nada.
