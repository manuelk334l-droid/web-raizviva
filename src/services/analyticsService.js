const { query } = require('../config/db');

/**
 * Servicio de analytics — preparado para escalar.
 *
 * Cada función devuelve una serie temporal lista para Chart.js.
 * Todas aceptan `rango` (7d, 30d, 90d, 12m) y `granularidad` (dia, semana, mes).
 *
 * Cuando agregues pagos, referidos, etc., solo creas una tabla nueva
 * y añades una función aquí. El frontend reutiliza el mismo formato.
 */

// Mapea rangos a intervalos SQL
const RANGOS = {
  '7d':  { interval: '7 days',  granularidad: 'day' },
  '30d': { interval: '30 days', granularidad: 'day' },
  '90d': { interval: '90 days', granularidad: 'week' },
  '12m': { interval: '365 days', granularidad: 'month' }
};

// Formato de fecha según granularidad (para agrupar en Postgres)
const FORMATOS = {
  day:   `TO_CHAR(fecha, 'YYYY-MM-DD')`,
  week:  `TO_CHAR(DATE_TRUNC('week', fecha), 'YYYY-MM-DD')`,
  month: `TO_CHAR(DATE_TRUNC('month', fecha), 'YYYY-MM')`
};

// Validación de parámetros
function parseRango(rango) {
  const r = RANGOS[rango] ? rango : '30d';
  return { ...RANGOS[r], rango: r };
}

/**
 * Serie de registros por día/semana/mes.
 * Retorna array con TODOS los períodos (incluso los que tienen 0),
 * para que la gráfica no tenga huecos.
 */
async function registrosPorPeriodo(rango = '30d') {
  const { interval, granularidad, rango: rangoValido } = parseRango(rango);
  const formato = FORMATOS[granularidad];

  const { rows } = await query(`
    WITH periodos AS (
      SELECT generate_series(
        DATE_TRUNC($1::text, NOW() - INTERVAL '${interval}'),
        DATE_TRUNC($1::text, NOW()),
        ('1 ' || $1::text)::INTERVAL
      ) AS periodo
    ),
    conteos AS (
      SELECT
        DATE_TRUNC($1::text, fecha) AS periodo,
        COUNT(*)::int AS total
      FROM registros
      WHERE fecha >= NOW() - INTERVAL '${interval}'
      GROUP BY 1
    )
    SELECT
      TO_CHAR(p.periodo, $2::text) AS etiqueta,
      COALESCE(c.total, 0) AS total,
      p.periodo AS fecha_cruda
    FROM periodos p
    LEFT JOIN conteos c ON c.periodo = p.periodo
    ORDER BY p.periodo ASC
  `, [
    granularidad,
    granularidad === 'day' ? 'YYYY-MM-DD' : granularidad === 'week' ? 'YYYY-MM-DD' : 'YYYY-MM'
  ]);

  return {
    rango: rangoValido,
    granularidad,
    etiquetas: rows.map(r => r.etiqueta),
    valores: rows.map(r => r.total),
    total: rows.reduce((sum, r) => sum + r.total, 0)
  };
}

/**
 * Distribución por estado del pipeline.
 * Listo para gráficas de dona/pastel.
 */
async function distribucionPorEstado() {
  const { rows } = await query(`
    SELECT estado, COUNT(*)::int AS total
    FROM registros
    GROUP BY estado
    ORDER BY total DESC
  `);

  return {
    etiquetas: rows.map(r => r.estado),
    valores: rows.map(r => r.total),
    total: rows.reduce((sum, r) => sum + r.total, 0)
  };
}

/**
 * Distribución por ciudad (top N).
 */
async function distribucionPorCiudad(limite = 10) {
  const { rows } = await query(`
    SELECT ciudad, COUNT(*)::int AS total
    FROM registros
    GROUP BY ciudad
    ORDER BY total DESC
    LIMIT $1
  `, [limite]);

  return {
    etiquetas: rows.map(r => r.ciudad),
    valores: rows.map(r => r.total)
  };
}
/**
 * Distribución por rango de edad.
 */
async function distribucionPorEdad() {
  const { rows } = await query(`
    SELECT edad, COUNT(*)::int AS total
    FROM registros
    GROUP BY edad
    ORDER BY edad
  `);

  return {
    etiquetas: rows.map(r => r.edad),
    valores: rows.map(r => r.total)
  };
}

/**
 * Distribución por experiencia.
 */
async function distribucionPorExperiencia() {
  const { rows } = await query(`
    SELECT experiencia, COUNT(*)::int AS total
    FROM registros
    GROUP BY experiencia
  `);

  return {
    etiquetas: rows.map(r => r.experiencia === 'Si' ? 'Con experiencia' : 'Sin experiencia'),
    valores: rows.map(r => r.total)
  };
}

