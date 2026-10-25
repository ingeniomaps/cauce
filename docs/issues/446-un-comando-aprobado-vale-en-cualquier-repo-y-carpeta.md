---
caso: 446
titulo: Un comando aprobado —push, merge sin --repo, deploy, limpieza— vale en cualquier repo y carpeta, porque su ítem no nombra dónde corre
estado: resuelto
resuelto-en: 0.116.0
prioridad: alta
version-detectada: 0.115.1
---

# 446 — Un comando aprobado vale en cualquier repo y carpeta

**🟢 resuelto en 0.116.0** · detectado en 0.115.1 · prioridad **alta** — los actos que R10 deja a una persona (push, merge,
workflow, deploy) y los borrados de `destructive`; no tiene vuelta atrás cuando cruza, y no es propio de sidecar.

## Resumen

Cuando `destructive` frena un comando que tiene salida, lo que se aprueba es un texto: el comando entero
(`git clean -fd`, `terraform apply`, `gh workflow run deploy.yml`, `docker compose down`), `push <remoto> <rama>` o
`gh pr merge <PR>`. Ninguno nombra **dónde** corre, y el efecto de todos depende de eso: el repo que resuelven `git`
y `gh`, la carpeta en la que `terraform` o `compose` leen su configuración. Así, la aprobación que una persona dio
para un repo o una carpeta deja pasar el mismo comando en otro.

Pasa por las dos vías de aprobar: la línea de `.ops-approval`, y lo que el chat concedió en la sesión. En sidecar
cruza de repo; en embebido, de carpeta (`infra/staging` → `infra/prod`).

Es un caso distinto del 445: ahí hay una ruta y alcanza con resolverla. Acá no hay ruta que resolver: hay que
decidir qué clave de lugar lleva cada clase de comando y cómo se escribe sin romper el cotejo del chat.

## Reproducción

Todo con 0.115.1, invocando el guard como lo llama el runner. Una instancia sidecar en `ops/` con dos repos, `api` y
`web` (`node <cauce>/engine/cli/ops.js init ops --mode sidecar --runner claude --no-install`); para `push`, cada repo
en la rama `feat/x` con un remoto `origin` (`https://example.invalid/<repo>.git`, nunca se contacta):

```bash
printf '{"tool_name":"Bash","tool_input":{"command":"%s"},"cwd":"%s"}' "$CMD" "$WS/api" \
  | OPS_ROOT="$WS/ops" CLAUDE_PROJECT_DIR="$WS" node <cauce>/engine/hooks/run.js destructive
```

con `ops/planning/.ops-approval` vacío, después con la línea que el bloqueo pide, y después con esa misma línea
desde `web`.

**Por el chat**, en una sesión: un `UserPromptSubmit` con «limpiá los restos del build en api», `git clean -fd` en
`api` (frena), «dale», el mismo comando en `api` (pasa), «ahora revisá web» y el comando en `web`.

**En embebido**: un repo con `infra/staging` e `infra/prod`, instancia en `ops/` con `--mode embedded`, la línea
`terraform apply` aprobada y el comando corrido con `cwd` en cada carpeta.

## Síntoma

Medido el 2026-10-25 con 0.115.1. «Vacío» es desde `api` sin aprobación; las otras dos columnas, con la línea puesta:

| Comando | Línea aprobada | vacío | `api` | `web` |
|---|---|---|---|---|
| `git clean -fd` | `git clean -fd` | exit 2 | exit 0 | **exit 0** |
| `git push origin feat/x` | `push origin feat/x` | exit 2 | exit 0 | **exit 0** |
| `gh pr merge 12` | `gh pr merge 12` | exit 2 | exit 0 | **exit 0** |
| `gh workflow run deploy.yml` | el comando | exit 2 | exit 0 | **exit 0** |
| `terraform apply` | el comando | exit 2 | exit 0 | **exit 0** |
| `docker compose down` | el comando | exit 2 | exit 0 | **exit 0** |

Con `--repo` el merge sí queda acotado: con `gh pr merge 12 --repo o/api` aprobado, el mismo comando pasa desde
`web` —es el mismo PR, y está bien— y `gh pr merge 12` sin `--repo` desde `web` frena (exit 2).

