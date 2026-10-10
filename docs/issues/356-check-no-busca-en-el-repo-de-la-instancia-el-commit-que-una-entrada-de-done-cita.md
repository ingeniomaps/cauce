---
caso: 356
titulo: check no busca en el repo de la instancia el commit que una entrada de DONE cita
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.105.0
---

# 356 — En una instancia sidecar, `check` dice que un commit «no está en su repositorio» cuando el commit vive en el repositorio de la propia instancia

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: es un aviso y no frena nada. Vale arreglarlo porque el aviso afirma algo falso con las
palabras del caso 243 —«si no existe, la traza no prueba nada»— sobre un commit que existe, y no tiene
salida: ni traer una rama ni corregir la entrada lo apaga. Un aviso que no se puede apagar haciendo lo
correcto se deja de leer, y es el mismo aviso que tiene que saltar el día que un hash sea fabricado.

## Resumen

Una tarea con `service: acme-ops` —trabajo de planning, reglas, documentos de la organización— produce
su commit en el repositorio de la instancia. Su entrada de DONE lo cita, y `check` no lo encuentra, porque
busca sólo en las raíces de `workspaceRoots` y la instancia sidecar no es una de ellas.

Sale de dos formas según cómo esté escrita la cita:

- **Sin repositorio nombrado** → `missing`: «el commit X no está en su repositorio».
- **Con `(acme-ops@main)`** → `unchecked`: «no se comprobaron porque su repositorio no está en esta
  máquina (acme-ops)». El repositorio es el directorio desde el que `check` está corriendo.

## Reproducción

Medida en una instancia real (sidecar, 0.105.0), no desde un directorio vacío:

```
acme/                        ← raíz del workspace, no es repo
├── api/                     ← workspaceRoots
├── web/                     ← workspaceRoots
└── acme-ops/                ← la instancia, repo propio, mode: sidecar
    └── planning/done/retirar-guias-viejas.md
          (service: acme-ops)
          commit: c2e3cc2 docs: remove the obsolete guides
```

```bash
cd acme/acme-ops
git cat-file -t c2e3cc2        # → commit
node tools/ops.js check planning
```

La forma mínima que debería reproducirlo, **sin correr**: `ops init --mode sidecar` junto a un repo de
código, un commit cualquiera dentro de la instancia, y una entrada en `planning/done/` que lo cite.

## Síntoma

```
⚠ done/config-del-workspace.md config-del-workspace: el commit f507d16 no está en su repositorio; si es de una rama que no trajiste, traela, y si no existe, la traza no prueba nada
⚠ done/retirar-guias-viejas.md retirar-guias-viejas: el commit c2e3cc2 no está en su repositorio; si es de una rama que no trajiste, traela, y si no existe, la traza no prueba nada
⚠ done/: 2 commit(s) no se comprobaron porque su repositorio no está en esta máquina (acme-ops)
```

Los cuatro commits existen: `git -C acme-ops cat-file -t <sha>` devuelve `commit` para cada uno.

## Causa raíz

Leído en la fuente a `fefe7d78` y en el paquete 0.105.0 instalado:

- `engine/core/repos.js`, `declaredRoots` — devuelve sólo `config.workspaceRoots`. En sidecar la instancia
  vive al lado de esas raíces y no adentro, así que ningún camino de `commitStatus` la alcanza: ni el de
  la cita sin nombre (`reposFor(opsRoot, '.')`), ni el de la cita con nombre, que resuelve el nombre
  contra las raíces.
- `engine/planning/done-commits.js` — el mensaje de `missing` dice «no está en su repositorio» sin haber
  mirado el repositorio donde el `service:` de la entrada dice que está.

Hay un tercer camino al mismo aviso, con otra causa: el repositorio se toma con
`/\(([^@()\s]+)@[^)]*\)\s*$/`, anclado al final. Una cita que sigue después del paréntesis
—`f507d16 … (acme-ops@main) — n/a para el archivo de configuración: vive en la raíz…`— queda sin repositorio y cae
en la búsqueda sin nombre. Es la primera línea del síntoma.

## Fix propuesto

Que el repositorio de la instancia sea un lugar más donde buscar, sin volverlo una raíz de código:

- en `commitStatus`, sumar `git -C <opsRoot> rev-parse --show-toplevel` a los repositorios de la búsqueda
  sin nombre, y resolver a él un nombre que coincida con `path.basename` de ese repositorio;
- dejar `declaredRoots` como está: de él cuelgan `verify`, el scope y el límite de escritura, y la
  instancia no tiene que entrar ahí.

En modo embebido la instancia ya vive dentro de una raíz, así que el cambio sólo se nota en sidecar.

## Tradeoffs

