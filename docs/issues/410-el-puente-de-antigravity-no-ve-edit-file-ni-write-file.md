---
caso: 410
titulo: el puente de Antigravity escucha nombres de herramienta que agy 1.4 ya no usa, y ningún guard de archivos corre cuando agy edita o crea un archivo
estado: resuelto
resuelto-en: 0.112.0
prioridad: alta
version-detectada: 0.111.0
---

# 410 — `agy` 1.4 escribe con `edit_file` y `write_file`, y el puente sólo escucha `write_to_file|replace_file_content|multi_replace_file_content`: `secrets`, `plan-first`, `engine` y el resto de `pre-files` no se llaman nunca

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 con agy 1.4.2 · prioridad **alta**. Una sesión de Antigravity escribe cualquier archivo
—un `.env`, el motor, el producto sin plan— sin que Cauce lo vea. Nada avisa: el puente no falla, simplemente no lo llaman.
Los guards del shell sí corren, así que la sesión se ve gobernada.

## Resumen

El plugin que instala `automation install . antigravity` declara en `hooks.json` qué herramientas pasan por `pre-files`. Los
nombres son los de una versión anterior de Antigravity. agy 1.4 expone `write_file` y `edit_file`, con el archivo en `Path`, y
ninguno de los dos coincide con el matcher. Además, `normalize` lee el archivo de `TargetFile` o `AbsolutePath`, y el
contenido de `CodeContent`, `ReplacementContent` o `ReplacementChunks`: aunque el matcher los dejara pasar, llegarían vacíos.
El caso 200 cerró eso por defecto —sin campo, se niega—, pero esa defensa sólo actúa si el puente es llamado.

## Reproducción

Medido el 2026-10-20 en un banco instalado fuera del árbol (`ops bench sidecar` copiado al scratchpad, con
`automation install . claude` y `. antigravity`), con agy 1.4.2:

1. Una sesión `agy -p` abierta en el árbol de una línea, con `--add-dir <workspace>`, en modo por defecto, construyó una tarea.
   Su registro de conversación (`~/.gemini/antigravity-cli/conversations/<id>.db`) trae cinco llamadas `edit_file`
   sobre `lines/web/app/src/components/*.jsx` con `{"Path": …, "Target": …, "Replacement": …}`, y ninguna negativa.
2. El mismo registro trae la definición de las herramientas que agy expone: `write_file` (`"required":["Path","Content"]`) y
   `edit_file` (`Path`). No aparece `write_to_file` ni `replace_file_content`.
3. En esa misma instancia, la misma escritura pasada a mano por el puente en la forma vieja, desde la carpeta de sesión y
   desde el árbol, se niega:

   ```
   {"decision":"deny","reason":"Cauce: <W>/lines/web/app/src/components/Card.jsx cambia el producto sin …
   ```

   O sea que el guard habría frenado, y lo que faltó fue la llamada.
4. Control del mismo puente por el shell, en una sesión agy del mismo árbol: `git add -A` frena con
   «`tool call denied by pre-tool hook: Cauce: 'git add -A/--all/.' está prohibido`». `run_command` sí coincide.

No se pudo comprobar con una sesión real que agy escriba un archivo de credenciales sin freno: la sesión que se le pidió
(`.netrc` con `write_file`) se cortó a los 300 s sin escribir nada. Es la misma vía que el punto 1.

## Causa raíz

- `automatization/runners/antigravity/hooks.json:11`: `"matcher": "write_to_file|replace_file_content|multi_replace_file_content"`.
- `automatization/runners/antigravity/hook.js:133-134` (`normalize`): `args.TargetFile || args.AbsolutePath` y
  `args.CodeContent || args.ReplacementContent`; `:171` y `:176` describen los mismos campos.

## Fix propuesto

- Sumar `write_file` y `edit_file` al matcher, sin sacar los viejos mientras una instalación pueda tener un agy anterior.
- Que `normalize` lea `Path` como archivo y `Content` o `Replacement` como contenido.
- **Y que no vuelva a pasar en silencio** (R27): el matcher es una lista de herramientas, y la próxima que agy agregue nace
  afuera. La salida es la que R27 nombra para cuando cerrar por defecto cuesta demasiado: una comparación. El puente puede
  registrar, en un evento que sí le llega a todo —el `Stop`, o un matcher amplio—, los nombres de herramienta que ve y no
  sabe clasificar, y `automation doctor antigravity` decirlo. Cómo, se decide en el arreglo.

La aceptación pide la mutación: con `edit_file` quitado del matcher, la prueba de instalación que lee `hooks.json` y comprueba
las herramientas de escritura de agy falla; y con `Path` quitado de `normalize`, la prueba que pasa una llamada `edit_file`
por el puente deja de recibir la negativa.

La prueba real del arreglo es la del punto 1, repetida: una sesión `agy` que edita el producto sin plan tiene que verse
frenada en su registro.

## Tradeoffs

- Los nombres de herramienta de agy no son un contrato publicado que conozcamos; cada versión puede cambiarlos. Por eso el
  arreglo necesita la parte de R27, y no sólo los dos nombres nuevos.

## Contexto de descubrimiento

En el experimento del caso 406: el programador de Antigravity construyó la tarea en el árbol de la línea sin que `plan-first`
lo frenara, aunque su plan estaba bajo otro id (caso 411). Buscando por qué no lo frenó, el registro de agy mostró que el
puente nunca fue llamado.

## Relacionados

- 200 — el puente cerrado por defecto cuando una llamada llega sin los campos que juzga.
- 393 — desde dónde carga Cauce una sesión de agy.
- 406 — el experimento donde apareció.

## Cierre

