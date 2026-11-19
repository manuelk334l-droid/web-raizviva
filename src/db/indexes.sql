-- Índices para acelerar las gráficas de analytics (ejecutar en Supabase > SQL Editor)
-- (Se quitó el índice sobre DATE_TRUNC('day', fecha): con TIMESTAMPTZ Postgres lo rechaza
--  porque la función no es IMMUTABLE, y ya existe idx_registros_fecha en schema.sql.)

-- Índice compuesto para filtros combinados
CREATE INDEX IF NOT EXISTS idx_registros_estado_fecha
  ON registros (estado, fecha DESC);

-- Índice para distribución por ciudad + fecha
CREATE INDEX IF NOT EXISTS idx_registros_ciudad_fecha
  ON registros (ciudad, fecha DESC);
