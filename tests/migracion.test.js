import { describe, it, expect } from 'vitest';
import { planMigracion, verificarMigracion } from '../lib/migracion.js';

const reg = (id, fields, createdTime = '2026-05-20T02:30:00.000Z') => ({ id, createdTime, fields });

describe('planMigracion', () => {
  it('solo reservas con anticipo y sin pagos; la fecha es la de creación en Bogotá', () => {
    const plan = planMigracion([
      reg('recA00000000000001', { 'Huésped': 'Ana', 'Anticipo COP': 500000 }),             // 2026-05-19 21:30 Bogotá
      reg('recB00000000000002', { 'Huésped': 'Beto', 'Anticipo COP': 0 }),
      reg('recC00000000000003', { 'Huésped': 'Caro', 'Anticipo COP': 300000, 'Pagos': ['recP00000000000009'] }),
      reg('recD00000000000004', { 'Huésped': 'Dora' }),
    ]);
    expect(plan).toEqual([{
      reservaId: 'recA00000000000001', huesped: 'Ana',
      campos: { 'Concepto': 'Anticipo (migrado) · Ana', 'Reserva': ['recA00000000000001'], 'Fecha': '2026-05-19', 'Monto': 500000, 'Medio': 'Otro', 'Nota': 'Migrado desde Anticipo COP' },
    }]);
  });
});

describe('verificarMigracion', () => {
  it('lista las reservas cuyo Pagado no coincide con el anticipo', () => {
    const difs = verificarMigracion([
      reg('r1', { 'Huésped': 'Ana', 'Anticipo COP': 500000, 'Pagado': 500000 }),
      reg('r2', { 'Huésped': 'Caro', 'Anticipo COP': 300000, 'Pagado': 0 }),
      reg('r3', { 'Huésped': 'Beto', 'Anticipo COP': 0 }),
    ]);
    expect(difs).toEqual([{ reservaId: 'r2', huesped: 'Caro', anticipo: 300000, pagado: 0 }]);
  });
});
