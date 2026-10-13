import { clienteDesdeEnv, esNoEncontrado } from '../lib/airtable.js';
import {
  tablasDesdeEnv, aReservaApi, aPagoApi, camposPagoNuevo, camposCambiosPago, cargarPagosPorIds, ESTADOS, FUENTES,
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
      if (esNoEncontrado(e)) { responder(res, 404, { ok: false, error: 'El abono no existe.' }); return null; }
      throw e;
    }
  }

  // Las reservas de canal (Airbnb, Booking.com) las cobra la plataforma: aquí no llevan pagos.
  const esDeCanal = (reserva) => reserva.fuente !== FUENTES.directo;
  const rechazarCanal = (res, reserva) => responder(res, 409, { ok: false, error: `Los pagos de ${reserva.fuente} no se registran aquí.` });

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
    if (esDeCanal(reserva)) return rechazarCanal(res, reserva);
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
    const reservaDelPago = aReservaApi(await cliente.obtener(tablas.reservas, reservaId));
    if (esDeCanal(reservaDelPago)) return rechazarCanal(res, reservaDelPago);
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
    const reservaDelPago = aReservaApi(await cliente.obtener(tablas.reservas, reservaId));
    if (esDeCanal(reservaDelPago)) return rechazarCanal(res, reservaDelPago);
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
