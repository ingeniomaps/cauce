---
caso: 449
titulo: Desde la sesión de una línea, la orden «haz el merge de main en work/<persona>» no destraba el `git merge` en la instancia que el bloqueo dice que se pasa con la confirmación de la persona
estado: resuelto
resuelto-en: 0.116.0
prioridad: media
version-detectada: 0.115.1
---

# 449 — La orden de hacer un `git` en la instancia no destraba el bloqueo de la línea

**🟢 resuelto en 0.116.0** · detectado en 0.115.1 · prioridad **media** — toda sesión de una línea que necesita un `git` que
cambia la rama o el árbol de la instancia sidecar: traer `main` a la rama de trabajo de planning es el caso común.

## Resumen

El bloqueo de `line-scope` sobre un `git merge` en la instancia termina con «Si la persona quiere dejarlo pasar igual,
alcanza con que lo confirme con sus palabras». La persona lo pidió en el chat con todas las letras y siguió frenado.
Hubo dos intentos y ninguno pasó:

1. **La orden no cuenta.** El ítem que frena es la ruta de la instancia, así que sólo una orden que nombre la ruta (o
   `<instancia>`) y use un verbo de `ASKS` lo destraba. «Haz el merge de main en work/<persona>» nombra la rama, y ni
   «haz» ni «merge» ni «mergea» están en `ASKS`. Nombrando la ruta tampoco pasa: «Haz el merge en
   <instancia>» y «Mergea main en <instancia>» siguen frenados, y «Toca <instancia>» pasa.
2. **La confirmación dura un mensaje y se gasta en otro tema.** Lo pendiente se aprueba con el mensaje siguiente,
   sea cual sea. Acá el siguiente fue «Hax rl commit», que hablaba de otra cosa. Ese mensaje aprobó el merge
   (verificado abajo), el agente no lo reintentó porque le pedían el commit, y en el mensaje que sí pedía el merge
   ya no quedaba nada pendiente.

El resultado es que el agente le dice a la persona que lo confirme, ella lo hace con las palabras naturales, y el
bloqueo vuelve igual. Después de dos intentos el agente no prueba un tercero, y lo único que queda es que la persona
corra el comando a mano o pegue la ruta de la instancia entera en `.ops-approval`. Esa línea vale para cualquier
escritura de la línea en la instancia hasta que alguien la borre: es mucho más ancha que el merge que se pidió.

## Reproducción

Con el motor del checkout (`7e54a2ec`), sin sesión real, contra el registro de chat en un temporal propio:

```bash
cd ~/Code/personal/cauce
S=$(mktemp -d) && TMPDIR=$S node -e '
const C = require("./engine/hooks/chat.js"); const it = "<instancia>"
const run = (label, steps) => { const inp = { session_id: label, cwd: "<instancia>l" }
  for (const s of steps) { if (s.say) C.record({ ...inp, prompt: s.say }); if (s.block) C.hold(inp, [it]) }
  console.log(label.padEnd(10), C.unauthorizedNow(inp, [it]).length ? "FRENA" : "pasa") }
run("sesion",  [{ say: "Mergea" }, { block: 1 }, { say: "Hax rl commit" }, { say: "Haz el merge de main en work/<persona>" }])
run("seguido", [{ say: "Mergea" }, { block: 1 }, { say: "Haz el merge de main en work/<persona>" }])
run("otro",    [{ say: "Mergea" }, { block: 1 }, { say: "Hax rl commit" }])
for (const t of ["Haz el merge de main en work/<persona>", "Haz el merge en <instancia>",
  "Mergea main en <instancia>", "Toca <instancia>"]) run(t.slice(0, 40), [{ say: t }])
'; rm -rf "$S"
```

## Síntoma

La sesión real, el 2026-10-25, con `CAUCE_RUNNER='<runner>#line/<línea>'` y la instancia sidecar en
`<instancia>`. El comando `git merge --no-edit origin/main` en la instancia, después de que
la persona escribiera «Haz el merge de main en work/<persona>», se frenó dos veces con:

