---
caso: 101
titulo: Review y los recorridos vuelcan en el INBOX sin tope, sin la forma de una entrada y sin mirar lo que ya está
estado: resuelto
resuelto-en: 0.82.0
prioridad: media
version-detectada: 0.80.0
---

# 101 — El INBOX lo llenan los workflows sin tope

**🟢 resuelto en 0.82.0** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **media** — no rompe nada un día
dado; en un mes de uso real convierte el INBOX en un archivo que nadie lee, y lo que sí importaba queda
enterrado ahí

## Resumen

El modelo de Cauce para el INBOX es sano —una idea se promueve una vez y se borra, y una recurrencia pide
recorrerlo—, pero los workflows lo alimentan solos y sin medida:

1. **Sin tope.** Cada tarea con revisión le pasa a un agente todo lo que Review anotó sin frenar, con el
   texto completo de cada hallazgo, para que lo escriba en «Propuestas». Nada en el código acota cuántos
   hallazgos pasan: el filtro que decide qué entra sólo mira `blocking`. Una corrida con muchas tareas
   escribe decenas de entradas en un día.
2. **Sin la forma que el molde define.** `template/planning/INBOX.md` sí dice qué forma tiene una entrada
   —`- **slug-del-item** — Qué es, y qué se decide o se resuelve con esto.`—, pero el pedido de volcado no
   la nombra y el preámbulo que lo acompaña tampoco la trae. Si el agente la sigue depende de que abra el
   encabezado del archivo.
3. **Sin mirar lo que ya está.** El pedido no incluye el INBOX actual ni sus cabeceras, así que dos
   revisiones que anotan lo mismo escriben dos entradas.

No es sólo Review. Los otros recorridos que escriben en el INBOX tienen el mismo pedido abierto: `flow` en
modo informe registra «cada seguimiento» sin límite, y `flow` en sus salidas `no-hacer` e `investigar`, y
`onboard`, escriben sin mirar si ya estaba.

Que el INBOX, además, no tenga salida —ni archivo, ni aviso, ni la recurrencia activa— es el **106**. Este
caso es lo que entra; aquél, lo que sale.

## Reproducción

Desde un checkout de Cauce, sin agentes: el volcado lo arma el código, y lo que interesa es qué le pasa al
agente.

```bash
OPS=$PWD/engine/cli/ops.js
sed -n 773,776p automatization/workflows/autobuild.js
# El filtro de :773, tal cual está en el fuente, sobre una revisión con 40 hallazgos (4 bloqueantes)
node -e '
const src=require("fs").readFileSync("automatization/workflows/autobuild.js","utf8").split("\n")[772].trim();
const review={concerns:Array.from({length:40},(_,i)=>({blocking:i%10===0,detail:"hallazgo "+i+" — "+"x".repeat(300)}))};
eval(src.replace("const noted","globalThis.noted"));
const prompt="Registrá en la sección Propuestas de planning/INBOX.md lo que la revisión de t dejó anotado sin frenar la entrega, sin promover ninguna: "+JSON.stringify(noted);
console.log("concerns="+review.concerns.length+" no-bloqueantes="+noted.length+" volcados="+noted.length+" prompt="+prompt.length+" caracteres")'
# El preámbulo del volcado lleva los contratos de PROTOCOL.md; ¿nombran la forma de una entrada del INBOX?
grep -n 'const LEDGER' automatization/workflows/autobuild.js
grep -n 'INBOX' template/planning/PROTOCOL.md
# Los demás recorridos que escriben en el INBOX
grep -n 'INBOX}' automatization/workflows/flow.js automatization/workflows/onboard.js
```

## Síntoma

Salida real, 2026-09-11, sobre `main` en 0.81.0:

