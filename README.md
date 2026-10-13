# Villa Aura — Reservas y mini-PMS

Formulario de reservas (`/`), calendario de ocupación y abonos (`/calendario`) y API (`/api/*`) sobre Airtable, desplegados en Vercel. Diseño y plan de implementación en `docs/`.

- Producción: `https://villa-aura-reservas.vercel.app`
- El enlace viejo de GitHub Pages (`hotelerojulian2593-dev.github.io/villa-aura-reservas/`) redirige a producción.

## Cómo está armado

```
public/            páginas estáticas (formulario, calendario, estilos MH) y módulos compartidos en public/js/
api/               funciones serverless: reservas.js (GET/POST/PATCH), pagos.js (POST/PATCH), salud.js (GET, monitor),
                   sincronizar.js (GET/POST, lee Airbnb/Booking), ical/[archivo].js (GET, calendario .ics para las OTAs)
lib/               servidor: cliente Airtable, validación, PIN, mapeo de campos, historial, iCal (ical.js), sincronización de canales (sincronizar.js), migración
scripts/           dev.mjs (servidor local) · migrar-anticipos.mjs (migración única de 2026-10-12)
tests/             vitest, un archivo por módulo
```

Sin build, sin framework, sin dependencias de ejecución. Node 24. La lógica pura (fechas, pesos, disponibilidad, pagos, calendario) vive en `public/js/` y la usan igual el navegador y el servidor.

## Comandos

- `npm test` — pruebas (vitest).
- `npm run dev:falso` — app local con Airtable en memoria y datos demo (PIN `123456`) en `http://localhost:3000`.
- `npm run dev` — app local contra Airtable real; requiere `.env.local` (`npx vercel env pull .env.local`).
- `npx vercel deploy --prod` — publicar. No hay integración con Git: se despliega desde esta carpeta con la sesión de Vercel del equipo `marketing-hotelero`.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Qué es |
|---|---|
| `AIRTABLE_TOKEN` | Token personal de Airtable con scopes `data.records:read` y `data.records:write`, acceso solo a la base de Villa Aura. **Nunca va en el repo.** |
| `AIRTABLE_BASE_ID` | Id de la base (`app…`). |
| `PIN_SENORAS` | PIN de 6 dígitos que piden el formulario y el calendario. |
| `PIN_GERENCIA` | PIN de 6 dígitos de gerencia: habilita editar/cancelar reservas y corregir/anular abonos. |
| `AIRTABLE_TABLA_RESERVAS` | Opcional; por defecto `Reservas`. |
| `AIRTABLE_TABLA_PAGOS` | Opcional; por defecto `Pagos`. |
| `AIRTABLE_TABLA_CANALES` | Opcional; por defecto `Canales`. |
| `ICAL_CLAVE` | 32 hex aleatorios. Forma el enlace de exportación `/api/ical/<clave>.ics` y autoriza `/api/sincronizar?clave=`. Cambiarla = redesplegar y volver a pegar el enlace en las OTAs y en UptimeRobot. |
| `CRON_SECRET` | La envía Vercel al cron diario de `/api/sincronizar` (`Authorization: Bearer`). |

Tras cambiar una variable hay que redesplegar (`npx vercel deploy --prod`).

## Operación

