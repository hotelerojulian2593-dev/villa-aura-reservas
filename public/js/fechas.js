// Fechas en formato ISO 'YYYY-MM-DD'. Todo "hoy" se calcula en hora de Colombia,
// porque de noche la hora UTC ya está en el día siguiente (bug del formulario viejo).
export const ZONA = 'America/Bogota';

const formatoISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
});

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function hoyBogota(ahora = new Date()) {
  return formatoISO.format(ahora);
}

export function deISO(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export function aISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

export function esFechaISO(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = deISO(valor);
  return !Number.isNaN(fecha.getTime()) && aISO(fecha) === valor;
}

export function sumarDias(iso, dias) {
  const fecha = deISO(iso);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return aISO(fecha);
}

export function noches(entrada, salida) {
  return Math.round((deISO(salida) - deISO(entrada)) / 86_400_000);
}

export function rangoMes(anio, mes) {
  const dos = (n) => String(n).padStart(2, '0');
  const desde = `${anio}-${dos(mes)}-01`;
  const hasta = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${dos(mes + 1)}-01`;
  return { desde, hasta, dias: noches(desde, hasta) };
}

export function mesDeISO(iso) {
  return { anio: Number(iso.slice(0, 4)), mes: Number(iso.slice(5, 7)) };
}

export function diaSemana(iso) {
  return deISO(iso).getUTCDay();
}

export function esFinDeSemana(iso) {
  const dia = diaSemana(iso);
  return dia === 0 || dia === 6;
}

export function nombreMes(mes) {
  return MESES[mes - 1];
}

export function fechaCorta(iso) {
  return `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
}

export function fechaLarga(iso) {
  const { anio, mes } = mesDeISO(iso);
  return `${Number(iso.slice(8, 10))} de ${MESES[mes - 1]} de ${anio}`;
}
