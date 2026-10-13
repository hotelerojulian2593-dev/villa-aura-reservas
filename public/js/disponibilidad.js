// Lógica pura de disponibilidad. Se usa idéntica en el celular (validación previa)
// y en el servidor (validación definitiva). Las fechas ISO se comparan como texto.
export const HABITACIONES = ['La Rosaura', 'La Yaneth', 'La Clara', 'La Luis', 'La Elsa'];
export const FULL_HOUSE = 'FULL HOUSE';
export const OPCIONES_HABITACION = [...HABITACIONES, FULL_HOUSE];

export function expandir(habitaciones) {
  return habitaciones.includes(FULL_HOUSE) ? [...HABITACIONES] : [...habitaciones];
}

export function seSolapan(a, b) {
  return a.entrada < b.salida && a.salida > b.entrada;
}

export function comparten(habsA, habsB) {
  const b = new Set(expandir(habsB));
  return expandir(habsA).some((h) => b.has(h));
}

export function buscarConflicto(nueva, existentes) {
  for (const existente of existentes) {
    if (nueva.id && existente.id === nueva.id) continue;
    if (seSolapan(nueva, existente) && comparten(nueva.habitaciones, existente.habitaciones)) return existente;
  }
  return null;
}
