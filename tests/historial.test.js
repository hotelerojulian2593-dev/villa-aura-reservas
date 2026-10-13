import { describe, it, expect } from 'vitest';
import { marcaDeTiempo, lineaHistorial, anteponer, cambiosReales, describirCambios } from '../lib/historial.js';

const T = new Date('2026-10-13T19:05:00Z'); // 14:05 en Bogotá

describe('marca de tiempo y línea', () => {
  it('usa hora de Colombia y formato fijo', () => {
    expect(marcaDeTiempo(T)).toBe('2026-10-13 14:05');
    expect(marcaDeTiempo(new Date('2026-10-14T04:30:00Z'))).toBe('2026-10-13 23:30');
    expect(lineaHistorial('canceló · motivo: no viajó', T)).toBe('2026-10-13 14:05 · gerencia · canceló · motivo: no viajó');
  });
  it('antepone: lo reciente queda arriba', () => {
    expect(anteponer('', 'A')).toBe('A');
    expect(anteponer(undefined, 'A')).toBe('A');
    expect(anteponer('A', 'B')).toBe('B\nA');
  });
});

describe('cambiosReales y describirCambios', () => {
  const antes = { huesped: 'Ana', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'], personas: 4, valorTotal: 500000, notas: '' };
  it('ignora lo que no cambia y compara arrays por contenido', () => {
    expect(cambiosReales(antes, { huesped: 'Ana', habitaciones: ['La Rosaura'], personas: 5 })).toEqual({ personas: 5 });
    expect(cambiosReales(antes, { habitaciones: ['La Rosaura', 'La Clara'] })).toEqual({ habitaciones: ['La Rosaura', 'La Clara'] });
    expect(cambiosReales(antes, {})).toEqual({});
  });
  it('describe con etiquetas, flechas, dinero formateado y vacío como —', () => {
    expect(describirCambios(antes, { entrada: '2026-10-18', personas: 5, valorTotal: 600000, notas: 'tarde' }))
      .toBe('Fecha entrada: 2026-10-17 → 2026-10-18; Personas: 4 → 5; Valor total: $ 500.000 → $ 600.000; Notas: — → tarde');
    expect(describirCambios(antes, { habitaciones: ['FULL HOUSE'] })).toBe('Habitaciones: La Rosaura → FULL HOUSE');
    expect(describirCambios({ monto: 250000, medio: 'Nequi' }, { monto: 200000 })).toBe('Monto: $ 250.000 → $ 200.000');
  });
  it('no inventa texto cuando nada cambió', () => {
    expect(describirCambios(antes, { personas: 4 })).toBe('');
  });
});

describe('una operación = una línea (revisión final)', () => {
  it('los saltos de línea del texto del usuario se aplanan a un espacio', () => {
    expect(lineaHistorial('canceló · motivo: no viajó\npor lluvia', T)).toBe('2026-10-13 14:05 · gerencia · canceló · motivo: no viajó por lluvia');
    expect(lineaHistorial('editó Notas: a\r\n  b → c', T)).toBe('2026-10-13 14:05 · gerencia · editó Notas: a b → c');
  });
});

describe('firma', () => {
  it('por defecto firma gerencia; la sincronización firma con su nombre', () => {
    expect(lineaHistorial('llegó por Airbnb', T, 'sincronización')).toBe('2026-10-13 14:05 · sincronización · llegó por Airbnb');
    expect(lineaHistorial('x', T)).toBe('2026-10-13 14:05 · gerencia · x');
  });
});