```
    const noted = review.concerns.filter((one) => !one.blocking).map((one) => one.detail)
    if (noted.length) {
      await write(`Registrá en la sección Propuestas de ${P}/INBOX.md lo que la revisión de ${task.id} dejó ` +
        `anotado sin frenar la entrega, sin promover ninguna: ${JSON.stringify(noted)}`, { label: 'review-noted' })
concerns=40 no-bloqueantes=36 volcados=36 prompt=11541 caracteres
339:const LEDGER = `${SCOPE}\n\nContratos de planning, textuales de ${P}/PROTOCOL.md:\n${contract.contracts}`
71:14. Cierre: check verde, deuda residual al INBOX y checkpoint entre hitos.
110:3. INBOX nunca se ejecuta automáticamente — `business-rules/system/BR-OPS-002`.
113:6. No ampliar alcance; lo adyacente vuelve al INBOX.
```

Treinta y seis hallazgos no bloqueantes de una sola tarea le llegan enteros al agente que los escribe, y
ninguno de los tres renglones de `PROTOCOL.md` que nombran el INBOX dice qué forma tiene una entrada. La
búsqueda en `flow.js` y `onboard.js` devuelve los otros cuatro puntos de escritura, citados abajo.

En la instancia donde se descubrió, después de un mes de uso, el INBOX tenía **3.586 líneas**:

- 79% escrito por las pasadas de Review;
- ~550 líneas de relatos de QA que no están en ningún `done/`;
- 15 grupos de duplicados (el mismo hallazgo, anotado por dos revisiones distintas);
- 249 entradas de una sola semana, la de una corrida con muchas tareas.

Las ~600 líneas de entradas ya resueltas o promovidas que nadie sacó son del 106. Todos estos números son
de la instancia y no se reproducen desde acá: su INBOX no viaja con el caso.

## Causa raíz

- `automatization/workflows/autobuild.js:773` — `review.concerns.filter((one) => !one.blocking)`: el
  filtro que decide qué entra. No tiene tope, y `detail` es texto libre de largo libre (`DECISION`, `:124-134`).
- `automatization/workflows/autobuild.js:775-776` — el pedido de volcado: `JSON.stringify(noted)` entero,
  sin la forma de entrada y sin el INBOX actual.
- `automatization/workflows/autobuild.js:339` — `LEDGER` antepone los contratos de `PROTOCOL.md`, que no
  nombran la forma de una entrada del INBOX: vive sólo en `template/planning/INBOX.md`.
- `automatization/workflows/flow.js:402` — informe: «registrá cada seguimiento en el INBOX», sin límite.
  Devuelve `followUps` como número (`:406`) y `:410` sólo lo imprime; nada lo compara contra nada.
- `automatization/workflows/flow.js:433` (`no-hacer`, Lecciones) y `:445` (`investigar`, Ideas) — una
  entrada por corrida, sin mirar si la misma intención ya dejó una.
- `automatization/workflows/onboard.js:183` — «las preguntas que queden abiertas, en la sección Ideas», sin
  límite ni forma.

### Los relatos de QA no son un tercer defecto

Se consideró abrirlos como caso propio y se decidió que no, por lo que muestra el fuente:

- **La evidencia de QA ya tiene casa, y el motor la manda ahí.** QA devuelve `evidence`
  (`autobuild.js:834-843`), y la fase Done la pasa como `qa=${qa.evidence}` al escribir `done/<slug>.md`
  (`:858-868`). Desde el 019, resuelto en 0.61.0, un campo de `done/` se lee con sus líneas de
  continuación, así que el contrato ya no obliga a recortar un relato. El tradeoff que este caso traía
  —«mover relatos a `done/` choca con el contrato estricto»— dejó de valer.
- **Ningún workflow escribe evidencia de QA en el INBOX.** Los únicos que escriben ahí son los seis puntos
  de arriba, y ninguno recibe el resultado de QA: Review corre antes que QA.
- **Lo que queda es el mismo agujero que este caso.** Un relato puede entrar por `detail`, que es texto
  libre sin forma ni tope, o por una sesión fuera de los workflows. En los dos casos invita el molde:
  «Propuestas — un cambio concreto del producto, **con su evidencia**» (`template/planning/INBOX.md`), y el
  comentario de `autobuild.js:769-772` repite la misma frase. La cura es la misma que la del volcado:
  una entrada es un nombre y una línea, y la evidencia se queda donde el motor ya la escribe.