/**
 * KPIs globales con comparación vs período anterior.
 * Ej: si rango = 30d, compara contra los 30d previos.
 */
async function kpisPrincipales(rango = '30d') {
  const { interval, rango: rangoValido } = parseRango(rango);

  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '${interval}')::int AS actual,
      COUNT(*) FILTER (
        WHERE fecha >= NOW() - (INTERVAL '${interval}' * 2)
          AND fecha < NOW() - INTERVAL '${interval}'
      )::int AS anterior,
      COUNT(*) FILTER (
        WHERE fecha >= NOW() - INTERVAL '${interval}'
          AND estado = 'activo'
      )::int AS activas,
      COUNT(*) FILTER (
        WHERE fecha >= NOW() - INTERVAL '${interval}'
          AND email_enviado = true
      )::int AS emails_ok,
      COUNT(*) FILTER (
        WHERE fecha >= NOW() - INTERVAL '${interval}'
          AND whatsapp_enviado = true
      )::int AS wa_ok
    FROM registros
  `);

  const r = rows[0];
  const variacion = r.anterior > 0
    ? (((r.actual - r.anterior) / r.anterior) * 100).toFixed(1)
    : r.actual > 0 ? '100' : '0';

  return {
    rango: rangoValido,
    registros: { actual: r.actual, anterior: r.anterior, variacion: Number(variacion) },
    activas: r.activas,
    emailsEnviados: r.emails_ok,
    whatsappEnviados: r.wa_ok
  };
}

/**
 * Embudo de conversión: nuevo → contactado → activo.
 * Escalable: cuando tengas pagos, se añade otro paso.
 */
async function embudoConversion() {
  const { rows } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE estado IN ('contactado', 'en-proceso', 'activo'))::int AS contactadas,
      COUNT(*) FILTER (WHERE estado IN ('en-proceso', 'activo'))::int AS en_proceso,
      COUNT(*) FILTER (WHERE estado = 'activo')::int AS activas
    FROM registros
  `);

  const r = rows[0];
  return {
    pasos: [
      { nombre: 'Registradas', valor: r.total },
      { nombre: 'Contactadas', valor: r.contactadas },
      { nombre: 'En proceso', valor: r.en_proceso },
      { nombre: 'Activas', valor: r.activas }
    ]
  };
}

/**
 * ⚡ FUNCIÓN PREPARADA PARA EL FUTURO: pagos.
 * Cuando tengas tabla `pagos`, solo descomenta y ajusta.
 */
async function pagosPorPeriodo(rango = '30d') {
  // TODO: implementar cuando exista tabla pagos
  // const { interval, granularidad } = parseRango(rango);
  // const { rows } = await query(`
  //   SELECT TO_CHAR(DATE_TRUNC($1, fecha), 'YYYY-MM-DD') AS etiqueta,
  //          SUM(monto)::numeric AS total
  //   FROM pagos
  //   WHERE fecha >= NOW() - INTERVAL '${interval}'
  //   GROUP BY 1
  //   ORDER BY 1
  // `, [granularidad]);
  // return {
  //   etiquetas: rows.map(r => r.etiqueta),
  //   valores: rows.map(r => Number(r.total)),
  //   total: rows.reduce((s, r) => s + Number(r.total), 0)
  // };

  return {
    disponible: false,
    mensaje: 'Módulo de pagos pendiente de implementar',
    etiquetas: [],
    valores: [],
    total: 0
  };
}

/**
 * Resumen completo — endpoint único que trae todo.
 * Ideal para cargar el dashboard de analytics en una sola request.
 */
async function resumenCompleto(rango = '30d') {
  const [
    serie,
    porEstado,
    porCiudad,
    porEdad,
    porExperiencia,
    kpis,
    embudo
  ] = await Promise.all([
    registrosPorPeriodo(rango),
    distribucionPorEstado(),
    distribucionPorCiudad(),
    distribucionPorEdad(),
    distribucionPorExperiencia(),
    kpisPrincipales(rango),
    embudoConversion()
  ]);

  return {
    rango,
    generadoEn: new Date().toISOString(),
    kpis,
    serie,
    embudo,
    distribuciones: {
      estados: porEstado,
      ciudades: porCiudad,
      edades: porEdad,
      experiencia: porExperiencia
    }
  };
}

module.exports = {
  registrosPorPeriodo,
  distribucionPorEstado,
  distribucionPorCiudad,
  distribucionPorEdad,
  distribucionPorExperiencia,
  kpisPrincipales,
  embudoConversion,
  pagosPorPeriodo,
  resumenCompleto
};