- Una cita sin nombre pasa a buscarse en un repositorio más. Un hash fabricado que por casualidad exista
  en la instancia daría `found`; con siete hexadecimales es improbable y hoy ya pasa entre raíces.
- Si la regex deja de anclarse al final, un `(texto@algo)` dentro del asunto del commit se podría tomar
  por repositorio. Conviene tomar el último paréntesis con `@` antes de un separador, no cualquiera.

## Cierre

**Resuelto en 0.106.0** con el fix propuesto, puesto un nivel más abajo de donde el caso lo ubicaba.

**Valor**: en una instancia sidecar toda tarea de planning o de documentos commitea en el repositorio de la
instancia, así que el aviso falso es el camino principal y no un borde. Sacarlo le devuelve el sentido al
aviso que queda: el de un hash que de verdad no existe. **Riesgo que se tomó**: una cita sin repositorio se
busca en un repositorio más.

### El recorrido de lo que este caso enumeró

- **Reproducción «sin correr» — se corrió.** Instancia sidecar con una raíz por repositorio, un commit en la
  instancia y las dos formas de citarlo: antes daban `missing` y `unchecked`, que es lo que el caso decía.
- **Causa raíz, `declaredRoots` — confirmada**, con un matiz que el caso no traía: con la raíz que `init`
  deja por defecto —`..`, la carpeta que contiene a todos— la cita **con** nombre ya se encontraba, porque el
  nombre se busca como carpeta dentro de la raíz. El defecto entero es de la instancia con una raíz por
  repositorio; con `..`, sólo fallaba la cita sin nombre.
- **Causa raíz, el mensaje de `missing` — no se tocó**: con el repositorio de la instancia en la búsqueda, lo
  que dice vuelve a ser cierto.
- **El tercer camino, la cita que sigue después del paréntesis — se hizo.** El repositorio es el último
  paréntesis con la forma `(<repo>@<rama>)` de cada tramo, no el del final.
- **Fix, el repositorio de la instancia como lugar de búsqueda — se hizo distinto**: no en `commitStatus`
  sino en `commitPlaces`, de donde también lee `ops evidence`. Ver abajo lo que eso encontró.
- **Fix, `declaredRoots` como está — se respetó.** La instancia no entra en la puerta, el scope ni el
  límite de escritura.
- **«En embebido no se nota» — cierto**: ahí el repositorio de la instancia ya es el de una raíz, y la
  búsqueda no repite repositorios.
- **Tradeoff 1, un hash fabricado que exista en la instancia — aplica y se acepta.** Es el mismo riesgo que
  ya había entre raíces, con un repositorio más. Lo acota que el nombre siga mandando: citado con el nombre
  de una raíz, el commit de la instancia sigue saliendo `missing`.
- **Tradeoff 2, un `(texto@algo)` en el asunto — no aplica como estaba escrito**: se toma el último, así que
  `fix(mail): accept (user@host) addresses (api@main)` da `api`. Lo que queda es el caso inverso, un
  paréntesis así en la aclaración que sigue al repositorio, y ése se tomaría por repositorio.

### Lo que este caso encontró y no preveía

- **`ops evidence` también miraba sólo las raíces.** La prueba de una tarea de la instancia —un script con
  su test, commiteado ahí— salía `ausente`. Con el mismo arreglo se busca en el commit que la entrada cita.
- **En una línea de trabajo la carpeta de la instancia se llama distinto**, así que el nombre citado se
  compara también con el del árbol principal. Sin eso el arreglo no alcanzaba a quien trabaja en una línea.
- **Si una raíz se llama igual que la instancia, el nombre es de la raíz**: es lo que el proyecto declaró.

### Qué se corrió

- Rojo previo: las dos pruebas nuevas de `test/planning/done-commits.test.js`, antes del cambio.
- **Sobre la instancia real que lo reportó, en sólo lectura**, con el motor anterior y con éste: los avisos
  de `check` pasan de 15 a 12. Se van los tres del síntoma y no aparece ninguno. En otras dos instancias
  reales, los mismos errores y avisos de antes.
- **`ops evidence` en las tres**, 161 entradas y 152 trazas: un solo veredicto distinto, de `ausente` a
  `encontrado`, y es legítimo — un archivo de pruebas que vive en la instancia, encontrado en el commit que
  su entrada cita.
- Seis mutaciones, cada una en rojo: sin la instancia en la búsqueda sin nombre, sin resolver su nombre, sin
  el nombre del árbol principal, con el repositorio anclado al final, tomando el primer paréntesis en vez
  del último, y dándole a la instancia el nombre que es de una raíz. Esta última sobrevivió la primera vez:
  no había caso con una raíz llamada como la instancia. Se agregó y se puso en rojo.

