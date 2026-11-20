---
caso: 521
titulo: en una enumeración separada por comas, el verbo del chat vale sólo para el primer elemento
estado: resuelto
resuelto-en: 0.123.1
prioridad: baja
version-detectada: 0.123.0
---

# 521 — en una enumeración separada por comas, el verbo del chat vale sólo para el primer elemento

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **baja**: la orden de la persona sobre varios ítems autoriza uno y deja
frenados los demás; un «dale» después del bloqueo los aprueba a todos. Bajó de media en la revisión: el disparador real
fueron PR, y ésos los resuelve el 520; lo que queda son archivos enumerados, con salida de un mensaje.

## Resumen

`mentions` busca el verbo en la frase del nombre, y la frase se corta en cada coma (`CLAUSE`). En «borrá a.md, b.md y
c.md» el verbo queda en la frase de `a.md`; `b.md` y `c.md` quedan en frases sin verbo y no se cuentan como pedidos.
Sin coma pasa: «borrá a.md y c.md» pide los dos.

## Reproducción

Desde la raíz de Cauce (revisado el 2026-11-19 sobre `27bbf5e5`):

```bash
node -e '
const fs=require("fs"),vm=require("vm"),path=require("path"),{createRequire}=require("module");
const f=path.resolve("engine/hooks/chat.js");
const src=fs.readFileSync(f,"utf8")+"\n;module.exports.__named=named;";
const m={exports:{}}; vm.runInThisContext(require("module").wrap(src))(m.exports,createRequire(f),m,f,path.dirname(f));
const N=m.exports.__named;
for (const [t,i] of [["borrá a.md, b.md y c.md","/w/a.md"],["borrá a.md, b.md y c.md","/w/b.md"],
  ["borrá a.md, b.md y c.md","/w/c.md"],["borrá a.md y c.md","/w/c.md"],
  ["autorizo cerrar api pr-69, api pr-64","delivery close acme/api pr-64"]]) console.log(N(t,i), t, "→", i)'
```

## Síntoma

```
true borrá a.md, b.md y c.md → /w/a.md
false borrá a.md, b.md y c.md → /w/b.md
false borrá a.md, b.md y c.md → /w/c.md
true borrá a.md y c.md → /w/c.md
false autorizo cerrar api pr-69, api pr-64 → delivery close acme/api pr-64
```

En la sesión real, «autorizo cerrar api pr-69, api pr-64, bff pr-33, bff pr-31 y bff pr-34» cerró el primero y frenó
los otros cuatro con el mensaje de siempre («Pedile la aprobación nombrando el paso»), aunque ya estaban nombrados.

## Causa raíz

Las citas de esta sección son a 0.123.0 (`27bbf5e5`), donde se detectó; los commits del arreglo movieron algunas líneas.

- `engine/hooks/chat.js:65` (contrastado): `CLAUSE = /[,;:!?\n]|\.(?=\s|$)/` trata la coma igual que el fin de una
  oración.
- `engine/hooks/chat.js:133-134`: `clause` es el tramo desde la última `CLAUSE` antes del nombre, y `phrase` le suma el
  tramo siguiente hasta la próxima. El verbo de la cabeza de la lista queda fuera de las dos para todo elemento que no
  sea el primero.

## Fix propuesto

Que la coma corte la frase sólo cuando el tramo siguiente trae su propio verbo o una negación; si no, es un elemento
más de la misma enumeración y hereda el verbo de la cabeza. La negación se sigue leyendo por elemento, así que «borrá
a.md, b.md, no c.md» no pide `c.md`.

```js
// Una coma seguida de un tramo sin verbo ni negación sigue la enumeración: no corta la frase.
function headOf(lower, at) {
  const parts = lower.slice(0, at).split(CLAUSE)
  let clause = parts.pop()
  while (parts.length && !asks(clause) && !NEGATION.test(clause)) clause = `${parts.pop()}, ${clause}`
  return clause
}
```