**No se estableció** cuál de las dos vías llevó los ~550 líneas de la instancia: haría falta su historia
del INBOX. Si resultara que vinieron de sesiones fuera de los workflows, lo que hay que arreglar es el molde
(la frase «con su evidencia»), y ése sí sería caso propio.

## Fix propuesto

Contener al agente, no a la persona: nada de esto limita lo que una persona escribe a mano en el INBOX.

1. **Tope en código, en `autobuild.js:773`.** `noted.slice(0, N)` con N chico (propuesta: 3 por tarea).
   Lo que sobra no se tira en silencio: el conteo va al hecho de revisión que ya viaja a `done/` —
   `reviewFact` (`:768`) gana un «· 33 anotados sin volcar»—, así que queda en la evidencia de la tarea
   sin crecer el INBOX. Un `detail` se recorta a una línea antes de pasar al agente.
2. **La forma y las cabeceras en el pedido de `review-noted`.** El pedido nombra la forma del molde
   —`- **slug** — qué y dónde, en una línea`— y recibe la lista de cabeceras que ya hay en Propuestas
   (una línea por entrada, no el archivo): si el mismo hallazgo ya está, no agrega uno nuevo. Las cabeceras
   ya las sabe leer `parser.js` (`readInbox`, `:407-421`, cuenta por negrita); extraerlas es una variante
   de ese recorrido, no un lector nuevo.
3. **El mismo pedido en los otros recorridos.** `flow.js:402` recibe el tope en el pedido y compara el
   `followUps` que devuelve contra él (hoy sólo lo imprime); `:433`, `:445` y `onboard.js:183` reciben la
   forma y las cabeceras de su sección.
4. **El molde deja de invitar evidencia.** «Propuestas — un cambio concreto del producto, con su
   evidencia y su fix propuesto» pasa a nombrar dónde vive la evidencia (el `done/` de la tarea, o el
   informe), y el comentario de `autobuild.js:769-772` se ajusta igual.
5. **Opcional, sólo como advertencia:** `check` avisa cuando el INBOX pasa un tamaño que la instancia fija.
   Nunca error: el INBOX es de la persona, y un `check` rojo por su tamaño la frenaría a ella por lo que
   escribió el agente.

Del fix que traía este caso quedan afuera, con su razón:

- **El formato `[servicio][slug]`**: reemplaza uno que ya existe —el del molde—, sin decir qué gana, y el
  lector de `readInbox` cuenta la negrita. Cambiarlo pide tocar parser, molde y cada instancia.
- **«Review deduplica»** como único mecanismo: pedírselo al agente no es un tope. Se queda como el punto 2,
  detrás del tope en código.
- `check` que avisa un slug de `done/`, `archive inbox` y la recurrencia activa: son salida, van al 106.

## Tradeoffs

- **Un tope pierde hallazgos del INBOX.** Queda el conteo en `done/`, no el texto. Si el cuarto hallazgo
  era el importante, sólo se ve abriendo la evidencia. Es la apuesta del caso: la revisión que anota
  treinta y seis cosas no está priorizando, y el INBOX tampoco las iba a leer.
- **N es arbitrario.** Conviene que viva en `ops.config.json` con un default, igual que los demás topes
  del runner, y no cableado en el workflow.
- **Pasar cabeceras cuesta contexto** en cada tarea con hallazgos. Con el INBOX de la instancia son cientos
  de líneas; con el tope puesto y el 106 resuelto deberían ser decenas. Sin el 106, este punto crece solo.
- **Deduplicar por cabecera deja pasar el mismo hallazgo con otro nombre.** No hay forma barata de
  evitarlo sin leer el cuerpo; el tope es lo que acota el daño.

## Qué tiene que probar el cierre

- Una revisión con más de N hallazgos no bloqueantes produce un pedido con N, y el hecho de revisión que
  llega a `done/` nombra cuántos quedaron sin volcar: vista en rojo quitando el `slice`.
- El pedido de `review-noted` nombra la forma de entrada del molde y lleva las cabeceras de Propuestas: una
  prueba sobre el texto armado, que se pone roja si alguna de las dos se quita.
