import { describe, it, expect } from 'vitest';
import { escapar, pinValido, ErrorApi } from '../public/js/app.js';

describe('app.js (partes puras)', () => {
  it('escapa HTML para no inyectar nombres de huéspedes', () => {
    expect(escapar('<b>Ana & "Luis"</b>')).toBe('&lt;b&gt;Ana &amp; &quot;Luis&quot;&lt;/b&gt;');
    expect(escapar(null)).toBe('');
  });
  it('PIN de 4 a 6 dígitos', () => {
    expect(pinValido('1234')).toBe(true);
    expect(pinValido('123456')).toBe(true);
    expect(pinValido('123')).toBe(false);
    expect(pinValido('12345a')).toBe(false);
  });
  it('ErrorApi guarda status y datos', () => {
    const e = new ErrorApi('x', 409, { conflicto: {} });
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(409);
    expect(e.datos).toEqual({ conflicto: {} });
  });
});
