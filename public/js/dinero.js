// Pesos colombianos enteros. Formato manual (no toLocaleString) para que Node y
// todos los navegadores de celular produzcan exactamente lo mismo.
export function parsearCOP(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  return digitos ? Number(digitos) : 0;
}

export function formatearCOP(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  const entero = Math.round(Math.abs(Number(n)));
  const conPuntos = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}$ ${conPuntos}`;
}
