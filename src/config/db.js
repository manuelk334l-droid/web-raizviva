const { Pool } = require('pg');
require('dotenv').config();

let poolConfig;

if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 6543,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
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

module.exports = { pool, query, transaccion, testConexion };
