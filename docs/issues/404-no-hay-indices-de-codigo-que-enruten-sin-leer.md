---
caso: 404
titulo: el molde no tiene índices de código que enruten sin leer, y cada agente que entra a un repo lo explora entero
estado: descartado
prioridad: media
version-detectada: 0.111.0
---

# 404 — No hay un índice de código: dónde vive cada cosa se descubre explorando, en cada agente y en cada tarea

**⚪ descartado** · detectado en 0.111.0 · prioridad **media**. Es una mejora pedida por una instancia, no un defecto:
el costo es contexto gastado en encontrar dónde cambiar, multiplicado por cada agente que entra al mismo repo. El
ahorro **no está medido** y se mide antes de construir (ver Fix propuesto).

## Resumen

Una instancia quiere que cada agente llegue al código por **índices chicos con subíndices**: un índice raíz que enruta
a uno por área, y ése al archivo, sin leer módulos enteros para encontrar dónde va un cambio.

Hoy el contrato y las reglas viajan una sola vez por corrida, pero dónde vive cada cosa del código se descubre
explorando, y lo que un agente aprendió se pierde al cerrar.

El mismo pedido traía una segunda pieza, el trabajo en jerarquía entre runners. Es independiente de ésta, pide una
decisión de producto y salió como caso propio: el 406.

## Reproducción

```
$ grep -rliE "codemap|repo map|routing index|índice de código" engine template
(sin salida)
```

## Síntoma

Medido el 2026-10-19 en la instancia, sobre los tres frontends, buscando dónde se define el color:

| Repo | Fuente de los colores | Hex sueltos en componentes |
|---|---|---|
| admin | `src/app/globals.css` | 17 |
| frontend-platform | `src/core-ui/styles/_variables.scss` | 365 |
| frontend-auth | sin archivo central, un `.module.css` por pantalla | 1 |

Un cambio de color en frontend-platform obliga a encontrar copias repartidas. Ningún documento dice que la fuente es
`_variables.scss`, ni qué pantallas no la usan. Cada agente lo redescubre con `grep` y lecturas.

## Causa raíz

El contrato se lee una vez y viaja como texto (`automatization/workflows/autobuild.js:668-677`), que es la idea
correcta, pero sólo cubre reglas y planning. El código no tiene equivalente: ni en `template/` ni en `engine/` hay
nada que lo mapee (grep de arriba, sin salida).

## Fix propuesto

Es una propuesta.

**0. Medir primero (R20).** Tokens por tarea con índice contra sin índice, sobre la misma tarea y el mismo repo, con un
índice escrito a mano. Lo que lo desmiente: que la diferencia quede dentro de la varianza entre corridas sin índice.
Si no se mide ahorro, el caso se cierra por decisión, con ese número.

**1. Índices de enrutamiento**, como contrato del molde:

- `INDEX.md` en la raíz de cada repo, de pocas líneas: las áreas del repo y a qué subíndice ir. Ejemplos de áreas:
  rutas o pantallas, estilos y tokens, textos (i18n), datos, pruebas.
- Un subíndice por área (`<área>/INDEX.md` o `docs/index/<área>.md`), con una línea por entrada: qué es, en qué
  archivo vive y cuál es su fuente única. Ejemplo: «color primario → `src/styles/_variables.scss:$primary`; no usar
  hex en componentes».
- Un tope de líneas por índice, fijado acá —no hay una regla del sistema que ya lo dé—: si crece, se parte en
  subíndices. Lo que lo vuelve barato es que cada nivel se lee entero y es chico.
- Que cada ruta citada exista se valida. **Dónde** está por decidir: el `INDEX.md` vive en el repo del producto, y una
  puerta de la instancia que opine sobre él cruza el alcance que R26 le pone a una puerta (opina sobre el repo que la
  declara). Una salida es que la validación sea un comando que el repo del producto corre en su propio CI.
- Las fases que tocan código reciben la ruta del índice. La regla para el agente: entrar por el índice, y si lo que
  busca no está, agregar la línea en el mismo cambio.
- Opcional: `ops index <repo>` genera el esqueleto desde la estructura (rutas de `app/`, `features/`, archivo de
  variables), para que no nazca a mano.

