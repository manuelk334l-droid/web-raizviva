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
      mensaje: 'Registro exitoso',
      id: registro.id
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

router.get('/health', async (req, res) => {
  const { query } = require('../config/db');
  try {
    await query('SELECT 1');
    res.json({ ok: true, status: 'activo', db: 'conectada', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', db: 'desconectada' });
  }
});

module.exports = router;