`mentions` usaría `headOf` para `asked` y `scope`, y seguiría mirando `denied` sólo en el tramo propio del nombre. Así
escrito, `headOf` vuelve a juntar tramos que `split(CLAUSE)` cortó en `;`, `:` o `.`; tiene que unir sólo a través de
comas, o el «sólo cambia la coma» de abajo no es cierto.

## Tradeoffs

- **Amplía lo que una frase autoriza, en la dirección del 109**, y para archivos: lo que `named` destraba son lecturas
  de secretos, escrituras protegidas y líneas de `.ops-approval`. Una lista que mezcla un pedido con una mención
  («borrá a.md, b.md es el de ayer») pasaría a pedir `b.md`. Cortar también en «es», «era» y otros verbos de estado
  achica eso, pero no lo elimina, y sería otra lista de palabras (`AGENTS.md` lo desaconseja).
- La salida de hoy cuesta un mensaje: el bloqueo deja los ítems pendientes y un «dale» los aprueba
  (`chat.js:241-242`). Lo que no hace es decir por qué frenó lo que ya estaba nombrado.
- Alternativa sin ampliar nada: que el bloqueo, cuando el ítem sí aparece en el mensaje pero sin verbo en su frase, lo
  diga («nombraste b.md sin pedirlo en la misma frase; contestá dale») en vez del genérico.

## Contexto de descubrimiento

Una instancia real, 2026-11-17, misma sesión que el 520: después de usar un verbo de la lista, la orden siguió pasando
uno de cinco cierres, y hubo que medir `named` para ver que el verbo no llegaba a los demás elementos.

## Revisión (2026-11-19)

- Citas contrastadas: `chat.js:65` y `chat.js:133-134` coinciden.
- Reproducido desde la raíz de Cauce; la original pedía una instancia instalada. Se agregó el contraste sin coma, que
  pasa, y el elemento del medio, que también frena.
- El ejemplo de PR lo resuelve el fix del 520 sin tocar `mentions`: `ordersMerge` ya junta los números de todas las
  frases. Lo que queda acá son archivos, y por eso bajó a baja.
- El `headOf` propuesto no hacía lo que el tradeoff afirmaba (une a través de cualquier corte); anotado arriba.
- **Pide decisión**: arreglarlo amplía una autorización del lado de los secretos. La recomendación de esta revisión es
  la alternativa del mensaje, o aplazarlo hasta que una orden real sobre varios archivos se frene.
- Saneado: sin el nombre de la instancia ni de su organización.

## Relacionados

- **520** — cerrar PR por chat; su fix cubre la enumeración de PR.
- **109** — por qué hace falta un verbo en la frase.

## Cierre

Decidido por la persona el 2026-11-19, entre las tres salidas de la revisión: mejorar el mensaje y no unir la
enumeración. Lo que una frase autoriza no cambió. Cuando lo que un guard frena aparece en el último mensaje de la persona
fuera de la frase que lo pide, el bloqueo (`HOW`, `engine/hooks/approval.js`) lo dice antes de pedir la confirmación:
«La persona nombró … en su mensaje, pero el guard no leyó un pedido en la frase que lo nombra». Para eso `mentions`
(`engine/hooks/chat.js`) devuelve además si el nombre apareció de una forma que podría pedir (`seen`), y
`namedUnasked` filtra lo que apareció sin pedirse.

Línea de base: el bloqueo de `secrets-read` tras «leé .env, .env.local y .env.prod», por la entrada real, abajo.

Contra el caso:

- **Fix, `headOf` y unir la enumeración:** se decidió que no, por lo que decía el tradeoff: amplía lo que una frase
  autoriza del lado de los secretos (109).
- **Tradeoff, la alternativa del mensaje:** es la que se hizo.
- **Tradeoff, la salida de hoy cuesta un mensaje:** sigue igual; el «dale» aprueba lo frenado, y ahora el agente sabe
  por qué pedirlo.
