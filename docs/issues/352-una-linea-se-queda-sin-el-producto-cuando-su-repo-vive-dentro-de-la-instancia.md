---
caso: 352
titulo: Una línea se queda sin el producto cuando su repo vive dentro de la instancia
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.105.0
---

# 352 — Con el repositorio del producto anidado en la instancia, una línea de trabajo nace con la carpeta del servicio vacía y `ops worktree` toma a la instancia por el producto; el banco `sidecar` arma justo esa disposición

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: ninguna de las tres instancias reales que hay en esta máquina anida el producto en la
instancia, y con la disposición que usan —instancia y servicios como carpetas hermanas— nada de esto pasa.
Vale abrirlo por dos razones. El banco de medición con el que se prueban las líneas arma la disposición
rota, así que mide algo que ninguna empresa tiene. Y la configuración la admite sin decir nada: quien la
elija se encuentra con una línea sin código y todos los comandos en verde. Sube a media el día que una
instancia real lo reporte, o si el banco `sidecar` se vuelve a usar para decidir algo sobre líneas.

## Resumen

Son dos defectos con una sola causa: un repositorio de producto que vive **dentro** de la carpeta de la
instancia y que el repositorio de la instancia registra como un enlace de git —modo `160000`, sin
`.gitmodules`—, que es lo que deja un `git add` que lo incluye.

1. **En el motor.** Una línea es un worktree de la instancia, y un worktree no puebla ese enlace: la
   carpeta del servicio existe y está vacía. `ops line` no la enlaza al original porque sólo enlaza lo que
   falta. `ops worktree` pregunta de qué repositorio es esa carpeta, git contesta «de la instancia», y arma
   el árbol de la tarea como un worktree de la instancia, con la carpeta de trabajo vacía. `check` pasa en
   la instancia y en la línea.
2. **En el banco.** `ops bench sidecar` crea el producto dentro del banco y después commitea la instancia
   con todo adentro, así que produce exactamente esa disposición. Su encabezado dice que existe para medir
   «lo que depende de desde qué árbol se pregunte».

## Reproducción

Con una instancia creada por `init`, sin el banco:

```bash
node <cauce>/engine/cli/ops.js init ops --name Acme --mode sidecar --no-install && cd ops
mkdir -p app/src && echo 'module.exports = 1' > app/src/app.js
git -C app init -q -b main && git -C app add src/app.js && git -C app commit -qm producto
# en ops.config.json: "workspaceRoots": [{ "name": "app", "path": "app" }]
# una tarea de la línea x con (service: app) en planning/backlog/uno.md
git init -q -b main && git add <los archivos de la instancia> app && git commit -qm instancia
node tools/ops.js line . x
cd ../../<carpeta>-x/ops   # la línea queda al lado de la carpeta que contiene a la instancia
node tools/ops.js claim planning t-uno && node tools/ops.js worktree planning t-uno --json
```

Con el banco: `node engine/cli/ops.js bench sidecar`, y desde ahí `line . x`.

## Síntoma

Corrido el 2026-10-09 con el motor de la rama y git 2.43.0. Las rutas van relativas a la carpeta de la prueba.

Producto anidado y registrado por el repositorio de la instancia:

```
160000 075eb242a747757ad456c7d51470dbc43eabc5bc 0	app      ← git ls-files -s app
✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 0 terminada(s)
✓ r3-x/ops  (line/x)                                        ← sin «enlazados al original»
  app en la línea: [. .. ]
  repo  = r3-x/ops                                          ← la instancia, no el producto
  work  = r3-x/ops-t-uno/app  []                            ← vacío
  check en la línea: ✓ planning válido
```

El banco `sidecar` da lo mismo: `160000 … app`, `app en la línea: [. .. ]` y `repo` igual a la instancia.

El mismo producto anidado, pero ignorado por el repositorio de la instancia (`/app/` en `.gitignore`):

```
✓ r4-x/ops  (line/x)
  enlazados al original: app
  app en la línea: [. .. .git package.json src ] -> r4/ops/app
  repo  = r4/ops/app
  work  = r4-x/ops/app-t-uno  [.git package.json src]
?? app                                                      ← git status en la línea
?? app-t-uno/
```

Ahí la línea tiene el código y el árbol de la tarea sale bien, pero el enlace y el árbol de la tarea quedan
sin trackear dentro del worktree de la instancia.

Y la disposición que usan las instancias reales —instancia y servicio hermanos, raíz `..`—, recorrida
entera: línea, reclamo, árbol de la tarea, commit, cierre, `check` y retiro del árbol.

