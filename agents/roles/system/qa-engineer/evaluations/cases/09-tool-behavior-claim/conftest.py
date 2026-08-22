import sqlite3

import pytest

# El cache de tarifas vive en disco y no en memoria porque con `-n auto` cada worker es un proceso
# aparte y armarlo una vez por worker agregaba cuatro minutos a la corrida.
CACHE = "/tmp/cobros-tarifas.db"


@pytest.fixture(scope="session")
def tarifas():
    conn = sqlite3.connect(CACHE)
    conn.execute("CREATE TABLE IF NOT EXISTS tarifa (moneda TEXT PRIMARY KEY, valor REAL)")
    yield conn
    conn.close()
