const express = require('express');
const rateLimit = require('express-rate-limit');
const registroService = require('../services/registroService');

const router = express.Router();

const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { ok: false, mensaje: 'Demasiados intentos. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/registro', limiteRegistro, async (req, res) => {
  try {
    const registro = await registroService.crear(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      ok: true,
      mensaje: 'Registro recibido. Revisa tu correo para confirmarlo.',
      correoEnviado: registro.correoEnviado === true
    });

  } catch (err) {
    console.error('❌ Error en POST /registro:', err.message);
    res.status(err.status || 500).json({
      ok: false,
      mensaje: err.message,
      errores: err.errores
    });
  }
});

const limiteReenvio = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { ok: false, mensaje: 'Demasiados intentos. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Enlace que llega por correo: valida el token y redirige a una página con el resultado.
router.get('/confirmar', async (req, res) => {
  let estado = 'invalido';
  try {
    estado = await registroService.confirmar(req.query.token);
  } catch (err) {
    console.error('❌ Error en GET /confirmar:', err.message);
    estado = 'error';
  }
  res.redirect(302, '/confirmar.html?estado=' + encodeURIComponent(estado));
});

router.post('/registro/reenviar', limiteReenvio, async (req, res) => {
  try {
    await registroService.reenviar(req.body && req.body.email);
  } catch (err) {
    console.error('❌ Error en POST /registro/reenviar:', err.message);
  }
  res.json({ ok: true, mensaje: 'Si ese correo tiene un registro pendiente, te enviamos un nuevo enlace.' });
});

router.get('/health', async (req, res) => {
  const { query, hostUsado } = require('../config/db');
  try {
    await query('SELECT 1');
    res.json({ ok: true, status: 'activo', db: 'conectada', timestamp: new Date().toISOString() });
  } catch (err) {
    // host y código ayudan a encontrar el error de configuración (nunca se muestra la contraseña)
    res.status(500).json({ ok: false, status: 'error', db: 'desconectada', host: hostUsado(), codigo: err.code || null });
  }
});

module.exports = router;