```
✓ r2-x/ops  (line/x)
  enlazados al original: ../api
  repo  = r2/api
  work  = r2-x/api-t-uno  [.git package.json src]
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 1 terminada(s)        ← sin ningún aviso
```

**Cómo se ve en una corrida.** Apareció en una corrida real de `/autobuild` sobre el banco `sidecar` con dos
líneas. El recorrido terminó porque el agente de Build, al encontrar la carpeta vacía, armó por su cuenta un
worktree del producto adentro. De ahí salieron tres cosas que se leyeron como tres defectos: `check` avisó
que el repositorio del producto «no está en esta máquina»; el paso de Commit no pudo retirar el árbol de la
tarea —«árboles de trabajo conteniendo submódulos no pueden ser movidos o eliminados»—; y `check` avisó de
dos commits de planning «que ninguna entrada de DONE nombra», porque contaba los de la instancia como si
fueran del producto.

En esa corrida `ops evidence` marcó además las cuatro trazas de prueba como `[ausente]`. Al abrir este caso
se atribuyó a lo mismo, y no lo es: pasa también con la disposición real. Salió como caso propio, el
[353](./353-en-una-linea-ops-evidence-da-por-ausente-la-prueba-que-quedo-en-la-rama-de-la-tarea.md).

## Causa raíz

En el motor:

- `engine/cli/lines.js:38-39` — `linkIfMissing` vuelve sin hacer nada si el destino existe. La carpeta vacía
  que deja el enlace de git existe.
- `engine/cli/lines.js:93-95` — por eso la raíz declarada no entra en `linked`, y la línea se informa como
  bien armada.
- `engine/core/repos.js:54-58` — `reposFor` pregunta `git rev-parse --show-toplevel` desde la carpeta del
  servicio. Vacía y sin `.git`, la respuesta es el repositorio que la contiene: la instancia.
- `engine/cli/worktree.js:49` y `:67-74` — con ese repositorio arma el árbol de la tarea, y `work` apunta a
  la misma carpeta vacía dentro de él.
- `engine/cli/lines.js:90` — `ignoreLink` anota en el `exclude` sólo el enlace de `node_modules`. Con el
  producto anidado e ignorado, el enlace al producto y el árbol de cada tarea quedan sin trackear en la línea.

En el banco:

- `engine/cli/bench.js:249-255` — el producto es un repositorio aparte porque sin eso no se reproducía el
  caso 152, y va dentro del banco a propósito: afuera, `clearBench` no lo alcanzaba y sobrevivía a la
  corrida anterior.
- `engine/cli/bench.js:256-269` — lo crea en `<banco>/app`, con su propio `.git`, y declara la raíz `app`.
- `engine/cli/bench.js:167` — el commit de la instancia es un `git add -A`, que registra ese repositorio
  anidado como enlace.

## Fix propuesto

Es una propuesta, en dos partes que se pueden entregar por separado.

1. **Que el banco arme la disposición real.** El banco `sidecar` pasa a ser una carpeta contenedora con la
   instancia y el producto como hermanos —`<banco>/ops` y `<banco>/app`— y la raíz `..`. Sigue todo dentro
   de lo que `clearBench` alcanza, que es por lo que hoy va adentro, y es la disposición que la última parte
   del síntoma muestra funcionando. El comando sigue imprimiendo la ruta de la instancia.
2. **Que el motor no arme una línea sin producto en silencio.** `ops line` comprueba cada raíz declarada
   que vive dentro de la instancia: si el repositorio de la instancia la registra como enlace de git, se
   niega y dice qué hacer —sacarla del índice e ignorarla, o moverla afuera—. Y cuando la enlaza, anota en
   el `exclude` el enlace y el patrón de los árboles de tarea, igual que ya hace con `node_modules`.

Lo más chico que ya ayuda, sin tocar `ops line`: que `check` avise cuando una raíz declarada está registrada
como enlace de git en el repositorio de la instancia. Convierte el silencio en un aviso en la instancia
principal, antes de que alguien abra una línea.

## Valor

- **Para quien mide**: el banco `sidecar` es el único escenario con instancia y producto separados, y hoy
  cualquier medición de líneas sobre él mide una disposición que no existe afuera. La corrida que originó
  este caso costó un millón de tokens y dejó tres falsas alarmas que hubo que descartar a mano.
- **Para una empresa**: bajo y preventivo. Evita que alguien que anide el producto descubra el problema con
  un agente improvisando worktrees, que es como apareció acá.

## Qué podría salir mal

