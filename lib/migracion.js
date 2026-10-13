import { hoyBogota } from '../public/js/fechas.js';

// Convierte el campo viejo "Anticipo COP" en un registro de Pagos por reserva.
// Idempotente: ignora las reservas que ya tienen pagos.
export function planMigracion(registros) {
  return registros
    .filter((r) => Number(r.fields['Anticipo COP']) > 0 && (r.fields['Pagos'] ?? []).length === 0)
    .map((r) => {
      const huesped = r.fields['Huésped'] ?? '';
      return {
        reservaId: r.id,
        huesped,
        campos: {
          'Concepto': `Anticipo (migrado) · ${huesped}`,
          'Reserva': [r.id],
          'Fecha': hoyBogota(new Date(r.createdTime)),
          'Monto': Number(r.fields['Anticipo COP']),
          'Medio': 'Otro',
          'Nota': 'Migrado desde Anticipo COP',
        },
      };
    });
}

export function verificarMigracion(registros) {
  return registros
    .filter((r) => Number(r.fields['Anticipo COP']) > 0)
    .map((r) => ({ reservaId: r.id, huesped: r.fields['Huésped'] ?? '', anticipo: Number(r.fields['Anticipo COP']), pagado: Number(r.fields['Pagado'] ?? 0) }))
    .filter((x) => x.anticipo !== x.pagado);
}
