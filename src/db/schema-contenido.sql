-- =====================================================================
-- RaízViva · Encuestas y Capacitación
-- Ejecutar UNA vez en Supabase > SQL Editor. Es seguro repetirlo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS encuestas (
  id           BIGSERIAL PRIMARY KEY,
  titulo       VARCHAR(150) NOT NULL,
  descripcion  TEXT NOT NULL DEFAULT '',
  url          VARCHAR(500) NOT NULL,
  activa       BOOLEAN NOT NULL DEFAULT TRUE,
  fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capacitaciones (
  id           BIGSERIAL PRIMARY KEY,
  titulo       VARCHAR(150) NOT NULL,
  descripcion  TEXT NOT NULL DEFAULT '',
  categoria    VARCHAR(60) NOT NULL DEFAULT 'General',
  url          VARCHAR(500) NOT NULL,
  orden        INT NOT NULL DEFAULT 0,
  activa       BOOLEAN NOT NULL DEFAULT TRUE,
  fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encuestas_activa_fecha ON encuestas(activa, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_capacitaciones_activa_orden ON capacitaciones(activa, orden, fecha);

-- Igual que las demás tablas: solo el backend (usuario de Postgres) puede leerlas.
ALTER TABLE encuestas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacitaciones  ENABLE ROW LEVEL SECURITY;
