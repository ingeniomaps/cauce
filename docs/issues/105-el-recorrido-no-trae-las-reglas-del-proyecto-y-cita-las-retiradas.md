---
caso: 105
titulo: El contrato de `autobuild` no trae `planning/rules/`, y sus prompts citan por número reglas que el proyecto retiró
estado: resuelto
resuelto-en: 0.82.0
prioridad: alta
version-detectada: 0.80.0
---

# 105 — El recorrido trabaja sin las reglas del proyecto y le cita al humano una que el proyecto dio de baja

**🟢 resuelto en 0.82.0** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **alta** — cada subagente de `autobuild` planifica, construye y
revisa sin haber leído una sola regla del proyecto, y el mismo recorrido le escribe a una persona «partirla
—R17—» aunque `check` diga que R17 dejó de regir ahí

## Resumen

Separado del 099, que se queda con lo que carga la sesión. Éste es el otro canal: lo que viaja a los
subagentes del recorrido. Dos daños con una misma raíz —el recorrido no conoce el conjunto efectivo de reglas—:

1. **El contrato no trae las reglas.** `autobuild` arma el contrato leyendo sólo `AGENTS.md`, `workspace.md`,
   `ops.config.json` y `PROTOCOL.md`, le prohíbe al que lo arma leer nada más, y a cada subagente le dice que no
   vuelva a leer esos cuatro. Ningún prompt nombra `planning/rules/`, y `context` —que es de donde el recorrido
   toma el estado— tampoco.
2. **Los prompts citan reglas del sistema por número.** Cuando nadie puede escribir un plan que sobreviva, la
   fila de HUMAN_ACTIONS manda a «partirla —R17—». En un proyecto que sobrescribió `process.md` sin R17, esa
   fila cita una regla que no está escrita en ningún archivo que rija ahí.

El segundo no es un descuido invisible: `planning/rules/README.md` —del toolkit— ya dice que R17 «la sigue
exigiendo el motor» y que «ahí queda exigida sin estar escrita en ningún lado». Lo que no dice es que el propio
recorrido la sigue nombrando como si estuviera.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: instancia embedded con runner Claude, una regla propia
nueva y un `process.md` propio que es el del sistema sin R17.

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js; A=$BANCO/acme
node $OPS init $A --mode embedded --runner claude --install >/dev/null
printf '# Seguridad (propia)\n\n## P2 — Autenticación cerrada por defecto\n\nRegla de la empresa.\n' \
  > $A/planning/rules/security.md
