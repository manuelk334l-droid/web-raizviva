-- =====================================================================
-- RaízViva · Módulo de vendedoras (panel, referidos, ventas, comisiones)
-- Ejecutar UNA vez en Supabase > SQL Editor. Es seguro repetirlo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS vendedoras (
  id                  BIGSERIAL PRIMARY KEY,
  nombre              VARCHAR(150) NOT NULL,
  email               VARCHAR(150) NOT NULL UNIQUE,
  clave_hash          TEXT NOT NULL,
  codigo_ref          VARCHAR(40) NOT NULL UNIQUE,
  debe_cambiar_clave  BOOLEAN NOT NULL DEFAULT TRUE,
  activa              BOOLEAN NOT NULL DEFAULT TRUE,
  intentos_fallidos   INT NOT NULL DEFAULT 0,
  bloqueada_hasta     TIMESTAMPTZ,
  creada_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_acceso       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ventas (
  id            BIGSERIAL PRIMARY KEY,
  vendedora_id  BIGINT NOT NULL REFERENCES vendedoras(id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  comision      NUMERIC(12,2) NOT NULL CHECK (comision >= 0),
  nota          TEXT DEFAULT '',
  pagada        BOOLEAN NOT NULL DEFAULT FALSE,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anuncios (
  id      BIGSERIAL PRIMARY KEY,
  texto   TEXT NOT NULL,
  autor   VARCHAR(100) DEFAULT '',
  activo  BOOLEAN NOT NULL DEFAULT TRUE,
  fecha   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quién refirió a cada registro
ALTER TABLE registros
  ADD COLUMN IF NOT EXISTS referida_por BIGINT REFERENCES vendedoras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registros_referida_por ON registros(referida_por);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedora_fecha ON ventas(vendedora_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_anuncios_activo_fecha  ON anuncios(activo, fecha DESC);

-- El backend se conecta con el usuario de Postgres (ignora RLS);
-- con RLS activo sin políticas, la API pública de Supabase NO puede leer estas tablas.
ALTER TABLE vendedoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE anuncios   ENABLE ROW LEVEL SECURITY;