- **El ejemplo de PR:** lo resolvió el 520, que lee todos los números del mensaje.

Lo que el caso no preveía, y midió la revisión independiente: la primera versión contaba como «nombrado» el último tramo
de un comando, que desde el 523 no pide, así que «¿la api quedó bien?» frente a `gh pr close 69 --repo acme/api` decía
que la persona había nombrado el PR. Ahora sólo cuenta lo que podría pedir. Tampoco llevan el aviso lo que se pidió y
frena por otra razón —una pregunta— ni lo que el mensaje niega. Y desde el code review del conjunto (2026-11-20), un
ítem que el guard sabe que es un comando se lee igual que su orden, sin basename (`HOW` recibe `command` desde
`shell.js`): «mirá el log, release.sh» frente a `./scripts/release.sh` ya no dice que la persona lo nombró. La frase ya no supone que hubo otro pedido en el mensaje
—«el .env.local está mal» también la dispara, y ahí no se pidió nada—, y muestra el ítem sin el lugar pegado.

### Qué se corrió

Por la entrada real (`run.js prompt` y `run.js secrets-read`), en el banco `suelto`, una sesión, tras «leé .env,
.env.local y .env.prod»:

```
antes    .env → pasa
         .env.local → frena: … es una credencial … Decile a la persona qué se frenó y por qué, …
después  .env → pasa
         .env.local → frena: … es una credencial … La persona nombró <banco>/.env.local en su mensaje, pero el guard
                      no leyó un pedido en la frase que lo nombra —en «leé a, b y c» sólo se pide a—; tampoco es un
                      no. Decile a la persona qué se frenó y por qué, …
```

Mutaciones, en una copia, todas rojas en `test/hooks/chat.test.js`: sin el aviso; `seen` contando cualquier aparición;
sin excluir lo pedido; sin sacar lo negado; y `asked` sin `whole`, que además pone roja la del 523 en `delivery`. Dos
condiciones de la primera versión sobrevivían porque sobraban —`!denied`, que `HOW` ya resuelve, y `!fixable`, porque en
un guard que el agente corrige la frase también es cierta— y se quitaron.

**Sin probar:** una sesión real de Claude Code, que vería el aviso en el bloqueo; el texto no depende del modelo.

### Lista de cierre

1. hecho: el bloqueo con el motor de antes, por la entrada real, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: la prueba del 521, roja sin el aviso y verde con él.
4. hecho: cinco mutaciones en una copia, todas rojas; dos condiciones que sobrevivían sobraban, y se quitaron.
5. no aplica: no quita ni reemplaza nada; suma una frase al bloqueo.
6. hecho: por la entrada real de los hooks, sin el arnés de las pruebas.
7. no aplica: no depende de un modelo ni de un runner.
8. hecho: corrieron las pruebas de `test/hooks` y la entrada real antes y después. La entrada real se repitió el 2026-11-20 con el último
   commit de la tanda y dio lo mismo. No corrió una sesión de Claude Code.
9. no aplica: no coordina nada.
10. hecho: `HOW` lo usan todos los guards con salida; la frase sale sólo en la rama del chat, sin subagente y no
    `fixable`, y `mentions` suma un campo que nadie más lee.
11. hecho: dos pasadas independientes sobre el caso, y tres más sobre los arreglos del code review del
    conjunto (2026-11-20), hasta una sin nada que impida entregar. La primera encontró que el aviso salía falso para PR y comandos, y el código se
    reescribió; la segunda, nada que impida entregar, y su nota —una aserción de ausencia que no miraba la frase— se
    corrigió y se vio roja sola con la mutación de lo negado.
12. hecho: uno por uno sobre el diff final; los de `chat.js` y `approval.js` dicen lo que hace el código.
13. hecho: `npm run ci` con el cambio y este caso stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.

