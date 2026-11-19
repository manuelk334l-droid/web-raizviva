const { pool, query } = require('../config/db');

async function verificar() {
  console.log('🌿 Verificando schema en Supabase...\n');

  try {
    const { rows: tablas } = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('registros', 'historial')
      ORDER BY table_name
    `);

    const nombres = tablas.map(t => t.table_name);
    console.log('📋 Tablas encontradas:', nombres.join(', ') || 'ninguna');

    if (!nombres.includes('registros')) {
      console.error('❌ Falta la tabla "registros". Ejecuta el schema.sql en Supabase.');      process.exit(1);
    }
    if (!nombres.includes('historial')) {
      console.error('❌ Falta la tabla "historial". Ejecuta el schema.sql en Supabase.');      process.exit(1);
    }

    const { rows: columnas } = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'registros'
    `);
    const cols = columnas.map(c => c.column_name);
    const requeridas = ['id', 'nombre', 'email', 'whatsapp', 'estado', 'email_enviado', 'whatsapp_enviado'];

    const faltantes = requeridas.filter(c => !cols.includes(c));
    if (faltantes.length > 0) {
      console.error('❌ Faltan columnas:', faltantes.join(', '));
      process.exit(1);
    }

    const { rows: count } = await query('SELECT COUNT(*)::int AS total FROM registros');
    console.log(`📊 Registros actuales: ${count[0].total}`);

    const { rows: vt } = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('vendedoras', 'ventas', 'anuncios')
    `);
    if (vt.length < 3) {
      console.log('⚠  Módulo de vendedoras sin instalar: ejecuta src/db/schema-vendedoras.sql en Supabase.');
    } else {
      console.log('🌱 Módulo de vendedoras: instalado');
    }

    console.log('\n✅ Schema verificado correctamente\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verificar();