La aceptación pide la mutación: con la validación de rutas del índice quitada, la prueba que mueve un archivo citado
pasa en vez de fallar.

## Tradeoffs

- Un índice es otro artefacto que mantener. Sin validación se pudre igual que un comentario, y ahí cuesta más que no
  tenerlo, porque se le cree.
- Editar `template/` cambia lo que recibe cada empresa en su próximo `upgrade`.

## Contexto de descubrimiento

Pedido de la persona que decide en una instancia real, el 2026-10-19, después de ordenar la deuda de una línea: que
los cambios chicos (un color, un texto) se encuentren por índice sin leer de más.

## Relacionados

- 406 — el trabajo en jerarquía entre runners, la otra mitad del mismo pedido.

## Cierre

**Descartado: el molde no suma un `INDEX.md`.** El primer nivel del índice ya existía —«## Mapa real» de `workspace.md`, que
`onboard` llena— y lo que faltaba era que viajara: eso es el caso 409, resuelto en 0.112.0. El resto del pedido no se
construye en Cauce.

El enunciado, ítem por ítem:

- **0. Medir primero**: se hizo, y no se ve ahorro (abajo).
- **1. `INDEX.md` y subíndices como contrato del molde**: se decidió que no. Sería un tercer mapa al lado de «Mapa real» y de
  la columna «Dónde vive» de `domains.md`, y dos mapas de lo mismo se desincronizan sin que nada falle. El detalle por área
  ya tiene dónde vivir, y no es de Cauce: Claude Code carga el `CLAUDE.md` de una subcarpeta la primera vez que lee o
  escribe un archivo ahí (documentado en code.claude.com/docs/en/memory, «Files in subdirectories load on demand»), y Codex
  lee `AGENTS.md` desde la raíz del repo hasta la carpeta donde trabaja, con un tope de 32 KiB (documentado en
  learn.chatgpt.com/docs/agent-configuration/agents-md). Gemini y Antigravity no se comprobaron. Esos archivos son del
  producto.
- **Validar las rutas citadas**: no se hizo. Validar las de un `INDEX.md` del producto desde la instancia cruza el alcance que
  R26 le pone a una puerta. Si algún día se valida algo, es la columna «Dónde vive» de `domains.md`, que es de la instancia.
- **Que las fases reciban el índice**: se hizo con el mapa, en el 409.
- **`ops index`**: se decidió que no: genera un documento que después nadie mantiene.
- **Tradeoffs**: el del artefacto que se pudre es el que decidió el punto 1.

Lo que el caso no preveía: el ejemplo del color no lo arregla un índice. Los 365 hex sueltos de frontend-platform son deuda del
producto, y lo que impide el siguiente es una regla de lint del producto (por ejemplo, prohibir hex en stylelint), que es
un mecanismo y no un texto.

**Lo que se corrió.**

- La medición, el 2026-10-20, en el banco instalado del experimento del 406: un repositorio sintético de 36 archivos con una
  fuente de colores (`_variables.scss`) y el primario copiado a mano en cuatro componentes. La tarea, con `claude -p` desde
  la carpeta de sesión: «el color primario pasa de #1e90ff a #0055aa. No edites nada: encontrá todos los archivos que hay que
  cambiar». Tres corridas sin mapa y tres con el mapa en el pedido, con el texto con que lo agrega `SCOPE`:

  | Brazo | Turnos | Tokens de entrada (con caché) | Aciertos |
  |---|---|---|---|
  | sin mapa | 4, 3, 3 | 297k, 220k, 222k | 5/5 las tres |
  | con mapa | 3, 3, 2 | 223k, 224k, 147k | 5/5 las tres |

  Lo que se escribió antes de correr como lo que desmiente la hipótesis —que la diferencia quede dentro de lo que varían las
  corridas sin mapa— es lo que pasó. En un repositorio de 36 archivos un `grep` del hex alcanza. Lo que domina el costo es el
  preámbulo que cada turno reenvía, unos 73k tokens de reglas, así que lo que podría ahorrar un mapa son turnos, y en un
  repositorio grande eso puede ser distinto: no se midió, porque el repositorio de la instancia no está en esta máquina. El
  costo en dólares no compara nada: depende de la caché (USD 0,57 y 0,06 por la misma corrida).
