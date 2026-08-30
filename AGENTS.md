# Cauce — reglas de este repositorio

Acá se **fabrica** el toolkit; no se lo consume. Éstas son las reglas de este repositorio; las
transversales viven en `template/planning/rules/`, que `CLAUDE.md` importa.

## Acá no se instala nada

**No correr `automation install` de ningún runner. No correr `ops init`. No crear `planning/` en la
raíz.** Cauce es lo que se fabrica en este repositorio, no algo que este repositorio consuma: el
toolkit no se aplica a sí mismo. `install` y `upgrade` fallan solos; lo que sí depende de vos es no
apuntar `init` acá ni crear `planning/` a mano.

El daño es concreto:

- `install` genera un puntero por cada cargo que escribimos en este mismo repo, y una segunda copia de
  los workflows que puede divergir del original.
- Instala todos los guards: `destructive` bloquea el `git push` de cada release y `planning-drift`
  valida un `planning/` que no existe.
- `init` o un `planning/` en la raíz duplicarían `template/planning`, que ya es el nuestro, y el
  molde dejaría de ser el que se distribuye.

`.claude/settings.json` activa `git-add` y `verify`, los dos que se ganaron el lugar. Que
`automation doctor` reporte faltantes es correcto y no hay que "arreglarlo": mide si la superficie de
consumo de una empresa está completa, una pregunta que acá no aplica.

## `system/` es el producto

`agents/roles/system/`, `template/planning/rules/system/` y los ADR del sistema son lo que se fabrica
acá, y mantenerlos es el trabajo. El motor ya lo sabe —`mode: toolkit` en `ops.config.json`—, así que
`fork` se niega a copiar un cargo del catálogo y `learn` sí puede escribirle a uno del sistema: lo que
decide es si el cargo vive en este repo, no si se llama `system`.

La contracara: **editar `template/` cambia lo que recibe cada empresa en su próximo `upgrade`**. Una
regla nueva en `template/planning/rules/system/` baja a todos los consumidores; no es una decisión de
estilo.

## Dónde vive cada cosa

    engine/           el motor: CLI, guards, parsers, ownership. Es el producto.
    template/         el molde que recibe una instancia. Su `planning/` es además el nuestro.
    automatization/   guards, workflows y adaptadores de runner.
    agents/  flows/   el catálogo, que viaja con el paquete en vez de copiarse.
    test/             pruebas del toolkit.

Este repo no tiene `planning/` propio: `ops.config.json` declara `mode: toolkit` y `make check` valida
`template/planning`.

### El banco de evaluación

Un cargo cuya entrega es una épica o una entrada de INBOX necesita un `planning/` donde escribir sea
legítimo, y acá no hay: el único que vive en este repo es `template/planning`, el molde. Por eso se
evalúa en un banco desechable.

```bash
node engine/cli/ops.js evaluate product-manager --bench 03-epic
```

Devuelve la ruta de una instancia desechable —`check` pasa, el catálogo resuelve desde adentro,
`planning/` está vacío y escribible— que `/agent-eval` usa como lugar de trabajo. Se recrea entera en
cada corrida: reutilizarla dejaría que lo que un cargo escribió el lunes sea contexto del que responde
el martes.

**Una por caso.** Con un banco compartido los casos de un cargo trabajan a la vez sobre el mismo
`planning/` y se leen entre sí: uno tomó por «una sesión anterior de este mismo cargo» lo que otro
acababa de escribir, y otro evaluó cuatro candidatas que en su enunciado no existían. Ninguno cambió de
veredicto, pero sus respuestas dejaron de ser las que el caso pedía medir.

El veredicto se escribe **junto al cargo**, no en el banco. El banco se borra; el contrato queda.

### Escribir un caso que tiente

Un caso mide una conducta prohibida de dos formas, y no son intercambiables.

**Explícita**: alguien pide que se firme lo que la conducta prohíbe. Mide la negativa bajo presión, y el
cargo la ve venir — las cinco que se escribieron para tentar la afirmación de mecanismo pasaron las
cinco, porque el pedido decía «no hace falta comprobarlo», que es un cartel.

**Incidental**: nadie lo pide. El cargo necesita un hecho sobre una herramienta, un formato o una norma
para poder seguir, y suponerlo le ahorra trabajo. Ahí es donde la conducta falla de verdad: los cuatro
cargos que hoy afirmaron mecanismo sin comprobarlo lo hicieron solos, dentro de casos sobre otra cosa,
para justificar dónde escribían su propia entrega. La forma explícita mide el reflejo; la incidental
mide el hábito.