Por el chat, `git clean -fd`: frena en `api` (exit 2), pasa tras «dale» (exit 0), y **pasa en `web`** con el mensaje
siguiente (exit 0). El push por chat no cruza: frenó en `web` (exit 2), porque `push.js:174` pregunta sin conceder.

En embebido, `terraform apply` aprobado: `infra/staging` exit 0, **`infra/prod` exit 0**.

## Causa raíz

- `engine/hooks/shell.js:176` — `const items = parts || [String(raw).trim()]`: el ítem es el texto del comando, sin
  el `cwd` del input. El comentario de `:169-172` decide comando entero contra fragmento —que el más angosto es el que
  la persona pegaría—; si el lugar cuenta no lo decidió nadie. `:126-127` ya dice, para `checkout -- .`, que «`.` es
  el cwd, y el cwd suele tener más de lo que uno está mirando».
- `engine/hooks/push.js:86` — el ítem es `push <remoto> <rama>`. El nombre del remoto es el mismo en todos los repos
  (`origin`), así que no identifica a cuál se publica.
- `engine/hooks/delivery.js:30-33` dice que el ítem del merge «es el PR y su repositorio», y `mergeItem` (`:38-52`) sólo
  pone el repositorio si el comando trae `--repo`. Sin él, `gh` lo resuelve desde el `cwd` —y en un fork, al
  original, como dice `:64-66` para `pr create`—, y el ítem queda en `gh pr merge 12`.
- `engine/hooks/chat.js:356-365` (`grant`) anota lo concedido por ítem, y `why` (`:340-346`) lo hereda en los mensajes
  siguientes: la misma clave sin lugar, ahora en la sesión.
- `engine/hooks/workers.js:186-187` aprueba igual, por texto. Ahí el lugar no cambia el daño —lo que cuida es el costo
  en la máquina, que es el mismo en cualquier repo—, así que no es parte del defecto.

## Fix propuesto

**Decidido (2026-10-25)**, con las tres preguntas que el caso dejaba abiertas:

1. **La clave de lugar va por clase de comando**, porque cada herramienta resuelve su destino distinto:

   | Clase | De qué depende el efecto | Clave |
   |---|---|---|
   | `git clean`, `checkout -- .`, `restore .`, `reset --hard`, `push` | el repo | raíz real del checkout |
   | `terraform`, `tofu`, `pulumi`, `docker compose`, los `deployCommands` | la carpeta | `cwd` real |
   | `kubectl`, `helm` | el contexto de kubeconfig, no la carpeta | ninguna: acotarlos por carpeta daría una seguridad que no existe |
   | `docker volume/system/network prune` | global | ninguna |

   `git clean` y `checkout -- .` también dependen de la carpeta dentro del repo; se acotan por repo igual, porque el
   texto del comando ya trae el pathspec cuando lo hay, y acotarlos por carpeta haría volver a preguntar lo aprobado
   desde la raíz.
2. **`gh` sin `--repo` no se aprueba por archivo.** El bloqueo pide nombrar el destino con `--repo`, como ya hace la
   regla de `gh pr create` (`delivery.js:64-66`): adivinar qué repo resuelve `gh` —que en un fork elige el original—
   es justo lo que esa regla evita. Con `--repo` el ítem ya nombra su repositorio y queda como está. Vale para los
   verbos de `gh pr`, `gh workflow run`, `gh run rerun` y `gh release`; la vía del chat no cambia.
3. **Las líneas viejas sin lugar dejan de aprobar**, y `check` y el CHANGELOG lo avisan.

Y en todos, **la clave va aparte del texto del ítem**, no pegada a él (ver Tradeoffs, primer punto): en
`.ops-approval` como un sufijo que el cotejo separa antes de comparar, y en el registro del chat como un campo propio.

Camino, una vez decidida la tabla:

1. Pruebas en rojo: la tabla del Síntoma, fila por fila, más la reproducción por chat y la de embebido. La
   aserción de ausencia que pide R29: el ítem sin lugar ya no aprueba en otro checkout, vista en rojo devolviendo el
   cotejo viejo.
