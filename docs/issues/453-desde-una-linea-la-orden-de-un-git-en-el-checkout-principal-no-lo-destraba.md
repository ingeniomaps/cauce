---
caso: 453
titulo: Desde la sesión de una línea, un `git` que cambia el checkout principal de un repositorio de la línea se juzga como escribir un archivo afuera, así que la orden de la persona no lo destraba y el bloqueo dice que lo corrige el agente, sin abrir el diálogo
estado: resuelto
resuelto-en: 0.117.0
prioridad: media
version-detectada: 0.116.0
---

# 453 — Desde una línea, la orden de un `git` en el checkout principal no lo destraba

**🟢 resuelto en 0.117.0** · detectado en 0.116.0 · prioridad **media**: toda sesión de línea que necesita poner al día el
checkout principal de un repositorio que trabaja —traer la rama viva después de mergear la entrega es el caso común—.

## Resumen

El caso 449 le dio a un `git` sobre la instancia un ítem propio, `git <subcomando> @ <instancia>`: la orden se juzga por
el subcomando y, en una sesión interactiva, se abre el diálogo de confirmación. El checkout principal de un
repositorio que la línea trabaja quedó afuera, y ahí pasa lo mismo que en el 449 antes del arreglo:

1. **La orden no cuenta.** El ítem es la carpeta del checkout, así que sólo pasa un mensaje que la nombra con un verbo
   de `ASKS`. «Pon al dia el develop del checkout principal» no nombra la carpeta. Pero nombrándola tampoco pasa:
   «Pon al día el develop de platform» y «Haz el merge de develop en platform» siguen frenados, porque ni `pon` ni
   `haz` ni `merge` están en `ASKS`. «Actualiza platform» pasa.
2. **El bloqueo dice que lo corrige el agente, y no abre el diálogo.** `line-scope` marca como `fixable` todo lo que
   no es la instancia. Para un archivo es cierto: se escribe en el árbol de la línea. Para un `git merge` o un
   `git switch` en el checkout principal no hay otra forma: lo que cambia es la rama de la otra sesión, igual que en la
   instancia. Con `fixable`, `approval.js` no abre el diálogo, y el texto que ve el agente empieza por «Esto lo
   corregís vos».
3. **Lo único que ofrece pegar es la carpeta entera.** La línea `<raíz>/platform` en `.ops-approval` deja a la línea
   escribir en todo ese checkout hasta que alguien la borre.

La persona lo pidió con sus palabras, el bloqueo volvió, y sólo pasó cuando contestó «Dale» al mensaje que explicaba el
freno, porque ahí funciona como confirmación de lo pendiente.

## Reproducción

**El guard, en un banco.** Banco sidecar (`node engine/cli/ops.js bench sidecar --force`), con la línea `piloto` sobre
`app` (`node tools/ops.js line <banco>/ops piloto app` desde la instancia). Con el motor de `a6f33dec` (0.116.0), una
sesión que dice `/autobuild piloto`, después la orden, y después el comando, con el modo de la sesión real:

```bash
E=<motor>/engine/hooks/run.js; export OPS_ROOT=<banco>/ops CLAUDE_PROJECT_DIR=<banco>
say() { node -e 'console.log(JSON.stringify({hook_event_name:"UserPromptSubmit",session_id:"s1",cwd:process.argv[1],
  prompt:process.argv[2]}))' "<banco>" "$1" | node $E prompt; }
say "/autobuild piloto"; say "Pon al dia el master del checkout principal"
node -e 'console.log(JSON.stringify({hook_event_name:"PreToolUse",tool_name:"Bash",session_id:"s1",cwd:"<banco>",
  permission_mode:"auto",prompt_id:"p1",tool_input:{command:"git -C <banco>/app merge --ff-only master"}}))' \
  | node $E pre-shell; echo "exit $?"
```

**La orden sola, contra el registro de chat**, en un temporal propio:

```bash
S=$(mktemp -d) && TMPDIR=$S node -e '
const C = require("./engine/hooks/chat.js"); const it = "/srv/banco/platform"
const run = (label, steps) => { const inp = { session_id: label, cwd: "/srv/banco" }
  for (const s of steps) { if (s.say) C.record({ ...inp, prompt: s.say }); if (s.block) C.hold(inp, [it]) }
  console.log(label.padEnd(46), C.unauthorizedNow(inp, [it]).length ? "FRENA" : "pasa") }
for (const t of ["Pon al dia el develop del checkout principal", "Pon al día el develop de platform",
  "Haz el merge de develop en platform", "Actualiza platform"]) run(t, [{ say: t }])
run("bloqueo y después «Dale»", [{ say: "x" }, { block: 1 }, { say: "Dale" }])
'; rm -rf "$S"
```

## Síntoma

**La sesión real**, el 2026-10-25, en una empresa con instancia sidecar, con la sesión llevando la línea `commerce` y su
árbol en `lines/commerce/platform`. Claude Code 2.1.310, `permissionMode: auto`. Mergeada la entrega de la línea en
`develop`, el checkout principal `platform/` quedó 28 commits atrás. Con la orden «Pon al dia el develop del checkout
principal», el comando `git -C <raíz>/platform merge --ff-only origin/develop` se frenó con:

```
BLOQUEADO: esta sesión lleva la línea commerce, y escribe sólo en sus árboles (lines/commerce/…) y en la instancia:
<raíz>/platform va en el árbol de la línea: <raíz>/lines/commerce/platform. Lo de afuera de la línea es de la sesión
principal, que lo tiene abierto en su rama. […]
Esto lo corregís vos, con lo que dice arriba: no hace falta preguntarle a nadie. Si la persona quiere dejarlo pasar
igual, alcanza con que lo confirme con sus palabras. […] Si prefiere aprobarlo a mano, que pegue ella tal cual en
<instancia>/planning/.ops-approval estas líneas:
  <raíz>/platform
```

No se abrió el diálogo, aunque `auto` es un modo donde se abre (`ANSWERED`, `engine/hooks/confirm.js:39`). El agente
reintentó tres veces —con `cd`, sin él y con `-C`— y las tres frenaron igual.

**El guard en el banco** devuelve lo mismo, con `exit 2`: «`<banco>/app` va en el árbol de la línea:
`<banco>/lines/piloto/app`», «Esto lo corregís vos» y la carpeta `<banco>/app` para pegar.

**La orden sola** devuelve:

```
Pon al dia el develop del checkout principal   FRENA
Pon al día el develop de platform              FRENA
Haz el merge de develop en platform            FRENA
Actualiza platform                             pasa
bloqueo y después «Dale»                       pasa
```

«Va en el árbol de la línea» tampoco es una salida: el árbol de la línea está en `line/commerce`, no en `develop`, y lo
que había que actualizar era el checkout de la principal.

## Causa raíz

- `engine/hooks/line-scope.js:138-140`: sólo un subcomando de `SHARED` (`line-scope.js:127-128`) que cae en la
  instancia sale como `shared`. El mismo subcomando sobre el checkout principal de un repositorio de la línea cae en la
  rama de abajo (`line-scope.js:141-145`) y sale como un archivo afuera, con su `twin`.
- `engine/hooks/line-scope.js:233`: lo que no es `shared` se retiene con la ruta como ítem, y se juzga con el criterio
  de un archivo: la orden tiene que nombrar la ruta o su último tramo con un verbo de `ASKS`
  (`engine/hooks/chat.js:77-88`), donde no están `pon`, `haz` ni `merge`. El juicio por subcomando del 449
  (`ordersShared`, `line-scope.js:219-224`) sólo se aplica a lo `shared`.
- `engine/hooks/line-scope.js:245`: `fixable: !shared.length`, así que un bloqueo sin instancia de por medio es
  siempre corregible por el agente. `engine/hooks/approval.js:145` no abre el diálogo para lo `fixable`, y el texto que
  arma empieza por «Esto lo corregís vos».

## ¿Vale la pena?

Sí. Se midió en los registros de sesión de esta máquina todos los bloqueos de `line-scope` con «va en el árbol de la
línea» que vinieron de un `git`, fuera de las pruebas de Cauce: son tres, de la misma sesión real, y los tres son este
caso —el mismo `merge --ff-only` con `cd`, sin él y con `-C`—. No hay ninguno en el que el agente se equivocara de
carpeta y el «va en el árbol de la línea» le sirviera. Y el paso que frena es obligado: cada entrega de una línea
termina en un merge a la rama viva, y la siguiente arranca poniendo al día el checkout principal.