La incidental se construye así, y el orden importa:

1. El pedido es trabajo corriente del cargo. La conducta no se nombra, ni de lejos.
2. Terminarlo exige saber cómo se comporta algo comprobable — un default, un límite, un plazo.
3. Ese hecho es barato de comprobar: una invocación inocua, una página pública.
4. **Suponerlo tiene que convenir**: ahorra un paso, evita una conversación incómoda, cierra antes.
   Sin esa conveniencia el caso no tienta, sólo pregunta.
5. El hecho termina en un artefacto que se lee solo, que es donde R14 dice que más se pierde.
6. Los comportamientos esperados nombran el hecho, nunca la conducta: decir «no afirmar sin verificar»
   dentro del caso lo convierte en la forma explícita.
7. **El hecho tiene que ser comprobable desde donde está el cargo.** Si el caso dice «el registro
   público» sin nombrar cuál, no hay nada contra qué comprobar y la respuesta correcta pasa a ser
   abstenerse — que también está bien, pero es otra conducta. El primer caso escrito con esta receta
   cayó justo ahí: el cargo respondió que sin registro declarado cualquier cosa sería hipótesis, y tenía
   razón. Nombrar la herramienta concreta es lo que convierte la abstención en una salida más cara que
   comprobar. Y si el hecho vive en un documento, el documento va como fixture —un directorio con el
   nombre del caso, al lado de su `.md`—: un caso que dice «adjunto el contrato» sin adjuntarlo mide lo
   mismo que no nombrar la herramienta. Pasó también, con un MSA que no estaba.

Y tiene una ventaja que no es de diseño sino de riesgo: en la forma explícita hay que redactar premisas
falsas, y una premisa que resulta verdadera le baja la nota a un cargo por tener razón. En la incidental
no se afirma nada — el hecho lo trae el cargo—, así que no hay nada que se pueda escribir mal.

### Correr un workflow acá

Los workflows de `automatization/workflows/` **no se ejecutan desde el fuente**: traen `{{INCLUDE:...}}`,
que se resuelve al instalar, y acá no se instala. Correr el archivo tal cual falla con `shared is not
defined` antes del primer agente.

Expandir los includes a mano —con `render` de `engine/automation/index.js`— alcanza para mirar el
archivo, y **no alcanza para correrlo** si compone otro workflow. `flow-eval` llama a `workflow('flow',
…)`, y lo que falta no es la primitiva sino el registro: `workflow()` existe siempre, y resuelve el
nombre contra los workflows de la sesión.

Ese registro **se arma al abrir la sesión**, y sale de `.claude/workflows/`. Es todo lo que hacía falta:
no `install`, que además escribiría punteros por cargo y guards que contradicen el trabajo, y que se
niega en un root `mode: toolkit`.

`make eval-workflows` renderiza `flow`, `flow-eval` y `agent-eval` ahí. **Después hay que abrir una
sesión nueva** —si no, el registro es el de antes— y desde ella se invocan `/flow-eval` y `/agent-eval`,
sobre este repositorio y con `mode: toolkit` intacto.

La copia va **gitignoreada y se rehace a pedido**. Committearla es lo que la dejaría divergir del
fuente, que es la razón por la que acá no queremos una segunda copia de los workflows: como salida
generada no tiene cómo pudrirse.

Y lo que se ve cuando algo de esto falta no lo dice: el `.catch` de cada caso convierte el error en
«este caso no se pudo medir», así que la corrida termina en `sin-veredicto` como si el instrumento
hubiera fallado en otro lado. Cuesta dos corridas descubrirlo, y una sonda de cinco líneas que no gasta
ni un agente lo aclara en milisegundos.

**El veredicto se escribe junto al cargo o al recorrido, que es donde ya vive.**

### Los PR que abre el ciclo de aprendizaje

Los abre `github-actions[bot]` con el `GITHUB_TOKEN`, y **su CI no arranca solo**: la corrida existe pero
espera a que una persona la autorice con «Approve and run workflows». Verificado el 2026-08-30 sobre las
tres corridas de la rama del PR #88: las tres tienen `actor=github-actions[bot]` y
`triggering_actor=ingeniomaps` —las creó el bot, las disparó quien las autorizó—. Y los PR de
investigación del 2026-08-29, que ese día se vieron con cero checks, hoy tienen dos.

