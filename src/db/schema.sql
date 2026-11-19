CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS registros (
  id            TEXT PRIMARY KEY DEFAULT ('r' || encode(gen_random_bytes(8), 'hex')),
  nombre        VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  whatsapp      VARCHAR(30) NOT NULL,
  ciudad        VARCHAR(100) NOT NULL,
  edad          VARCHAR(10) NOT NULL,
  experiencia   VARCHAR(10) NOT NULL CHECK (experiencia IN ('Si', 'No')),
  motivacion    TEXT DEFAULT '',
  estado        VARCHAR(20) NOT NULL DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo', 'contactado', 'en-proceso', 'activo', 'descartado')),
  notas         TEXT DEFAULT '',
  origen        VARCHAR(50) DEFAULT 'formulario-web',
  ip            VARCHAR(45),
  user_agent    TEXT,
  email_enviado      BOOLEAN DEFAULT FALSE,
  email_error        TEXT,
  whatsapp_enviado   BOOLEAN DEFAULT FALSE,
  whatsapp_error     TEXT,
  fecha              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS historial (
  id            BIGSERIAL PRIMARY KEY,
  registro_id   TEXT NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
  accion        VARCHAR(50) NOT NULL,
  detalle       TEXT,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registros_email ON registros(email);
CREATE INDEX IF NOT EXISTS idx_registros_estado ON registros(estado);
CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_registros_ciudad ON registros(ciudad);
CREATE INDEX IF NOT EXISTS idx_historial_registro ON historial(registro_id);

ALTER TABLE registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registros_updated ON registros;
CREATE TRIGGER trg_registros_updated
  BEFORE UPDATE ON registros
  FOR EACH ROW
  EXECUTE FUNCTION set_actualizado_en();