1. **Cambiar la forma del banco rompe a quien usa su ruta.** `bench sidecar` imprime una ruta que es entrada
   de otra cosa, y hay pruebas y notas que dan por hecho que el producto está en `<ruta>/app`. Con el
   contenedor pasa a estar en `<ruta>/../app`.
2. **El runner se instalaría en otro lugar.** En sidecar el runner se instala en la carpeta que contiene a
   la instancia. Hoy esa carpeta es `_medicion/`, compartida por los tres escenarios; con el contenedor
   pasaría a ser la del propio banco, que es mejor y es un cambio.
3. **Negarse en `ops line` frena a quien hoy tiene esa disposición y le funciona a medias.** No se conoce a
   nadie, y lo que tiene hoy es una línea sin código; pero un comando que pasaba y deja de pasar es una
   quita, y se prueba como tal.
4. **Anotar el patrón de los árboles de tarea en el `exclude` puede ocultar una carpeta que alguien quería
   ver.** El patrón tiene que ser el nombre exacto que arma `ops worktree`, no un comodín ancho.
5. **El aviso de `check` puede saltar sobre un submódulo de verdad**, con su `.gitmodules`. Ése sí se puebla
   con `git submodule update` y no es el defecto: el aviso tiene que distinguirlo.

## Riesgo de regresión

- La parte 1 toca sólo el banco, que no viaja a ninguna empresa. Lo que puede romper es lo que lo usa acá
  adentro: las pruebas de `bench`, el banco de evaluación —que comparte `clearBench`— y cualquier guion que
  arme la ruta del producto a mano.
- La parte 2 toca `ops line`, que usan las instancias con líneas. El camino que hoy funciona —raíces fuera
  de la instancia— no entra en la comprobación nueva, y eso se fija con la corrida de la disposición real
  que está en el síntoma, antes y después.

## Recomendación

Hacer la parte 1 y el aviso de `check`. Son baratos, no cambian nada de lo que hoy funciona en una empresa,
y sacan las dos fuentes de confusión: un banco que mide otra cosa y un silencio.

La negativa y el `exclude` de `ops line` (el resto de la parte 2) esperan a que haya una instancia real con
el producto anidado. Hasta entonces es construir para una disposición que nadie usa, y la que sí se usa ya
anda.

## Tradeoffs

- El producto se puso dentro del banco por una razón medida, y este caso lo mueve: la razón se conserva
  —todo queda bajo la carpeta que se borra—, pero el banco deja de ser la instancia y pasa a contenerla.
- Un aviso en `check` no impide nada. Quien no lo lea abre la línea igual; por eso la negativa queda
  propuesta y no descartada.
- No está medido cuántas instancias anidan el producto. En las tres de esta máquina, ninguna.

## Cierre

**Resuelto en 0.106.0** con lo que se recomendaba: el banco arma repositorios hermanos y `check` avisa del
enlace. La negativa en `ops line` y su `exclude` quedan sin construir, a propósito.

### El recorrido de lo que este caso enumeró

- **Parte 1, que el banco arme la disposición real — se hizo, con un cambio.** El banco `sidecar` es una
  carpeta con la instancia en `ops/` y el producto en `app/`, y lo que se rehace es esa carpeta. La raíz no
  quedó en `..` como decía la propuesta: se declara sobre el producto, `../app`. Con `..`, la carpeta del
  banco —que no es un repositorio y cuelga del toolkit— hacía que una tarea sin servicio resolviera al
  repositorio del toolkit, y `ops worktree` le habría agregado una rama. Lo encontró la revisión.
- **Parte 2, la negativa de `ops line` y el `exclude` — no se hizo, y sigue propuesta.** Espera a una
  instancia real con el producto anidado, que era la recomendación.
- **«Lo más chico», el aviso de `check` — se hizo.** Nombra cada enlace por su ruta y trae el comando.
- **Qué podría salir mal 1, «rompe a quien usa la ruta» — no pasó**: fuera de `bench.js` y su prueba, nadie
  en el repositorio usa la ruta ni supone `<ruta>/app`. `AGENTS.md` dice ahora dónde queda cada cosa.
- **2, «el runner se instalaría en otro lugar» — pasó y es lo buscado**: se instala en la carpeta del banco,
  no en la que comparten los tres escenarios.
- **3 y 4 — no aplican**: son de la parte que no se construyó.
- **5, «el aviso salta sobre un submódulo de verdad» — cubierto y probado**, también con espacios en el
  nombre o en la ruta, que era donde la primera versión fallaba.
- **Riesgo de regresión del banco — comprobado**: `suelto`, `tarea` y el banco de evaluación dan la misma
  salida y el mismo contenido en disco que antes.