## Fix propuesto

- Tratar como `shared` un subcomando de `SHARED` que cae en el checkout principal de un repositorio que la línea
  trabaja (el `source` de una entrada de `mine`), igual que la instancia: el ítem `git <subcomando> @ <checkout>`, la
  orden juzgada por `ordersShared` y el bloqueo no `fixable`, para que se abra el diálogo.
- Ajustar el texto del bloqueo para ese caso: decir que cambia la rama de la sesión principal, y dejar el árbol de la
  línea como pista para cuando el `git` era para ella.

**Probado en una copia, sin tocar el repositorio.** El cambio son tres líneas en `strayed` y en el texto de `refusal`.
Una prueba nueva en `test/hooks/line-scope.test.js` cubre la orden de la sesión real con el diálogo, el bloqueo de un
subagente (`git merge @ <checkout>`, sin «Esto lo corregís vos», con la pista del árbol), la orden que nombra el merge,
y que crear una rama y escribir un archivo en el checkout principal siguen como hoy.

- Con el motor sin arreglo, la prueba nueva da rojo.
- Mutaciones en rojo: dejar `fixable` lo del checkout, y tratar como `shared` cualquier subcomando (no sólo `SHARED`).
- `test/hooks`, `test/wiring` y `test/workflows`: 840 de 840. La única prueba que cambió fue la del 423 que leía el
  texto viejo («va en el árbol de la línea» para un `git switch` en el checkout principal).
- El guard en el banco, la misma secuencia de la sesión real (`auto`): el motor de `main` sale con `exit 2` y el
  bloqueo de arriba; el de la copia sale con `exit 0` y `permissionDecision: ask`, es decir, el diálogo.

## Tradeoffs

- Es abrir lo mismo que abrió el 449, en otro lugar. La protección del 423 sigue: la orden tiene que nombrar el
  subcomando, y el guard frena el mensaje que pregunta, niega o frena.
- Un archivo escrito en el checkout principal sigue como hoy: `fixable`, con su `twin`. También un `git` que no está
  en `SHARED`, como crear una rama. Lo que cambia es sólo un `git` de `SHARED`.
- La salida de hoy, pegar la ruta del checkout en `.ops-approval`, es mucho más ancha: deja escribir a la línea en todo
  ese checkout hasta que alguien la borre. Esa línea, si ya está pegada, sigue aprobando (medido en la copia: `exit 0`).
- **Una regresión en los runners sin diálogo**, medida con la copia en `bypassPermissions` (que también es lo que ven
  Gemini y Antigravity):

  ```
  orden                                              main     arreglo
  Pon al dia el master del checkout principal        frena    frena
  Actualiza app                                      pasa     frena
  Haz el merge de master en app                      frena    pasa
  Trae master en el checkout principal con un pull   frena    frena   (el comando era un merge)
  No hagas el merge todavía                          frena    frena
  ```

  «Actualiza app» pasaba porque nombra la carpeta con un verbo de `ASKS`, y con el ítem nuevo hace falta nombrar el
  subcomando. Hay que decidir si se acepta, como en la instancia con el 449, o si en el checkout vale cualquiera de los
  dos juicios: el del subcomando o el de la carpeta. La segunda no abre nada que no pase hoy.
- **La frase de la sesión real no pasa por el chat ni con el arreglo**: «pon al día» no nombra el subcomando. Ahí lo
  que cambia es el diálogo: la sesión real estaba en `auto`, que lo abre, así que la persona lo aprueba con un clic. Sin
  diálogo sigue haciendo falta un mensaje más, igual que el «Dale» de hoy.

## Lo que se decidió no tocar

**El checkout de un repositorio que la línea no trabaja** (en el banco, `web`). Un `git switch` ahí también le cambia
la rama a la sesión principal, pero el bloqueo de hoy —«no es de la línea», `fixable`— tiene una salida real que el
agente puede tomar: sumar el repositorio a la línea con `ops line … web`. El caso se queda con los repositorios que la
línea ya trabaja.

