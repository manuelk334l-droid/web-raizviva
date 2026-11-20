const { query } = require('../config/db');

function errorHttp(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Solo se aceptan enlaces https (evita javascript:, data:, etc.)
function urlSegura(valor) {
  const u = String(valor || '').trim();
  if (u.length > 500) throw errorHttp(400, 'El enlace es demasiado largo (máx. 500 caracteres)');
  let parsed;
  try { parsed = new URL(u); } catch { throw errorHttp(400, 'El enlace no es válido'); }
  if (parsed.protocol !== 'https:') throw errorHttp(400, 'El enlace debe empezar con https://');
  return parsed.toString();
}

function texto(valor, campo, min, max) {
  const t = String(valor ?? '').trim();
  if (t.length < min || t.length > max) {
    throw errorHttp(400, `${campo} debe tener entre ${min} y ${max} caracteres`);
  }
  return t;
}

/* ---------------- Encuestas ---------------- */

async function listarEncuestas({ soloActivas }) {
  const { rows } = await query(
    `SELECT id, titulo, descripcion, url, activa, fecha FROM encuestas
     ${soloActivas ? 'WHERE activa' : ''} ORDER BY fecha DESC`
  );
  return rows;
}

async function crearEncuesta({ titulo, descripcion, url }) {
  const { rows } = await query(
    `INSERT INTO encuestas (titulo, descripcion, url) VALUES ($1, $2, $3)
     RETURNING id, titulo, descripcion, url, activa, fecha`,
    [texto(titulo, 'El título', 3, 150), String(descripcion || '').trim().slice(0, 600), urlSegura(url)]
  );
  return rows[0];
}

async function actualizarEncuesta(id, { activa }) {
  if (typeof activa !== 'boolean') throw errorHttp(400, 'Datos inválidos');
  const { rows } = await query(
    'UPDATE encuestas SET activa = $2 WHERE id = $1 RETURNING id, activa', [id, activa]
  );
  if (!rows[0]) throw errorHttp(404, 'Encuesta no encontrada');
  return rows[0];
}

async function eliminarEncuesta(id) {
  const { rowCount } = await query('DELETE FROM encuestas WHERE id = $1', [id]);
  if (!rowCount) throw errorHttp(404, 'Encuesta no encontrada');
}

/* ---------------- Capacitación ---------------- */

async function listarCapacitaciones({ soloActivas }) {
  const { rows } = await query(
    `SELECT id, titulo, descripcion, categoria, url, orden, activa, fecha FROM capacitaciones
     ${soloActivas ? 'WHERE activa' : ''} ORDER BY orden ASC, fecha ASC`
  );
  return rows;
}

async function crearCapacitacion({ titulo, descripcion, categoria, url, orden }) {
  const o = Number.isInteger(Number(orden)) ? Math.max(0, Math.min(9999, Number(orden))) : 0;
  const { rows } = await query(
    `INSERT INTO capacitaciones (titulo, descripcion, categoria, url, orden)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, titulo, descripcion, categoria, url, orden, activa, fecha`,
    [
      texto(titulo, 'El título', 3, 150),
      String(descripcion || '').trim().slice(0, 600),
      String(categoria || 'General').trim().slice(0, 60) || 'General',
      urlSegura(url),
      o
    ]
  );
  return rows[0];
}

async function actualizarCapacitacion(id, { activa }) {
  if (typeof activa !== 'boolean') throw errorHttp(400, 'Datos inválidos');
  const { rows } = await query(
    'UPDATE capacitaciones SET activa = $2 WHERE id = $1 RETURNING id, activa', [id, activa]
  );
  if (!rows[0]) throw errorHttp(404, 'Video no encontrado');
  return rows[0];
}

async function eliminarCapacitacion(id) {
  const { rowCount } = await query('DELETE FROM capacitaciones WHERE id = $1', [id]);
  if (!rowCount) throw errorHttp(404, 'Video no encontrado');
}

module.exports = {
  listarEncuestas, crearEncuesta, actualizarEncuesta, eliminarEncuesta,
  listarCapacitaciones, crearCapacitacion, actualizarCapacitacion, eliminarCapacitacion,
  urlSegura
};