Eso alcanza: no hace falta guardar un PAT —la credencial que `release.yml` evita a propósito— para
conseguir lo mismo. Lo que **no** conviene es leerlo como que esos PR no corren CI nunca; durante un
tiempo esta sección lo decía, apoyada en que «events triggered by the `GITHUB_TOKEN` will not create a
new workflow run» —docs.github.com, «Trigger a workflow»—, y las corridas de arriba no encajan con esa
lectura. Que la cita sea real y que igual haya corridas creadas sobre esos PR es una tensión sin
resolver acá: lo verificado es el comportamiento observado, no la explicación.

**Conviene aprobarlo en los PR de propuesta y es opcional en los de investigación.** El guard que valida
las rutas que citan los documentos de un cargo exime `learning/reports/` —un informe es evidencia y
puede citar lo que investigó— y **no** exime `learning/proposals/`, porque una propuesta es un documento
que alguien sigue. O sea que sobre una propuesta CI sí tiene algo que decir, y sobre un informe casi no.

#### Un PR con una propuesta pendiente lo abre el bot

**No se abre con `gh pr create`.** Se empuja la rama y se lanza el workflow, que lo abre como
`github-actions[bot]`:

    gh workflow run open-pr.yml -f branch=<rama>

Abrirlo desde la cuenta que después tiene que firmarlo deja la propuesta sin poder firmarse: GitHub no
deja aprobar el PR propio, así que no aparece el botón «Approve», no hay evento `pull_request_review` y
la firma no se dispara. No falla ni avisa nada en el momento — se descubre buscando un botón que no
está. Pasó el 2026-08-30 con el PR #90, que hubo que cerrar y reabrir desde el workflow.

El encabezado de `open-pr.yml` explica por qué existe esa asimetría; acá está sólo qué hacer. Y CI avisa
cuando un PR lleva una propuesta pendiente y no lo abrió el bot, pero **no lo impide**: con equipo, un
compañero puede aprobar el PR que abrió otro y la firma sale bien.

#### Qué clic firma una propuesta

**Aprobar la review es lo que firma.** El workflow escucha `pull_request_review` con
`state == 'approved'`, así que lo que dispara la firma es **Files changed → Review changes → Approve**.
El otro botón que dice aprobar —«Approve and run workflows», el banner de arriba— es la compuerta de CI
y no firma nada. Los dos se llaman igual y hacen cosas distintas; confundirlos deja la propuesta sin
firmar y parece que el workflow no anda.

El orden que menos vueltas da:

1. `Open pull request` abre el PR con la propuesta.
2. Autorizar la corrida de CI, si se la quiere ver verde antes de decidir.
3. **Aprobar la review.** Acá se firma: el bot escribe «Estado», «Responsable» y «Fecha».
4. Autorizar la corrida de CI del commit de la firma, que es un push nuevo sobre la rama.
5. Mergear.

El paso 4 sorprende y es correcto: la firma es un commit que nadie revisó, y la puerta tiene algo que
decir sobre él. Y firmar no es aplicar — `agent-promote` sigue siendo un acto aparte; el porqué de esa
separación vive en el encabezado de `sign-proposal.yml`, no acá.

#### Un re-run repite el árbol, no lo recalcula

Cuando uno de esos PR falla y el arreglo se mergea a `main`, **el botón de re-run no sirve**: replaya el
mismo commit, que se calculó antes. Lo que hace falta es actualizar la rama —el botón «Update branch», o
`PUT /repos/{owner}/{repo}/pulls/{n}/update-branch`—, que recalcula el merge y dispara una corrida nueva.

Verificado el 2026-08-30 sobre el PR #65: la corrida `#33286076308` iba por su `run_attempt=3` sobre
`head_sha=92b7412`, creada 01:36; el arreglo entró a `main` 02:04 y el intento de 02:06 falló idéntico.
Actualizar la rama dio la corrida `#33287260130`, intento 1 sobre `708d126`, verde.

Lo caro no es el reintento sino que **se ve igual que un arreglo que no funcionó**: mismo test, mismo
mensaje. Antes de dudar del arreglo se mira `run_attempt` y `head_sha` de la corrida que falló.

#### Las corridas viejas de la rama no se van

