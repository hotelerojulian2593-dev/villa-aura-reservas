import { describe, it, expect } from 'vitest';
import {
  HABITACIONES, FULL_HOUSE, OPCIONES_HABITACION, expandir, seSolapan, comparten, buscarConflicto,
} from '../public/js/disponibilidad.js';

const r = (entrada, salida, habitaciones, id) => ({ id, entrada, salida, habitaciones });

describe('constantes', () => {
  it('cinco habitaciones y la opción Full House', () => {
    expect(HABITACIONES).toEqual(['La Rosaura', 'La Yaneth', 'La Clara', 'La Luis', 'La Elsa']);
    expect(OPCIONES_HABITACION).toEqual([...HABITACIONES, FULL_HOUSE]);
    expect(expandir([FULL_HOUSE])).toEqual(HABITACIONES);
    expect(expandir(['La Clara'])).toEqual(['La Clara']);
  });
});

describe('seSolapan', () => {
  it('la salida de una puede ser la entrada de la otra', () => {
    expect(seSolapan({ entrada: '2026-10-17', salida: '2026-10-19' }, { entrada: '2026-10-19', salida: '2026-10-21' })).toBe(false);
  });
  it('comparten al menos una noche', () => {
    expect(seSolapan({ entrada: '2026-10-17', salida: '2026-10-19' }, { entrada: '2026-10-18', salida: '2026-10-20' })).toBe(true);
    expect(seSolapan({ entrada: '2026-10-10', salida: '2026-10-25' }, { entrada: '2026-10-18', salida: '2026-10-20' })).toBe(true);
  });
});

describe('comparten', () => {
  it('Full House choca con cualquier habitación y viceversa', () => {
    expect(comparten([FULL_HOUSE], ['La Elsa'])).toBe(true);
    expect(comparten(['La Elsa'], [FULL_HOUSE])).toBe(true);
    expect(comparten([FULL_HOUSE], [FULL_HOUSE])).toBe(true);
  });
  it('habitaciones distintas no chocan', () => {
    expect(comparten(['La Rosaura', 'La Clara'], ['La Elsa'])).toBe(false);
    expect(comparten(['La Rosaura', 'La Clara'], ['La Clara'])).toBe(true);
  });
});

describe('buscarConflicto', () => {
  const existentes = [
    r('2026-10-17', '2026-10-19', ['La Rosaura'], 'recA'),
    r('2026-10-24', '2026-10-26', [FULL_HOUSE], 'recB'),
  ];
  it('misma habitación, noches cruzadas → devuelve la reserva que choca', () => {
    expect(buscarConflicto(r('2026-10-18', '2026-10-20', ['La Rosaura']), existentes)?.id).toBe('recA');
  });
  it('consecutivas (salida = entrada) → sin conflicto', () => {
    expect(buscarConflicto(r('2026-10-19', '2026-10-21', ['La Rosaura']), existentes)).toBeNull();
  });
  it('otra habitación en las mismas fechas → sin conflicto', () => {
    expect(buscarConflicto(r('2026-10-17', '2026-10-19', ['La Elsa']), existentes)).toBeNull();
  });
  it('una habitación suelta contra un Full House existente → conflicto', () => {
    expect(buscarConflicto(r('2026-10-25', '2026-10-27', ['La Yaneth']), existentes)?.id).toBe('recB');
  });
  it('Full House nuevo contra una habitación existente → conflicto', () => {
    expect(buscarConflicto(r('2026-10-16', '2026-10-18', [FULL_HOUSE]), existentes)?.id).toBe('recA');
  });
  it('ignora la propia reserva si tiene el mismo id', () => {
    expect(buscarConflicto(r('2026-10-17', '2026-10-19', ['La Rosaura'], 'recA'), existentes)).toBeNull();
  });
});
