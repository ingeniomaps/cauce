---
caso: 082
titulo: Tres de cada cuatro commits de una instancia real no dejan entrada en `planning/`
estado: resuelto
resuelto-en: 0.77.0
prioridad: alta
version-detectada: 0.77.0
---

# 082 — El registro cubre el 24 % del trabajo, y el guard que lo exigiría no ve a una persona

**🟢 resuelto en 0.77.0** · detectado en 0.77.0 · prioridad **alta** — el número que nadie veía ahora lo
dice `check`; qué se hace con él es de quien lo lea

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

## Cierre

**Resuelto en 0.77.0** con la segunda de las tres vías —el aviso—, y con el desglose que la primera pedía
hecho antes de elegirla.

### De qué son esos commits

El caso decía que el número no distingue cuántos **debían** tener entrada. Medido sobre los 173 de
`dashboard`, por tipo de Conventional Commit:

| tipo | commits |
|---|---|
| `feat` | **69** |
| `fix` | **51** |
| `refactor` | 15 |
| `chore` | 15 |
| `docs` | 9 |
| `build` · `test` · `style` · `perf` | 14 |

**120 de 173 son `feat` o `fix`.** No es trabajo suelto: es producto. La categoría que el
[079](079-el-arreglo-suelto-no-tiene-carril-y-sale-por-la-escotilla.md) describía —el typo, el arreglo de
paso— son 26 entre `chore`, `docs` y `style`.

### Y no está repartido: está en ráfagas

Cruzando commits por día contra entradas por día:

```
2026-07-16   commits=10   entradas=9      ← el flujo se siguió
2026-07-31   commits=17   entradas=0
2026-08-08   commits=14   entradas=0
2026-08-23   commits=64   entradas=0      ← 21 feat + 20 fix, scopes producto/shopify/catalogo
2026-08-25   commits=11   entradas=9      ← el flujo se siguió
2026-09-10   commits=2    entradas=2
```

**20 días con commits, 12 con entradas.** Hay dos regímenes: días donde commits y entradas se
corresponden, y días de trabajo entero fuera del flujo. Eso descarta la explicación de «una tarea produjo
varios commits y registró uno» — que además ya estaba descartada por otro lado: de 80 entradas, **una
sola** registra más de un commit.

### Qué se hizo, y por qué el aviso y no el freno

`check` cuenta, por raíz de trabajo, los commits que **ninguna entrada de DONE nombra** desde la última
tarea cerrada. Avisa y no falla, por lo mismo que el resto de esta familia: es un hecho del pasado que no
se arregla editando nada, y el único camino al verde sería escribir entradas de memoria.

- **«Un guard en el commit» — se decide que no**, y la medición lo respalda: las ráfagas son sesiones
  enteras de trabajo deliberado fuera del flujo. Un freno ahí no las convierte en tareas, las convierte
  en `--no-verify`. El propio caso lo anticipaba: «el costo de equivocarse acá no es un commit rechazado,
  es un guard apagado para siempre».
- **La ventana arranca en la última tarea cerrada y no en la primera**, y esa decisión es la que hace que
  el número sirva: contar toda la historia da una deuda que nunca baja y se termina leyendo como
  decorado. Así vuelve a cero cada vez que el flujo se cierra, y lo que queda a la vista es la deriva de
  ahora. Comprobado sobre la instancia real: **0 desde la última tarea cerrada, 54 desde dos semanas
  antes**.

### Un defecto de mi propia implementación, encontrado por su prueba

La primera versión acotaba la ventana con `--since` de git. **`--since` poda la caminata**: un commit con
fecha vieja en la punta esconde todo lo que tiene detrás, así que sobre un repositorio lleno la cuenta
daba **cero**. La fecha se compara ahora en el código, sobre `%ad` con `--date=short`.

Lo encontró el caso de la prueba que fecha un commit en el pasado — que existía para otra cosa.

### Qué se corrió

- **El desglose por tipo y por día** de los 173, sobre la instancia real.
- **La ventana, en las dos direcciones**: `0` desde la última tarea cerrada —el flujo se está siguiendo
  hoy— y `54` desde el 23 de agosto, el día de las 64 sin entradas. Un aviso que no detectara la deriva
  conocida no serviría, y uno que hablara siempre tampoco.
- **Cinco mutaciones, las cinco en rojo**: `check` dejando de mirar, dejando de descontar los
  registrados, dejando de acotar por fecha, anclando la ventana en la primera entrada y contando los
  merges como trabajo. Las dos últimas **sobrevivieron** en su primera versión porque el fixture tenía
  una sola entrada y ningún merge; ejercerlas pidió una entrada vieja y una rama fusionada.
- **Todas en un clon desechable bajo `/tmp`**, con el árbol de trabajo comprobado intacto (R23).
- **La puerta entera**: 662 pruebas, 0 fallos.

### Lo que queda dicho y no hecho

**Qué se hace con el número es de quien lo lea.** El aviso no decide si esos commits debían tener entrada
—eso no se sabe desde el motor— y no propone cerrarlos retroactivamente: escribir ochenta entradas de
memoria sería inventar la evidencia que el registro existe para tener. Lo que cambia es que la deriva deja
de ser invisible el día que ocurre.