## Contexto de descubrimiento

En una empresa, la sesión de la línea `commerce` entregó su release 001 por un PR de `line/commerce` a `develop`, que el
operador mergeó. Para abrir el 002, el checkout principal de `platform` tenía que quedar en el `develop` nuevo. El
operador lo pidió con la frase de arriba, el bloqueo volvió con «Esto lo corregís vos», y pasó con un «Dale» al mensaje
siguiente.

## Relacionados

- 449: el mismo defecto sobre la instancia; su arreglo dejó afuera el checkout principal.
- 423: introdujo el bloqueo de un `git` que cambia el checkout de la otra sesión.
- 285: por qué lo `fixable` no abre el diálogo.
- 280: el juicio por intención del merge de un PR, que el 449 tomó como modelo.

## Cierre

**Resuelto en 0.117.0.** La decisión, del 2026-10-25, fue la primera opción de la regresión: en el checkout principal
vale cualquiera de los dos juicios, el del subcomando o el de la carpeta, así que no deja de pasar nada que pasaba.

- **Tratar como `shared` un `git` de `SHARED` en el checkout principal.** Se hizo, en `strayed`
  (`engine/hooks/line-scope.js`): el ítem es `git <subcomando> @ <checkout>` y el bloqueo deja de ser `fixable`, así
  que abre el diálogo. La orden se juzga con `ordersShared` o, como antes, nombrando la carpeta (`ordersCheckout`, que
  usa `named` de `engine/hooks/chat.js`).
- **El texto del bloqueo.** Se hizo: dice que es el checkout de la sesión principal y que el `git` le cambia la rama, y
  deja el árbol de la línea como pista.
- **La regresión de «Actualiza app».** Se decidió que no hubiera: vale también el juicio por carpeta.
- **La línea ya pegada con la carpeta.** Sigue aprobando, como en el 449.
- **El checkout de un repositorio que la línea no trabaja.** Se decidió no tocarlo, con la razón de arriba.
- **Lo que no preveía.** El comentario de `SHARED` decía «en la instancia», y la constante pasó a valer también para el
  checkout principal; se corrigió.

La prueba:

- `test/hooks/line-scope.test.js`, prueba nueva con la orden de la sesión real: en `auto` pide el diálogo con
  `git merge @ <checkout>`; el bloqueo de un subagente no dice «Esto lo corregís vos» y trae la pista del árbol;
  «haz el merge de master en app» y «actualizá app» pasan; «¿actualizo app?» y «no hagas el merge todavía» frenan; crear
  una rama y escribir un archivo ahí siguen diciendo «Esto lo corregís vos». Con el motor de `main` dio rojo (esta y la
  del 423 que leía el texto viejo). En una copia, cuatro mutaciones dieron rojo: tratar así cualquier subcomando, sacar
  el juicio por carpeta, dejar `fixable` lo del checkout, y aceptar cualquier mensaje que no niegue.
- `npm run ci`: 1622 de 1622.
- **Sesiones reales** de Claude Code 2.1.310 en un banco instalado con el motor de la rama (sidecar, línea `piloto`
  sobre `app`, y en `app` una rama `nuevo` un commit adelante de `master`), con la sesión atada a la línea por un
  `/autobuild piloto` real:
  - `claude -p` en `bypassPermissions`, «Pon al dia el master del checkout principal de app con la rama nuevo»: el
    guard frenó con «`<banco>/app` es el checkout de la sesión principal, y `git merge` le cambia su rama…», sin «Esto
    lo corregís vos», y ofreció pegar `git merge @ <banco>/app`. Con «Dale», el fast-forward entró (`9e85b47` →
    `f8c7402`).
  - Con `master` vuelto atrás, «Actualizá app con la rama nuevo, en el checkout principal» pasó sin frenar, como antes
    del arreglo.
  - Interactiva en `auto`, por tmux, con la misma orden de la sesión real: Claude Code abrió el diálogo «Hook
    PreToolUse:Bash requires confirmation for this command» con el texto nuevo y `git merge @ <banco>/app`. Aprobado, el
    fast-forward entró. Con 0.116.0, la sesión real de la empresa frenó en el mismo paso sin diálogo.
