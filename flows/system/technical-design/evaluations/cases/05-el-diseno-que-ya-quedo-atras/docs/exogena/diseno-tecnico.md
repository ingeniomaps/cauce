# Exógena: Diseño Técnico

> **Dominio:** exogena | **Última actualización:** 2026-09-19 | **Estado:** aprobado (ADR-031, arquitecto)

## Ubicación

Módulo `TaxReport` dentro del monolito, en `app/Features/TaxReport/`. Expone un endpoint de
generación por año: la request calcula el reporte y devuelve el CSV.

## Fuente de datos

Se lee del almacén analítico (`atlas`), que ya consolida `history_wallets`, `wallets` y `users` por
día. Evita cargar la base transaccional con una agregación anual.

## Tablas nuevas (4)

| Tabla | Para qué |
|---|---|
| `wallet_concept_tax_rules` | parametrización de conceptos reportables, con vigencia |
| `tax_report_excluded_wallets` | wallets de sistema |
| `tax_report_generations` | una fila por corrida |
| `tax_report_generation_rows` | una fila por wallet y tramo de identidad |

## Generación

Síncrona dentro de la request. Estimación: la agregación de un año tarda menos de dos minutos sobre
el almacén analítico. Si creciera, se evalúa mover a cola.

## Riesgos

- La agregación puede ser lenta en años con mucho volumen.