```
BLOQUEADO: esta sesión lleva la línea <línea>, y escribe sólo en sus árboles (lines/<línea>/…) y en la instancia:
<instancia> es la instancia, una sola para las dos sesiones, y `git merge` le cambia a la
otra su rama, su árbol o su stash. […]
Esto lo corregís vos, con lo que dice arriba: no hace falta preguntarle a nadie. Si la persona quiere dejarlo pasar
igual, alcanza con que lo confirme con sus palabras. Esa confirmación cubre lo que se frenó y nada más —algo nuevo
vuelve a frenar— y vale para este turno: en el mensaje siguiente vuelve a preguntarse. […]
```

La reproducción de arriba devuelve:

```
sesion     FRENA
seguido    pasa
otro       pasa
Haz el merge de main en work/<persona> FRENA
Haz el merge en <instancia> FRENA
Mergea main en <instancia> FRENA
Toca <instancia> pasa
```

`otro` es el defecto 2: «Hax rl commit» aprueba el merge pendiente. `seguido` muestra que la misma frase sí pasa
cuando llega justo después del bloqueo, porque ahí funciona como confirmación y no como orden.

## Causa raíz

- `engine/hooks/line-scope.js:222`: el bloqueo pide `AP.HOW(null, held, input, held, { fixable: true, turn: true })`
  con el ítem igual a la ruta de la instancia. Para el chat, un `git merge` sobre la instancia es «un archivo».
- `engine/hooks/chat.js:122` (`mentions`) y `chat.js:101` (`asks`): para un archivo, la orden pasa sólo si el mensaje
  nombra la ruta o su último tramo, y la frase trae un verbo de `ASKS` (`chat.js:77-88`). En esa lista no están
  `haz`, `hace`, `hacer`, `merge`, `mergea`, `stash`, `switch` ni `checkout`, que son las formas en que se pide un
  `git` sobre un checkout. Además, nadie nombra la carpeta de la instancia para pedir un merge: nombra la rama.
- `engine/hooks/chat.js:241` y `chat.js:268`: cada mensaje humano aprueba todo lo pendiente salvo que niegue, frene o
  pregunte (`refuses`, `chat.js:189`), y después vacía lo pendiente. Un mensaje sobre otra cosa también aprueba.
  Si la aprobación no se usa en ese turno, se pierde.
- `engine/hooks/approval.js:168`: el texto que ve el agente es «alcanza con que lo confirme con sus palabras», sin
  decir que sólo vale en el mensaje inmediato ni qué forma tiene que tener una orden.

El merge de un PR ya pasó por esto y se resolvió de otra manera (`chat.js:191-197`, caso 280): ahí no hay lista de
verbos, el agente juzga la intención y el guard sólo frena la dirección insegura (pregunta, negación, freno).

## Fix propuesto

- Darle a un `git` sobre la instancia un ítem propio, como el de `gh pr merge`, por ejemplo
  `git merge @ <instancia>`. Que se ordene igual que el merge del caso 280: si la persona lo pidió lo juzga el agente,
  y el guard frena sólo si el mensaje pregunta, niega o arranca frenando. El agente sabe que «haz el merge de main en
  work/<persona>» habla del `git merge` que acaba de frenarse; la lista de verbos no puede saberlo.
- Que la confirmación no se gaste en un mensaje sobre otra cosa: que lo pendiente sobreviva hasta el próximo intento
  del mismo ítem, o que un mensaje apruebe lo pendiente sólo si no trae una orden sobre otra cosa.
- Si lo anterior no entra, que el texto del bloqueo de `line-scope` diga lo que realmente pasa: que la confirmación
  vale sólo en el mensaje siguiente, y la frase exacta que la destraba como orden.

## Tradeoffs

- Con un ítem juzgado por el agente, la orden pasa por la lectura de intención del agente y no por una regla
  mecánica. Es la misma concesión que ya se hizo en el 280 por la misma razón.
- Hacer que lo pendiente sobreviva más de un mensaje vuelve a abrir lo que cuidó el 184: que un «seguí con lo tuyo»
  apruebe algo frenado varios mensajes antes. Habría que acotarlo al mismo ítem y al turno siguiente que lo
  reintenta, no dejarlo vivo para siempre.
