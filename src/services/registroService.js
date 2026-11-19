const { query } = require('../config/db');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const vendedoraService = require('./vendedoraService');

function generarId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function validar(datos) {
  const errores = [];
  if (!datos.nombre || datos.nombre.trim().length < 3) errores.push('Nombre inválido');
  if (!datos.email || !/^\S+@\S+\.\S+$/.test(datos.email)) errores.push('Correo inválido');
  if (!datos.whatsapp || datos.whatsapp.replace(/\D/g, '').length < 7) errores.push('WhatsApp inválido');
  if (!datos.ciudad || datos.ciudad.trim().length < 2) errores.push('Ciudad requerida');
  if (!datos.edad) errores.push('Edad requerida');
  if (!datos.experiencia || !['Si', 'No'].includes(datos.experiencia)) errores.push('Experiencia requerida');
  return errores;
}

async function crear(datos, meta = {}) {
  const errores = validar(datos);
  if (errores.length > 0) {
    const error = new Error('Datos inválidos');
    error.errores = errores;
    error.status = 400;
    throw error;
  }

  const id = generarId();
  const email = datos.email.toLowerCase().trim();

  const existente = await query('SELECT id FROM registros WHERE email = $1', [email]);
  if (existente.rows.length > 0) {
    const error = new Error('Este correo ya está registrado');
    error.status = 409;
    throw error;
  }

  // Si llegó con el link de una vendedora, se guarda quién la refirió (código inválido = se ignora).
  const referidaPor = await vendedoraService.idPorCodigo(
    typeof datos.ref === 'string' ? datos.ref.toLowerCase().trim() : ''
  );

  const columnas = ['id', 'nombre', 'email', 'whatsapp', 'ciudad', 'edad', 'experiencia', 'motivacion', 'ip', 'user_agent'];
  const valores = [
    id,
    datos.nombre.trim(),
    email,
    datos.whatsapp.trim(),
    datos.ciudad.trim(),
    datos.edad,
    datos.experiencia,
    datos.motivacion?.trim() || '',
    meta.ip || null,
    meta.userAgent || null
  ];
  if (referidaPor) {
    columnas.push('referida_por');
    valores.push(referidaPor);
  }

  const insert = await query(
    `INSERT INTO registros (${columnas.join(', ')})
     VALUES (${valores.map((_, k) => '$' + (k + 1)).join(', ')})
     RETURNING *`,
    valores
  );

  const registro = insert.rows[0];

  await query(
    'INSERT INTO historial (registro_id, accion, detalle) VALUES ($1, $2, $3)',
    [id, 'creado', referidaPor ? 'Registro creado desde formulario web (link de una vendedora)' : 'Registro creado desde formulario web']
  );

  dispararNotificaciones(registro).catch(err => {
    console.error('❌ Error al disparar notificaciones:', err.message);
  });

  return registro;
}

async function dispararNotificaciones(registro) {
  const [emailUsuario, emailAdmin, waUsuario, waAdmin] = await Promise.allSettled([
    emailService.enviarBienvenida(registro),
    emailService.notificarAdmin(registro),
    whatsappService.enviarBienvenida(registro),
    whatsappService.notificarAdmin(registro)
  ]);

  const resultadoEmail = emailUsuario.status === 'fulfilled'
    ? emailUsuario.value
    : { enviado: false, error: emailUsuario.reason?.message };

  const resultadoWA = waUsuario.status === 'fulfilled'
    ? waUsuario.value
    : { enviado: false, error: waUsuario.reason?.message };

  try {
    await query(`
      UPDATE registros SET
        email_enviado = $1,
        email_error = $2,
        whatsapp_enviado = $3,
        whatsapp_error = $4
      WHERE id = $5
    `, [
      resultadoEmail.enviado,
      resultadoEmail.error || null,
      resultadoWA.enviado,
      resultadoWA.error || null,
      registro.id
    ]);
  } catch (err) {
    console.error('❌ Error al actualizar flags de notificación:', err.message);
  }
}

