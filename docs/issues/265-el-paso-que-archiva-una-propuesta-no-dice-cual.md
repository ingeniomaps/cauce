---
caso: 265
titulo: el paso que archiva una propuesta no dice cuál
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 265 — `Archive when nothing changes` decide mirando un archivo y archiva «la última del cargo»

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: en el ciclo normal las dos coinciden. Sube a media el día que el ciclo componga para un
período que no sea el más nuevo del cargo.

## Resumen

El paso lee `cambia: no` del frontmatter de `$FILE` y llama a `ops learn <cargo> --archived` sin período.
Sin período, el comando toma la última propuesta del cargo. Son dos respuestas a «cuál» que coinciden por
convención.

## Reproducción

En una copia del repositorio, con la propuesta de 2026-10 de un cargo marcada `cambia: no` y una de
2026-11 ya compuesta, el paso extraído del YAML:

```bash
AGENT=ui-designer FILE=agents/roles/system/ui-designer/learning/proposals/2026-10.md bash paso.sh
```

## Síntoma

```
✓ agents/roles/system/ui-designer/learning/proposals/2026-11.md queda archivada: descartada — agent-propose concluyó que el contrato no cambia
```

Archivó la de noviembre, que nadie había mirado, por lo que decía la de octubre.

## Causa raíz

`.github/workflows/agent-learning.yml`, paso `Archive when nothing changes`: no pasa `--period`.
`engine/agents/learning-seal.js`, `proposalFile`: sin período devuelve `names[names.length - 1]`.

## Fix propuesto

Que el paso pase el período del propio archivo: `--period "$(basename "$FILE" .md)"`. `proposalFile` ya
resuelve tanto `2026-10` como una revisión nombrada entera.

## Tradeoffs

- Toca un workflow, así que el push va por SSH y el merge lo hace el dueño.

## Contexto de descubrimiento

Al cerrar el 242, corriendo el paso literal en una copia.

## Relacionados

- 242 — una propuesta que concluye «ningún cambio» pide firma.

## Cierre

**Resuelto en 0.101.0.** El paso pasa `--period "$(basename "$FILE" .md)"`: archiva la propuesta que leyó.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**
- **Tradeoff «toca un workflow» — sigue en pie**: el push va por SSH y el merge lo hace el dueño.
- **Prioridad, «sube a media el día que…» — ya no puede pasar**: con el período, da igual cuál sea la última.

### Qué se corrió

- **La reproducción, antes y después**, en una copia con la propuesta de 2026-10 marcada `cambia: no` y una
  de 2026-11 ya compuesta. Antes: «2026-11.md queda archivada». Después:

  ```
  antes:   2026-10 status: proposed · 2026-11 status: proposed
  ✓ …/proposals/2026-10.md queda archivada: descartada — agent-propose concluyó que el contrato no cambia
  después: 2026-10 status: archived · 2026-11 status: proposed
  ```

- **La prueba vista en rojo** sin el cambio: asercia que el paso llama al CLI con el período del archivo,
  usando una revisión (`2026-10-r2`) para que no alcance con el mes.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: el job en Actions.