**Resuelto en 0.112.0.** El puente escucha y entiende las herramientas de escritura de agy 1.4, sin dejar de entender las de
antes, y `automation doctor antigravity` avisa cuando agy cambió de versión respecto de la que se midió.

- `automatization/runners/antigravity/hooks.json`: el matcher de `pre-files` es
  `write_file|edit_file|write_to_file|replace_file_content|multi_replace_file_content`.
- `automatization/runners/antigravity/hook.js` (`normalize`): el archivo sale también de `Path`, y el contenido de
  `Content` (`write_file`) o `Replacement` (`edit_file`), que es el texto nuevo. Los textos de `undescribed` nombran los
  campos nuevos.
- `automatization/runners/antigravity/manifest.json` declara `"toolsMeasuredWith": "1.4"`, y `toolsDrift`
  (`engine/automation/runners.js`) compara `agy --version` con eso en `doctor`.

El enunciado, ítem por ítem:

- **Sumar `write_file` y `edit_file` sin sacar los viejos**: hecho.
- **Que `normalize` lea `Path`, `Content` y `Replacement`**: hecho. Los nombres salen del esquema que agy 1.4.2 expone, leído en
  el registro de una sesión: `write_file` con `"required":["Path","Content"]` (más `Overwrite` y `Append`) y `edit_file` con
  `"required":["Path","Target","Replacement"]`. Que el `matcher` es una expresión regular sobre el nombre de la herramienta
  está documentado (antigravity.google/docs/hooks).
- **Que no vuelva a pasar en silencio (R27)**: se hizo distinto de lo que el caso dejaba abierto. Un matcher amplio (`.*_file.*`)
  descartado: haría pasar las lecturas por `pre-files`, que llegan sin contenido, y el puente cerrado por defecto las
  negaría. El registro de herramientas desconocidas también: agy no publica su lista, y el puente no ve las llamadas que su
  matcher no toma. Lo que sí se puede comparar es la versión: `doctor` avisa cuando la de agy no es la medida, con el
  camino para revisarlo. Mientras esta misma sesión trabajaba, agy se actualizó solo de 1.4.2 a 1.4.3, que es justo la forma
  en que esto se rompió.
- **Las dos mutaciones del caso**, y dos más: abajo.
- **La prueba real del punto 1, repetida**: abajo.
- **Tradeoff, los nombres no son un contrato publicado**: por eso el aviso de `doctor` es por versión menor; un parche
  (1.4.3) no avisa, una 1.5 sí.

Lo que el caso no preveía: dos aserciones del caso 200 usaban justo `Path` y `Content` como ejemplos de un campo que el puente
no conoce. Se cambiaron por nombres que no usa nadie (`FilePath`, `Text`), y siguen probando que lo desconocido se niega.

**Lo que se corrió para saber que funciona.**

- `test/wiring/runners.test.js`: «el puente de Antigravity juzga las escrituras de agy 1.4, y sigue juzgando las de antes»
  (el matcher toma los cinco nombres y ninguna lectura; `write_file` de un `.env` y `edit_file` de un `.npmrc` se niegan
  por `secrets`; el contenido juzgado es `Replacement`), y «doctor de Antigravity avisa cuando agy no es la versión en que
  se midieron sus herramientas» (con un `agy` falso en el `PATH`: 1.4.3 calla, 1.5.0 avisa, sin versión avisa). Rojas antes del
  cambio.
- Mutaciones en una copia fuera del árbol, las cuatro en rojo: el matcher sin los nombres nuevos; `normalize` sin `Path`;
  juzgando `Target` en vez de `Replacement`; `doctor` sin comparar la versión.
- **Real, con agy 1.4.3**, en dos bancos instalados fuera del árbol, uno con el puente de la rama y otro con el de `main`
  (armado entero con el motor de `main`), con una tarea en cola y el WIP en IDLE:

  | Pedido a `agy -p`, con su herramienta de archivos | `main` | rama |
  |---|---|---|
  | agregar `// revisado` al principio de `app/src/app.js` | editado | negado: «…app.js cambia el producto sin plan. WIP está en IDLE…» |
  | crear `app/.env` con `TOKEN=prueba` | creado | negado: «…app/.env parece contener secretos…» |

  Y `automation doctor . antigravity` sobre el banco de la rama, con agy 1.4.3 real: «adaptador operativo (0 advertencia(s))».

**Lo que encontró la revisión del conjunto**, antes del PR, y se arregló acá:

- **`toolsDrift` corría `--version` sin plazo**, así que un `agy --version` que esperara algo —una actualización, un login—
  colgaba `doctor` entero. Ahora tiene 5 s, y como el proceso se lanza como líder de su grupo, el corte se lleva también a
  los hijos de un wrapper sin `exec`: sin eso quedaban huérfanos, y la propia prueba lo vio, porque su primera versión dejó
  un `sleep` vivo.
- **La versión se lee también de stderr**, donde la imprimen algunas herramientas. Lo que no se pudo arreglar: si stdout viene
  vacío y stderr sólo trae un aviso con números («1.4.2 → 1.5.0»), sale una versión que no es. Sin conocer el formato de cada
  runner no hay cómo distinguirlos, y queda dicho en el código.

Probado así: la prueba de `doctor` suma la versión por stderr y un wrapper que duerme 60 s: `doctor` vuelve, dice que no pudo
leer la versión y no queda ningún proceso vivo. Mutaciones en rojo: sin plazo («doctor se colgó esperando a agy --version»),
sólo stdout y sin matar el grupo («quedó vivo el hijo del wrapper»). Real, con el agy 1.4.3 instalado: `doctor` responde al
instante y sin aviso de versión.
