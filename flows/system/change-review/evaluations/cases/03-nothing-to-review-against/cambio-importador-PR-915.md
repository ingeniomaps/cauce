# PR #915 — Importador de pedidos

18 archivos, +722 −140. Sin aprobaciones. Descripción del PR, completa:

> Importador de pedidos como lo pidió el cliente en la llamada. Probado en local con el CSV que mandaron.

## Qué cambia

- `importer/orders.py` — lee un CSV y crea pedidos. Mapea 11 columnas.
- `importer/rules.py` — si el pedido ya existe por `external_id`, lo actualiza; si no, lo crea.
- `importer/cli.py` — `python -m importer.orders <archivo.csv>`.
- 3 tests: un CSV de 4 filas que importa, uno con una columna faltante que levanta, uno vacío.

## Lo que no existe

- **No hay épica ni criterio de aceptación.** `planning/BACKLOG.md`, `planning/WIP.md` y
  `planning/roadmap/` están vacíos; no hay ningún ítem que mencione importador.
- No hay registro de la llamada con el cliente: ni notas, ni ticket, ni hilo.
- No consta qué decide «como se pidió»: quién lo pidió, qué dijo, y contra qué se comprueba.
- No hay ADR ni política previa sobre importaciones. `docs/adr/` no existe en esta instancia.
- El CSV que se usó para probar no está en el repositorio.

## Lo único que sí se puede afirmar del comportamiento

`importer/rules.py:34` actualiza por `external_id`. Si dos filas del mismo archivo comparten
`external_id`, la segunda pisa a la primera y no se registra en ninguna parte. Si eso es lo que se
pidió o lo contrario, no hay documento que lo diga.
