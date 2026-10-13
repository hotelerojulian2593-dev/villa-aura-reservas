import { describe, it, expect } from 'vitest';
import { validarCambiosReserva, validarCancelacion, validarCambiosPago, validarAnulacion, MEDIOS } from '../lib/validar.js';

const ID = 'recAAAAAAAAAAAAAA';

describe('validarCambiosReserva', () => {
  it('normaliza solo las claves presentes', () => {
    expect(validarCambiosReserva({ id: ` ${ID} `, cambios: { huesped: ' Ana ', personas: '5', valorTotal: '600000', notas: ' tarde ' } }))
      .toEqual({ ok: true, datos: { id: ID, cambios: { huesped: 'Ana', personas: 5, valorTotal: 600000, notas: 'tarde' } } });
    expect(validarCambiosReserva({ id: ID, cambios: { entrada: '2026-10-18' } }).datos.cambios).toEqual({ entrada: '2026-10-18' });
  });
  it('permite fechas pasadas (una reserva en curso se puede corregir)', () => {
    expect(validarCambiosReserva({ id: ID, cambios: { entrada: '2020-01-01' } }).ok).toBe(true);
  });
  it.each([
    [{ id: '123', cambios: { personas: 2 } }, 'La reserva indicada no es válida.'],
    [{ id: ID }, 'No hay cambios.'],
    [{ id: ID, cambios: {} }, 'No hay cambios.'],
    [{ id: ID, cambios: [] }, 'No hay cambios.'],
    [{ id: ID, cambios: { estado: 'Confirmado' } }, 'Campo desconocido: estado.'],
    [{ id: ID, cambios: { huesped: '  ' } }, 'El nombre del huésped es requerido.'],
    [{ id: ID, cambios: { telefono: '' } }, 'El teléfono es requerido.'],
    [{ id: ID, cambios: { entrada: '18/10/2026' } }, 'La fecha de llegada no es válida.'],
    [{ id: ID, cambios: { salida: 'x' } }, 'La fecha de salida no es válida.'],
    [{ id: ID, cambios: { habitaciones: [] } }, 'Selecciona al menos una habitación.'],
    [{ id: ID, cambios: { habitaciones: ['La Suite'] } }, 'Hay una habitación que no existe.'],
    [{ id: ID, cambios: { habitaciones: ['FULL HOUSE', 'La Elsa'] } }, 'Full House no se combina con habitaciones sueltas.'],
    [{ id: ID, cambios: { personas: 0 } }, 'El número de personas debe estar entre 1 y 60.'],
    [{ id: ID, cambios: { valorTotal: 1.5 } }, 'El valor total acordado es requerido.'],
  ])('rechaza %o', (body, mensaje) => {
    expect(validarCambiosReserva(body)).toEqual({ ok: false, error: mensaje });
  });
});

describe('validarCancelacion', () => {
  it('exige id y motivo', () => {
    expect(validarCancelacion({ id: ID, cancelar: { motivo: ' no viajó ' } })).toEqual({ ok: true, datos: { id: ID, motivo: 'no viajó' } });
    expect(validarCancelacion({ id: ID, cancelar: {} })).toEqual({ ok: false, error: 'Indica el motivo de la cancelación.' });
    expect(validarCancelacion({ id: 'nope', cancelar: { motivo: 'x' } })).toEqual({ ok: false, error: 'La reserva indicada no es válida.' });
  });
});

describe('validarCambiosPago', () => {
  it('caso feliz y rechazos', () => {
    expect(validarCambiosPago({ id: ID, cambios: { monto: '200000', fecha: '2026-10-12', medio: 'Nequi', nota: ' ok ' } }))
      .toEqual({ ok: true, datos: { id: ID, cambios: { monto: 200000, fecha: '2026-10-12', medio: 'Nequi', nota: 'ok' } } });
    expect(validarCambiosPago({ id: ID, cambios: { monto: 0 } })).toEqual({ ok: false, error: 'El monto del abono debe ser un número entero mayor que cero.' });
    expect(validarCambiosPago({ id: ID, cambios: { medio: 'PayPal' } })).toEqual({ ok: false, error: `El medio de pago debe ser uno de: ${MEDIOS.join(', ')}.` });
    expect(validarCambiosPago({ id: ID, cambios: { fecha: 'ayer' } })).toEqual({ ok: false, error: 'La fecha del abono no es válida.' });
    expect(validarCambiosPago({ id: ID, cambios: { nota: 'x'.repeat(501) } })).toEqual({ ok: false, error: 'La nota no puede superar 500 caracteres.' });
    expect(validarCambiosPago({ id: ID, cambios: { reserva: 'x' } })).toEqual({ ok: false, error: 'Campo desconocido: reserva.' });
    expect(validarCambiosPago({ id: ID, cambios: {} })).toEqual({ ok: false, error: 'No hay cambios.' });
    expect(validarCambiosPago({ id: 'x', cambios: { monto: 1 } })).toEqual({ ok: false, error: 'El abono indicado no es válido.' });
  });
});

describe('validarAnulacion', () => {
  it('exige id y motivo', () => {
    expect(validarAnulacion({ id: ID, anular: { motivo: 'duplicado' } })).toEqual({ ok: true, datos: { id: ID, motivo: 'duplicado' } });
    expect(validarAnulacion({ id: ID, anular: { motivo: '' } })).toEqual({ ok: false, error: 'Indica el motivo de la anulación.' });
  });
});
