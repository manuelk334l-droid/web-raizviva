const { Pool } = require('pg');
require('dotenv').config();

let poolConfig;
let hostUsado = 'desconocido';

const limpiar = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');

if (process.env.DB_HOST) {
  // Modo por partes: evita problemas con símbolos en la contraseña.
  hostUsado = limpiar(process.env.DB_HOST);
  poolConfig = {
    host: hostUsado,
    port: Number(limpiar(process.env.DB_PORT)) || 6543,
    user: limpiar(process.env.DB_USER),
    password: process.env.DB_PASSWORD, // tal cual, sin recortar
    database: limpiar(process.env.DB_NAME) || 'postgres',
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  };
} else {
  const url = limpiar(process.env.DATABASE_URL);
  try { hostUsado = new URL(url).hostname || 'vacío'; } catch { hostUsado = 'ilegible'; }
  poolConfig = {
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  };
}

const pool = new Pool({
  ...poolConfig,
  max: process.env.VERCEL ? 2 : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en PostgreSQL:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const dur = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && dur > 200) {
      console.log(`🐢 Query lenta (${dur}ms):`, text.slice(0, 60));
    }
    return res;
  } catch (err) {
    console.error('❌ Error en query:', err.message);
    throw err;
  }
}

async function transaccion(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function testConexion() {
  try {
    const { rows } = await pool.query('SELECT NOW() as ahora, version() as version');
    console.log('✅ Conexión a Supabase OK');
    console.log('   Hora del servidor:', rows[0].ahora);
    console.log('   Postgres:', rows[0].version.split(' ').slice(0, 2).join(' '));
    return true;
  } catch (err) {
    console.error('❌ Error al conectar con Supabase:', err.message);
    console.error('   Verifica tu DATABASE_URL en .env');
    return false;
  }
}

module.exports = {
  hostUsado: () => hostUsado, pool, query, transaccion, testConexion };