async function listar(filtros = {}) {
  const condiciones = [];
  const valores = [];
  let i = 1;

  if (filtros.buscar) {
    condiciones.push(`(nombre ILIKE $${i} OR email ILIKE $${i} OR ciudad ILIKE $${i})`);
    valores.push(`%${filtros.buscar}%`);
    i++;
  }
  if (filtros.estado) {
    condiciones.push(`estado = $${i++}`);
    valores.push(filtros.estado);
  }
  if (filtros.experiencia) {
    condiciones.push(`experiencia = $${i++}`);
    valores.push(filtros.experiencia);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const result = await query(`
    SELECT * FROM registros ${where}
    ORDER BY fecha DESC
    LIMIT 500
  `, valores);

  return result.rows;
}

async function obtener(id) {
  const result = await query('SELECT * FROM registros WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function actualizar(id, cambios) {
  const permitidos = ['estado', 'notas'];
  const sets = [];
  const valores = [];
  let i = 1;

  const estadosValidos = ['nuevo', 'contactado', 'en-proceso', 'activo', 'descartado'];

  for (const [clave, valor] of Object.entries(cambios)) {
    if (!permitidos.includes(clave)) continue;
    if (clave === 'estado' && !estadosValidos.includes(valor)) {
      const error = new Error('Estado inválido');
      error.status = 400;
      throw error;
    }
    sets.push(`${clave} = $${i++}`);
    valores.push(valor);
  }

  if (sets.length === 0) {
    const error = new Error('No hay campos válidos para actualizar');
    error.status = 400;
    throw error;
  }

  sets.push(`actualizado_en = NOW()`);
  valores.push(id);

  const result = await query(`
    UPDATE registros SET ${sets.join(', ')}
    WHERE id = $${i}
    RETURNING *
  `, valores);

  if (result.rows.length === 0) {
    const error = new Error('Registro no encontrado');
    error.status = 404;
    throw error;
  }

  await query(
    'INSERT INTO historial (registro_id, accion, detalle) VALUES ($1, $2, $3)',
    [id, 'actualizado', JSON.stringify(cambios)]
  );

  return result.rows[0];
}

async function eliminar(id) {
  const result = await query('DELETE FROM registros WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) {
    const error = new Error('Registro no encontrado');
    error.status = 404;
    throw error;
  }
  return true;
}

async function estadisticas() {
  const [total, porEstado, porCiudad, porExp, porEdad, ultimos] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM registros'),
    query('SELECT estado, COUNT(*)::int AS n FROM registros GROUP BY estado'),
    query('SELECT ciudad, COUNT(*)::int AS n FROM registros GROUP BY ciudad ORDER BY n DESC LIMIT 10'),
    query('SELECT experiencia, COUNT(*)::int AS n FROM registros GROUP BY experiencia'),
    query('SELECT edad, COUNT(*)::int AS n FROM registros GROUP BY edad ORDER BY edad'),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '24 hours')::int AS ultimas24h,
        COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '7 days')::int AS ultimos7,
        COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '30 days')::int AS ultimos30
      FROM registros
    `)
  ]);

  const aObjeto = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: r.n }), {});

  return {
    total: total.rows[0].n,
    ultimas24h: ultimos.rows[0].ultimas24h,
    ultimos7: ultimos.rows[0].ultimos7,
    ultimos30: ultimos.rows[0].ultimos30,
    porEstado: aObjeto(porEstado.rows, 'estado'),
    porCiudad: aObjeto(porCiudad.rows, 'ciudad'),
    porExperiencia: aObjeto(porExp.rows, 'experiencia'),
    porEdad: aObjeto(porEdad.rows, 'edad')
  };
}

async function historial(registroId) {
  const result = await query(
    'SELECT * FROM historial WHERE registro_id = $1 ORDER BY fecha DESC',
    [registroId]
  );
  return result.rows;
}

module.exports = {
  crear,
  listar,
  obtener,
  actualizar,
  eliminar,
  estadisticas,
  historial
};
