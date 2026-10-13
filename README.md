# Villa Aura — Reservas y mini-PMS

Formulario de reservas (`/`), calendario de ocupación y abonos (`/calendario`) y API (`/api/*`) sobre Airtable, desplegados en Vercel. Diseño y plan de implementación en `docs/`.

- Producción: `https://villa-aura-reservas.vercel.app`
- El enlace viejo de GitHub Pages (`hotelerojulian2593-dev.github.io/villa-aura-reservas/`) redirige a producción.

## Cómo está armado

```
public/            páginas estáticas (formulario, calendario, estilos MH) y módulos compartidos en public/js/
api/               funciones serverless: reservas.js (GET/POST), pagos.js (POST), salud.js (GET, para el monitor)
lib/               servidor: cliente Airtable, validación, PIN, mapeo de campos, migración
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
| `AIRTABLE_TABLA_RESERVAS` | Opcional; por defecto `Reservas`. |
| `AIRTABLE_TABLA_PAGOS` | Opcional; por defecto `Pagos`. |

Tras cambiar una variable hay que redesplegar (`npx vercel deploy --prod`).

## Operación

- **Cambiar el PIN:** editar `PIN_SENORAS` en Vercel → redesplegar → avisar a las señoras. Los celulares pedirán el PIN nuevo solos (la app borra el PIN guardado al recibir un 401).
- **Rotar el token de Airtable:** crear token nuevo (mismos scopes, solo esta base) → reemplazar `AIRTABLE_TOKEN` en Vercel → redesplegar → revocar el viejo en Airtable.
- **Alerta de UptimeRobot (`/api/salud` caído):** abrir `https://villa-aura-reservas.vercel.app/api/salud`. Si responde `"airtable":"error"`, el problema es el token o Airtable; si no responde, revisar el panel de Vercel y `npx vercel logs https://villa-aura-reservas.vercel.app`.
- **Agregar un medio de pago:** agregar la opción en el campo `Medio` de Airtable **y** en la constante `MEDIOS` de `lib/validar.js`, `public/index.html` y `public/calendario.html`.
- **Corregir o cancelar una reserva:** directamente en Airtable con la cuenta de gerencia. La API no borra ni edita reservas: solo crea reservas, crea pagos y pasa el `Estado` a `Confirmado` al registrar el primer abono.
- **Reservas anteriores a 2026-10-12 sin valor total:** completar `Valor total` en Airtable para que el mini-PMS muestre el saldo; mientras tanto aparecen como "Valor total sin definir".
- **Opciones basura en `Estado`** (`Todo`, `In progress`, `Done`): borrarlas a mano en Airtable; la API no puede eliminar opciones.

## Seguridad

- El token de Airtable solo existe en Vercel y en `.env.local` (ignorado por git).
- PIN en cabecera `X-Pin`; tras el tercer intento fallido de una IP la respuesta se demora (1 s, 2 s, 4 s… hasta 30 s).
- La API no expone borrado ni edición: con el PIN filtrado, lo peor posible es una reserva o un abono falsos, visibles y corregibles en Airtable.
- Repo público sin secretos: antes de publicar, `git grep -n -E "pat[A-Za-z0-9]{14}\." -- . ':!package-lock.json'` debe devolver nada.

## Contexto

Este sistema reemplazó el 2026-10-12 a un webhook de n8n alojado en Railway que llevaba caído desde mayo de 2026. Spec: `docs/2026-10-12-villa-aura-mini-pms-vercel-design.md`. Plan ejecutado: `docs/2026-10-12-villa-aura-mini-pms-vercel.md`.
