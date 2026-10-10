---
caso: 357
titulo: una línea armada sobre el banco de medición sobrevive a rehacerlo
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.105.0
---

# 357 — `ops bench` rehace el banco y deja en pie la línea de trabajo que se había armado sobre él: una carpeta con el estado de la corrida anterior, sin repositorio, que `check` da por válida

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: es del toolkit y no llega a ninguna empresa —el banco es de este repositorio—, y sólo
toca a quien mide algo de líneas. Vale arreglarlo porque rompe la garantía con la que el banco se presenta:
«se recrea entero en cada corrida». Lo que queda es justo lo que R21 y R22 nombran, estado de una corrida
anterior que se lee igual que uno limpio.

## Resumen

`ops line` arma la línea al lado de la carpeta de la instancia: `<carpeta>-<línea>/`. En el banco `sidecar`
eso es `_medicion/sidecar-<línea>/`, hermana de `_medicion/sidecar/`, que es lo que `bench` borra y rehace.
La línea queda afuera de lo que se borra.

Después de rehacer, esa carpeta sigue ahí con el `planning/` de la corrida anterior. Su `.git` apunta a un
worktree del repositorio que se borró, así que ya no es un repositorio. Y no se puede volver a armar la
línea con ese nombre: `ops line` se niega porque la carpeta existe.

## Reproducción

```bash
B=$(node engine/cli/ops.js bench sidecar --force)
(cd "$B" && node tools/ops.js line . auth)
node engine/cli/ops.js bench sidecar --force
ls .cauce-eval/_medicion/
(cd "$B" && node tools/ops.js line . auth)
cd .cauce-eval/_medicion/sidecar-auth/ops && git status; node tools/ops.js check planning; node tools/ops.js context planning
```

## Síntoma

Corrido el 2026-10-09, sobre el commit `d97a321f`:

```
$ ls .cauce-eval/_medicion/                    # después de rehacer
sidecar  sidecar-auth  suelto  tarea

$ node tools/ops.js line . auth                # sobre el banco nuevo
…/_medicion/sidecar-auth/ops ya existe y no es un worktree de esta instancia.

$ cd …/sidecar-auth/ops && git status
fatal: no es un repositorio git: …/_medicion/sidecar/ops/.git/worktrees/ops

$ node tools/ops.js check planning
✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 0 terminada(s)

$ node tools/ops.js context planning
TASK   tarea-medida [lite]  service: app  hito: medicion
```

`bench` salió con código 0 las dos veces y no nombró la carpeta que dejaba.

## Causa raíz

- `engine/cli/bench.js`, `makeBench` — lo que se borra es `wipe`, la carpeta del banco. La guarda de «trabajo
  sin recoger» mira esa carpeta y los repositorios que cuelgan de ella; una línea vive al lado y no entra ni
  en lo que se borra ni en lo que se mira.
- `engine/cli/lines.js`, `layout` — la línea es `<carpeta>-<línea>`, hermana de la instancia. Es correcto
  para una empresa; en el banco la saca de lo desechable.

## Fix propuesto

Que rehacer el banco alcance a sus líneas: las carpetas `<banco>-<línea>` que sean worktrees de la instancia
del banco entran en la guarda de trabajo sin recoger y, pasada, en lo que se borra. El borrado pasa por la
misma comprobación de destino que el del banco.

## Valor

Bajo, y acotado al toolkit: evita medir sobre restos de la corrida anterior, que es la clase de error que
no avisa. Los casos 347, 352 y 353 se midieron armando líneas sobre este banco.

## Qué podría salir mal

1. **Borrar una carpeta que no es una línea del banco.** El patrón `<banco>-*` puede coincidir con algo que
   alguien dejó ahí. Hay que reconocer la línea por lo que es —un worktree registrado por la instancia del
   banco— antes de borrar, y con el banco ya borrado ese registro no existe: se resuelve antes.
2. **Perder trabajo de una medición en curso.** Es lo que la guarda de trabajo sin recoger ya cuida para el
   banco; tiene que valer igual para la línea.

## Cierre

**Resuelto en 0.106.0** con el fix propuesto.

### El recorrido de lo que este caso enumeró

- **Fix, que rehacer el banco alcance a sus líneas — se hizo.** Entran en la guarda de trabajo sin recoger
  y, pasada, se borran con el mismo decisor de destino que el banco.
- **Qué podría salir mal 1, borrar una carpeta que no es una línea — cubierto.** La línea se reconoce por
  lo que es: el `.git` de su árbol apunta adentro del banco. Una carpeta vecina `sidecar-ajena`, sin eso,
  queda intacta, y está probado. Y se reconoce leyendo ese archivo, no preguntándole a git, así que vale
  también para la huérfana.
- **2, perder trabajo de una medición — cubierto.** Lo que la línea tiene sin commitear frena igual que lo
  del banco, y la negativa nombra la carpeta de la línea.

### Lo que este caso encontró y no preveía

**La línea huérfana no puede decir si tiene trabajo**: git ya no lee su árbol. Se decidió que cuente como
que lo tiene —cerrado por defecto— y que se vaya con `--force`. Es el estado en que quedaban las líneas
antes de este arreglo, así que es lo primero que va a encontrar quien tenga una.

**Y la ruta del banco puede llegar por un enlace.** Git escribe en el `.git` del árbol la ruta real, y la
primera versión la comparaba con la ruta tal como llegaba. La encontró la puerta al commitear: corre sobre
una copia que enlaza `.cauce-eval`, y ahí ninguna línea coincidía. Ahora se compara contra la ruta real.
Reproducido con esa disposición: la versión anterior en rojo, ésta en verde.

### Qué se corrió

- **La reproducción del caso, sobre el banco de verdad**, con el arreglo:

  ```
  $ node engine/cli/ops.js bench sidecar           # con una nota suelta en la línea
  …/_medicion/sidecar-auth tiene trabajo sin recoger. Guardá lo que esa corrida dejó antes de
  rehacerlo, o usá --force si ya lo tenés.          (código 2)
  $ node engine/cli/ops.js bench sidecar --force   # código 0
  $ ls .cauce-eval/_medicion/
  sidecar  suelto  tarea
  $ node tools/ops.js line . auth
  ✓ …/_medicion/sidecar-auth/ops  (line/auth)
  ```

- Rojo previo: la prueba nueva de `test/agents/bench-measurement.test.js`, antes del cambio.
- Cuatro mutaciones, cada una en rojo: sin borrar las líneas, sin que la línea con trabajo frene, sin
  contar la huérfana como trabajo, y reconociendo la línea por el nombre de la carpeta.

No tuvo revisión independiente: es del toolkit, el borrado pasa por el decisor que ya existía y la
mutación que lo afloja —reconocer por nombre— está en rojo.

## Contexto de descubrimiento

Anotado sin caso el 2026-10-09 al medir el 352 y el 353 con líneas sobre el banco `sidecar`, y reproducido
ese mismo día para decidir si ameritaba uno.

## Relacionados

- **352** — de donde sale la forma actual del banco `sidecar`, con la instancia y el producto al lado.
- **274** — las líneas de trabajo y dónde se arman.
