---
caso: 498
titulo: El agente se escribe en ops.config.json las llaves que apagan los guards que no son el de push
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 498 — El agente se escribe en `ops.config.json` las llaves que apagan los guards que no son el de push

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: es la puerta que el 114 cerró para el push, abierta para
cinco guards más, y el mensaje de dos de ellos nombra la llave exacta.

## Resumen

El 114 dejó a `ops-config` protegiendo dos llaves, `runner.allowPush` y `runner.pushToLiveBranches`, y el 373 sumó las
raíces que ensanchan el límite. Las llaves que se agregaron después con la misma forma («lo decide una persona en
`ops.config.json`») quedaron afuera, porque la protección es una lista (`engine/hooks/ops-config.js:36`) y nada la
compara con las llaves que existen. Es la forma que R27 describe: lo que se agrega nace abierto y no falla nada.

Escribiendo `ops.config.json` entero con la herramienta de archivos, el agente apaga cinco guards sin que nadie lo
confirme:

| Llave | Lo que afloja | Dónde se lee | ¿Lo nombra el bloqueo? |
|---|---|---|---|
| `runner.commitToLiveBranch: true` | `live-commit`: commitear en la rama viva | `live-commit.js:62` | sí, `live-commit.js:72` |
| `runner.allowAiSignature: true` | `ai-signature`: publicar con firma de IA | `ai-signature.js:142` | sí, `ai-signature.js:148-149` |
| `boundedCommands` (agregar) | `test-workers`: correr sin tope de workers | `workers.js:184` | sí, `workers.js:195-196` |
| `deployCommands` (quitar) | `delivery`: un deploy declarado deja de frenarse | `delivery.js:106` | no |
| `guards` (quitar) | los guards propios del proyecto dejan de correr | `project-guards.js:57` | no |
| `comments` (quitar) | `comments` deja de mirar los comentarios del commit | `comments.js:187` | no |

Los mensajes le hablan a la persona («lo decide una persona»), igual que el de push. El 114 ya dejó escrito
(«Tradeoffs», el borde del mensaje que nombra el campo) que eso alcanza **sólo si un guard frena la escritura**, y acá no
hay ninguno que lo haga.

Las otras vías ya están cerradas, y por eso el hueco es angosto: por shell, `ops-config-shell` frena toda escritura al
archivo, y un `Edit` parcial se frena porque no llega un JSON completo (`ops-config.js:69-72`). Lo que pasa es un
`Write` con el archivo entero.

## Reproducción

Desde la raíz de Cauce, sin gastar modelo: el guard se alimenta con el payload que manda el runner.

```bash
B=$(realpath "$(node engine/cli/ops.js bench suelto 2>/dev/null)"); F=$B/ops.config.json
probe() {
  NEW=$(python3 -I -c 'import json,sys;c=json.load(open(sys.argv[1]));exec(sys.argv[2]);print(json.dumps(c,indent=2))' "$F" "$1")
  python3 -I -c 'import json,sys;print(json.dumps({"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"Write",
    "tool_input":{"file_path":sys.argv[1],"content":sys.argv[2]},"cwd":sys.argv[3]}))' "$F" "$NEW" "$B" \
  | node engine/hooks/run.js ops-config >/dev/null 2>"$B/../err.txt"; echo "exit=$? :: $1 :: $(head -c 90 "$B/../err.txt")"
}
probe 'c["runner"]["allowPush"]=True'            # control: el 114
probe 'c["runner"]["commitToLiveBranch"]=True'
probe 'c["runner"]["allowAiSignature"]=True'
probe 'c["boundedCommands"]=["vitest"]'
```

Para las quitas, el banco tiene que traerlas antes: agregar `deployCommands` y `guards` a `$F` y probar
`del c["deployCommands"]` y `del c["guards"]`.

Y la cadena entera con una de ellas: `live-commit` sobre `git commit -m x` en la rama viva del banco, antes y después de
escribir la llave.

## Síntoma

Corrido el 2026-11-07 sobre el banco `suelto` (rama `master`, viva):

```
exit=2 :: c["runner"]["allowPush"]=True :: BLOQUEADO: …/suelto/ops.config.json lleva las dos llaves que deciden qué push
exit=0 :: c["runner"]["commitToLiveBranch"]=True ::
exit=0 :: c["runner"]["allowAiSignature"]=True ::
exit=0 :: c["boundedCommands"]=["vitest"] ::
exit=0 :: quitar deployCommands ::
exit=0 :: quitar guards ::
```

`live-commit`, antes y después de escribir `runner.commitToLiveBranch: true`:

```
exit=2 antes :: BLOQUEADO: 'git commit' cae en master, la rama viva de suelto. No hace falta preguntarle a nadie: …
exit=0 despues ::
```