- `flow.js:402` compara `followUps` contra el tope; `:433`, `:445` y `onboard.js:183` llevan forma y
  cabeceras — cada uno con su aserción, no una sola para los cuatro.
- El molde de INBOX ya no dice que una propuesta lleva su evidencia adentro, y el comentario de
  `autobuild.js` tampoco.
- Si se hace el aviso de tamaño: `check` sale 0 con el INBOX pasado del umbral y la advertencia a la vista.
- Los relatos de QA: se establece por la historia del INBOX de la instancia de qué vía vinieron, y se dice.
  Si fue fuera de los workflows y el punto 4 no alcanza, sale como caso propio antes de cerrar.

## Contexto de descubrimiento

Instancia real (sidecar, 0.80.0), 2026-09-11. Al revisar el orden del proceso, el INBOX tenía 3.586 líneas,
con un vaciado manual el 2026-08-16. La instancia lo podó de su lado —moviendo líneas a un archivo, sin
reescribir ninguna—, escribió su propia regla de formato y ciclo, activó la recurrencia mensual y agregó a
su validador el aviso de entradas que nombran tareas cerradas.

Al mejorar el caso, el 2026-09-11 sobre 0.81.0, se separó la salida del INBOX al 106, se encontró que
`flow` y `onboard` también vuelcan sin tope, y se corrigió el Resumen: decía que nada define la forma de
una entrada, y el molde la define desde 0.80.0.

## Relacionados

- **106** — la otra mitad: lo que entra por acá no sale por ningún lado. Sin él, el tope sólo baja la
  velocidad a la que el INBOX crece.
- **099** — la misma instancia; lo que el INBOX no muestra por tamaño, las reglas no lo muestran por no
  llegar.
- **019** — resuelto en 0.61.0: los campos de `done/` se leen con sus continuaciones, que es lo que deja
  a la evidencia de QA quedarse en `done/`.

## Cierre

**🟢 resuelto en 0.82.0** · `automatization/shared/inbox.js`, `autobuild.js`, `flow.js`, `onboard.js`,
`engine/planning/parser.js`, `engine/planning/inbox.js`, `engine/cli/planning.js`, `engine/config/validate.js`,
`template/planning/INBOX.md`; cerrado junto con el 106

### Contra lo que el caso enumeró

**Fix propuesto**

1. **Tope en código en `autobuild`** — hecho: `noted.slice(0, INBOX_CAP)`, con `INBOX_CAP = 3` en un
   fragmento compartido, `automatization/shared/inbox.js`, que incluyen los tres recorridos. Lo que sobra se
   cuenta en el hecho de revisión —«· N anotado(s) sin volcar al INBOX»—, que la fase Done escribe en
   `done/`. Cada `detail` se recorta a su primera línea y a 240 caracteres antes de llegar al agente.
2. **La forma y las cabeceras en `review-noted`** — hecho: el pedido nombra la forma del molde
   (`INBOX_ENTRY`, atada al molde por una prueba que se pone roja si cualquiera de los dos cambia) y los
   nombres que ya hay en Propuestas. Los nombres llegan por `ops context --json`, que gana el campo `inbox`
   —los nombres por sección—: un recorrido no tiene disco, y la lectura de planning ya corre ese comando en
   cada vuelta. `parser.inboxHeads` es la variante del recorrido de `readInbox`, y `readInbox` pasó a
   apoyarse en ella: sigue habiendo un solo lector del INBOX.
3. **El mismo pedido en los otros recorridos** — hecho, y distinto en dos de los cuatro puntos:
   - `flow` en modo informe: el caso proponía pedir el tope y comparar `followUps` contra él. Comparar un
     número que devuelve el mismo agente que ya escribió no contiene nada, así que se hizo determinista: el
     agente del informe devuelve los seguimientos —sección y entrada— sin escribir en el INBOX, y un paso
     aparte (`report-inbox`) escribe los tres primeros con forma y nombres. Lo que pasa del tope queda en el
     informe —el pedido dice que todos van también en lo que queda abierto— y se cuenta en el resultado
     (`unlisted`) y en el log. Cuesta un agente más por informe que deje seguimientos.
   - `flow` en `no-hacer` e `investigar`: forma y nombres de Lecciones e Ideas. Escriben una entrada por
     corrida, así que el tope ya era uno.
   - `onboard`: el paso de borradores dejó de escribir en Ideas y devuelve las preguntas en `openQuestions`,
     como ya pedía su schema; las escribe el paso de la épica —siguen siendo tres agentes— con tope, forma y
     los nombres de Ideas, que el Scan lee con `ops context --json`. Las que no entran se nombran en el log
     y en el resultado (`unlistedQuestions`): el arranque lo corre una persona, y es ahí donde las lee.