sed '/^## R17/,/^## R20/{/^## R20/!d}' $A/planning/rules/system/process.md > $A/planning/rules/process.md
grep -c 'planning/rules' $A/.claude/workflows/autobuild.js
grep -n -- '—R17—' $A/.claude/workflows/autobuild.js
node $OPS check $A/planning | grep -i sobrescribe
node $OPS context $A/planning --json | grep -ci 'rules'
```

## Síntoma

Salida real, 2026-09-11, desde el checkout en 0.81.0:

```
0
582:      + `distintas y partirla —R17—, o dejarla entera con la razón escrita.`, 'plan-human')
⚠ planning/rules/process.md sobrescribe process.md (override explícito); deja de regir R17
0
```

El workflow instalado no nombra `planning/rules` ni una vez, `context` tampoco, y la única regla que cita por
número es la que `check` acaba de declarar retirada. La línea 582 del instalado es la 568 del fuente: `install`
expande los `{{INCLUDE:...}}` y corre la numeración. El 099 registró los mismos dos ceros sobre 0.80.0 publicado.

## Causa raíz

- `automatization/workflows/autobuild.js:309-323` — el contrato: «Leé `AGENTS.md`, `workspace.md`, `ops.config.json`
  y `PROTOCOL.md` una sola vez y no leas nada más». Las reglas no están entre los cuatro ni en el esquema que
  devuelve.
- `automatization/workflows/autobuild.js:335-337` — `SCOPE`, que heredan los subagentes que tocan código, repite
  que no relean esos cuatro, y `LEDGER` (`:339`) le suma los contratos de PROTOCOL. Ninguno de los dos nombra
  reglas.
- `automatization/workflows/autobuild.js:568` — el prompt de `planRejected` escribe «—R17—» sin mirar si R17 rige.
- `engine/cli/planning.js:312` — `context`, que `autobuild.js:369` corre con `--json` para leer el estado, no
  informa qué reglas rigen.
- Otro workflow también cita por número: `automatization/workflows/agent-eval.js:228` («hasta donde R12
  permite»). No se midió si llega a una instancia; ver «Qué tiene que probar el cierre».

## Fix propuesto

1. **`context` informa el conjunto efectivo.** Una línea `RULES` —y su campo en `--json`— con lo que resuelve el
   `effectiveRules(root)` que propone el 099. Va acá y no en el 099 porque es el canal que el recorrido ya usa:
   `autobuild.js:369` corre `context --json` y reporta lo que imprime, así que la lista llega sin que el agente
   del contrato tenga que leer otro archivo ni romper su «no leas nada más». Y a una persona le muestra qué rige
   sin abrir nada.
2. **`SCOPE` y `LEDGER` nombran las reglas** que cada subagente aplica antes de planificar, construir o revisar,
   en la forma que decida la pregunta de abajo.
3. **Ningún prompt cita una regla del sistema por número.** El de `planRejected` ya describe la conducta —«revisar
   si la unidad son dos resultados con vidas distintas y partirla»—; alcanza con sacar «—R17—». Si se quiere
   conservar la cita, se resuelve contra el conjunto efectivo y se omite cuando la regla no rige.

**Decisión pendiente del usuario:** ¿el recorrido le pasa a cada subagente la lista de reglas o el texto?

- **La lista** (lo que proponía el autor original): barata, porque cada subagente recibe rutas y no contenido.
  Pero depende de que el subagente decida leerlas, que es exactamente lo que falló en la instancia donde se
  descubrió esto.
- **El texto**: seguro, y caro. Viaja en `SCOPE`, que se reenvía a cada subagente que toca código, así que el
  costo es el tamaño del conjunto por la cantidad de subagentes. Sólo las cuatro reglas del sistema ya son
  39 074 bytes (`wc -c template/planning/rules/system/*.md`); la instancia real tenía ~122 KB según su propio
  informe, no medido acá.
- **Mixta**: el texto a Plan y Review, que deciden contra las reglas, y la lista a Build.

**Recomendación, como propuesta:** la lista, por `context`, más la obligación de que Review nombre contra qué
reglas revisó. Así el costo no se multiplica y la lectura deja rastro, que es lo que hoy no hay.

## Tradeoffs

- **La lista no garantiza lectura.** Si se elige, un subagente que no las lee sigue pasando. Lo que lo haría
  visible es que Review cite reglas por identificador, y eso cambia el esquema del veredicto.
- **Sacar el número del prompt pierde la trazabilidad** hacia la regla del sistema cuando sí rige. Resolverla
  contra el conjunto efectivo la conserva a cambio de que el prompt deje de ser texto fijo.
- **R17 sigue exigida por el motor** aunque el proyecto la retire: lo dice `planning/rules/README.md`, y el texto
  de R17 dice que `check` exige `(sin partir: <razón>)`. Acá no se corrió `check` sobre una unidad que cruce el
  umbral con R17 retirada, así que es documentado, no verificado. Este caso no cambia eso. Lo que cambia es que el recorrido deje
  de nombrar la regla como si rigiera.

## Qué tiene que probar el cierre

- La reproducción de arriba devuelve una línea `RULES` que incluye `planning/rules/process.md` y
  `planning/rules/security.md` y **no** `planning/rules/system/process.md`. Aserción de ausencia, vista en rojo
  sobre el `context` de hoy.
- Una mutación que saque las reglas de `SCOPE` pone una prueba en rojo.
- `grep -- '—R17—'` sobre el workflow instalado no devuelve nada, y una prueba que falla si un prompt vuelve a
  citar una `R` por número se ve en rojo devolviéndolo.
- `agent-eval.js:228`: se establece si llega a una instancia. Si llega, se arregla acá o sale como caso propio;
  si no, se dice por qué.
- Una corrida real de `autobuild` sobre el banco muestra en su registro que el Plan o el Review nombra
  `security.md`: la prueba de que la regla llegó y no sólo de que se listó.
- La decisión de arriba queda escrita con su respuesta.

## Contexto de descubrimiento

Mismo que el 099: instancia real (sidecar, 0.80.0), 2026-09-11, revisando si el recorrido aplicaba 50 reglas
propias recién escritas. El `autobuild` no las nombraba en ningún prompt. Hasta el 2026-09-10 la instancia usaba
un workflow propio que sí las inyectaba; al retirarlo a favor del de Cauce dejaron de llegar sin que nada fallara.
La cita de R17 apareció al separar este caso del 099, el 2026-09-11, buscando qué otras reglas nombraba el
recorrido por su cuenta.

## Relacionados

- **099** — la otra mitad: lo que carga la sesión. Los dos dependen de un mismo `effectiveRules(root)`, y si ése
  sale en el 099, éste lo consume.
- **007** — hizo que `check` nombre lo que un override retira; acá el recorrido sigue citando lo retirado.
- **023** — la misma familia: una regla que manda a un archivo que el agente no lee.

## Cierre

**🟢 resuelto en 0.82.0** · `engine/cli/planning.js`, `automatization/workflows/autobuild.js`,
`automatization/workflows/agent-eval.js`; consume el `effectiveRules` del 099, con el que se cierra

### La decisión

- **¿Lista o texto?** — la lista, decidida por el usuario, con la obligación de que Review nombre contra qué reglas
  revisó. Viajan rutas y no contenido, así que el costo no se multiplica por cada subagente; y la lectura deja rastro
  en la respuesta de Review, que es lo que hoy no había.

### Contra lo que el caso enumeró

**Fix propuesto**

1. **`context` informa el conjunto efectivo** — hecho: campo `rules` en `--json` y línea `RULES` en texto, con lo que
   resuelve `effectiveRules`. `autobuild` lo copia de la lectura que ya hacía (`rules` en el esquema `CONTEXT`), así que
   el agente del contrato sigue sin leer nada más.
2. **`SCOPE` y `LEDGER` nombran las reglas** — hecho: `SCOPE` lleva la lista, relativa a la raíz ops, desde que vuelve
   la primera lectura de `context`, y `LEDGER` la hereda. Llega a Decompose, Plan, Build, Review, Verify, QA, Commit y a
   cada escritura de planning. **No** llega a lo que corre con el preámbulo invariante —Ready, Critique y la propia
   lectura de `context`—: ese preámbulo existe para no obligar a leer ningún archivo, y Critique ataca un plan que ya se
   escribió con las reglas a la vista. Si una crítica que las ignore resulta un problema, se agrega ahí; hoy no hay
   evidencia de que lo sea.
3. **Ningún prompt cita una regla del sistema por número** — hecho: sale «—R17—» de la fila de `planRejected`, que ya
   describía la conducta, y sale «R12» del juez de `agent-eval.js`, que dice ahora lo que esa regla pedía. No se
   resolvió la cita contra el conjunto efectivo: describir la conducta vale igual rija o no la regla.

**Tradeoffs**

- **La lista no garantiza lectura** — lo que la vuelve visible es el campo `rules` del esquema `REVIEWED`: Review
  nombra contra qué reglas revisó, y si hay reglas que rigen y no nombra ninguna, la corrida para con
  `review-unbacked`, igual que cuando aprueba sin decir qué abrió. Lo que nombró va al journal (`Review contra: …`).
  **No** se sumó a la línea `review=` de la entrada de DONE: está pegada al volcado a INBOX que otro cambio está tocando en
  paralelo, y queda como seguimiento —se cierra agregando `review.rules` a `reviewFact`—.
- **Sacar el número pierde la trazabilidad** — asumido: el texto dice la conducta, que es lo que la fila le pide a una
  persona, y la regla, si rige, está en la lista.
- **R17 sigue exigida por el motor** — sin cambios, como el caso decía: `planning/rules/README.md` lo dice y este cambio
  no lo toca.

**Qué tiene que probar el cierre**

- **La reproducción devuelve una línea `RULES` con `process.md` y `security.md` propias y sin `system/process.md`, vista
  en rojo** — corrida tal como la escribe el caso (abajo), y `context dice qué reglas rigen, en texto y en --json`, que
  asercia la ausencia de la sobrescrita; roja sobre la base (`context --json no trae rules`) y verde ahora.
- **Sacar las reglas de `SCOPE` pone una prueba en rojo** — M11: `las reglas que lista context llegan a Plan, Build y
  Review` en rojo.
- **`grep -- '—R17—'` sobre el workflow instalado no devuelve nada, y una prueba que falla si vuelve una `R` por número
  se ve en rojo** — el `grep` corrido abajo; `ningún texto que un runner instala cita una regla por número` recorre todo
  lo que instalan los cuatro adaptadores con los includes resueltos, y devolver «—R17—» (M13) o «R12» (M14) la pone en
  rojo.
- **`agent-eval.js:228`: si llega a una instancia** — llega: el manifiesto de Claude lo instala como
  `.claude/workflows/agent-eval.js`. Se arregló acá.
- **Una corrida real de `autobuild` muestra que Plan o Review nombra `security.md`** — **sigue sin correrse**, y el
  2026-09-11 se intentó: el banco quedó armado y la corrida no se pudo lanzar. Lo que sí se corrió es el recorrido
  renderizado de verdad, con los agentes simulados por el arnés: los prompts que reciben Plan, Build y Review traen las
  rutas, y un Review que no nombra reglas frena. Que un modelo las **lea** sigue sin medir, y con él la parada
  `review-unbacked` vista fuera del arnés. Del intento quedó esto:

  - **El banco es el que el caso pide.** Instancia embedded con runner Claude bajo el scratch, hecha con `npm pack` del
    worktree e instalada desde el `.tgz` —0.82.0 no está publicado—, con una regla propia (`planning/rules/security.md`,
    testigo `TALAMPAYA-7731`), un `process.md` propio que sobrescribe al del sistema (testigo `LAPACHO-3312`), el testigo
    `NOGAL-5508` dentro de la retirada, y una tarea `[full]` en cola:

    ```
    $ node tools/ops.js check planning                                      # código 0
    ⚠ planning/rules/process.md sobrescribe process.md (override explícito); deja de regir R17, R99
    ✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 0 terminada(s)
    $ node tools/ops.js context planning --json   → .rules
    planning/rules/system/code-shape.md, planning/rules/system/commits.md, planning/rules/system/conduct.md,
    planning/rules/process.md, planning/rules/security.md
    $ grep -c -- '—R17—' .claude/workflows/autobuild.js                     # 0
    ```

  - **Lo que frenó no es el arreglo ni el banco: es el permiso para abrir la sesión que corre el recorrido.**
    `/autobuild` se carga con la herramienta `Skill`, y una sesión sin superficie de aprobación la deniega:

    ```
    $ claude -p "/autobuild" --setting-sources project --permission-prompts none \
        --output-format stream-json --verbose                               # código 0
    "permission_denials":[{"tool_name":"Skill","tool_input":{"skill":"autobuild"}}, …]
    → «The `autobuild` skill couldn't be loaded (permission denied, no approval surface in this session).
       I'll run the same protocol manually»
    ```

    Esa corrida no mide nada —el modelo improvisó el protocolo a mano, sin workflow, y ninguna fase existió— y costó
    USD 1,04. Las dos formas que sí le daban los permisos que el recorrido necesita —`--permission-mode
    bypassPermissions`, y un `--settings` con `allow` acotado a `Skill`, `Bash`, `Edit` y `Task`— las rechazó el
    clasificador del harness antes de ejecutarlas, las dos con «Permission for this action was denied by the Claude Code
    auto mode classifier. Reason: [Create Unsafe Agents]».

  - **Qué la cierra y quién la revisa.** Correr `/autobuild` desde una sesión **interactiva** abierta en el banco, donde
    una persona aprueba los permisos, y traer su journal con la línea `Review contra: … planning/rules/security.md`.
    Sigue valiendo el orden de magnitud del 081: ~780 k tokens. Una sesión de agente no alcanza, y eso no es del arreglo:
    es que no puede abrir una sesión anidada con permisos para cargar el workflow.
- **La decisión queda escrita** — arriba.

### Lo que el caso no preveía

- **`autobuild-review.test.js` aserciaba la cita**: la prueba de la fila de un plan rechazado buscaba `R17` en el texto.
  Ahora busca la conducta —«vidas distintas» y «partirla»—, que es lo que la fila tiene que decir.
- **El `grep -c 'planning/rules'` de la reproducción sigue en 0, y es correcto**: la lista no está escrita en el workflow
  sino que llega por `context` en cada corrida. Lo que pasa de 0 a 1 es `context --json | grep -ci rules`.
- **`template/AGENTS.md` cita «R13»** al presentar los cargos («Su contraparte es R13: el que se niega bien y no deja nada
  tampoco cumplió»). No es un prompt de recorrido, y dice la conducta al lado del número, así que no depende de que R13
  rija; queda como está y se nombra para que lo decida quien mantiene ese archivo.

### Qué se corrió

- **La reproducción del caso**, con el CLI del checkout y el motor enlazado del mismo árbol:

  ```
  base (HEAD)                                   rama
  grep -c 'planning/rules' → 0                  → 0
  grep -n -- '—R17—' → 582: … partirla —R17— …  → (nada)
  check → … deja de regir R17                   → … deja de regir R17
  context --json | grep -ci rules → 0           → 1
  RULES → (sin línea)                           → RULES  planning/rules/system/code-shape.md,
                                                  planning/rules/system/commits.md, planning/rules/system/conduct.md,
                                                  planning/rules/process.md, planning/rules/security.md
  ```
- **El rojo previo** de las pruebas nuevas sobre la base: el recorrido (`Plan|plan no recibió
  planning/rules/system/commits.md`), el Review sin reglas (la corrida terminaba en vez de parar), `context` y la
  búsqueda de citas por número (dos: la de R17 y la de R12).
- **Mutaciones**, en copias desechables bajo el scratch (R23): M9 a M14, las seis rojas —`context` sin la lista o sin la
  línea, `SCOPE` sin las reglas, Review sin la parada, y las dos citas devueltas—. Las otras doce de la tanda son del 099.
- **La instancia real y la sesión real** del 099 corrieron sobre el mismo paquete: `context` ahí devuelve la misma
  línea `RULES`, y el `autobuild.js` instalado tiene cero «—R17—».
- `npm run ci`, con los archivos nuevos en el índice y `TMPDIR` propio: código 0, 710 de 710, cobertura de 62 archivos en su piso o por encima —`engine/automation/rules.js` entra con 100/84/100—, ningún export sin uso. Sin el `TMPDIR` propio, «verify mide el índice y no el árbol de trabajo» falló una vez por un `ops-verify-*` de otra sesión en el `/tmp` compartido; no es de este cambio.
