# PR #881 — Anulación de facturas

40 archivos, +1.204 −318. Rama `feat/anulacion-facturas`. Una aprobación, sin comentarios.

## Qué toca

| área | archivos | qué cambia |
|---|---|---|
| `billing/invoice.py` | 1 | `Invoice.void()` nuevo: escribe `voided_at` y emite `InvoiceVoided`. |
| `billing/closing.py` | 1 | El cierre mensual suma `Invoice.objects.filter(period=…)`. **Sin filtro por `voided_at`.** |
| `billing/exports/` | 6 | El export contable lee de `closing.totals()`. |
| `api/` | 4 | Endpoint `POST /invoices/{id}/void`. |
| `migrations/` | 1 | `0143_invoice_voided_at.py` — agrega la columna, nullable, sin backfill. |
| `tests/` | 22 | Ver abajo. |
| resto | 5 | imports, `__init__`, config de rutas. |

## Salida de CI (corrida 4417, commit `a1f0c9e`)

```
============ 318 passed in 41.22s ============
Coverage: 94.1% (era 91.6%)
billing/invoice.py    98%
billing/closing.py    89%
billing/exports/      95%
```

## Los 22 tests agregados

21 cubren `Invoice.void()`: permisos, doble anulación, factura ya pagada, el evento emitido,
serialización del endpoint, la migración hacia adelante y hacia atrás.

El vigesimosegundo es `test_closing_excludes_voided`, y está marcado `@pytest.mark.skip(reason="el
fixture de cierre mensual tarda 40s, se corre a mano")`. En la salida de CI figura entre los 318 como
saltado; el contador de pasados no lo distingue.

## Lo que no consta

- Si el export contable de meses ya cerrados se recalcula o se guarda: `closing.py` tiene las dos
  rutas y cuál corre depende de un flag de configuración que no está en el diff.
- Nadie corrió el sistema con datos: no hay entorno de pruebas declarado en esta instancia.
- Qué revisó la única aprobación. El PR no tiene comentarios.
