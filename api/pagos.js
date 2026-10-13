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
