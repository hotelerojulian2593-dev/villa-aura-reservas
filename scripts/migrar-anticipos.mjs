// Migra "Anticipo COP" → tabla Pagos. Simula por defecto; escribe con --aplicar.
//   npm run migrar            (simulación)
//   npm run migrar:aplicar    (escribe en Airtable)
import { clienteDesdeEnv } from '../lib/airtable.js';
import { tablasDesdeEnv } from '../lib/reservas.js';
import { planMigracion, verificarMigracion } from '../lib/migracion.js';
import { formatearCOP } from '../public/js/dinero.js';

const aplicar = process.argv.includes('--aplicar');
const cliente = clienteDesdeEnv();
const tablas = tablasDesdeEnv();
const CAMPOS = ['Huésped', 'Anticipo COP', 'Pagos', 'Pagado'];

const registros = await cliente.listar(tablas.reservas, { fields: CAMPOS });
const plan = planMigracion(registros);
console.log(`Reservas: ${registros.length} · con anticipo y sin pagos: ${plan.length}`);
for (const p of plan) console.log(` · ${p.huesped.padEnd(28)} ${formatearCOP(p.campos.Monto).padStart(14)}  fecha ${p.campos.Fecha}`);

if (plan.length && !aplicar) {
  console.log('\nSimulación: nada se escribió. Para aplicar: npm run migrar:aplicar');
} else if (plan.length) {
  for (const p of plan) {
    await cliente.crear(tablas.pagos, p.campos);
    console.log(` ✓ ${p.huesped}`);
  }
}

if (aplicar || plan.length === 0) {
  const despues = await cliente.listar(tablas.reservas, { fields: CAMPOS });
  const diferencias = verificarMigracion(despues);
  if (diferencias.length) {
    console.log('\n⚠ Reservas cuyo Pagado no coincide con Anticipo COP:');
    for (const d of diferencias) console.log(` · ${d.huesped}: anticipo ${formatearCOP(d.anticipo)} vs pagado ${formatearCOP(d.pagado)}`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Pagado coincide con Anticipo COP en todas las reservas con anticipo.');
  }
}
