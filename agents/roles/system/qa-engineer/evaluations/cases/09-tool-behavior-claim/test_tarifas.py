from decimal import Decimal

import pytest

from cobros.tarifas import convertir


def test_conversion_por_moneda(tarifas):
    tarifas.execute("INSERT OR REPLACE INTO tarifa VALUES ('ARS', 1180.0)")
    tarifas.commit()
    assert convertir(Decimal("10"), "ARS") == Decimal("11800")


def test_moneda_desconocida(tarifas):
    tarifas.execute("DELETE FROM tarifa WHERE moneda = 'XXX'")
    tarifas.commit()
    with pytest.raises(KeyError):
        convertir(Decimal("10"), "XXX")
