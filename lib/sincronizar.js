// Lee el calendario de un canal (Airbnb, Booking.com) y lo refleja en Airtable:
// crea, mueve, cancela y reactiva reservas Full House del canal. Nunca borra.
import { parsearIcs, eventosReserva, datosDeDescripcion } from './ical.js';
import { aReservaApi, formulaCanal, listarReservasEnRango, listarCanalesActivos, estadoCanal, ESTADOS } from './reservas.js';
import { lineaHistorial, anteponer } from './historial.js';
import { buscarConflicto, FULL_HOUSE } from '../public/js/disponibilidad.js';
import { hoyBogota } from '../public/js/fechas.js';
import { CANALES } from '../public/js/canales.js';

export const QUIEN = 'sincronización';
const TIMEOUT_MS = 8000;

export async function descargarIcs(url, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS) {
  if (!/^https:\/\//.test(String(url ?? ''))) throw new Error('El enlace del canal debe empezar por https://');
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetchImpl(url, { signal: control.signal, headers: { Accept: 'text/calendar' } });
    if (!respuesta.ok) throw new Error(`el canal respondió ${respuesta.status}`);
    return await respuesta.text();
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'el canal no respondió en 8 s' : e.message);
  } finally {
    clearTimeout(temporizador);
  }
}

export function camposReservaCanal(canal, evento, linea) {
  const { codigo, enlace, telefonoFinal } = datosDeDescripcion(evento.descripcion);
  const notas = [`Reserva de ${canal}`, codigo && `código ${codigo}`, telefonoFinal && `teléfono termina en ${telefonoFinal}`].filter(Boolean).join(' · ');
  return {
    'Huésped': canal, 'Fecha entrada': evento.inicio, 'Fecha salida': evento.fin, 'Habitaciones': [FULL_HOUSE],
    'Estado': ESTADOS.confirmado, 'Fuente': canal, 'UID canal': evento.uid, 'Notas': notas,
    ...(enlace ? { 'Enlace canal': enlace } : {}), 'Historial': linea,
  };
}

const resumen = (r) => `ok · ${r.activas} activas · ${r.nuevas} nuevas · ${r.cambiadas} cambiadas · ${r.canceladas} canceladas`;

async function buscarChoque(cliente, tablas, evento) {
  const existentes = (await listarReservasEnRango(cliente, tablas, evento.inicio, evento.fin)).map((reg) => aReservaApi(reg));
  return buscarConflicto({ entrada: evento.inicio, salida: evento.fin, habitaciones: [FULL_HOUSE] }, existentes);
}

function cancelar(cliente, tablas, r, texto, ahora) {
  return cliente.actualizar(tablas.reservas, r.id, { 'Estado': ESTADOS.cancelada, 'Historial': anteponer(r.historial, lineaHistorial(texto, ahora, QUIEN)) });
}

export async function sincronizarCanal({ cliente, tablas, canal, fetchImpl = globalThis.fetch, ahora = new Date() }) {
  const hoy = hoyBogota(ahora);
  const nombre = canal.canal;
  let eventos;
  try {
    // La tabla Canales la edita gerencia a mano: un nombre mal escrito se reporta, no se propaga.
    if (!CANALES.includes(nombre)) throw new Error(`canal desconocido "${nombre}": usa ${CANALES.join(' o ')}`);
    eventos = eventosReserva(nombre, parsearIcs(await descargarIcs(canal.enlace, fetchImpl)), hoy);
  } catch (e) {
    await cliente.actualizar(tablas.canales, canal.id, { 'Último resultado': `error: ${e.message}` });
    return { ok: false, canal: nombre, error: e.message };
  }

  const resultado = { ok: true, canal: nombre, activas: eventos.length, nuevas: 0, cambiadas: 0, canceladas: 0, choques: 0 };
  const registros = await cliente.listar(tablas.reservas, { filterByFormula: formulaCanal(nombre, hoy) });
  // Solo lo que creó la sincronización (tiene UID): una reserva marcada Airbnb a mano no se toca.
  const existentes = registros
    .map((reg) => ({ ...aReservaApi(reg), creada: reg.createdTime ?? '' }))
    .filter((r) => r.uidCanal)
    .sort((a, b) => a.creada.localeCompare(b.creada));
  const porUid = new Map();
  for (const r of existentes) porUid.set(r.uidCanal, [...(porUid.get(r.uidCanal) ?? []), r]);
  const enCalendario = new Set(eventos.map((e) => e.uid));

  for (const evento of eventos) {
    const grupo = porUid.get(evento.uid) ?? [];
    const activas = grupo.filter((r) => r.estado !== ESTADOS.cancelada);
    if (grupo.length === 0) {
      const choque = await buscarChoque(cliente, tablas, evento);
      const texto = `llegó por ${nombre}${choque ? ` · ⚠ choca con ${choque.huesped}` : ''}`;
      await cliente.crear(tablas.reservas, camposReservaCanal(nombre, evento, lineaHistorial(texto, ahora, QUIEN)));
      resultado.nuevas += 1;
      if (choque) resultado.choques += 1;
      continue;
    }
    for (const duplicada of activas.slice(1)) {
      await cancelar(cliente, tablas, duplicada, 'duplicada', ahora);
      resultado.canceladas += 1;
    }
    const vigente = activas[0] ?? grupo[0];
    if (!activas[0]) {
      await cliente.actualizar(tablas.reservas, vigente.id, {
        'Estado': ESTADOS.confirmado, 'Fecha entrada': evento.inicio, 'Fecha salida': evento.fin,
        'Historial': anteponer(vigente.historial, lineaHistorial(`reapareció en ${nombre}`, ahora, QUIEN)),
      });
      resultado.nuevas += 1;
      continue;
    }
    if (vigente.entrada !== evento.inicio || vigente.salida !== evento.fin) {
      const texto = `${nombre} cambió fechas: ${vigente.entrada} → ${vigente.salida} pasa a ${evento.inicio} → ${evento.fin}`;
      await cliente.actualizar(tablas.reservas, vigente.id, {
        'Fecha entrada': evento.inicio, 'Fecha salida': evento.fin, 'Historial': anteponer(vigente.historial, lineaHistorial(texto, ahora, QUIEN)),
      });
      resultado.cambiadas += 1;
    }
  }

  for (const r of existentes) {
    if (r.estado !== ESTADOS.cancelada && !enCalendario.has(r.uidCanal)) {
      await cancelar(cliente, tablas, r, `canceló · ya no aparece en el calendario de ${nombre}`, ahora);
      resultado.canceladas += 1;
    }
  }

  await cliente.actualizar(tablas.canales, canal.id, { 'Última lectura': ahora.toISOString(), 'Último resultado': resumen(resultado) });
  return resultado;
}

export async function sincronizarTodo({ cliente, tablas, fetchImpl = globalThis.fetch, ahora = new Date(), siViejoMin = 0 }) {
  const canales = await listarCanalesActivos(cliente, tablas);
  if (siViejoMin > 0 && canales.length > 0) {
    const frescos = canales.every((c) => c.ultimaLectura && ahora.getTime() - new Date(c.ultimaLectura).getTime() < siViejoMin * 60000);
    if (frescos) return { ok: true, omitido: true, canales: canales.map(estadoCanal) };
  }
  const resultados = [];
  for (const canal of canales) resultados.push(await sincronizarCanal({ cliente, tablas, canal, fetchImpl, ahora }));
  return { ok: resultados.every((r) => r.ok), canales: resultados };
}
