const crypto = require('crypto');
const { promisify } = require('util');
const { query } = require('../config/db');
const { nivelPara, siguienteNivel } = require('../config/niveles');

const scrypt = promisify(crypto.scrypt);

const TOKEN_HORAS = 8;
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
const MSG_LOGIN = 'Correo o clave incorrectos';
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function errorHttp(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

/* ---------- Claves ---------- */

async function hashClave(clave) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(clave, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verificarClave(clave, guardado) {
  try {
    const [alg, s, h] = String(guardado).split('$');
    if (alg !== 'scrypt') return false;
    const esperado = Buffer.from(h, 'base64');
    const calculado = await scrypt(clave, Buffer.from(s, 'base64'), esperado.length);
    return crypto.timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

let hashFalso;
async function claveFalsa() {
  if (!hashFalso) hashFalso = await hashClave(crypto.randomBytes(12).toString('hex'));
  return hashFalso;
}

function generarClaveTemporal() {
  let c = '';
  for (let i = 0; i < 12; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return c;
}

function validarClaveNueva(nueva, actual) {
  if (typeof nueva !== 'string' || nueva.length < 10 || nueva.length > 128) {
    throw errorHttp(400, 'La nueva clave debe tener entre 10 y 128 caracteres');
  }
  if (!/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) {
    throw errorHttp(400, 'La nueva clave debe incluir letras y números');
  }
  if (nueva === actual) throw errorHttp(400, 'La nueva clave debe ser distinta a la actual');
}

/* ---------- Sesión (token firmado, sin dependencias externas) ---------- */

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET no configurado');
  return s;
}

// Huella de la clave: si la vendedora cambia su clave, los tokens anteriores dejan de servir.
function huellaClave(claveHash) {
  return crypto.createHmac('sha256', secreto()).update(String(claveHash)).digest('base64url').slice(0, 16);
}

function crearToken(v) {
  const payload = {
    sub: v.id,
    h: huellaClave(v.clave_hash),
    exp: Math.floor(Date.now() / 1000) + TOKEN_HORAS * 3600
  };
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = crypto.createHmac('sha256', secreto()).update(p).digest('base64url');
  return `${p}.${firma}`;
}

function verificarToken(token) {
  if (typeof token !== 'string' || token.length > 1000) return null;
  const [p, f] = token.split('.');
  if (!p || !f) return null;
  const esperado = crypto.createHmac('sha256', secreto()).update(p).digest();
  const recibido = Buffer.from(f, 'base64url');
  if (recibido.length !== esperado.length || !crypto.timingSafeEqual(recibido, esperado)) return null;
  try {
    const datos = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (!datos.exp || datos.exp < Date.now() / 1000) return null;
    return datos;
  } catch {
    return null;
  }
}

/* ---------- Códigos de referido ---------- */

function slug(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function generarCodigo(nombre) {
  const partes = nombre.trim().split(/\s+/);
  const base = (slug(partes[0]) || 'v') + (partes[1] && slug(partes[1]) ? '-' + slug(partes[1])[0] : '');
  for (let i = 0; i < 8; i++) {
    const codigo = `${base}-${crypto.randomBytes(2).toString('hex')}`.slice(0, 40);
    const { rows } = await query('SELECT 1 FROM vendedoras WHERE codigo_ref = $1', [codigo]);
    if (rows.length === 0) return codigo;
  }
  throw new Error('No se pudo generar el código de referido');
}

// Usado por el formulario público. Nunca rompe el registro si algo falla.
async function idPorCodigo(codigo) {
  if (typeof codigo !== 'string' || !/^[a-z0-9-]{3,40}$/.test(codigo)) return null;
  try {
    const { rows } = await query('SELECT id FROM vendedoras WHERE codigo_ref = $1 AND activa', [codigo]);
    return rows[0]?.id || null;
  } catch (err) {
    console.warn('⚠ No se pudo validar el código de referido:', err.message);
    return null;
  }
}

/* ---------- Administración de vendedoras ---------- */

async function crear({ nombre, email }) {
  const n = String(nombre || '').trim();
  const e = String(email || '').toLowerCase().trim();
  if (n.length < 3 || n.length > 150) throw errorHttp(400, 'Nombre inválido');
  if (!/^\S+@\S+\.\S+$/.test(e) || e.length > 150) throw errorHttp(400, 'Correo inválido');

  const claveTemporal = generarClaveTemporal();
  const claveHash = await hashClave(claveTemporal);
  const codigo = await generarCodigo(n);

  try {
    const { rows } = await query(
      `INSERT INTO vendedoras (nombre, email, clave_hash, codigo_ref)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, codigo_ref`,
      [n, e, claveHash, codigo]
    );
    return { vendedora: rows[0], claveTemporal };
  } catch (err) {
    if (err.code === '23505') throw errorHttp(409, 'Ya existe una vendedora con ese correo');
    throw err;
  }
}

async function listar() {
  const { rows } = await query(`
    SELECT v.id, v.nombre, v.email, v.codigo_ref, v.activa, v.ultimo_acceso, v.creada_en,
           (SELECT COUNT(*)::int FROM registros r WHERE r.referida_por = v.id) AS referidas
    FROM vendedoras v
    ORDER BY v.creada_en DESC
  `);
  return rows;
}

async function resetClave(id) {
  const claveTemporal = generarClaveTemporal();
  const { rows } = await query(
    `UPDATE vendedoras
        SET clave_hash = $2, debe_cambiar_clave = TRUE, intentos_fallidos = 0, bloqueada_hasta = NULL
      WHERE id = $1
      RETURNING id, nombre, email`,
    [id, await hashClave(claveTemporal)]
  );
  if (!rows[0]) throw errorHttp(404, 'Vendedora no encontrada');
  return { vendedora: rows[0], claveTemporal };
}

async function setActiva(id, activa) {
  const { rows } = await query(
    'UPDATE vendedoras SET activa = $2 WHERE id = $1 RETURNING id, nombre, activa',
    [id, !!activa]
  );
  if (!rows[0]) throw errorHttp(404, 'Vendedora no encontrada');
  return rows[0];
}

async function registrarVenta({ vendedoraId, monto, nota }) {
  const m = Number(monto);
  if (!Number.isFinite(m) || m <= 0 || m > 1e9) throw errorHttp(400, 'Monto inválido');
  const n = String(nota || '').slice(0, 300);

  const { rows } = await query(`
    SELECT v.id, v.nombre,
           (SELECT COUNT(*)::int FROM registros r WHERE r.referida_por = v.id AND r.estado = 'activo') AS activas
    FROM vendedoras v WHERE v.id = $1 AND v.activa
  `, [vendedoraId]);
  if (!rows[0]) throw errorHttp(404, 'Vendedora no encontrada o inactiva');

  const nivel = nivelPara(rows[0].activas);
  const comision = Math.round(m * nivel.comisionPct) / 100;

  const ins = await query(
    `INSERT INTO ventas (vendedora_id, monto, comision, nota)
     VALUES ($1, $2, $3, $4) RETURNING id, monto, comision, fecha`,
    [vendedoraId, m, comision, n]
  );
  return { venta: ins.rows[0], nivel: nivel.nombre, comisionPct: nivel.comisionPct };
}

async function publicarAnuncio({ texto, autor }) {
  const t = String(texto || '').trim();
  if (t.length < 3 || t.length > 500) throw errorHttp(400, 'El anuncio debe tener entre 3 y 500 caracteres');
  const { rows } = await query(
    'INSERT INTO anuncios (texto, autor) VALUES ($1, $2) RETURNING id, fecha',
    [t, String(autor || '').slice(0, 100)]
  );
  return rows[0];
}

/* ---------- Sesión de la vendedora ---------- */

async function login(email, clave) {
  const e = String(email || '').toLowerCase().trim();
  if (!e || typeof clave !== 'string' || !clave || clave.length > 200) {
    throw errorHttp(400, 'Correo y clave requeridos');
  }

  const { rows } = await query('SELECT * FROM vendedoras WHERE email = $1', [e]);
  const v = rows[0];

  if (!v) {
    await verificarClave(clave, await claveFalsa()); // mismo tiempo de respuesta
    throw errorHttp(401, MSG_LOGIN);
  }
  if (v.bloqueada_hasta && new Date(v.bloqueada_hasta) > new Date()) {
    throw errorHttp(429, 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  }

  const ok = await verificarClave(clave, v.clave_hash);
  if (!ok) {
    await query(
      `UPDATE vendedoras
          SET intentos_fallidos = intentos_fallidos + 1,
              bloqueada_hasta = CASE WHEN intentos_fallidos + 1 >= $2
                                     THEN NOW() + make_interval(mins => $3::int)
                                     ELSE bloqueada_hasta END
        WHERE id = $1`,
      [v.id, MAX_INTENTOS, BLOQUEO_MINUTOS]
    );
    throw errorHttp(401, MSG_LOGIN);
  }
  if (!v.activa) throw errorHttp(401, MSG_LOGIN);

  await query(
    'UPDATE vendedoras SET intentos_fallidos = 0, bloqueada_hasta = NULL, ultimo_acceso = NOW() WHERE id = $1',
    [v.id]
  );
  return { token: crearToken(v), nombre: v.nombre, debeCambiarClave: v.debe_cambiar_clave };
}

async function cambiarClave(id, actual, nueva) {
  if (typeof actual !== 'string' || !actual || actual.length > 200) throw errorHttp(400, 'Clave actual requerida');
  validarClaveNueva(nueva, actual);

  const { rows } = await query('SELECT id, clave_hash FROM vendedoras WHERE id = $1 AND activa', [id]);
  const v = rows[0];
  if (!v || !(await verificarClave(actual, v.clave_hash))) {
    throw errorHttp(401, 'La clave actual no es correcta');
  }

  const nuevoHash = await hashClave(nueva);
  await query(
    'UPDATE vendedoras SET clave_hash = $2, debe_cambiar_clave = FALSE, intentos_fallidos = 0 WHERE id = $1',
    [id, nuevoHash]
  );
  return { token: crearToken({ id, clave_hash: nuevoHash }) };
}

/* ---------- Panel ---------- */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Por privacidad la vendedora solo ve "Nombre I." de cada referida (nunca contacto).
function nombreCorto(nombre) {
  const p = String(nombre).trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0].toUpperCase()}.` : p[0];
}

function variacion(actual, anterior) {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

async function panel(id) {
  const [vend, conteo, lista, ventas, serie, ranking, anuncio] = await Promise.all([
    query('SELECT nombre, email, codigo_ref, debe_cambiar_clave FROM vendedoras WHERE id = $1', [id]),
    query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE estado = 'activo')::int AS activas,
             COUNT(*) FILTER (WHERE fecha >= date_trunc('month', NOW()))::int AS este_mes
      FROM registros WHERE referida_por = $1
    `, [id]),
    query(`
      SELECT nombre, ciudad, estado, fecha
      FROM registros WHERE referida_por = $1
      ORDER BY fecha DESC LIMIT 30
    `, [id]),
    query(`
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE fecha >= date_trunc('month', NOW())), 0)::float AS ventas_mes,
        COALESCE(SUM(monto) FILTER (WHERE fecha >= date_trunc('month', NOW()) - interval '1 month'
                                      AND fecha <  date_trunc('month', NOW())), 0)::float AS ventas_prev,
        COALESCE(SUM(comision) FILTER (WHERE fecha >= date_trunc('month', NOW())), 0)::float AS comision_mes,
        COALESCE(SUM(comision) FILTER (WHERE NOT pagada), 0)::float AS comision_pendiente,
        COUNT(*)::int AS n_ventas
      FROM ventas WHERE vendedora_id = $1
    `, [id]),
    query(`
      SELECT to_char(m, 'YYYY-MM') AS mes, COALESCE(SUM(v.monto), 0)::float AS total
      FROM generate_series(date_trunc('month', NOW()) - interval '5 months',
                           date_trunc('month', NOW()), interval '1 month') AS m
      LEFT JOIN ventas v ON v.vendedora_id = $1
                        AND v.fecha >= m AND v.fecha < m + interval '1 month'
      GROUP BY m ORDER BY m
    `, [id]),
    query(`
      WITH mes AS (
        SELECT v.id, COALESCE(SUM(s.monto) FILTER (WHERE s.fecha >= date_trunc('month', NOW())), 0) AS total
        FROM vendedoras v LEFT JOIN ventas s ON s.vendedora_id = v.id
        WHERE v.activa GROUP BY v.id
      )
      SELECT (SELECT COUNT(*)::int FROM mes) AS total_equipo,
             (SELECT COUNT(*)::int + 1 FROM mes WHERE total > (SELECT total FROM mes WHERE id = $1)) AS posicion
    `, [id]),
    query('SELECT texto, autor, fecha FROM anuncios WHERE activo ORDER BY fecha DESC LIMIT 1')
  ]);

  const v = vend.rows[0];
  if (!v) throw errorHttp(404, 'Vendedora no encontrada');
  const c = conteo.rows[0];
  const t = ventas.rows[0];
  const r = ranking.rows[0] || {};

  const nivel = nivelPara(c.activas);
  const sig = siguienteNivel(nivel);
  const progreso = sig
    ? Math.min(100, Math.round(((c.activas - nivel.desde) / (sig.desde - nivel.desde)) * 100))
    : 100;

  return {
    perfil: {
      nombre: v.nombre,
      email: v.email,
      codigoRef: v.codigo_ref,
      debeCambiarClave: v.debe_cambiar_clave
    },
    nivel: {
      actual: { nombre: nivel.nombre, emoji: nivel.emoji, comisionPct: nivel.comisionPct },
      siguiente: sig
        ? { nombre: sig.nombre, emoji: sig.emoji, comisionPct: sig.comisionPct, faltan: sig.desde - c.activas }
        : null,
      progreso
    },
    kpis: {
      referidas: { total: c.total, esteMes: c.este_mes },
      activas: c.activas,
      ventasMes: { actual: t.ventas_mes, anterior: t.ventas_prev, variacion: variacion(t.ventas_mes, t.ventas_prev) },
      comisiones: { mes: t.comision_mes, pendiente: t.comision_pendiente },
      posicion: { lugar: r.posicion || null, total: r.total_equipo || null }
    },
    serie: {
      etiquetas: serie.rows.map(x => MESES[Number(x.mes.slice(5, 7)) - 1]),
      valores: serie.rows.map(x => x.total)
    },
    referidas: lista.rows.map(x => ({
      nombre: nombreCorto(x.nombre),
      ciudad: x.ciudad,
      estado: x.estado,
      fecha: x.fecha
    })),
    ruta: [
      { texto: 'Cuenta creada', hecho: true },
      { texto: 'Cambiar tu clave temporal', hecho: !v.debe_cambiar_clave },
      { texto: 'Compartir tu link y lograr tu primera referida', hecho: c.total > 0 },
      { texto: 'Registrar tu primera venta', hecho: t.n_ventas > 0 },
      { texto: sig ? `Llegar al nivel ${sig.nombre}` : 'Nivel máximo alcanzado', hecho: !sig }
    ],
    anuncio: anuncio.rows[0] || null
  };
}

module.exports = {
  crear, listar, resetClave, setActiva, registrarVenta, publicarAnuncio,
  login, cambiarClave, panel, idPorCodigo,
  verificarToken, huellaClave,
  // exportadas para pruebas
  hashClave, verificarClave, crearToken, generarClaveTemporal, nombreCorto, slug
};
