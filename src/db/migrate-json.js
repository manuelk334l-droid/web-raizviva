const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/db');
async function migrarDesdeJSON() {
  const archivo = path.join(__dirname, '..', '..', 'data', 'registros.json');

  if (!fs.existsSync(archivo)) {
    console.log('⚠  No hay archivo JSON para migrar.');
    process.exit(0);
  }

  const registros = JSON.parse(fs.readFileSync(archivo, 'utf-8'));
  console.log(`📦 Migrando ${registros.length} registros a Supabase...\n`);

  let migrados = 0, saltados = 0, errores = 0;

  for (const r of registros) {
    try {
      await query(`
        INSERT INTO registros
          (id, nombre, email, whatsapp, ciudad, edad, experiencia, motivacion, estado, notas, ip, fecha, email_enviado, whatsapp_enviado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, false)
        ON CONFLICT (email) DO NOTHING
      `, [
        r.id || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        r.nombre,
        r.email,
        r.whatsapp,
        r.ciudad,
        r.edad,
        r.experiencia,
        r.motivacion || '',
        r.estado || 'nuevo',
        r.notas || '',
        r.ip || null,
        r.fecha || new Date().toISOString()
      ]);
      migrados++;
      console.log(`  ✅ ${r.email}`);
    } catch (err) {
      if (err.message.includes('duplicate')) {
        saltados++;
        console.log(`  ⏭  ${r.email} (ya existe)`);
      } else {
        errores++;
        console.error(`  ❌ ${r.email}: ${err.message}`);
      }
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`   ✅ Migrados: ${migrados}`);
  console.log(`   ⏭  Saltados: ${saltados}`);
  console.log(`   ❌ Errores:  ${errores}\n`);

  await pool.end();
}

migrarDesdeJSON();
