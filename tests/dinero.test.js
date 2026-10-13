import { describe, it, expect } from 'vitest';
import { parsearCOP, formatearCOP } from '../public/js/dinero.js';

describe('parsearCOP', () => {
  it('lee lo que escribe la señora con o sin formato', () => {
    expect(parsearCOP('$ 1.060.000')).toBe(1060000);
    expect(parsearCOP('530000')).toBe(530000);
    expect(parsearCOP('1,060,000')).toBe(1060000);
  });
  it('vacío, null o sin dígitos es 0', () => {
    expect(parsearCOP('')).toBe(0);
    expect(parsearCOP(null)).toBe(0);
    expect(parsearCOP('abc')).toBe(0);
  });
});

describe('formatearCOP', () => {
  it('separa miles con punto y antepone $', () => {
    expect(formatearCOP(1060000)).toBe('$ 1.060.000');
    expect(formatearCOP(530000)).toBe('$ 530.000');
    expect(formatearCOP(900)).toBe('$ 900');
    expect(formatearCOP(0)).toBe('$ 0');
  });
  it('redondea decimales y marca negativos', () => {
    expect(formatearCOP(530000.4)).toBe('$ 530.000');
    expect(formatearCOP(-100000)).toBe('-$ 100.000');
  });
  it('null o NaN devuelve cadena vacía', () => {
    expect(formatearCOP(null)).toBe('');
    expect(formatearCOP(NaN)).toBe('');
  });
});
