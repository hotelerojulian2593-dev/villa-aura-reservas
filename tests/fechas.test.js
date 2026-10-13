import { describe, it, expect } from 'vitest';
import {
  hoyBogota, esFechaISO, sumarDias, noches, rangoMes, esFinDeSemana,
  fechaCorta, fechaLarga, mesDeISO, nombreMes, diaSemana, DIAS_CORTOS,
} from '../public/js/fechas.js';

describe('hoyBogota', () => {
  it('a las 23:30 de Bogotá sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    // 2026-10-12 23:30 Bogotá (UTC-5) = 2026-10-13T04:30:00Z
    expect(hoyBogota(new Date('2026-10-13T04:30:00Z'))).toBe('2026-10-12');
  });
  it('a las 00:10 de Bogotá ya es el día siguiente', () => {
    expect(hoyBogota(new Date('2026-10-13T05:10:00Z'))).toBe('2026-10-13');
  });
  it('devuelve formato YYYY-MM-DD', () => {
    expect(hoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('esFechaISO', () => {
  it('acepta fechas reales', () => {
    expect(esFechaISO('2026-02-28')).toBe(true);
    expect(esFechaISO('2028-02-29')).toBe(true);
  });
  it('rechaza fechas inexistentes, otros formatos y tipos', () => {
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('2026-13-01')).toBe(false);
    expect(esFechaISO('12/10/2026')).toBe(false);
    expect(esFechaISO(20261012)).toBe(false);
    expect(esFechaISO(undefined)).toBe(false);
  });
});

describe('sumarDias y noches', () => {
  it('cruza mes y año', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('cuenta noches', () => {
    expect(noches('2026-10-17', '2026-10-19')).toBe(2);
    expect(noches('2026-10-17', '2026-10-17')).toBe(0);
  });
});

describe('rangoMes', () => {
  it('octubre 2026 tiene 31 días y termina el 1 de noviembre', () => {
    expect(rangoMes(2026, 10)).toEqual({ desde: '2026-10-01', hasta: '2026-11-01', dias: 31 });
  });
  it('diciembre pasa al año siguiente', () => {
    expect(rangoMes(2026, 12)).toEqual({ desde: '2026-12-01', hasta: '2027-01-01', dias: 31 });
  });
  it('febrero bisiesto', () => {
    expect(rangoMes(2028, 2).dias).toBe(29);
  });
});

describe('días de la semana y nombres', () => {
  it('sábado y domingo son fin de semana; lunes no', () => {
    expect(esFinDeSemana('2026-10-17')).toBe(true);
    expect(esFinDeSemana('2026-10-18')).toBe(true);
    expect(esFinDeSemana('2026-10-19')).toBe(false);
  });
  it('diaSemana y DIAS_CORTOS', () => {
    expect(diaSemana('2026-10-18')).toBe(0);
    expect(DIAS_CORTOS[diaSemana('2026-10-17')]).toBe('S');
  });
  it('formatos legibles', () => {
    expect(fechaCorta('2026-10-07')).toBe('7 oct');
    expect(fechaLarga('2026-10-17')).toBe('17 de octubre de 2026');
    expect(nombreMes(10)).toBe('octubre');
    expect(mesDeISO('2026-10-17')).toEqual({ anio: 2026, mes: 10 });
  });
});