La rama de un PR acumula todas sus corridas, y las de árboles que ya no existen se quedan en rojo para
siempre en la lista de Actions. Esa lista no es el estado del PR. Lo que decide es el commit que se va a
mergear: `gh pr view <n> --json mergeStateStatus` —`CLEAN` es la afirmación de que nada bloquea— o
`gh api repos/.../commits/<sha>/check-runs`. El #65 llegó a tener cinco corridas, cuatro rojas, y estaba
listo para mergear.

## Convenciones

- **Cero dependencias**, de runtime y de desarrollo: Node >= 24 y nada más. Por eso no hay linter ni
  formateador —las convenciones se sostienen leyéndolas—, y agregar una dependencia es una decisión,
  no un detalle.
- **120 caracteres por línea y 500 líneas por archivo de código** —`.js` y `.sh`—. El markdown y los
  `.json` de datos quedan fuera: son prosa y fixtures, y envolverlos no los hace más legibles.

  Los dos números son duros acá, y eso no contradice a R7. R7 deja el número al proyecto porque
  depende del lenguaje y de la superficie, y **este** es el proyecto: un repositorio de Node sin
  dependencias, donde 500 líneas ya son varias responsabilidades. La regla que viaja a una empresa
  sigue siendo la de R7; la que se cumple acá es ésta.

  Pasarse se justifica cuando de verdad corresponde, y la justificación se registra en
  `test/repo/repo.test.js` con su razón: hoy la única es el recorrido de `autobuild`, que crece de a
  una fase. Un archivo que crece sin esa razón no pasa la puerta, y una justificación que dejó de
  hacer falta tampoco: se retira cuando el archivo baja del umbral.
- **Código en inglés, prosa en español.** Identificadores y nombres de archivo, en inglés; comentarios y
  documentación, en español; lo que lee una persona —salida del CLI, errores, plantillas—, en español.
  Los mensajes de commit van en inglés, Conventional Commits. Un nombre a medio traducir —`sinFase`,
  `esArchivoCompartido`— cuesta más que cualquiera de los dos idiomas: obliga a adivinar en cuál está
  escrito el siguiente. **Al escribir código nuevo se nombra en inglés desde el principio**, y eso
  incluye mover o partir un archivo: los identificadores viajan tal cual y la deuda termina repartida
  en más archivos que antes. El repositorio todavía tiene nombres en español anteriores a esta regla;
  se traducen cuando se toca el archivo, no en un barrido aparte.

  Traducir uno se revisa **leyendo el diff, no corriendo la puerta**, porque un rename entra en tres
  lugares donde no debe y ninguno rompe una prueba: la prosa española dentro de un template literal,
  el vocabulario que un documento usa —`- Estado: pendiente` lo escribe el molde, lo lee un regex y lo
  firma una persona— y una propiedad que cruza archivos, que se renombra en todos o rompe uno. El
  segundo es el caro: cambiarlo dejó molde y regex consistentes entre sí e incompatibles con todo lo
  escrito antes, y `npm run ci` siguió en verde.
- Las pruebas corren con `node --test`. La puerta real es `npm run ci`: `check`, automatización,
  integraciones y cobertura, y `prepublishOnly` la exige antes de publicar.
- El CLI se invoca con `node engine/cli/ops.js` o `npm run ops -- <comando>`; `make help` lista los
  atajos frecuentes.
- **Publicar necesita `NPM_TOKEN` exportado**: `.npmrc` lo expande desde el entorno, no desde `.env`.
  Ese archivo no viaja con el repositorio —está gitignoreado y el guard de secretos lo bloquea por
  nombre, aunque hoy no tenga ningún valor adentro—, así que un clon nuevo hay que dárselo a mano con su
  única línea: `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`.
  Corré `set -a; . ./.env; set +a` antes de `npm publish`, o `make release-check`, que lo carga, corre
  la puerta entera y se detiene sin publicar. El `npm publish` no se envuelve en un target a propósito:
  el guard de dependencias lo bloquea por su nombre, y un target que lo corriera adentro no matchearía
  ese patrón —pasaría sin que nada lo diga—.
  `git push` no lo necesita —su helper lee `.env` por su cuenta—, y esa asimetría es la que hace
  parecer que ya está cargado. Los nombres de las credenciales están en `.env.example`.
- **Nada de `exports` en `package.json`.** Una instancia resuelve el motor por subpath —
  `require.resolve('@ingeniomaps/cauce/engine/cli/ops.js')` en `template/tools/ops.js`—, y un mapa
  `exports` lo dejaría fuera. Agregarlo parece higiene y rompe toda instancia instalada.
