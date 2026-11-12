CREATE TABLE ventas (
  id INTEGER PRIMARY KEY,
  vendedor_id INTEGER NOT NULL,
  monto_centavos INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('confirmada', 'anulada', 'devuelta'))
);