Las vías cerradas, como control:

```
ops-config-shell, sed -i … ops.config.json  → exit=2 :: BLOQUEADO: el comando escribe en …/ops.config.json, donde viven runner.allowPush…
ops-config, Edit parcial                   → exit=2 :: BLOQUEADO: …/ops.config.json no llega como un JSON completo que se pueda leer…
```

`comments` no se corrió: sale de leer `comments.js:186-188`, donde sin `comments` el guard vuelve sin mirar.

## Causa raíz

`engine/hooks/ops-config.js:36` declara `PROTECTED = ['allowPush', 'pushToLiveBranches']`, y `keysOf`
(`ops-config.js:42-45`) compara sólo esas. El bloqueo sale en `ops-config.js:170` cuando difieren, así que cualquier otra
llave pasa. Cada caso que agregó una llave que afloja un guard (251 `commitToLiveBranch`, 300 `allowAiSignature`, 291
`boundedCommands`, 428 `guards`) lo hizo sin tocar esa lista, y no hay ninguna prueba que se lo hubiera pedido.

## Fix propuesto

Darle a la lista el comparador que pide R27, en vez de agrandarla a mano otra vez:

1. **Clasificar cada llave** que acepta `engine/config/validate.js:58-59` (y las de `runner`) en dos clases: las que
   aflojan un guard, con la dirección que afloja (`true`, agregar o quitar), y las libres. Las que aflojan las
   confirma una persona por la misma salida que ya usan las raíces del 373. Las libres pasan.
2. **Una prueba que recorra lo que valida `validate.js`** y falle mientras una llave no esté clasificada. Así la próxima
   llave nace en rojo y no abierta.
3. Lo que angosta sigue sin preguntarse: poner `commitToLiveBranch: false`, quitar de `boundedCommands`, agregar a
   `deployCommands`.

Mutación a declarar: sacar `commitToLiveBranch` de la clasificación tiene que poner roja la prueba del punto 2, y
devolver la lista a las dos llaves de hoy tiene que poner rojas las de los cinco `probe` de arriba.

## Tradeoffs

- **Más preguntas a la persona.** Hoy el agente puede declarar `boundedCommands` solo cuando `test-workers` lo frena, y
  después de esto lo confirma una persona. El mensaje de `workers.js:195` ya dice que lo hace «una persona», así que
  el cambio alinea el mecanismo con lo que el mensaje promete; igual es una pregunta más.
- **La dirección por llave es una decisión por llave.** ¿Subir `gateTimeoutMinutes` afloja? Al vencer, `verify` marca
  el gate como `cortado` (`verify.js:297-300`) y no lo deja pasar, así que se clasifica libre. Esa lectura sale del
  código y hay que confirmarla al construir.
- **Cambiar quién escribe una llave es una quita (R29).** La CLI no se frena a sí misma: escribe `ops.config.json` con
  `fs` desde node (`engine/cli/instance.js:141` y `:443`, `lines.js:259`, `lines-join.js:190`), no con la herramienta de
  archivos del agente, así que este guard no la ve. Comprobado leyendo el fuente el 2026-11-13. Lo que sí hay que mirar
  al construir es si alguna de esas escrituras toca una llave de las que aflojan: `lines` escribe `lines`, que habría
  que clasificar.

## Contexto de descubrimiento

Revisando el repositorio público `affaan-m/ECC` (antes `everything-claude-code`), un toolkit de hooks para Claude Code.
Sus issues #3844 («los mensajes de rechazo le dicen al agente cómo apagar el guard») y #3845 («el guard exime justo el
archivo donde están sus interruptores») describen este mismo defecto en otro producto. Contrastado contra Cauce, el push
estaba cerrado desde el 114 y las demás llaves no.

## Hallazgo aparte, sin caso todavía

En el mismo banco, ningún guard de `pre-files` frena un `Write` que vacía `.claude/settings.json` o
`.claude/settings.local.json` (`exit=0` con `secrets generated workspace-boundary engine migrations
integration-snapshot test-evidence plan-first ops-config`). En una instancia instalada, ese archivo es el que registra los
guards en Claude. No se midió en un banco instalado ni en los otros tres runners. Si el runner mismo frena esa escritura
es un mecanismo sin comprobar. Tiene peso propio y pide otra decisión (qué archivos de cada runner se protegen), así que,
si se confirma, va como caso aparte.

## Relacionados

- 114 — el mismo defecto para el push. Este caso es lo que su lista dejó afuera.
- 373 — las raíces que ensanchan, con la salida de confirmación que este fix reusa.
- 251, 291, 300, 428 — los casos que agregaron las llaves de la tabla.