4. **El molde deja de invitar evidencia** — hecho: Propuestas pasa a «un cambio concreto del producto y su
   fix propuesto. La evidencia no se copia acá: se cita dónde vive». El comentario de `autobuild.js` se
   ajustó igual, y el pedido del informe de `flow` dejó de decir «un cambio del producto con su evidencia».
   `INBOX.md` es del proyecto (`init` en `TEMPLATE_OWN`): lo reciben las instancias nuevas, y las que ya
   existen se enteran por el CHANGELOG.
5. **Aviso de tamaño en `check`** — hecho, como advertencia y nunca error, en `engine/planning/inbox.js`:
   300 líneas por defecto, que la instancia cambia en `inbox.warnLines` de `ops.config.json` (schema y
   validador; sólo un entero positivo).

Lo que el caso ya dejaba afuera se quedó afuera: el formato `[servicio][slug]` no se tocó, y deduplicar
sigue siendo el segundo filtro, detrás del tope en código. Lo que es salida del INBOX fue al 106.

**Tradeoffs**

- **«N conviene que viva en `ops.config.json`»** — se decidió que no. Un recorrido no lee archivos: un N
  configurable llegaría por el agente que transcribe la configuración (`contract-digest`), que es
  justamente de lo que un tope en código viene a no depender. Queda como constante en el fragmento
  compartido; si una instancia necesita otro, es un caso propio.
- **«Pasar cabeceras cuesta contexto»** — acotado: viajan sólo los nombres de la sección donde se escribe,
  no las entradas. Con 36 hallazgos el pedido pasó de 13284 a 1811 caracteres (abajo).
- **«Un tope pierde hallazgos del INBOX»** y **«deduplicar por nombre deja pasar otro nombre»** — siguen
  valiendo como estaban descritos; el conteo en `done/` es lo que evita que lo primero sea silencioso.

**Qué tiene que probar el cierre**

- **Tope y conteo en `done/`, rojo quitando el `slice`** — prueba nueva en `autobuild-review.test.js`;
  M1 (sin `slice`) y M2 (sin conteo) la ponen roja. La ausencia —dentro del tope no se cuenta nada— tiene
  su propia prueba, roja con M4 (contar siempre).
- **Forma y cabeceras en `review-noted`** — la misma prueba, roja con M3.
- **`flow.js:402`, `:433`, `:445` y `onboard.js:183`, cada uno con su aserción** — cuatro pruebas, una por
  punto, rojas con M6, M7, M8 y M9/M10. La de `:402` mide el tope aplicado, no una comparación: ver el
  punto 3.
- **El molde y el comentario ya no dicen que una propuesta lleva su evidencia adentro** — comprobado con
  `grep -rn "con su evidencia" template/planning/INBOX.md automatization/workflows/ automatization/shared/`:
  nada en el molde, y quedan tres coincidencias que no son del INBOX y están bien donde están —el cierre de
  `done/` en `autobuild.js:870` y el veredicto de `agent-eval.js:18` y `flow-eval.js:18`—.
- **`check` sale 0 con el INBOX pasado del umbral y el aviso a la vista** — prueba nueva en
  `planning.test.js`, roja con M11 y M12 (el umbral de la instancia ignorado).