- **Riesgo de regresión de `check` — comprobado**: sobre instancias hechas con `init`, embebida y con el
  producto al lado, `check --json` da lo mismo con el motor anterior y con éste.

### Lo que encontró la revisión independiente

Un subagente revisó el diff en una copia, con el banco armado en sus dos formas y diez mutaciones. Un hallazgo
impedía entregar y está corregido con prueba y mutación en rojo:

- **La guarda de «trabajo sin recoger» había dejado de ver casi todo.** Miraba los dos repositorios y
  borraba la carpeta entera: el árbol de una tarea o una nota suelta en ella se iban sin preguntar. Antes
  todo vivía dentro de la instancia y su `git status` lo cubría. Ahora cualquier cosa en la carpeta que no
  sea la instancia ni el producto cuenta como trabajo, y la negativa la nombra.

Y lo demás, corregido:

- Un banco con la forma anterior y la instancia sucia se rehacía sin `--force`: la carpeta entera se mira
  también como repositorio.
- El aviso recomendaba sacar del índice un submódulo legítimo cuando su nombre o su ruta tenían espacios.
- Con la instancia nombrada por un enlace simbólico, el aviso no salía.
- Una raíz que es una carpeta con varios enlaces adentro nombraba mal la ruta o callaba, según el orden;
  y una raíz dentro de un enlace no se avisaba. Ahora se recorren todos los enlaces que tocan a una raíz.
- La condición central —«es un enlace»— no tenía prueba que la sostuviera; ahora la tiene, con una raíz
  que es una carpeta del propio repositorio.

Lo que queda dicho y no se cambió: una línea armada sobre el banco queda al lado de su carpeta, fuera de lo
que se borra, y sobrevive a rehacerlo. Ya pasaba antes de este caso, con otra ruta. Salió después como el
caso 357, que lo resolvió.

### Qué se corrió

- **El banco nuevo con una línea, sin modelo**: `enlazados al original: ../app`, y `ops worktree` devuelve el
  repositorio del producto y un árbol con el código.
- **Corrida real de `/autobuild`** sobre repositorios hermanos, en una línea, con el runner instalado: 10
  minutos y medio, 1,26 millones de tokens, 22 agentes. Leído de su diario y del disco:

  ```
  Worktree  → repo e2e2/app | work e2e2-admin/app-rechazo-por-marca
  Commit    → {"committed":true,"leftovers":[]}
  Closing   → {"ok":true,"errors":[],"warnings":[]}
  ✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 1 terminada(s)
  ```

  Las tres cosas del síntoma ya no están: el árbol de la tarea se retiró, `check` no avisa de ningún
  repositorio faltante ni de commits sin nombrar. La corrida se hizo con la raíz `..`; el cambio a `../app`
  es posterior y se comprobó con la corrida sin modelo de arriba.
- Trece mutaciones, cada una en rojo: seis sobre la primera versión y siete sobre lo que la revisión hizo
  corregir.

### Lo que encontró la revisión del conjunto (2026-10-09)

La revisión del diff entero de la rama, antes del PR. Un hallazgo, y era el de la forma más común: **con la raíz declarada como el repositorio
entero —`.`, o `..` desde una instancia que vive en su carpeta— el aviso no salía nunca.** Esa raíz se
descartaba junto con las de afuera del repositorio, y es la que tiene debajo a todos los enlaces. Ahora
cuenta. Rojo previo con las dos formas: cero avisos antes, uno después, nombrando el enlace.

## Contexto de descubrimiento

Corrida real de `/autobuild` del 2026-10-09, hecha para respaldar los casos de 0.106.0 sobre el banco
`sidecar` con dos líneas armadas con `ops line`. Las tres observaciones se anotaron sin investigar y después
se reprodujeron sin modelo: primero sobre un banco recién creado, después sobre dos instancias hechas con
`init` —una con el producto registrado y otra ignorado—, y por último con la disposición real, que no
muestra ninguna de las tres.

## Relacionados

- [152](./152-los-guards-resuelven-el-runner-por-invocacion-y-plan-first-frena-segun-el-cwd.md) — el caso
  que pidió un banco con el producto en un repositorio aparte.
- [274](./274-en-una-linea-el-recorrido-cambia-de-rama-el-producto-que-comparte.md) — el árbol por tarea
  dentro de una línea; este caso es lo que pasa cuando el servicio no está ahí.
- [275](./275-el-arbol-de-una-linea-nace-sucio.md) — el `exclude` para el enlace de `node_modules`, que este
  caso propone extender.
