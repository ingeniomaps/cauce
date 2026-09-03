---
caso: 012
titulo: el Makefile del molde llama a "ops team", que se renombró a "ops flow"
estado: resuelto
prioridad: media
version-detectada: 0.58.0
resuelto-en: 0.59.0
---

# 012 — `make team-check` y `make team-show` llaman a un comando que ya no existe

**🟢 resuelto en 0.59.0** · detectado en 0.58.0 · prioridad **media** — dos atajos rotos en toda instancia

## Resumen

`teams/` se renombró a `flows/` y el comando pasó de `ops team` a `ops flow` — `upgrade` incluso mueve
la carpeta y los archivos de cada recorrido propio. El `Makefile` del molde no acompañó el cambio:
sigue llamando a `node tools/ops.js team check` y `team show`.

Los dos targets fallan con el banner de uso. Como el `Makefile` está en `SYSTEM_FILES`, toda instancia
—nueva o actualizada— los tiene rotos.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install
cd ops

make team-check TEAM=product-development     # exit 2, imprime "Uso:"
make team-show  TEAM=product-development     # ídem

node tools/ops.js flow check product-development   # ✓ funciona
```

## Síntoma

```text
$ make team-check TEAM=product-development
Uso:
  ops init [destino] [--name <nombre>] [--mode embedded|sidecar] [--force]
  ...
exit=2

$ node tools/ops.js flow check product-development
✓ product-development: 9 etapa(s), 17 agente(s), contrato válido
```

`ops --help` ya no lista ningún `team`: sólo `flow list`, `flow check <flow>` y `flow show <flow>`.

Comprobado también en una instancia real —`venotal-ops`, actualizada a 0.58.0 el 2026-09-03—:
`Makefile:66` y `Makefile:69` siguen diciendo `ops.js team`.

## Causa raíz

`template/Makefile`, líneas 63-69:

```make
require-team:
	@test -n "$(TEAM)" || (echo "Falta TEAM=<slug>" >&2; exit 2)

team-check: require-team ## Valida contrato, agentes y etapas de TEAM=<slug>
	@node tools/ops.js team check "$(TEAM)"

team-show: require-team ## Muestra el recorrido de TEAM=<slug>
	@node tools/ops.js team show "$(TEAM)"
```

El rename llegó al motor, al README —tres menciones de `ops flow`— y a `renameTeamsToFlows` en
`engine/cli/instance.js`, que mueve `teams/` y los dos archivos de cada recorrido. El Makefile quedó
afuera.

**Corrección de este caso**: decía acá que el CHANGELOG no tiene una entrada del rename. Sí la tiene
—0.45.0, «`teams/` ahora es `flows/`, y `ops team` ya no existe»— y hasta le pide a cada usuario
renombrar los `ops team check|list|show` que haya automatizado. Eso no atenúa el bug: lo agrava. El
toolkit pidió ese renombre y no lo hizo en el Makefile que él mismo distribuye y `upgrade` reemplaza.

## Fix propuesto

```diff
-require-team:
-	@test -n "$(TEAM)" || (echo "Falta TEAM=<slug>" >&2; exit 2)
+require-flow:
+	@test -n "$(FLOW)" || (echo "Falta FLOW=<slug>" >&2; exit 2)

-team-check: require-team ## Valida contrato, agentes y etapas de TEAM=<slug>
-	@node tools/ops.js team check "$(TEAM)"
+flow-check: require-flow ## Valida contrato, agentes y etapas de FLOW=<slug>
+	@node tools/ops.js flow check "$(FLOW)"

-team-show: require-team ## Muestra el recorrido de TEAM=<slug>
-	@node tools/ops.js team show "$(TEAM)"
+flow-show: require-flow ## Muestra el recorrido de FLOW=<slug>
+	@node tools/ops.js flow show "$(FLOW)"
```

Y las tres entradas correspondientes en el `.PHONY`. Falta además `flow-list`, que hoy no tiene atajo
aunque `ops flow list` exista.

Renombrar la variable de `TEAM` a `FLOW` es parte del arreglo: dejar `TEAM=` apuntando a `flow` deja la
palabra vieja viva en la única superficie que el dev escribe a mano.

## Tradeoffs

Cambia el nombre de dos targets públicos. Como hoy no funcionan, nadie puede tener un script que
dependa de ellos andando — a lo sumo uno que dependa de que fallen. Va en el CHANGELOG igual.

## Contexto de descubrimiento

Barriendo el ciclo de vida completo de 0.58.0 el 2026-09-03, corriendo **todos** los targets del
Makefile del molde con y sin parámetro. Los 27 restantes andan; estos dos son los únicos que fallan, y
fallan igual en una instancia nueva y en una actualizada.

## Resolución

**Resuelto en 0.59.0.** Los targets pasan a `flow-check` y `flow-show` con `FLOW=<slug>`, y se suma
`flow-list`, que no tenía atajo. Renombrar la variable era parte del arreglo: dejar `TEAM=` apuntando a
`flow` mantendría viva la palabra vieja en la única superficie que el dev escribe a mano.

Y entró la puerta que faltaba, que es lo que evita el próximo rename a medias: una prueba compara cada
`ops.js <comando>` del Makefile del molde contra los que el CLI acepta, leídos de su propio uso y no de
una lista escrita al lado —una lista envejecería con el mismo silencio que el Makefile—. Comprobada en
rojo: encuentra `ops team` y ningún otro, que confirma lo que este caso afirmaba de los 27 restantes.

Verificado el 2026-09-03: `make flow-check FLOW=product-development` valida el recorrido,
`make flow-list` los lista, y sin la variable el target se detiene con `Falta FLOW=<slug>`.

## Relacionados

Ninguno.