No tuvo revisión independiente: es un lugar más de búsqueda y una expresión regular, las dos con su
mutación, y la medición sobre las tres instancias cubre lo que una revisión iba a mirar.

### Lo que encontró la segunda revisión del conjunto (2026-10-09)

Dos hallazgos, los dos de este arreglo:

- **Con la raíz en la carpeta que contiene a los repositorios**, una cita sin repositorio pasaba de «sin
  comprobar» a «no está en su repositorio»: antes no había dónde buscarla, y ahora se la buscaba sólo en la
  instancia y, al no estar, se la daba por inexistente. Es ruido sobre commits legítimos del producto. Ahora,
  si las raíces no dan ningún repositorio, no encontrarla en la instancia la deja «sin comprobar».
- **El último paréntesis con arroba se tomaba por repositorio**, también en el medio del asunto:
  `bump (lodash@4.17.21) and fix types` quedaba «sin comprobar», y un hash fabricado ahí dejaba de avisarse.
  Ahora tiene que cerrar la cita: al final, o seguido de un separador.

Rojo previo y mutación en rojo para cada uno. `check` y `evidence` con el motor anterior y con éste sobre
las tres instancias reales: los mismos avisos y los mismos veredictos.

### Lo que encontró la tercera revisión (2026-10-09)

Tres hallazgos sobre las correcciones de la segunda:

- **La forma estricta de leer el repositorio le sacaba el repositorio a citas que antes lo tenían**:
  `(api@main).`, `(api@main) (revertido luego)`, `(api@main) n/a parcial`. Ahora hay dos lecturas. El
  paréntesis que cierra la cita —al final, con o sin punto, o antes de un separador— es el repositorio. El
  que no la cierra vale si es el nombre de un repositorio que está acá; si no, la cita se busca como si no
  nombrara ninguno. Así el `(lodash@4.17.21)` de un asunto no esconde un hash fabricado, y la aclaración que
  sigue a un repositorio de verdad no lo pierde.
- **«Sin repositorios en las raíces» era todo o nada**: con una raíz que es un repositorio y otra que es una
  carpeta de repositorios, lo de la carpeta seguía saliendo «inexistente». Ahora se mira raíz por raíz.
- **Con una carpeta de repositorios, el commit del producto no se buscaba en ningún lado.** Ahora se miran
  los repositorios que cuelgan directo de esa carpeta, y el commit se encuentra. Los de más adentro no se
  miran: por eso no encontrarlo ahí deja la cita «sin comprobar» y no «inexistente». Es lo que queda sin
  cubrir: un hash fabricado, citado sin repositorio en una instancia con una carpeta por raíz, no se avisa.
  Tampoco se avisaba antes de este caso.

Rojo previo y mutación para cada uno; dos mutaciones sobrevivieron la primera vez por falta de caso y se
agregaron. `check` contra `main` y contra el commit anterior sobre las tres instancias reales: en la que
reportó este caso se van los tres avisos del síntoma, y en ninguna aparece uno nuevo.

### Lo que encontró la cuarta revisión (2026-10-09)

Cuatro hallazgos:

- **La segunda lectura del repositorio no llegaba a `check`**: el aviso de commits desconocidos pasaba sólo
  el sha y el repositorio, así que las pruebas —que llamaban a la función de abajo— estaban en verde sobre
  algo que `check` no hacía. Y cuando llegaba, **un paréntesis del asunto que se llamara como un repositorio
  de acá acotaba la búsqueda a ése** y daba un falso «no está». Las dos salen de lo mismo, así que se quitó
  la segunda lectura: el paréntesis que cierra la cita es el repositorio, y el que no, no nombra nada y la
  cita se busca en todos los repositorios del proyecto. La prueba ahora pasa por el camino de `check`.
- **Con una carpeta de repositorios, cada sha ausente costaba un proceso por repositorio.** Una tanda con un
  solo sha que faltara mandaba a preguntar de a uno. Ahora git saltea los que no existen y la tanda se
  contesta con un proceso; está fijado contando los procesos.

## Contexto de descubrimiento

Limpiando el rastro viejo de `planning/done/` el 2026-10-09. De 58 commits «sin comprobar», 55 citaban un
repositorio por un nombre que ya no tiene y se arreglaron renombrando la cita; los que quedaron son éstos,
y no tienen arreglo desde la instancia. Es el camino principal de cualquier sidecar: toda tarea de
planning o de documentación commitea ahí.

## Relacionados

- **243** — de donde viene el aviso: un hash fabricado que el formato dejaba pasar.
- **254** y **263** — las dos formas de nombrar un repositorio dentro de las raíces.
- **273** — «sin comprobar» con el repositorio a la vista, por comparar contra un enlace.
