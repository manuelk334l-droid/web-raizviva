const express = require('express');
const rateLimit = require('express-rate-limit');
const vendedoraService = require('../services/vendedoraService');
const contenidoService = require('../services/contenidoService');
const { requiereVendedora } = require('../middleware/authVendedora');

const router = express.Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, mensaje: 'Demasiados intentos. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

function responderError(res, err, ruta) {
  if (!err.status) console.error(`❌ Error en ${ruta}:`, err.message);
  res.status(err.status || 500).json({
    ok: false,
    mensaje: err.status ? err.message : 'Error interno'
  });
}

router.post('/login', limiteLogin, async (req, res) => {
  try {
    const r = await vendedoraService.login(req.body?.email, req.body?.clave);
    res.json({ ok: true, ...r });
  } catch (err) {
    responderError(res, err, 'POST /vendedora/login');
  }
});

router.get('/panel', requiereVendedora, async (req, res) => {
  try {
    res.json({ ok: true, data: await vendedoraService.panel(req.vendedoraId) });
  } catch (err) {
    responderError(res, err, 'GET /vendedora/panel');
  }
});

router.post('/cambiar-clave', limiteLogin, requiereVendedora, async (req, res) => {
  try {
    const r = await vendedoraService.cambiarClave(req.vendedoraId, req.body?.actual, req.body?.nueva);
    res.json({ ok: true, ...r });
  } catch (err) {
    responderError(res, err, 'POST /vendedora/cambiar-clave');
  }
});

router.get('/encuestas', requiereVendedora, async (req, res) => {
  try {
    res.json({ ok: true, encuestas: await contenidoService.listarEncuestas({ soloActivas: true }) });
  } catch (err) {
    responderError(res, err, 'GET /vendedora/encuestas');
  }
});

router.get('/capacitaciones', requiereVendedora, async (req, res) => {
  try {
    res.json({ ok: true, capacitaciones: await contenidoService.listarCapacitaciones({ soloActivas: true }) });
  } catch (err) {
    responderError(res, err, 'GET /vendedora/capacitaciones');
  }
});

module.exports = router;
