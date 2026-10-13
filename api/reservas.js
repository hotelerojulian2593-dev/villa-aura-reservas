import { clienteDesdeEnv } from '../lib/airtable.js';
import {
  tablasDesdeEnv, cargarReservasConPagos, listarReservasEnRango, aReservaApi, cargarPagosPorIds,
  camposReservaNueva, camposPagoNuevo, camposCambiosReserva, ESTADOS, FUENTES,
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
    if (actual.fuente !== FUENTES.directo && ['entrada', 'salida', 'habitaciones'].some((k) => k in reales)) {
      return responder(res, 400, { ok: false, error: `Las fechas y habitaciones de una reserva de ${actual.fuente} se cambian en ${actual.fuente}.` });
    }
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
    if (actual.fuente !== FUENTES.directo) return responder(res, 409, { ok: false, error: `Esta reserva es de ${actual.fuente}: cancélala en ${actual.fuente} y desaparecerá aquí.` });
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
        // Plan Free de Airtable (1.000 llamadas/mes): el GET no lee Canales; el estado lo pide gerencia con /api/sincronizar?estado=1.
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
