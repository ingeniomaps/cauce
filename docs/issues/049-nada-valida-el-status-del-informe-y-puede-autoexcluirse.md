---
caso: 049
titulo: Nada valida el `status` de un informe, que puede auto-excluirse de la propuesta
estado: abierto
prioridad: alta
version-detectada: 0.70.0
---

# 049 — Un informe con el `status` pisado no entra a ninguna propuesta, y nada lo dice

**🔴 abierto** · detectado en 0.70.0 · prioridad **alta** — el hallazgo se pierde en silencio

## Resumen

`prepareReport` crea el informe de la semana con `status: draft`, y `markConsolidated` lo mueve a
`consolidated` cuando ese informe entra a una propuesta. El sello existe para distinguir el que ya se
consolidó del que llegó tarde, y el comentario del motor lo dice: «marcar al primero es lo que deja ver
al segundo».

Lo que nada comprueba es que el `status` que llega al PR sea el que el motor escribió. El cuerpo del
informe lo redacta un agente sobre el archivo ya creado, y el frontmatter está adentro de ese archivo.
Un informe que llegue con `status: consolidated` sin haber entrado a ninguna propuesta queda excluido de
todas las futuras: `pendingReports` saltea lo consolidado, así que sus recomendaciones no llegan nunca al
contrato del cargo.

El daño tiene dos mitades y la segunda es la cara. La primera es que se pierde el hallazgo. La segunda
es que **se pierde sin señal**: el PR se ve igual que los otros diecinueve, la puerta pasa en verde, y la
propuesta mensual sale sin ese cargo sin que nada indique que faltaba. Es la forma que R15 nombra — se
lee entero y no lo está.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce
npm ci

node -e '
const { frontmatterState } = require("./engine/agents/learning-files.js")
const nuevo   = "---\nagent: x\ndate: 2026-09-07\nstatus: draft\n---\n"
const pisado  = "---\nagent: x\ndate: 2026-09-07\nstatus: consolidated\n---\n"
for (const [que, texto] of [["recien creado", nuevo], ["con status pisado", pisado]]) {
  const estado = frontmatterState(texto, "draft")
  console.log(que.padEnd(20), "->", estado.padEnd(13), "entra a la propuesta:", estado !== "consolidated")
}'
```

Y para ver que ninguna puerta lo mira, el guard del ciclo sobre un informe con el sello pisado:

```bash
grep -n "for seccion in" -A 12 .github/workflows/agent-learning.yml
grep -n "Recomendación' \"\$report\"" -B 2 .github/workflows/agent-learning.yml
```

## Síntoma

```
recien creado        -> draft         entra a la propuesta: true
con status pisado    -> consolidated  entra a la propuesta: false
```

Ocurrido de verdad en la tanda del 2026-09-07: de los veinte informes, diecinueve llegaron con
`status: draft` y el de `frontend-engineer` con `status: consolidated`, sin que ninguna propuesta lo
citara. Llevaba cuatro recomendaciones, una de ellas con fecha dura — la baja de XSLT de Chrome Stable
el 17 de noviembre de 2026.

## Causa raíz

- `engine/agents/learning.js:44` — `prepareReport` escribe `status: draft` al crear el archivo.
- `engine/agents/learning.js:230-234` — `pendingReports` filtra por
  `frontmatterState(...) !== 'consolidated'`: el sello decide si el informe entra a la propuesta.
- `.github/workflows/agent-learning.yml:431-464` — el guard del ciclo valida que «Fuentes consultadas» y
  «Hallazgos» tengan contenido y que el título `## Recomendación` esté literal. **No mira el
  frontmatter.**

No hay un punto donde el motor compare el `status` que escribió contra el que volvió.

## Fix propuesto

En el mismo paso donde el guard ya valida las secciones, comprobar que un informe recién creado siga en
`draft`:

```diff
   if ! grep -qx '## Recomendación' "$report"; then
     ...
   fi
+  # El sello lo mueve `markConsolidated` al consolidar, nunca quien escribe el informe. Uno que vuelve
+  # ya sellado no entra a ninguna propuesta —`pendingReports` lo saltea— y se pierde sin señal.
+  if ! grep -qx 'status: draft' "$report"; then
+    echo "El informe de $AGENT no volvió con 'status: draft'." >&2
+    echo "El sello lo mueve la consolidación; sellado de entrada, no entra a ninguna propuesta." >&2
+    exit 1
+  fi
```

Alternativa, más fuerte y más cara: que el paso que recoge el informe reescriba el frontmatter desde el
motor en vez de confiar en lo que volvió, dejando que el agente sólo aporte el cuerpo.

## Tradeoffs

- El guard nuevo falla la corrida de ese cargo, que es ruidoso pero es el punto: hoy el modo de fallo es
  el silencio.
- No cubre el resto del frontmatter (`agent`, `date`). Si se quiere cubrir todo, la alternativa de
  reescribirlo desde el motor es la que corresponde, y entonces este `grep` sobra.
- **Sin comprobar**: no sé si el sello lo pisó el agente al reescribir el archivo entero o si vino de
  otro lado. El fix propuesto vale igual porque comprueba el resultado, no la causa — pero si la causa
  fuera del motor, el guard la taparía en vez de arreglarla. Vale la pena mirar una corrida con el
  informe crudo antes de dar el caso por cerrado.

## Contexto de descubrimiento

Revisando los veinte PR de la tanda semanal del 2026-09-07 antes de mergearlos, contrastando el
frontmatter de todos contra el molde. No apareció leyendo el informe: apareció comparando los veinte.

## Relacionados

- [050](050-la-puerta-de-rutas-absolutas-corre-sobre-informes-generados.md) — el otro caso donde una
  puerta y un informe generado se cruzan sin que el ciclo lo prevea.
