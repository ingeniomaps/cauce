---
caso: 029
titulo: Al rehacer un banco, el borrado no lanza pero el scaffold encuentra restos y se niega
estado: resuelto
prioridad: media
version-detectada: 0.62.0
resuelto-en: 0.63.0
---

# 029 — El banco se borra, y el que lo recrea encuentra que todavía está

**🟢 resuelto en 0.63.0** · detectado en 0.62.0 · prioridad **media** — el mismo test vuelve a fallar a veces, con otro mensaje

## Resumen

`evaluationBench` borra el banco con `rmSync` y lo recrea con `scaffold`. En CI, a veces el borrado
termina sin lanzar y el `scaffold` que sigue encuentra el directorio todavía poblado, así que
`copyTemplate` se niega: *«El destino contiene …/11-otro/AGENTS.md. Usa un directorio vacío o
--force»*.

Es el mismo test y el mismo directorio que el [018](018-el-test-del-banco-por-caso-es-intermitente.md),
que se cerró en 0.60.1 dándole reintentos al borrado. Ahora el borrado ya no lanza `ENOTEMPTY` — y el
resto aparece un paso más tarde.

## Reproducción

**No se reproduce a pedido, y eso es parte del caso.** Lo que hay son dos corridas de CI y una
comprobación local que no lo hizo aparecer:

```bash
# No falló ninguna de las cinco, en Node v24.18.0.
for i in 1 2 3 4 5; do node --test test/agents/bench.test.js; done
```

En CI, sobre un PR que sólo cambiaba tres líneas de markdown: la corrida `34065763996` falló, y el
re-run del **mismo árbol** —`gh run rerun … --failed`— pasó. Eso es lo que lo clasifica como
intermitente y no como regresión.

## Síntoma

Dos fallas del mismo test sobre el mismo banco, con tres días de diferencia:

```
2026-09-03  corrida 33808678183  ci (24)
  ✖ cada caso recibe su propio banco
    ENOTEMPTY, Directory not empty: …/.cauce-eval/product-manager/11-otro

2026-09-06  corrida 34065763996  ci (current)
  ✖ cada caso recibe su propio banco
    El destino contiene …/.cauce-eval/product-manager/11-otro/AGENTS.md.
    Usa un directorio vacío o --force.
```

La primera es la que cerró el 018. La segunda es ésta. Cada una cayó en una pata distinta de la matriz
—`["24", current]`—, así que no es una versión de Node.

## Causa raíz

`engine/cli/catalog.js`, en `evaluationBench`:

```js
fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
IN.scaffold(dir, { name: 'Banco de evaluación', mode: 'sidecar', quiet: true })
```

y `engine/cli/instance.js:49`, adonde llega ese `scaffold`:

```js
if (fs.existsSync(to)) {
  if (!force) fail(`El destino contiene ${to}. Usa un directorio vacío o --force.`)
```

`scaffold` se llama **sin** `force`, así que cualquier archivo que sobreviva al borrado corta la
corrida. Y `rmSync` no lanzó: sus reintentos cubren `ENOTEMPTY` y compañía, y después de agotarlos
lanzaría — el error que se ve no es ése.

**Por qué queda algo después de un borrado que no falló, no se estableció acá.** El directorio es un
árbol versionado con un symlink al motor adentro, y sobre él acaba de correr un `git status`; cualquiera
de esas cosas puede explicarlo y ninguna se comprobó. Se deja escrito como lo que es —una observación
sin causa establecida— en vez de elegir la hipótesis más cómoda.

Lo que sí se puede afirmar es la forma: el 018 hizo que el borrado dejara de lanzar, y el mismo resto
aparece ahora un paso más adelante. Si son el mismo defecto o dos, tampoco está establecido.

## Fix propuesto

Pasarle `force` al `scaffold` del banco:

```diff
-  IN.scaffold(dir, { name: 'Banco de evaluación', mode: 'sidecar', quiet: true })
+  // El banco es desechable y se acaba de borrar: lo que sobreviva al `rmSync` se pisa, no corta la
+  // corrida. La protección de «acá alguien trabajó» ya se ejerció doce líneas arriba, contra
+  // `git status`, y es la que decide si esto se rehace; una segunda puerta que dispara a veces no
+  // protege nada y enseña a re-correr sin mirar.
+  IN.scaffold(dir, { name: 'Banco de evaluación', mode: 'sidecar', quiet: true, force: true })
```

La autorización ya ocurrió: `evaluationBench` comprueba `git status --porcelain` sobre el banco y exige
`--force` si hay trabajo sin recoger. Después de esa puerta, «rehacer» significa rehacer.

El camino existe y está comprobado: `scaffold` lo recibe con `force = false` por defecto
(`engine/cli/instance.js:91`) y lo pasa a `copyTemplate` y a `copyRuntime`. Lo que nunca lo ejercitó es
la llamada del banco, que es la única que no lo manda.

**Alternativa, que cuesta más y conserva la señal**: comprobar después del `rmSync` que el directorio
quedó vacío y fallar con un mensaje que lo diga. Mantiene visible que algo sobrevive, en vez de taparlo,
pero deja la corrida rota igual y no arregla la intermitencia. Sirve si lo que se quiere es investigar
la causa que este caso no estableció.

## Tradeoffs

Con `force`, un resto deja de verse. Si lo que sobrevive al borrado fuera evidencia de una corrida
anterior, se pisaría en silencio — y ése es justo el daño que el comentario de `evaluationBench` cuenta
que ya pasó una vez. Lo que lo hace aceptable es que la pregunta «¿alguien trabajó acá?» ya la contestó
`git status` antes, y con `--force` explícito de por medio.

Sólo afecta al toolkit: en una instancia `--bench` no corre, así que no lleva entrada de CHANGELOG.

## Contexto de descubrimiento

Cerrando el [028](028-una-comilla-de-cierre-desarma-la-regla-de-rm.md) el 2026-09-06. El PR que marcaba
ese caso como resuelto —tres líneas de frontmatter— falló en CI, y lo primero que uno hace con un rojo
así es dudar del cambio. No era: el re-run del mismo árbol pasó.

Un test que falla a veces enseña a re-correr sin leer, y la próxima vez que falle por una razón real
nadie va a mirar. Es el mismo argumento con el que se abrió el 018, tres días antes.

## Relacionados

- [018](018-el-test-del-banco-por-caso-es-intermitente.md) — la falla anterior del mismo test sobre el
  mismo banco, cerrada en 0.60.1. Comparten test y directorio; si comparten defecto, no está establecido.
