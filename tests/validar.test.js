import { describe, it, expect } from 'vitest';
import { validarReservaNueva, validarPagoNuevo, validarRango, aEntero, MEDIOS } from '../lib/validar.js';

const HOY = '2026-10-12';
const buena = {
  huesped: '  Ana Pérez ', telefono: '310 000 0000', entrada: '2026-10-17', salida: '2026-10-19',
  habitaciones: ['La Rosaura', 'La Clara'], personas: 11, valorTotal: 1060000,
  abono: { monto: 530000, medio: 'Nequi' }, notas: ' Llegan tarde ',
};

describe('aEntero', () => {
  it('acepta enteros y cadenas de dígitos; rechaza decimales, negativos y texto', () => {
    expect(aEntero(5)).toBe(5);
    expect(aEntero('500000')).toBe(500000);
    expect(aEntero(500000.5)).toBeNaN();
    expect(aEntero('500.000')).toBeNaN();
    expect(aEntero('-1')).toBeNaN();
    expect(aEntero(null)).toBeNaN();
  });
});

describe('validarReservaNueva', () => {
  it('caso feliz: recorta espacios, completa la fecha del abono con hoy', () => {
    const v = validarReservaNueva(buena, HOY);
    expect(v.ok).toBe(true);
    expect(v.datos).toEqual({
      huesped: 'Ana Pérez', telefono: '310 000 0000', entrada: '2026-10-17', salida: '2026-10-19',
      habitaciones: ['La Rosaura', 'La Clara'], personas: 11, valorTotal: 1060000,
      abono: { monto: 530000, medio: 'Nequi', fecha: HOY, nota: '' }, notas: 'Llegan tarde',
    });
  });
  it('sin abono → abono null', () => {
    const { abono, ...sinAbono } = buena;
    expect(validarReservaNueva(sinAbono, HOY).datos.abono).toBeNull();
  });
  it('acepta valorTotal y personas como cadenas de dígitos', () => {
    const v = validarReservaNueva({ ...buena, valorTotal: '1060000', personas: '11' }, HOY);
    expect(v.datos.valorTotal).toBe(1060000);
    expect(v.datos.personas).toBe(11);
  });
  it('abono mayor al valor total se acepta (el cliente ya confirmó)', () => {
    expect(validarReservaNueva({ ...buena, abono: { monto: 2000000, medio: 'Efectivo' } }, HOY).ok).toBe(true);
  });
  it.each([
    [{ huesped: '' }, 'El nombre del huésped es requerido.'],
    [{ telefono: '  ' }, 'El teléfono es requerido.'],
    [{ entrada: '17/10/2026' }, 'La fecha de llegada no es válida.'],
    [{ salida: undefined }, 'La fecha de salida no es válida.'],
    [{ entrada: '2026-10-11', salida: '2026-10-13' }, 'La fecha de llegada no puede ser anterior a hoy.'],
    [{ salida: '2026-10-17' }, 'La fecha de salida debe ser posterior a la llegada.'],
    [{ habitaciones: [] }, 'Selecciona al menos una habitación.'],
    [{ habitaciones: ['La Suite'] }, 'Hay una habitación que no existe.'],
    [{ habitaciones: ['FULL HOUSE', 'La Clara'] }, 'Full House no se combina con habitaciones sueltas.'],
    [{ personas: 0 }, 'El número de personas debe estar entre 1 y 60.'],
    [{ personas: 61 }, 'El número de personas debe estar entre 1 y 60.'],
    [{ valorTotal: 0 }, 'El valor total acordado es requerido.'],
    [{ valorTotal: 1060000.5 }, 'El valor total acordado es requerido.'],
    [{ abono: { monto: -1, medio: 'Nequi' } }, 'El monto del abono debe ser un número entero mayor que cero.'],
    [{ abono: { monto: '500.000', medio: 'Nequi' } }, 'El monto del abono debe ser un número entero mayor que cero.'],
    [{ abono: { monto: 1000, medio: 'PayPal' } }, `El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.`],
    [{ abono: { monto: 1000, medio: 'Nequi', fecha: 'ayer' } }, 'La fecha del abono no es válida.'],
    [{ abono: { monto: 1000, medio: 'Nequi', nota: 'x'.repeat(501) } }, 'La nota no puede superar 500 caracteres.'],
  ])('rechaza %o', (cambio, mensaje) => {
    expect(validarReservaNueva({ ...buena, ...cambio }, HOY)).toEqual({ ok: false, error: mensaje });
  });
  it('permite reservar para hoy mismo', () => {
    expect(validarReservaNueva({ ...buena, entrada: HOY, salida: '2026-10-13' }, HOY).ok).toBe(true);
  });
});

describe('validarPagoNuevo', () => {
  it('caso feliz con fecha explícita', () => {
    expect(validarPagoNuevo({ reservaId: 'recABCDEFGHIJKLMN', monto: '200000', medio: 'Efectivo', fecha: '2026-10-19', nota: 'Al llegar' }, HOY))
      .toEqual({ ok: true, datos: { reservaId: 'recABCDEFGHIJKLMN', monto: 200000, medio: 'Efectivo', fecha: '2026-10-19', nota: 'Al llegar' } });
  });
  it('rechaza ids que no son de Airtable', () => {
    expect(validarPagoNuevo({ reservaId: '123', monto: 1, medio: 'Nequi' }, HOY)).toEqual({ ok: false, error: 'La reserva indicada no es válida.' });
    expect(validarPagoNuevo({ reservaId: "rec' OR 1=1", monto: 1, medio: 'Nequi' }, HOY).ok).toBe(false);
  });
});

describe('validarRango', () => {
  it('caso feliz', () => {
    expect(validarRango({ desde: '2026-10-01', hasta: '2026-11-01' })).toEqual({ ok: true, datos: { desde: '2026-10-01', hasta: '2026-11-01' } });
  });
  it.each([
    [{}, 'Indica desde y hasta en formato YYYY-MM-DD.'],
    [{ desde: '2026-10-01', hasta: '2026-10-01' }, '"hasta" debe ser posterior a "desde".'],
    [{ desde: '2026-10-01', hasta: '2027-01-15' }, 'El rango no puede superar 93 días.'],
  ])('rechaza %o', (query, mensaje) => {
    expect(validarRango(query)).toEqual({ ok: false, error: mensaje });
  });
});
