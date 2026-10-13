import { describe, it, expect } from 'vitest';
import { FUENTES, CANALES, esDeCanal } from '../public/js/canales.js';

describe('canales.js', () => {
  it('fuentes y canales con los nombres exactos de Airtable', () => {
    expect(FUENTES).toEqual({ directo: 'Directo', airbnb: 'Airbnb', booking: 'Booking.com' });
    expect(CANALES).toEqual(['Airbnb', 'Booking.com']);
  });
  it('esDeCanal: Airbnb y Booking sí; Directo, vacío o sin fuente no', () => {
    expect(esDeCanal({ fuente: 'Airbnb' })).toBe(true);
    expect(esDeCanal({ fuente: 'Booking.com' })).toBe(true);
    expect(esDeCanal({ fuente: 'Directo' })).toBe(false);
    expect(esDeCanal({ fuente: '' })).toBe(false);
    expect(esDeCanal({})).toBe(false);
    expect(esDeCanal(null)).toBe(false);
  });
});
