import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/calendario.html', import.meta.url), 'utf8');

describe('calendario.html — bloque de gerencia', () => {
  it('ofrece "Salir de gerencia" para olvidar el PIN de gerencia en ese dispositivo', () => {
    expect(html).toContain('id="g-salir"');
    expect(html).toContain('Salir de gerencia');
    expect(html).toMatch(/borrarPinGerencia\(\)/);
  });
});