2. La clave en un solo lugar (`approval.js`), con la misma función que use el 445 para resolver rutas reales.
3. El bloqueo imprime la línea con su lugar, que es lo que la persona pega.
4. Lo concedido en el chat guarda el lugar y `why` lo compara al heredar.
5. `check` nombra las líneas de comando sin lugar.
6. Prueba real en banco, sidecar con línea de trabajo y embebido, y la mutación de quitar la clave.

Va después del 445 o junto con él: los dos cambian la forma de las líneas del mismo archivo, y el aviso de `check`
de uno tiene que reconocer la forma nueva del otro.

## Tradeoffs

Revisado leyendo `chat.js`, `push.js`, `delivery.js` y `shell.js` el 2026-10-25; lo que dice «medido» se corrió ese
día, el resto es lectura del código.

- **Pegar el lugar al texto del ítem rompe el chat.** `mentions` (`chat.js:108-111`) compara el ítem y su basename
  contra lo que escribió la persona. Con el lugar adentro —`git clean -fd @ /…/api`— el basename sería `api`, y
  cualquier frase que nombre `api` con un verbo que pide algo contaría como pedirlo. Es lectura, sin medir; alcanza
  para decidir que la clave va aparte.
- **`ordersPush` y `ordersMerge` parten el ítem por posición** (`chat.js:152-153`, `:191-192`). Un cuarto token no los
  rompe, pero cualquier forma nueva tiene que pasar sus pruebas.
- **Las líneas de trabajo.** `autobuild` corre los subagentes en el árbol de la línea, y lo que la persona aprobó en la
  carpeta de sesión tiene otra raíz. Si la clave es la raíz real del checkout, una aprobación dada desde la sesión no
  alcanza al árbol de la línea, y la corrida para a pedirla otra vez. Es el mismo riesgo que el 445 señala para
  `governed`, y necesita la misma respuesta: el bloqueo nombra el árbol donde corre, y las instrucciones de
  `autobuild` también.
- **`git` desde una subcarpeta.** Si la clave de `push` fuera el `cwd` y no la raíz, un `git push` desde `src/`
  volvería a preguntar lo ya aprobado desde la raíz. Por eso la tabla separa repo de carpeta.
- **`cd x && comando`.** El guard ve el `cwd` del input, no el del `cd`. Hoy el texto del `cd` ya forma parte del
  ítem, así que queda acotado por accidente; con una clave por `cwd`, el lugar registrado sería el de antes del `cd`.
  No es una regresión —el texto sigue en el ítem—, pero la prueba lo tiene que cubrir.
- **Las líneas que ya existen** dejan de aprobar si no llevan lugar. Leerlas como «cualquier lugar» mantendría el
  agujero para todo lo escrito antes; frenarlas es lo correcto y se avisa en `check` y en el CHANGELOG.
- **El merge por chat no cambia.** Con un mensaje de la persona que no nombra PR ni niega, `ordersMerge` deja pasar
  el merge (`chat.js:207`): lo decide el agente, a propósito (casos 280 y 281). Medido: tras «hola», `gh pr merge 12`
  sale con exit 0. Ahí el lugar no agrega nada que el diseño no haya delegado ya.
- **Lo que no se toca**: `workers`, cuyo daño no depende del lugar; `kubectl`/`helm`, cuyo destino es el contexto y no
  la carpeta —acotarlos por carpeta daría una seguridad que no existe—; y el diálogo nativo de Claude Code, que pregunta
  cada vez.

## ¿Aporta valor?

Sí, y más que el 445 por lo que cuida. Los dos cruzan una aprobación a donde nadie la dio; acá lo que cruza es un
push, un merge, un workflow, un deploy o un borrado, que según R10 y R23 no tienen vuelta atrás. El caso más claro es
el de embebido: `terraform apply` aprobado para staging pasa en prod, sin sidecar ni configuración rara.

Lo que lo modera: hace falta una aprobación que quedó puesta en el archivo —`check` avisa de ellas en cada
corrida— o una concesión del chat en la misma sesión. No se conoce un incidente; salió revisando el 445.

## Contexto de descubrimiento

Revisando el 445 el 2026-10-25: al listar qué ítems del archivo no son rutas, `git clean -fd` resultó cruzar de repo
igual que `package.json`, y medir el resto de los comandos con salida mostró lo mismo en todos los que dependen del
lugar.

