---
caso: 105
titulo: El contrato de `autobuild` no trae `planning/rules/`, y sus prompts citan por número reglas que el proyecto retiró
estado: abierto
prioridad: alta
version-detectada: 0.80.0
---

# 105 — El recorrido trabaja sin las reglas del proyecto y le cita al humano una que el proyecto dio de baja

**🔴 abierto** · detectado en 0.80.0 · prioridad **alta** — cada subagente de `autobuild` planifica, construye y
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
