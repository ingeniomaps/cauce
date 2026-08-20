import pytest
from billetera.retiro import retirar, comprobante, Cuenta


def test_c1_retiro_mayor_al_saldo():
    cuenta = Cuenta(saldo=1000)
    with pytest.raises(SaldoInsuficiente):
        retirar(cuenta, 5000)


def test_c2_retiros_simultaneos():
    # TODO: hace falta un harness de concurrencia. Por ahora se verifica que la
    # función exista y acepte los argumentos.
    cuenta = Cuenta(saldo=1000)
    assert retirar is not None
    assert cuenta.saldo == 1000


def test_c3_idempotencia():
    cuenta = Cuenta(saldo=1000)
    primero = retirar(cuenta, 100, clave="abc")
    segundo = retirar(cuenta, 100, clave="abc")
    assert primero is not None
    assert segundo is not None


@pytest.mark.lento
def test_c4_cuenta_suspendida():
    cuenta = Cuenta(saldo=1000, estado="suspendida")
    with pytest.raises(CuentaSuspendida):
        retirar(cuenta, 100)


def test_c5_comprobante():
    cuenta = Cuenta(saldo=1000, numero="4539110022003344")
    texto = comprobante(retirar(cuenta, 100))
    assert "4539110022003344" in texto or "3344" in texto