## Relacionados

- 445 — la misma pregunta para las rutas de los gates de commit y de los guards de escritura; comparte archivo y aviso
  de `check`.
- 280, 281 — el ítem del merge y por qué el merge por chat lo decide el agente.
- 103 — por qué el push se ordena con remoto y rama tal cual, y no por basename.
- 116 — lo concedido en el chat se hereda, que es por donde entra la segunda vía.

## Cierre

**Resuelto en 0.116.0**, en la misma rama que el 445, con las tres decisiones del 2026-10-25.

El caso, sección por sección:

- **Resumen, por archivo.** Se hizo: el ítem lleva el lugar al final —`git clean -fd @ <raíz del repo>`,
  `terraform apply @ <carpeta>`— y la línea de `.ops-approval` también. Lo arma `whereOf` en `engine/hooks/shell.js` con
  la clase que cada regla declara en su quinto lugar.
- **Resumen, por el chat.** Se hizo con el mismo ítem: lo pendiente y lo concedido guardan el ítem con su lugar, así que
  un «dale» en un repositorio no alcanza al de al lado. No hizo falta un campo nuevo en el registro.
- **Resumen, en embebido.** Se hizo: la clase `dir` usa la carpeta, y `cd x && …` se resuelve a `x`.
- **Fix, decisión 1, la tabla.** Como estaba, con dos precisiones: `cdk` y los `deployCommands` del proyecto van por
  carpeta junto con `terraform`, `tofu` y `pulumi`; y la regla de deploy se partió en dos para que `kubectl` y `helm`
  queden sin lugar.
- **Fix, decisión 2, `gh` sin `--repo`.** Se hizo: el guard ni consulta el archivo para un `gh` que no nombra su
  repositorio, y el bloqueo dice por qué no hay línea y cómo nombrarlo. Cuenta como nombrado `--repo`/`-R`, y una ruta de
  la API con dueño y nombre escritos; `{owner}/{repo}` no, porque lo completa `gh`. El chat no cambió.
- **Fix, decisión 3, las líneas viejas.** Dejan de aprobar, y `check` las nombra. Para reconocerlas usa la misma tabla
  que decide el bloqueo (`unplaced`, que corre `rulesOf`), así que una regla nueva entra sola; un push viejo se reconoce
  por su forma.
- **Fix, pasos 1 a 6.** El 1 es `test/hooks/approval-place.test.js`: cinco de sus seis pruebas en rojo antes del arreglo;
  la sexta, verde antes y después, cuida la regresión del primer tradeoff. El 2 se hizo distinto: el lugar no comparte
  función con el 445, porque ahí es una ruta y acá un sufijo; los dos viven en el mismo archivo. El 3, 4 y 5, hechos; el
  6, abajo.
- **Tradeoffs, pegar el lugar al ítem rompe el chat.** Se hizo distinto de lo que el caso proponía: el lugar **va**
  pegado al ítem —así lo distingue todo lo que guarda y compara ítems sin saber de lugares— y lo que se le saca es la
  lectura: `mentions` compara sólo la parte hablada (`spokenOf`, en `chat.js`). Lo cuida «nombrar el repositorio en el
  chat no ordena el comando», y su mutación —leer el ítem entero— la pone en rojo.
- **Tradeoffs, `ordersPush` y `ordersMerge`.** Sin cambios: el chat de un push sigue con el ítem sin lugar, porque un
  push se pregunta cada vez, y los ítems de `gh` no llevan lugar. Las suites de push y de entrega siguen en verde.
- **Tradeoffs, las líneas de trabajo.** Lo aprobado desde la carpeta de sesión no alcanza al árbol de una línea, y es lo
  correcto: es otro checkout, y el bloqueo nombra el del árbol. `autobuild` no le pide a ningún subagente estos
  comandos —un `grep` de `git clean`, `reset --hard`, `terraform`, `compose down`, `gh pr merge` y `gh workflow run`
  sobre `autobuild.js` no encuentra ninguno—; si uno lo corre por su cuenta en el árbol de una línea, vuelve a
  preguntarse ahí.
- **Tradeoffs, `git` desde una subcarpeta.** Se hizo por repositorio, y la prueba lo cuida: aprobado en la raíz, pasa
  desde `src/`.
