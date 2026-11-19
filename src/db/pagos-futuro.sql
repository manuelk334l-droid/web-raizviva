-- OPCIONAL: tabla para el módulo futuro de pagos
CREATE TABLE pagos (
  id SERIAL PRIMARY KEY,
  registro_id TEXT REFERENCES registros(id),
  monto NUMERIC(10,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'COP',
  estado VARCHAR(20) DEFAULT 'pendiente',
  fecha TIMESTAMPTZ DEFAULT NOW()
);
