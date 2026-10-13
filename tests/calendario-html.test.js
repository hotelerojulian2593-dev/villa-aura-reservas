import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/calendario.html', import.meta.url), 'utf8');

describe('calendario.html — bloque de gerencia', () => {
  it('ofrece "Salir de gerencia" para olvidar el PIN de gerencia en ese dispositivo', () => {
    expect(html).toContain('id="g-salir"');
    expect(html).toContain('Salir de gerencia');
    expect(html).toMatch(/borrarPinGerencia\(\)/);
  });
  it('sincroniza con los canales: sección Canales, lectura al abrir, forzar/estado y "Ver en"', () => {
    expect(html).toContain('id="canales"');
    expect(html).toContain('id="canales-cuerpo"');
    expect(html).toContain('Sincronizar ahora');
    expect(html).toContain("'/api/sincronizar?siViejo=10'");
    expect(html).toContain("'/api/sincronizar?estado=1'");
    expect(html).toContain("'/api/sincronizar?forzar=1'");
    expect(html).toContain("import { esDeCanal } from '/js/canales.js'");
    expect(html).toContain('choques = idsConChoque(reservas)');
    expect(html).toContain('Ver en ${escapar(r.fuente)}');
    expect(html).toContain('Cobro a través de ${escapar(r.fuente)}');
    expect(html).toMatch(/aviso--rojo/);
  });
  it('dibuja la grilla como cuadrícula con barras de media casilla a media casilla', () => {
    expect(html).toContain('lineasDeBarra(b, dias)');
    expect(html).toContain('grid-column:${inicio} / ${fin}');
    expect(html).toContain('repeat(${dias * 2}, var(--medio))');
    expect(html).not.toContain('<table class="grilla">');
  });
});