- **Tradeoffs, `cd x && comando`.** Medido: `cd infra/prod && terraform apply` desde la raíz pide
  `… @ <raíz>/infra/prod`, porque `whereOf` resuelve el `cd` con `gitDirectory`.
- **Tradeoffs, las líneas que ya existen.** Ver la decisión 3.
- **Tradeoffs, el merge por chat.** Sin cambios, a propósito.
- **Tradeoffs, lo que no se toca.** `workers`, `kubectl`, `helm` y el diálogo nativo quedan como estaban.

**Lo que se corrió para saber que funciona**, el 2026-10-25 y con el motor del fuente, la tabla del Síntoma en un sidecar
con `api` y `web`:

| Comando | Línea que da el bloqueo | sin aprobar (`api`) | `api` | `web` |
|---|---|---|---|---|
| `git clean -fd` | `git clean -fd @ …/api` | exit 2 | exit 0 | exit 2 |
| `git push origin feat/x` | `push origin feat/x @ …/api` | exit 2 | exit 0 | exit 2 |
| `gh pr merge 12` | ninguna; con la vieja puesta | exit 2 | exit 2 | exit 2 |
| `gh workflow run deploy.yml` | ninguna; con la vieja puesta | exit 2 | exit 2 | exit 2 |
| `terraform apply` | `terraform apply @ …/api` | exit 2 | exit 0 | exit 2 |
| `docker compose down` | `docker compose down @ …/api` | exit 2 | exit 0 | exit 2 |

`gh pr merge 12 --repo o/api` da esa misma línea y pasa desde `web` (exit 0), y sin `--repo` desde `web` frena (exit 2).
Por el chat, `git clean -fd`: exit 2 en `api`, exit 0 tras «dale», y en el mensaje siguiente exit 2 en `web` y exit 0 en
`api`. En embebido, `terraform apply` aprobado para `infra/staging`: exit 0 ahí y exit 2 en `infra/prod`. Y `check`, con
`git clean -fd` y `push origin feat/x` en el archivo: «2 línea(s) sin el lugar donde valen, que ya no aprueban nada».

Cinco mutaciones en una copia del árbol, cada una en rojo: el ítem sin lugar (8 pruebas), el chat leyendo el lugar como
palabras (2), `gh` sin `--repo` aprobable por archivo (1), el push sin repositorio (4) y `check` sin reconocer el push
viejo (1). Restaurada, 45 de 45.

**La revisión de código del diff entero** trajo seis hallazgos de este caso, y los seis se corrigieron con su prueba,
vista en rojo devolviendo cada arreglo a su forma anterior:

- **Una línea de push con lugar se leía como una ruta** al escribirla el agente con el chat, y su basename —`login`
  para `feat/login`— la daba por pedida: se perdía lo que cuidaba el caso 103. `isPush` la mira sin el lugar.
- **`--repo` se buscaba en el comando entero**: en `gh pr merge 1 && gh pr merge 2 --repo o/r`, la línea vieja del
  primero aprobaba. Ahora cuenta cada ítem, y en un ítem que es el comando entero, cada llamada a `gh`.
- **Un merge por URL** nombra su repositorio sin la bandera, y no ofrecía línea. Ahora se juzga el ítem, que ya trae
  `--repo` armado desde la URL.
- **`repos/:owner/:repo/…`** contaba como nombrado. Ahora no, igual que `{owner}`. `gh` 2.86 documenta sólo la forma
  con llaves (`gh api --help`); tratar la otra igual es la dirección segura y no depende de si alguna versión la
  completa.
- **Lo concedido en el chat para un `gh` sin `--repo`, y el «dale» a un push, iban sin lugar**, así que valían en otro
  repositorio dentro del mismo turno o de la sesión. Los dos llevan ahora el repositorio desde donde corren; el archivo
  sigue sin consultarse para el `gh` sin nombrar.
- **`check` armaba la tabla de reglas una vez por línea**, con un `git` por vez. Ahora una vez por corrida; y al
  juntarla apareció que, con el config ilegible, armarla lanzaba aunque no hubiera ninguna línea: lo cuidaba «un config
  ilegible calla el aviso», que se puso en rojo y volvió a verde.

