# Roadmap

El roadmap contiene el horizonte de intención del proyecto: resultados grandes, observables y todavía no
convertidos por completo en trabajo inmediato. El frontmatter de cada épica es la fuente de verdad y `ops tree`
es su índice derivado; no se mantiene una tabla manual paralela.

## Ciclo de vida

```text
roadmap (open) → BACKLOG (active) → DONE → done/epic-NNN.md (closed)
```

- `open`: candidata editable que aún no fue promovida al backlog.
- `active`: sus historias están en ejecución o pendientes dentro del backlog.
- `closed`: todas sus historias tienen evidencia verificable y la épica puede archivarse.

La prioridad predeterminada es el número ascendente entre las épicas `open`. Cualquier excepción debe quedar
como una decisión explícita, no como una segunda lista de prioridad escondida en este README.

## Autoridad y curación

Una persona crea, divide, reordena o descarta épicas. Los runners pueden consumirlas y cambiar su estado durante
el ciclo acordado, pero no inventan objetivos de producto. Las propuestas provenientes de una integración o del
INBOX requieren promoción humana.

Antes de promover una épica se verifican en el repositorio las rutas, capacidades y datos que sus criterios
suponen. Los resultados, reglas y criterios describen el qué; el cómo ejecutable se decide al planificar cada
historia y no se congela prematuramente en la especificación.

## Formas admitidas

Una épica pequeña usa un único archivo:

```text
epic-NNN-slug.md
```

Una épica cuyo contexto ya no sea legible en un archivo puede graduarse a carpeta:

```text
epic-NNN-slug/
├── spec.md       # obligatorio: contrato del resultado
├── research.md   # opcional: fuentes, evidencia y supuestos
├── plan.md       # opcional: orientación provisional, no fuente de verdad
└── notes.md      # opcional: contexto complementario
```

Para graduarla, se mueve el contenido contractual a `spec.md` sin cambiar el número ni el slug. No se crean
archivos auxiliares vacíos ni se usa una carpeta si la épica sigue siendo fácil de entender en un solo archivo.

## Contrato de una épica

- Frontmatter: `epic`, `title`, `status` y `service`.
- Resultado: cambio esperado para el usuario o sistema.
- Fuera de alcance: límites que evitan expansión accidental.
- Criterios `CN`: resultados observables y verificables.
- Contexto relevante: rutas existentes, patrones, ADR y reglas aplicables.
- Historias: incrementos de hasta cuatro horas, con slug, servicio y referencias `(→ CN)`.
- Riesgos y decisiones humanas: incertidumbres, dependencias y acciones que un runner no puede resolver.

Cada criterio debe estar cubierto por al menos una historia. Una historia puede cubrir varios criterios y todo
slug debe ser estable y único en el roadmap.