- **Los relatos de QA: de qué vía vinieron** — no se estableció, y no se abre caso todavía. Hace falta la
  historia del `INBOX.md` de la instancia —`git log -p` sobre ese archivo, allá—, que no viaja con el caso y
  no está en este repositorio. El disparador que el caso fijó para abrir uno propio es «vinieron de fuera de
  los workflows **y** el punto 4 no alcanza», y ninguna de las dos mitades se puede evaluar desde acá. Lo que
  sí cambió son las dos vías que el caso nombraba: `detail` llega recortado a una línea y el molde ya no pide
  evidencia. Lo puede cerrar quien tenga la instancia, corriendo ese `git log`.

### Lo que el caso no preveía

- **`flow.js` pasaba las 500 líneas** (502) con el schema de los nombres copiado de `autobuild`. Fue al
  fragmento compartido como `INBOX_HEADS`, que además sacó el literal duplicado entre los dos recorridos.
  En `autobuild` se declara `inbox: { ...INBOX_HEADS }` y no el nombre pelado, porque la prueba que ata el
  schema de `planning-context` con lo que el recorrido lee reconoce un campo por la forma `campo: {`.
- **El fragmento va inmediatamente después de `workflow-root.js`**, y no con `workflow-finish.js`: los
  schemas que lo usan se evalúan antes, y una constante incluida más abajo no existiría todavía.

### Qué se corrió

- **La reproducción del caso sobre el código nuevo.** `r101.js` corre el arnés de `autobuild` del árbol que
  se le pase con 36 hallazgos no bloqueantes de dos líneas y 300 caracteres. Sobre `git archive HEAD`:

  ```
  concerns=36 volcados=36 prompt=13284 caracteres
  segundas líneas en el pedido: 36
  forma del molde en el pedido: false
  cabeceras de Propuestas en el pedido: false
  hecho de revisión en done/: review=aprobado por software-architect, sobre api/alta.go
  ```

  Sobre la rama:

  ```
  concerns=36 volcados=3 prompt=1811 caracteres
  segundas líneas en el pedido: 0
  forma del molde en el pedido: true
  cabeceras de Propuestas en el pedido: true
  hecho de revisión en done/: review=aprobado por software-architect, sobre api/alta.go · 33 anotado(s) sin volcar al INBOX
  ```

- **El rojo previo**: las pruebas nuevas copiadas sobre `git archive HEAD` fallan todas —las del tope, las
  de forma y nombres en los tres recorridos, las de `check`, `context --json` y el validador—; las dos
  existentes cuya expectativa cambió a propósito también.
- **Mutaciones**, cada una en una copia desechable y todas rojas:

  | | Mutación | Prueba que se puso roja |
  |---|---|---|
  | M1 | `autobuild` sin `slice` | lo anotado entra al INBOX con tope… |
  | M2 | sin sumar lo no volcado al hecho de revisión | ídem |
  | M3 | `review-noted` sin forma ni nombres | ídem |
  | M4 | sumar el conteo siempre | lo anotado dentro del tope no deja nada contado sin volcar |
  | M5 | `detail` sin recortar a una línea | lo anotado entra al INBOX con tope… |
  | M6 | informe de `flow` sin tope | los seguimientos de un informe entran al INBOX con tope… |
  | M7 | `no-hacer` sin forma ni nombres | la lección de una intención no viable… |
  | M8 | `investigar` sin forma ni nombres | la idea de lo que falta averiguar… |
  | M9 | `onboard` sin tope | onboard lleva al INBOX tres preguntas abiertas… |
  | M10 | `onboard` calla las que no entran | ídem |
  | M11 | `check` sin aviso de tamaño | check avisa un INBOX pasado de tamaño… |
  | M12 | `check` ignora `inbox.warnLines` | ídem |
  | M15 | `context --json` sin `inbox` | context --json trae los nombres del INBOX por sección |
  | M20 | el validador acepta cualquier `warnLines` | inbox.warnLines se valida… |
  | M21 | el molde cambia la forma de entrada | los recorridos piden la misma forma de entrada… |
  | M22 | los nombres ignoran una viñeta con casilla | context --json trae los nombres… |

  M13, M14, M16–M19 y M23 son del 106.
- **La puerta**: `npm run ci`, código 0 — 717 pruebas, 0 fallas, 62 archivos en su piso de cobertura.
  `engine/planning/inbox.js` entró al registro de pisos con 100/80/100.
