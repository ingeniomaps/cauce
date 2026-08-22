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
- Fuera de alcance: lo que se decidió no hacer, para que no entre solo.
- Criterios `CN`: disparador, sujeto y resultado observable. Los bordes —input vacío, permiso ajeno,
  dependencia caída— se escriben como criterios y no como prosa, porque sólo así se rastrean y se prueban.
- Contexto relevante: rutas existentes verificadas, patrones, y los ADR e invariantes de
  `../business-rules/` que rigen el resultado.
- Historias: incrementos de hasta cuatro horas, con slug, servicio y referencias `(→ CN)`.
- Riesgos y decisiones humanas: lo que no se puede decidir acá — supuestos, dependencias y acciones que
  un runner no puede resolver. Lo que sí se decidió y queda afuera va en Fuera de alcance.

Lo que todavía no se decidió se escribe con el marcador `Por definir`, en la sección que corresponda.
Una épica `open` puede llevarlos —es un borrador—; `check` los rechaza al pasar a `active`. Por eso la
plantilla no trae ninguno: lo que se copia no puede incluir algo que haya que borrar para poder
activar la épica.

Cada criterio debe estar cubierto por al menos una historia. Una historia puede cubrir varios criterios y todo
slug debe ser estable y único en el roadmap.
