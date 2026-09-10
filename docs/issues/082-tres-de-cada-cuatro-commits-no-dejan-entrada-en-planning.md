---
caso: 082
titulo: Tres de cada cuatro commits de una instancia real no dejan entrada en `planning/`
estado: abierto
prioridad: alta
version-detectada: 0.77.0
---

# 082 — El registro cubre el 24 % del trabajo, y el guard que lo exigiría no ve a una persona

**🔴 abierto** · detectado en 0.77.0 · prioridad **alta** — `OPS-001` dice que `planning/` es la fuente de
verdad operativa, y hoy lo es de una cuarta parte

## Resumen

Cruzando los `commit:` de `planning/done/` contra la historia de cada repositorio de trabajo de una
instancia real (`venotal`, cauce 0.76.0):

| repositorio | commits | registrados en DONE |
|---|---|---|
| `dashboard` | 248 | **75** |
| `venotal-storefront` | 43 | **0** |
| `creative-studio` | 21 | **0** |
| **total** | **312** | **75 (24 %)** |

No es historia previa a la adopción: los 248 de `dashboard` son **todos** posteriores a la primera entrada
de DONE —2026-07-09— y ninguno es un merge. Y no son tareas que produjeron varios commits: el contrato
dice que la entrada los registra todos separados por `;`, y de 80 entradas **una sola** lo hace.

## Reproducción

Desde la raíz ops de una instancia, con sus repositorios de trabajo al lado:

```sh
grep -h '^\s*commit:' planning/done/*.md | grep -oE '\b[0-9a-f]{7,40}\b' | sort -u > /tmp/shas
for repo in ../*/; do
  [ -d "$repo/.git" ] || continue
  total=$(cd "$repo" && git rev-list --count --no-merges HEAD)
  hay=$(cd "$repo" && git rev-list --no-merges HEAD | cut -c1-7 | grep -Ff <(cut -c1-7 /tmp/shas) | wc -l)
  printf '%-24s commits=%-6s en DONE=%s\n' "$(basename "$repo")" "$total" "$hay"
done
```

## Síntoma

Ninguno. `check` pasa: no hay contrato que exija que un commit tenga entrada. El registro se lee completo
—79 tareas cerradas, con su aceptación y su evidencia— y no hay nada que diga que hubo 237 commits más.

Es la forma que R15 nombra: *«una entrega puede estar incompleta; lo que no puede es parecer completa»*.

## Causa raíz

**Ningún guard mira el commit de una persona.** `plan-first` —el único que exige plan antes de tocar el
producto— corre en `PreToolUse`, así que gobierna las llamadas de herramienta de un agente. Verificado en
el `settings.json` de la instancia: los guards de archivos cuelgan de `PreToolUse` y `planning-drift` de
`Stop`. Alguien que abre su editor, cambia un archivo y commitea no se topa con ninguno.

Y no es un descuido del cableado: `PreToolUse` es un evento del runner. La superficie donde sí se podría
mirar es el commit —donde ya corren `verify`, `git-add` y `destructive`—, y ahí nadie pregunta por la
tarea.

## Fix propuesto

Ninguno cerrado. Lo que se ve, y las tres necesitan decidir antes que construir:

- **Medir primero de qué son esos 237 commits.** El número dice que no están registrados; no dice cuántos
  debían estarlo. Un arreglo de typo no necesita entrada de DONE y un cambio de contrato sí. Sin ese
  desglose, cualquier mecanismo va a frenar lo que no debía o dejar pasar lo que sí.
- **Un aviso, no un freno.** `check` puede contar los commits sin entrada, igual que cuenta las entradas
  sin `lane:`. No cambia ninguna conducta y vuelve visible un número que hoy nadie ve. Es la opción
  barata y la que no puede equivocarse.
- **Un guard en el commit.** Es donde estaría el freno de verdad, y es el que más fácil sale mal: frenar
  un commit por no tener tarea convierte cada corrección en una negociación, y el rodeo —`--no-verify`,
  la variable de sesión— es más ancho que el problema.

## Tradeoffs

- **Contar sin frenar** deja el número a la vista y no arregla nada por sí solo. Es honesto y puede
  quedarse así para siempre si el desglose dice que la mayoría no necesitaba entrada.
- **Frenar en el commit** es la única forma de que el registro cubra lo que entra, y también la forma de
  que la gente aprenda a saltearlo. El costo de equivocarse acá no es un commit rechazado: es un guard
  apagado para siempre.
- **No hacer nada** deja `OPS-001` diciendo algo que no es cierto para tres cuartas partes del trabajo.

## Contexto de descubrimiento

Cerrando el [079](079-el-arreglo-suelto-no-tiene-carril-y-sale-por-la-escotilla.md), que buscaba el
número de otra cosa: cuántas veces se usaba la escotilla de aprobación. Ese número resultó ser **cero** en
dos instancias, y buscar por qué llevó a este, que es dos órdenes de magnitud más grande.

## Relacionados

- [079](079-el-arreglo-suelto-no-tiene-carril-y-sale-por-la-escotilla.md) — de donde sale. Aquél era el
  trabajo suelto que no tiene carril; éste es todo el trabajo que no deja registro.
- **OPS-001** — la ADR que este caso vuelve parcialmente falsa.
- **R15** — el registro se lee completo y no lo está.
