import { describe, it, expect } from 'vitest';
import { parsearIcs, eventosReserva, datosDeDescripcion, RESUMEN_RESERVA_AIRBNB } from '../lib/ical.js';

// Forma real del calendario exportado por Airbnb: fechas VALUE=DATE, DESCRIPTION plegada y con \n escapado.
const ICS_AIRBNB = [
  'BEGIN:VCALENDAR', 'PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 0.8.8//EN', 'CALSCALE:GREGORIAN', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261219', 'DTSTART;VALUE=DATE:20261217', 'UID:1440a2f9c7b5-abc123@airbnb.com', 'SUMMARY:Reserved',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de', ' tails/HMABC123XY\\nPhone Number (Last 4 Digits): 1234', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261231', 'DTSTART;VALUE=DATE:20261224', 'UID:bloqueo-1@airbnb.com', 'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261001T150000Z', 'UID:viejo@airbnb.com', 'SUMMARY:Reserved', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261217', 'DTEND;VALUE=DATE:20261219', 'UID:1440a2f9c7b5-abc123@airbnb.com', 'SUMMARY:Reserved', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

describe('parsearIcs', () => {
  it('lee eventos con fechas VALUE=DATE, desdobla líneas plegadas y desescapa \\n', () => {
    const eventos = parsearIcs(ICS_AIRBNB);
    expect(eventos).toHaveLength(4);
    expect(eventos[0]).toEqual({
      uid: '1440a2f9c7b5-abc123@airbnb.com', inicio: '2026-12-17', fin: '2026-12-19', resumen: 'Reserved',
      descripcion: 'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC123XY\nPhone Number (Last 4 Digits): 1234',
    });
    expect(eventos[1]).toMatchObject({ uid: 'bloqueo-1@airbnb.com', inicio: '2026-12-24', fin: '2026-12-31', resumen: 'Airbnb (Not available)', descripcion: '' });
  });
  it('fecha-hora UTC → fecha; sin DTEND → una noche', () => {
    expect(parsearIcs(ICS_AIRBNB)[2]).toMatchObject({ inicio: '2026-10-01', fin: '2026-10-02' });
  });
  it('acepta LF y tolera líneas sin dos puntos; sin VCALENDAR es inválido', () => {
    expect(parsearIcs('BEGIN:VCALENDAR\nX\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20261101\nEND:VEVENT\nEND:VCALENDAR\n')).toHaveLength(1);
    expect(parsearIcs('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')).toEqual([]);
    expect(() => parsearIcs('hola')).toThrow('ICS inválido');
    expect(() => parsearIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nEND:VEVENT')).toThrow('ICS inválido');
  });
  it('ignora eventos sin UID o sin DTSTART', () => {
    expect(parsearIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261101\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nEND:VEVENT\nEND:VCALENDAR')).toEqual([]);
  });
});

describe('eventosReserva', () => {
  const eventos = parsearIcs(ICS_AIRBNB);
  it('Airbnb: solo Reserved, futuros y sin UID repetido', () => {
    expect(RESUMEN_RESERVA_AIRBNB).toBe('Reserved');
    expect(eventosReserva('Airbnb', eventos, '2026-10-13').map((e) => e.uid)).toEqual(['1440a2f9c7b5-abc123@airbnb.com']);
  });
  it('Booking.com: todos los eventos futuros (su iCal no distingue reserva de bloqueo)', () => {
    expect(eventosReserva('Booking.com', eventos, '2026-10-13').map((e) => e.uid)).toEqual(['1440a2f9c7b5-abc123@airbnb.com', 'bloqueo-1@airbnb.com']);
  });
  it('un evento que termina hoy ya no cuenta; uno que termina mañana sí', () => {
    const e = { uid: 'x', inicio: '2026-10-12', fin: '2026-10-13', resumen: 'Reserved', descripcion: '' };
    expect(eventosReserva('Airbnb', [e], '2026-10-13')).toEqual([]);
    expect(eventosReserva('Airbnb', [{ ...e, fin: '2026-10-14' }], '2026-10-13')).toHaveLength(1);
    expect(eventosReserva('Airbnb', [{ ...e, inicio: '2026-11-02', fin: '2026-11-01' }], '2026-10-13')).toEqual([]);
  });
});

describe('datosDeDescripcion', () => {
  it('extrae enlace, código y últimos 4 dígitos', () => {
    expect(datosDeDescripcion('Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC123XY\nPhone Number (Last 4 Digits): 1234'))
      .toEqual({ codigo: 'HMABC123XY', enlace: 'https://www.airbnb.com/hosting/reservations/details/HMABC123XY', telefonoFinal: '1234' });
  });
  it('vacío cuando no hay datos', () => {
    expect(datosDeDescripcion('')).toEqual({ codigo: '', enlace: '', telefonoFinal: '' });
    expect(datosDeDescripcion(undefined)).toEqual({ codigo: '', enlace: '', telefonoFinal: '' });
  });
});

import { generarIcs, plegar, HOST } from '../lib/ical.js';

describe('generarIcs', () => {
  const AHORA = new Date('2026-10-13T19:05:00Z');
  const r = { id: 'recAAAAAAAAAAAAAA', huesped: 'Ana Pérez', entrada: '2026-10-17', salida: '2026-10-19', habitaciones: ['La Rosaura'] };
  it('un VEVENT por reserva, fechas VALUE=DATE con salida exclusiva, sin nombres, CRLF', () => {
    const ics = generarIcs([r], AHORA);
    const lineas = ics.split('\r\n');
    expect(lineas.slice(0, 5)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Villa Aura//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']);
    expect(lineas).toContain(`UID:recAAAAAAAAAAAAAA@${HOST}`);
    expect(lineas).toContain('DTSTAMP:20261013T190500Z');
    expect(lineas).toContain('DTSTART;VALUE=DATE:20261017');
    expect(lineas).toContain('DTEND;VALUE=DATE:20261019');
    expect(lineas).toContain('SUMMARY:Villa Aura - ocupado');
    expect(ics).not.toMatch(/Ana|Rosaura/);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
  it('ida y vuelta con parsearIcs; sin reservas sigue siendo un calendario válido', () => {
    expect(parsearIcs(generarIcs([r], AHORA))).toEqual([{ uid: `recAAAAAAAAAAAAAA@${HOST}`, inicio: '2026-10-17', fin: '2026-10-19', resumen: 'Villa Aura - ocupado', descripcion: '' }]);
    expect(parsearIcs(generarIcs([], AHORA))).toEqual([]);
  });
  it('plegar corta a 75 octetos y continúa con espacio', () => {
    expect(plegar('corta')).toBe('corta');
    expect(plegar('a'.repeat(100))).toBe(`${'a'.repeat(75)}\r\n ${'a'.repeat(25)}`);
    expect(plegar('a'.repeat(160)).split('\r\n ')).toEqual(['a'.repeat(75), 'a'.repeat(74), 'a'.repeat(11)]);
  });
});

describe('revisión final — calendarios menos prolijos', () => {
  it('acepta BOM, nombres en minúscula y espacios al final de línea', () => {
    const ics = '\uFEFFbegin:vcalendar \r\nversion:2.0\r\nbegin:vevent\r\nuid:a@x\r\ndtstart;value=date:20261101\r\ndtend;value=date:20261103 \r\nsummary:Reserved\r\nend:vevent\r\nend:vcalendar\r\n';
    expect(parsearIcs(ics)).toEqual([{ uid: 'a@x', inicio: '2026-11-01', fin: '2026-11-03', resumen: 'Reserved', descripcion: '' }]);
  });
  it('desescapa \; y no confunde una barra escapada seguida de n con un salto de línea', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20261101\nDESCRIPTION:x\;y\\\\z\\\\nw\\,v\nEND:VEVENT\nEND:VCALENDAR';
    expect(parsearIcs(ics)[0].descripcion).toBe('x;y\\z\\nw,v');
  });
});