- Hoy la única salida que siempre funciona es pegar la ruta de la instancia en `.ops-approval`, y es mucho más ancha:
  deja escribir a la línea en toda la instancia. Arreglar la orden es también achicar lo que la persona termina
  aprobando.

## Contexto de descubrimiento

En una empresa, la sesión que construye la línea <línea> tenía stageado un commit en `lines/<línea>/<repo>` que el
guard propio del proyecto frenaba. El arreglo del guard se mergeó a `main` de `<instancia>`, pero los hooks corren la
copia de la instancia, que está en `work/<persona>`. Había que traer `main` a esa rama, y ése es un `git merge` en la
instancia, que es lo que `line-scope` frena. La persona lo pidió dos veces, con un mensaje de otro tema en el medio, y
terminó preguntando quién lo frenaba.

## Relacionados

- 423: introdujo el bloqueo de un `git` que cambia el checkout de la otra sesión. El bloqueo es correcto; lo que falla
  es la forma de destrabarlo.
- 280: el merge de un PR tampoco se nombra como un archivo, y por eso lo juzga el agente.
- 184 y 188: cómo y cuándo un mensaje confirma lo pendiente.
- 424: el texto del bloqueo que corrige el agente.

## Cierre

**Resuelto en 0.116.0**, en la rama de los huecos de esa versión. La decisión, del 2026-10-25, fue la primera del
fix propuesto: que la orden la juzgue el agente.

El fix propuesto, punto por punto:

- **Un ítem propio, juzgado como el merge del 280.** Se hizo. Un `git` que `line-scope` frena en la instancia
  tiene como ítem `git <subcomando> @ <instancia>`, y lo pide `ordersShared` (`engine/hooks/line-scope.js`): pasa
  si el mensaje no pregunta, niega ni frena (`refuses`, que `chat.js` ahora exporta), y no tras un aviso del runner.
  La línea para pegar es ese ítem, mucho más angosta que la instancia entera.
- **Que la confirmación no se gaste en otro mensaje.** Se decidió que no. Con la orden, que era lo que fallaba, la
  persona ya no depende de acertar el mensaje siguiente. Hacer que lo pendiente sobreviva vuelve a abrir lo que
  cuidó el 184, como dice el propio caso.
- **El texto del bloqueo.** Se hizo distinto: para un `git` en la instancia el bloqueo deja de decir «Esto lo
  corregís vos», porque el agente no tiene cómo corregirlo. Lo que la línea escribe afuera de sus árboles lo sigue
  diciendo, porque eso sí lo corrige.

Lo que no preveía: con esta forma, cualquier mensaje de la persona que no pregunte, niegue ni frene cuenta como
orden. Es la concesión del 280, y la prueba lo mide así. Un subagente, que no tiene mensaje propio, sigue frenado.
Un recorrido como `/autobuild` también, porque sus órdenes no cuentan.

La prueba:

- `test/hooks/line-scope.test.js`: un subagente frena con la línea `git merge @ <instancia>` y sin «Esto lo corregís
  vos». «haz el merge de main en work/<persona>» pasa. «¿mergeo main?», «no hagas el merge todavía» y «pará con eso»
  frenan. La línea pegada vale para el merge y no para un `git stash`. Antes del arreglo dio rojo, por el ítem. En
  una copia, tres mutaciones dieron rojo: el ítem como ruta, no frenar la negación, y decir que lo corrige el agente.
- **Prueba real.** Una sesión de `claude -p` con `CAUCE_RUNNER='claude-banco#line/piloto'` y la instancia del banco
  en `work/planning`, con `master` un commit adelante. Al pedido «En la instancia (ops) haz el merge de master en
  work/planning.» el agente corrió `git merge --no-edit master` y pasó (fast-forward a `ea9e0d7`). El mismo comando
  con el mismo mensaje, por el guard solo: con 0.115.1 `exit 2`, con el motor de la rama `exit 0`. «¿hago el
  merge?» da `exit 2` en los dos.
