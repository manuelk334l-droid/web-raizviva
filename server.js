const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { validar } = require('./src/config/env');
const { pool, testConexion } = require('./src/config/db');
const rutasPublicas = require('./src/routes/public');
const rutasVendedora = require('./src/routes/vendedora');
const rutasAdmin = require('./src/routes/admin');
const app = express();
const PORT = process.env.PORT || 3000;

const { emailHabilitado, whatsappHabilitado, sinConfigurar } = validar();

// Detrás del proxy del hosting (Render, Railway…): necesario para ver la IP real y que el límite de peticiones funcione
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - inicio;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${dur}ms)`);
  });
  next();
});

app.use('/api', rutasPublicas);
app.use('/api/vendedora', rutasVendedora); // antes de rutasAdmin (que exige clave de admin)
app.use('/api', rutasAdmin);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/vendedora', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vendedora.html'));
});

// Link personal de cada vendedora: /r/codigo → formulario con el código de referido
app.get('/r/:codigo', (req, res) => {
  const codigo = String(req.params.codigo).toLowerCase();
  const valido = /^[a-z0-9-]{3,40}$/.test(codigo);
  res.redirect(valido ? `/unete.html?ref=${encodeURIComponent(codigo)}` : '/unete.html');
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('❌ Error no capturado:', err);
  res.status(500).json({ ok: false, mensaje: 'Error interno' });
});

// En Vercel (serverless) no se llama a listen(): se exporta la app y Vercel la ejecuta.
// En local o en un hosting tradicional (node server.js) sí se inicia el servidor.
async function iniciar() {
  console.log('');
  console.log('🌿 Conectando a Supabase...');

  const ok = await testConexion();
  if (!ok) {
    console.error('❌ No se pudo conectar a la base de datos. Abortando.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('🌿 ================================');
    console.log('🌿  RaízViva Backend v2.2 · Supabase');
    console.log('🌿 ================================');
    console.log(`🌐  Servidor:       http://localhost:${PORT}`);
    console.log(`🔐  Panel admin:    http://localhost:${PORT}/admin`);
    console.log(`🌱  Panel vendedora: http://localhost:${PORT}/vendedora`);
    console.log(`📧  Email:          ${emailHabilitado ? '✅ activo' : '⚠  desactivado'}`);
    console.log(`💬  WhatsApp:       ${whatsappHabilitado ? '✅ activo' : '⚠  desactivado'}`);
    if (sinConfigurar.length > 0) {
      console.log(`⚠   Sin configurar: ${sinConfigurar.join(', ')}`);
    }
    console.log('');
  });

  process.on('SIGTERM', async () => {
    console.log('👋 Cerrando servidor...');
    await pool.end();
    process.exit(0);
  });
}

if (require.main === module) {
  iniciar();
}

module.exports = app;