- **Cambiar el PIN:** editar `PIN_SENORAS` en Vercel → redesplegar → avisar a las señoras. Los celulares pedirán el PIN nuevo solos (la app borra el PIN guardado al recibir un 401).
- **Rotar el token de Airtable:** crear token nuevo (mismos scopes, solo esta base) → reemplazar `AIRTABLE_TOKEN` en Vercel → redesplegar → revocar el viejo en Airtable.
- **Alerta de UptimeRobot (`/api/salud` caído):** abrir `https://villa-aura-reservas.vercel.app/api/salud`. Si responde `"airtable":"error"`, el problema es el token o Airtable; si no responde, revisar el panel de Vercel y `npx vercel logs https://villa-aura-reservas.vercel.app`.
- **Agregar un medio de pago:** agregar la opción en el campo `Medio` de Airtable **y** en la constante `MEDIOS` de `lib/validar.js`, `public/index.html` y `public/calendario.html`.
- **Corregir o cancelar una reserva, corregir o anular un abono:** desde `/calendario` → detalle de la reserva → botón **Gerencia** (pide `PIN_GERENCIA` y lo guarda en ese celular; el botón **Salir de gerencia**, al final del bloque, lo olvida — úsalo si gerencia entró desde el celular de las señoras). Cancelar deja `Estado = Cancelada` (sale del calendario y de la disponibilidad; el registro queda); anular deja el abono en `$ 0` con la nota `ANULADO · antes $X · motivo`. Todo cambio se anota en el campo `Historial` de la reserva. La API **nunca borra**: ni reservas ni pagos. Restaurar una cancelada = cambiar `Estado` en Airtable.
- **Cambiar el PIN de gerencia:** editar `PIN_GERENCIA` en Vercel (3 entornos) → `npx vercel deploy --prod`.
- **Reservas anteriores a 2026-10-12 sin valor total:** completar `Valor total` en Airtable para que el mini-PMS muestre el saldo; mientras tanto aparecen como "Valor total sin definir".
- **Opciones basura en `Estado`** (`Todo`, `In progress`, `Done`): borrarlas a mano en Airtable; la API no puede eliminar opciones.
- **Canales (Airbnb / Booking.com), sincronización por iCal:**
  - *Conectar Airbnb:* en Airbnb → Calendario → Disponibilidad → Conectar calendarios → **Exportar**: copiar el enlace y pegarlo en Airtable → tabla `Canales` → fila `Airbnb` → `Enlace ICS`, y marcar `Activo`. Luego **Importar**: pegar el enlace que muestra `/calendario` → Gerencia → Canales → *Copiar enlace* (`https://villa-aura-reservas.vercel.app/api/ical/<ICAL_CLAVE>.ics`), nombre "Villa Aura".
  - *Agregar Booking.com:* fila nueva en `Canales` (`Canal` = `Booking.com`, su enlace de exportación, `Activo`) y pegar nuestro `.ics` en el extranet. Su iCal no distingue reservas de bloqueos: **no bloquear a mano en Booking** (todo entra como reserva `Booking.com`).
  - *Bloquear la finca:* registrar en el formulario una reserva Full House con nombre `BLOQUEO …`. **Nunca bloquear en Airbnb**: sus bloqueos no se importan (mezclan ecos de nuestro propio calendario, días de preparación y límite de meses).
  - *Qué entra de los canales:* solo reservas reales (`Reserved` en Airbnb). Se crean como Full House con huésped `Airbnb`/`Booking.com`, `Fuente`, `UID canal` y `Enlace canal`; si el huésped cancela en la plataforma, aquí pasan a `Cancelada` solas. Fechas, habitaciones y cancelación se manejan en la plataforma; nombre, teléfono, personas, valor y notas se pueden editar aquí (gerencia). No llevan abonos.
  - *Choques:* si una reserva de canal cae sobre fechas ya vendidas directo, igual se crea y el calendario marca `⚠ Choque` en ambas; gerencia decide cuál cancelar (la directa aquí, la del canal en su plataforma).
  - *Frecuencia:* UptimeRobot dispara la lectura cada 5 min (`/api/sincronizar?clave=<ICAL_CLAVE>`), el calendario la pide al abrirse si pasaron más de 10 min y Vercel corre un respaldo diario. Airbnb lee nuestro calendario cada ~3 h; tras vender directo fechas cercanas conviene tocar *Actualizar* en el calendario conectado de Airbnb.
  - *Alerta de UptimeRobot sobre `/api/sincronizar`:* abrir `/calendario` → Gerencia → Canales: el último resultado dice qué falló (`error: …`). Si Airbnb cambió el enlace de exportación, pegarlo de nuevo en `Canales`. Nada se cancela mientras el canal falle.

## Seguridad

- El token de Airtable solo existe en Vercel y en `.env.local` (ignorado por git).
- PIN en cabecera `X-Pin`; tras el tercer intento fallido de una IP la respuesta se demora (1 s, 2 s, 4 s… hasta 30 s).
- Las operaciones de gerencia exigen las dos cabeceras (`X-Pin` y `X-Pin-Gerencia`); con el PIN de las señoras solamente responden 401.
- La API nunca borra; editar y cancelar exigen el PIN de gerencia. Con el PIN de las señoras filtrado, lo peor posible es una reserva o un abono falsos, visibles y corregibles.
- El `.ics` exportado no contiene nombres ni teléfonos (solo noches ocupadas); la clave de su URL vive en Vercel, en las OTAs, en UptimeRobot y en `Villa aura/MEMORY.md`. El enlace de exportación de Airbnb (que revela sus reservas) vive solo en la tabla `Canales` de Airtable.
- Repo público sin secretos: antes de publicar, `git grep -n -E "pat[A-Za-z0-9]{14}\." -- . ':!package-lock.json'` debe devolver nada.

## Contexto

Este sistema reemplazó el 2026-10-12 a un webhook de n8n alojado en Railway que llevaba caído desde mayo de 2026. Spec: `docs/2026-10-12-villa-aura-mini-pms-vercel-design.md`. Plan ejecutado: `docs/2026-10-12-villa-aura-mini-pms-vercel.md`. Gerencia (edición, cancelación, abonos): `docs/2026-10-13-villa-aura-edicion-reservas-design.md`. Canales iCal: `docs/2026-10-13-villa-aura-sincronizacion-ical-design.md` y su plan `docs/2026-10-13-villa-aura-sincronizacion-ical.md`.
