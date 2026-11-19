// Gestión de vendedoras desde la terminal (hasta que exista la pantalla en el panel admin).
//
//   npm run vendedoras -- crear "Valentina Rojas" valentina@correo.com
//   npm run vendedoras -- reset valentina@correo.com
//   npm run vendedoras -- venta valentina@correo.com 250000 "Pedido #12"
//   npm run vendedoras -- anuncio "Texto del mensaje" "Ana"
//   npm run vendedoras -- listar
require('dotenv').config();
const { pool, query } = require('../config/db');
const svc = require('../services/vendedoraService');

const [,, cmd, ...args] = process.argv;
const base = process.env.APP_URL || 'http://localhost:3000';

async function idPorEmail(email) {
  const { rows } = await query('SELECT id FROM vendedoras WHERE email = $1', [String(email || '').toLowerCase().trim()]);
  if (!rows[0]) throw new Error('No existe una vendedora con ese correo');
  return rows[0].id;
}

async function main() {
  switch (cmd) {
    case 'crear': {
      const { vendedora, claveTemporal } = await svc.crear({ nombre: args[0], email: args[1] });
      console.log(`\n✅ Vendedora creada: ${vendedora.nombre} <${vendedora.email}>`);
      console.log(`   Panel:          ${base}/vendedora`);
      console.log(`   Clave temporal: ${claveTemporal}   (se pedirá cambiarla al entrar; no se vuelve a mostrar)`);
      console.log(`   Su link:        ${base}/r/${vendedora.codigo_ref}\n`);
      break;
    }
    case 'reset': {
      const { vendedora, claveTemporal } = await svc.resetClave(await idPorEmail(args[0]));
      console.log(`\n✅ Nueva clave temporal para ${vendedora.nombre}: ${claveTemporal}\n`);
      break;
    }
    case 'venta': {
      const r = await svc.registrarVenta({ vendedoraId: await idPorEmail(args[0]), monto: args[1], nota: args[2] });
      console.log(`\n✅ Venta registrada: $${r.venta.monto} · comisión $${r.venta.comision} (nivel ${r.nivel}, ${r.comisionPct}%)\n`);
      break;
    }
    case 'anuncio': {
      await svc.publicarAnuncio({ texto: args[0], autor: args[1] });
      console.log('\n✅ Anuncio publicado\n');
      break;
    }
    case 'listar': {
      const filas = await svc.listar();
      console.table(filas.map(f => ({ id: f.id, nombre: f.nombre, email: f.email, referidas: f.referidas, activa: f.activa, link: `/r/${f.codigo_ref}` })));
      break;
    }
    default:
      console.log('Comandos: crear "Nombre" correo | reset correo | venta correo monto [nota] | anuncio "texto" [autor] | listar');
  }
}

main()
  .catch(err => { console.error('❌', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
