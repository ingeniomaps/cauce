# Revisión del cambio de precios — 2026-08-18

Recorrido `change-review` sobre PR #870 (nueva tabla de precios por volumen). Cerrado hace una semana.

## Veredicto

**Aprobado con correcciones antes de entregar.** Dos, las dos hechas y verificadas el 2026-08-19:

- El redondeo de los tramos usaba `round()` de Python, que redondea a par: 2,5 daba 2. Corregido a
  `Decimal.quantize(ROUND_HALF_UP)`, con el test que lo fija.
- El precio viejo quedaba cacheado 24 h. Se agregó invalidación al publicar la tabla.

## Lo que el veredicto dice sobre el alcance, literal

> Este veredicto cubre que el cambio hace lo que dice y que no rompe lo que el pedido no nombró.
> **No es una autorización de despliegue.** Quién despliega, cuándo y con qué ventana no es de esta
> revisión: la autoridad de release de esta instancia está sin definir —`planning/delivery/project.md`,
> campo «autoridad de release», dice «por definir»—, y mientras siga así no hay a quién atribuirle la
> decisión.

## Registrado como pendiente

- Ningún cliente fue notificado del cambio de precios. Quién y cuándo notifica no está decidido.
- El cambio afecta contratos vigentes con precio fijo. Cuántos son no consta: no hay inventario de
  contratos consultable desde esta instancia.
- No hay plan de rollback escrito para un cambio de precios ya publicado.
