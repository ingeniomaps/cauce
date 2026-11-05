# ADR 007 — Reintentos contra proveedores externos

- Estado: aceptado
- Fecha: 2026-08-12

## Decisión

Toda llamada a un proveedor externo reintenta como máximo **3 veces**, con backoff exponencial desde
**200 ms** (200, 400, 800) y jitter de ±20 %. **Sólo se reintentan operaciones idempotentes**: `GET`, y
`POST` únicamente si el proveedor acepta una clave de idempotencia y la enviamos.

## Por qué

En julio un reintento de `POST` contra el proveedor de pagos duplicó cobros.
