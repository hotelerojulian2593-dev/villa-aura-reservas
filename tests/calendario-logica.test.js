import { describe, it, expect } from 'vitest';
import {
  barraEnMes, filasDe, colorEstado, ordenarProximas, telefonoWa, etiquetaPago, porcentajePago,
} from '../public/js/calendario-logica.js';

const MES = { desde: '2026-10-01', hasta: '2026-11-01' };
const base = { estado: 'Confirmado', valorTotal: 1060000, pagado: 530000, saldo: 530000, estadoPago: 'parcial' };
const A = { ...base, id: 'A', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'] };
const B = { ...base, id: 'B', entrada: '2026-10-30', salida: '2026-11-02', habitaciones: ['FULL HOUSE'], estado: 'Anticipo pendiente' };
const D = { ...base, id: 'D', entrada: '2026-09-29', salida: '2026-10-02', habitaciones: ['La Elsa'] };

describe('barraEnMes', () => {
  it('reserva completa dentro del mes', () => {
    expect(barraEnMes(A, MES.desde, MES.hasta)).toEqual({ diaInicio: 17, span: 2, cortadaIzq: false, cortadaDer: false });
  });
  it('recortada a la derecha cuando sigue en el mes siguiente', () => {
    expect(barraEnMes(B, MES.desde, MES.hasta)).toEqual({ diaInicio: 30, span: 2, cortadaIzq: false, cortadaDer: true });
  });
  it('recortada a la izquierda cuando viene del mes anterior', () => {
    expect(barraEnMes(D, MES.desde, MES.hasta)).toEqual({ diaInicio: 1, span: 1, cortadaIzq: true, cortadaDer: false });
  });
  it('fuera del mes → null', () => {
    expect(barraEnMes(A, '2026-11-01', '2026-12-01')).toBeNull();
  });
});

describe('filas y color', () => {
  it('Full House ocupa las cinco filas y se pinta azul', () => {
    expect(filasDe(B)).toHaveLength(5);
    expect(colorEstado(B)).toBe('fullhouse');
  });
  it('confirmado navy, pendiente dorado', () => {
    expect(colorEstado(A)).toBe('confirmado');
    expect(colorEstado({ ...A, estado: 'Anticipo pendiente' })).toBe('pendiente');
  });
});

describe('ordenarProximas', () => {
  it('primero las que no han salido, por fecha de llegada; las pasadas al final', () => {
    const pasada = { ...A, id: 'P', entrada: '2026-10-05', salida: '2026-10-06' };
    const enCurso = { ...A, id: 'E', entrada: '2026-10-11', salida: '2026-10-13' };
    expect(ordenarProximas([pasada, A, B, enCurso], '2026-10-12').map((r) => r.id)).toEqual(['E', 'A', 'B', 'P']);
  });
});

describe('telefonoWa', () => {
  it('normaliza al formato wa.me con indicativo 57 sin duplicarlo', () => {
    expect(telefonoWa('310 000 0000')).toBe('https://wa.me/573100000000');
    expect(telefonoWa('+57 310-000-0000')).toBe('https://wa.me/573100000000');
    expect(telefonoWa('573100000000')).toBe('https://wa.me/573100000000');
  });
  it('números demasiado cortos no generan enlace', () => {
    expect(telefonoWa('123')).toBeNull();
    expect(telefonoWa('')).toBeNull();
  });
});

describe('etiqueta y porcentaje de pago', () => {
  it('cuatro estados', () => {
    expect(etiquetaPago(A)).toBe('Falta $ 530.000');
    expect(etiquetaPago({ ...A, estadoPago: 'pagado', saldo: 0 })).toBe('Pagado ✓');
    expect(etiquetaPago({ ...A, estadoPago: 'sin_anticipo' })).toBe('Sin anticipo');
    expect(etiquetaPago({ ...A, estadoPago: 'sin_valor', valorTotal: null, saldo: null })).toBe('Valor total sin definir');
  });
  it('porcentaje acotado a 0–100', () => {
    expect(porcentajePago(A)).toBe(50);
    expect(porcentajePago({ ...A, pagado: 2000000 })).toBe(100);
    expect(porcentajePago({ ...A, valorTotal: null })).toBe(0);
  });
});