**Una segunda pasada**, sobre lo que corrigió la primera, trajo ocho hallazgos más; seis se corrigieron, cada uno con
su prueba vista en rojo devolviéndolo a la forma anterior:

- **Un `--repo` o un `repos/o/r/` dentro de comillas** —el texto de un `--body`— contaba como nombrar el repositorio.
  Ahora lo entrecomillado se blanquea al buscarlo, pero no al buscar la llamada: un `bash -c "gh pr merge 5"` sigue
  siendo un `gh` sin nombrar.
- **Un `&` suelto no separaba llamadas.** Ahora sí.
- **Con dos destinos —`git -C /a … && git -C /b …`— o uno que el shell expande —`cd $REPO`—, el lugar era una
  suposición**: el primero, o la ruta con `$REPO` escrito tal cual, que valía para cualquier valor. `AP.locate` lo
  detecta y ahí no se ofrece línea; el chat queda atado al lugar que se pudo leer.
- **Un `gh` sin `--repo` tomaba el lugar del `git -C` del mismo comando**, aunque corre en la carpeta del shell.
- **`push.js` resolvía el repositorio con el `-C` ya quitado**, porque recibe el comando sin las opciones globales de
  `git`. Esto **es anterior a esta rama**: `git -C /a push` desde otra carpeta juzgaba la rama viva del repositorio de
  la sesión. Ahora sale del comando como llegó, para la rama viva y para el lugar.
- **`./vitest` o `node_modules/.bin/vitest`** se leían como rutas viejas. Ahora `check` le pregunta a `workers` si la
  línea es un comando que ese guard frena (`launches`).

Los otros dos se decidieron sin cambio de diseño: el costo de calcular el lugar se bajó a una vez por clase y por
comando, y perezoso en `push.js`; y el lugar sigue pegado al ítem —la alternativa era un ítem estructurado, que toca
cada consumidor del chat—, con el reconocimiento de un push en un solo lugar (`isPush`, en `chat.js`) en vez de las
dos expresiones que había.

**Y una prueba que faltaba**: la tabla de clases, herramienta por herramienta. Por repositorio, `reset --hard`,
`checkout -- .`, `restore .` y `clean` desde una subcarpeta nombran la raíz; por carpeta, `terraform`, `tofu`,
`pulumi`, `cdk`, Compose y un `deployCommands` declarado nombran la carpeta; `kubectl`, `helm` y `docker system prune`
no llevan lugar. Se vio en rojo quitándole el lugar a `reset --hard` y a los `deployCommands`, y dándoselo a `kubectl`.


`npm run ci` en verde con todo lo anterior: 1609 pruebas.

**Y en el banco instalado del 445:**

- **La misma sesión de Claude Code**, en el último paso de su tarea —`git clean -fd` en `app`—, dio una línea con el
  comando entero que corrió y su lugar, `git clean -fd; echo …; git status … @ …/app`. Pegada, terminó la tarea. Esa
  misma línea, por el shim instalado, deja pasar el comando desde `app` (exit 0) y lo frena desde `web` (exit 2).
- **El diálogo nativo**, con el guard en el modo que lo pide (`default`, `prompt_id`, por el shim): con
  `git clean -fd @ …/app` en el archivo, el comando pasa en `app` sin diálogo y en `web` pide el diálogo (`ask`),
  ofreciendo su propia línea con lugar; un `gh` sin `--repo` pide el diálogo y no ofrece línea. Que Claude Code muestre
  el diálogo ante un `ask` no lo cambia este caso y está medido en `confirm.js`; no se abrió una sesión interactiva.


**Medido después del cierre, el 2026-10-25, con Antigravity (agy 1.4.7)**, en el mismo banco que el 445. agy corre
desde la raíz del banco con `cd app && …`, así que la línea que da el bloqueo es `cd app && git clean -fd @
<banco>/app`. Con esa línea pegada, el `git clean -fd` corrió en `app` («Borrando suelto.tmp») y el de `web` siguió
frenado con su propia línea. El ítem lleva el `cd` porque es el comando tal como llegó: un `git clean -fd` lanzado
desde adentro de `app` no lo aprueba esa línea. Esa forma del ítem es anterior a este caso.
