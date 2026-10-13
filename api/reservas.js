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
