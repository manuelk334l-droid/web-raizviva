const express = require('express');
const registroService = require('../services/registroService');
const vendedoraService = require('../services/vendedoraService');
const contenidoService = require('../services/contenidoService');
const { requiereAdmin, claveValida } = require('../middleware/auth');

const router = express.Router();

router.post('/admin/login', (req, res) => {
  const clave = String((req.body && req.body.clave) || '').trim();
  if (claveValida(clave)) {
    return res.json({ ok: true, mensaje: 'Acceso concedido' });
  }
  res.status(401).json({ ok: false, mensaje: 'Clave incorrecta' });
});

router.use(requiereAdmin);

router.get('/registros', async (req, res) => {
  try {
    const registros = await registroService.listar(req.query);
    res.json({ ok: true, total: registros.length, registros });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

router.get('/estadisticas', async (req, res) => {
  try {
    const stats = await registroService.estadisticas();
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

router.get('/registros/:id', async (req, res) => {
  try {
    const registro = await registroService.obtener(req.params.id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });
    res.json({ ok: true, registro });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

router.patch('/registros/:id', async (req, res) => {
  try {
    const registro = await registroService.actualizar(req.params.id, req.body);
    res.json({ ok: true, mensaje: 'Actualizado', registro });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, mensaje: err.message });
  }
});

router.delete('/registros/:id', async (req, res) => {
  try {
    await registroService.eliminar(req.params.id);
    res.json({ ok: true, mensaje: 'Eliminado' });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, mensaje: err.message });
  }
});

router.get('/registros/:id/historial', async (req, res) => {
  try {
    const historial = await registroService.historial(req.params.id);
    res.json({ ok: true, historial });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

router.post('/registros/:id/reenviar', async (req, res) => {
  try {
    const registro = await registroService.obtener(req.params.id);
    if (!registro) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });

    const emailService = require('../services/emailService');
    const whatsappService = require('../services/whatsappService');
    const { canal } = req.body;

    const resultados = {};
    if (canal === 'email' || canal === 'ambos') {
      resultados.email = await emailService.enviarBienvenida(registro);
    }
    if (canal === 'whatsapp' || canal === 'ambos') {
      resultados.whatsapp = await whatsappService.enviarBienvenida(registro);
    }

    res.json({ ok: true, resultados });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

router.get('/exportar/csv', async (req, res) => {
  try {
    const registros = await registroService.listar({});

    const headers = ['ID', 'Nombre', 'Email', 'WhatsApp', 'Ciudad', 'Edad', 'Experiencia', 'Estado', 'Motivación', 'Notas', 'Fecha'];
    const filas = registros.map(r => [
      r.id,
      `"${(r.nombre || '').replace(/"/g, '""')}"`,
      r.email,
      r.whatsapp,
      `"${(r.ciudad || '').replace(/"/g, '""')}"`,
      r.edad,
      r.experiencia,
      r.estado,
      `"${(r.motivacion || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      `"${(r.notas || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      new Date(r.fecha).toLocaleString('es-CO')
    ]);

    const csv = [headers.join(','), ...filas.map(f => f.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=registros-raizviva-${Date.now()}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// ============================================================
// RUTAS DE ANALYTICS — solo admin
// ============================================================
const analyticsService = require('../services/analyticsService');

// Resumen completo (1 sola request)
router.get('/analytics/resumen', async (req, res) => {
  try {
    const rango = req.query.rango || '30d';
    const data = await analyticsService.resumenCompleto(rango);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('❌ Error en /analytics/resumen:', err.message);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// Serie temporal (registros por día/semana/mes)
router.get('/analytics/serie', async (req, res) => {
  try {
    const rango = req.query.rango || '30d';
    const data = await analyticsService.registrosPorPeriodo(rango);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// KPIs
router.get('/analytics/kpis', async (req, res) => {
  try {
    const rango = req.query.rango || '30d';
    const data = await analyticsService.kpisPrincipales(rango);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// Embudo de conversión
router.get('/analytics/embudo', async (req, res) => {
  try {
    const data = await analyticsService.embudoConversion();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// Distribuciones (estados, ciudades, edades, experiencia)
router.get('/analytics/distribuciones', async (req, res) => {
  try {
    const [estados, ciudades, edades, experiencia] = await Promise.all([
      analyticsService.distribucionPorEstado(),
      analyticsService.distribucionPorCiudad(),
      analyticsService.distribucionPorEdad(),
      analyticsService.distribucionPorExperiencia()
    ]);
    res.json({ ok: true, data: { estados, ciudades, edades, experiencia } });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// Pagos (placeholder para el futuro)
router.get('/analytics/pagos', async (req, res) => {
  try {
    const rango = req.query.rango || '30d';
    const data = await analyticsService.pagosPorPeriodo(rango);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});


/* ===== Vendedoras, ventas y anuncios (protegido por requiereAdmin) ===== */

function errAdmin(res, err, ruta) {
  if (!err.status) console.error(`❌ Error en ${ruta}:`, err.message);
  res.status(err.status || 500).json({ ok: false, mensaje: err.status ? err.message : 'Error interno' });
}
const idValido = (v) => /^\d{1,12}$/.test(String(v));

router.get('/admin/vendedoras', async (req, res) => {
  try {
    res.json({ ok: true, vendedoras: await vendedoraService.listar() });
  } catch (err) { errAdmin(res, err, 'GET /admin/vendedoras'); }
});

router.post('/admin/vendedoras', async (req, res) => {
  try {
    const r = await vendedoraService.crear(req.body || {});
    res.status(201).json({ ok: true, ...r, aviso: 'Guarda la clave temporal: no se vuelve a mostrar.' });
  } catch (err) { errAdmin(res, err, 'POST /admin/vendedoras'); }
});

router.post('/admin/vendedoras/:id/reset-clave', async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID inválido' });
    const r = await vendedoraService.resetClave(req.params.id);
    res.json({ ok: true, ...r, aviso: 'Guarda la clave temporal: no se vuelve a mostrar.' });
  } catch (err) { errAdmin(res, err, 'POST /admin/vendedoras/:id/reset-clave'); }
});

router.patch('/admin/vendedoras/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id) || typeof req.body?.activa !== 'boolean') {
      return res.status(400).json({ ok: false, mensaje: 'Datos inválidos' });
    }
    res.json({ ok: true, vendedora: await vendedoraService.setActiva(req.params.id, req.body.activa) });
  } catch (err) { errAdmin(res, err, 'PATCH /admin/vendedoras/:id'); }
});

router.post('/admin/ventas', async (req, res) => {
  try {
    if (!idValido(req.body?.vendedora_id)) return res.status(400).json({ ok: false, mensaje: 'vendedora_id inválido' });
    const r = await vendedoraService.registrarVenta({
      vendedoraId: req.body.vendedora_id, monto: req.body.monto, nota: req.body.nota
    });
    res.status(201).json({ ok: true, ...r });
  } catch (err) { errAdmin(res, err, 'POST /admin/ventas'); }
});

router.post('/admin/anuncios', async (req, res) => {
  try {
    res.status(201).json({ ok: true, anuncio: await vendedoraService.publicarAnuncio(req.body || {}) });
  } catch (err) { errAdmin(res, err, 'POST /admin/anuncios'); }
});

/* ===== Encuestas y capacitación ===== */

router.get('/admin/encuestas', async (req, res) => {
  try {
    res.json({ ok: true, encuestas: await contenidoService.listarEncuestas({ soloActivas: false }) });
  } catch (err) { errAdmin(res, err, 'GET /admin/encuestas'); }
});

router.post('/admin/encuestas', async (req, res) => {
  try {
    res.status(201).json({ ok: true, encuesta: await contenidoService.crearEncuesta(req.body || {}) });
  } catch (err) { errAdmin(res, err, 'POST /admin/encuestas'); }
});

router.patch('/admin/encuestas/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID inválido' });
    res.json({ ok: true, encuesta: await contenidoService.actualizarEncuesta(req.params.id, req.body || {}) });
  } catch (err) { errAdmin(res, err, 'PATCH /admin/encuestas/:id'); }
});

router.delete('/admin/encuestas/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID inválido' });
    await contenidoService.eliminarEncuesta(req.params.id);
    res.json({ ok: true, mensaje: 'Eliminada' });
  } catch (err) { errAdmin(res, err, 'DELETE /admin/encuestas/:id'); }
});

router.get('/admin/capacitaciones', async (req, res) => {
  try {
    res.json({ ok: true, capacitaciones: await contenidoService.listarCapacitaciones({ soloActivas: false }) });
  } catch (err) { errAdmin(res, err, 'GET /admin/capacitaciones'); }
});

router.post('/admin/capacitaciones', async (req, res) => {
  try {
    res.status(201).json({ ok: true, capacitacion: await contenidoService.crearCapacitacion(req.body || {}) });
  } catch (err) { errAdmin(res, err, 'POST /admin/capacitaciones'); }
});

router.patch('/admin/capacitaciones/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID inválido' });
    res.json({ ok: true, capacitacion: await contenidoService.actualizarCapacitacion(req.params.id, req.body || {}) });
  } catch (err) { errAdmin(res, err, 'PATCH /admin/capacitaciones/:id'); }
});

router.delete('/admin/capacitaciones/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID inválido' });
    await contenidoService.eliminarCapacitacion(req.params.id);
    res.json({ ok: true, mensaje: 'Eliminado' });
  } catch (err) { errAdmin(res, err, 'DELETE /admin/capacitaciones/:id'); }
});

module.exports = router;

