---
caso: 034
titulo: El override de gobernanza no está documentado en ninguna parte y su única vía practicable es de sesión
estado: resuelto
prioridad: media
version-detectada: 0.63.0
resuelto-en: 0.64.0
---

# 034 — El guard manda a usar una llave y no dice dónde está

**🟢 resuelto en 0.64.0** · detectado en 0.63.0 · prioridad **media** — la salida existe y no hay cómo tomarla

## Resumen

`governance` bloquea un commit que toca reglas, ADRs o contratos de cargo, y en el mensaje ofrece la
salida:

> `Usa OPS_GOVERNANCE_OVERRIDE=1 solo con aprobación, en el entorno del guard: escrita delante del
> comando no llega hasta acá.`

La aclaración es correcta y es nueva —la trajo [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md)—.
Pero deja al lector en un punto muerto: sabe dónde **no** va la variable y no tiene dónde leer dónde
sí. No está documentada en ningún archivo que alguien vaya a abrir.

Y hay un problema debajo del de documentación: las vías que quedan son de **sesión**, no de comando. Un
permiso pensado para un commit se toma para todos los que sigan.

## Reproducción

Un commit que toca gobernanza, y después buscar cómo autorizarlo:

```bash
git add planning/rules/system/conduct.md
git commit -m "…"        # BLOQUEADO, con el mensaje de arriba

# Ahora buscar la salida, en todo lo que el proyecto instala y en el repo del toolkit:
grep -rn OPS_GOVERNANCE_OVERRIDE ops/ --include='*.md'          # nada
grep -rn OPS_GOVERNANCE_OVERRIDE node_modules/@ingeniomaps/cauce --include='*.md'
#   → sólo CHANGELOG.md
```

*Verificado* el 2026-09-06 sobre 0.63.0. Las únicas menciones en todo el paquete y en el repositorio
son: el mensaje del propio guard, `engine/hooks/shell.js`, un comentario en `engine/hooks/input.js`,
dos entradas del `CHANGELOG.md` y transcripciones de evaluaciones de cargos —que son registro de lo que
pasó un día, no documentación—.

No aparece en `AGENTS.md`, ni en `PROTOCOL.md`, ni en ninguna regla de `planning/rules/system/`, ni en
`README.md`, ni en `docs/`.

**Y no es sólo el de gobernanza.** Contados los cinco overrides del motor, la documentación del molde y
del repositorio menciona **cero**:

| variable | documentada | la ofrece un mensaje de bloqueo |
|---|---|---|
| `OPS_GOVERNANCE_OVERRIDE` | no | sí |
| `OPS_MIGRATIONS_OVERRIDE` | no | sí |
| `OPS_TEST_EVIDENCE_OVERRIDE` | no | sí |
| `OPS_DEPENDENCIES_OVERRIDE` | no | no |
| `OPS_SKIP_VERIFY` | no | no |

Los tres primeros dejan al lector en el mismo punto muerto: el guard le nombra una llave y no hay dónde
leer dónde va. Arreglar sólo el de gobernanza deja el hueco abierto en los otros dos, con la misma forma
y por la misma razón.

## Causa raíz

El mecanismo nació en el código y nunca subió a la documentación. Hasta 0.62.0 eso no se notaba, y por
la peor de las razones: la forma que todo el mundo escribía —`OPS_GOVERNANCE_OVERRIDE=1 git commit`—
**parecía funcionar**. No leía el override: hacía que el guard no se ejecutara (caso 030). El resultado
visible era el mismo que el esperado, así que nadie fue a buscar la documentación que faltaba.

Al arreglar 030 el guard empezó a correr, y con eso quedó a la vista que la salida que ofrece no tiene
puerta.

El único texto que la menciona fuera del código es el `CHANGELOG.md`, y en dos lugares que no ayudan.
Una entrada vieja dice que tocar el propio cargo «pide `OPS_GOVERNANCE_OVERRIDE=1`» **sin decir dónde
se pone** —no muestra la forma inline, pero tampoco ninguna otra, y quien la lea va a escribir la que
tenía en la mano—. La otra es la entrada de 0.63.0, que sí muestra la forma inline, precisamente para
contar que no funcionaba.

## Fix propuesto

Dos cosas, y la segunda importa más que la primera.

**1. Documentarlo donde se busca, y los tres.** La sección de `AGENTS.md` que habla de qué se puede
editar y qué no es donde alguien llega cuando lo bloquean. Ahí va qué archivos cuentan como gobernanza,
qué significa la aprobación, y **cómo** se pone la variable en el entorno del guard para cada runner —
con las de migraciones y evidencia de pruebas al lado, que tienen el mismo punto muerto.

Que eso viva en `AGENTS.md` no repite el error del [023](023-r12-manda-las-excepciones-a-un-archivo-que-no-las-lee.md):
aquello era el proyecto escribiendo lo suyo en un archivo que `upgrade` reemplaza. Esto es documentación
del toolkit sobre su propio motor, que es exactamente lo que ese archivo mantiene.

**2. Darle un alcance de commit, no de sesión.** Es lo que hace falta decidir antes de escribir la
documentación, porque de eso depende qué se documenta. Un hook corre en el entorno del proceso del
runner, así que exportar la variable antes de lanzarlo —o dejarla en la configuración del runner— la
deja prendida para todo lo que venga después. Eso convierte «aprobado este commit» en «apagado el guard
hasta que cierre la sesión», que no es lo que el mensaje promete cuando dice *solo con aprobación*.

Una salida con el alcance correcto sería un archivo de aprobación de un solo uso —el guard lo lee, lo
consume y lo borra—, que además deja rastro de qué se autorizó y cuándo:

```
planning/.governance-approval    # contiene los archivos aprobados; el guard lo consume
```

Es más trabajo que documentar una variable, y es lo que separa una llave de una puerta abierta.

Lo que **no** conviene es volver a leer un prefijo del texto del comando: eso es exactamente lo que 030
acaba de cerrar, y un guard que se desactiva con algo que el propio comando declara no protege de nada.

## Tradeoffs

Documentar sin resolver el alcance es barato y deja el problema: quien lea la documentación va a
aprender a apagar el guard para toda la sesión, y a hacerlo la primera vez que lo bloquee.

Resolver el alcance con un archivo de aprobación agrega superficie —un archivo más, su limpieza, su
caso de borde cuando queda huérfano— a cambio de que la aprobación signifique lo que dice.

## Prioridad

**Media.** No hay riesgo silencioso: el guard bloquea y se ve. Pero deja sin salida practicable a quien
tiene un motivo legítimo, y la salida que va a encontrar por su cuenta —exportar la variable— es la más
amplia de todas. Un guard sin puerta se termina rodeando, y el rodeo que este enseña es el peor.

## Contexto de descubrimiento

En `gouduet`, el 2026-09-06, validando que 0.63.0 cerrara los cuatro casos anteriores. El arreglo de
030 funciona —el guard corre y bloquea—, y al leer el mensaje nuevo apareció la pregunta de dónde se
pone entonces la variable. La respuesta no está escrita en ninguna parte.

Los commits de gobernanza de esa sesión no la necesitaron, así que esto no bloqueó trabajo: se vio
leyendo el mensaje, no chocando con él.

## Relacionados

- [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) — su arreglo es lo que
  dejó este hueco a la vista. No es una regresión: el hueco estaba desde que existe el override, tapado
  por el defecto que 030 corrigió.
- [024](024-los-cuatro-limites-son-seis-y-uno-es-configurable.md) — el mismo género: un mecanismo del
  motor que la documentación del proyecto no reflejaba, y un lector que concluía mal por eso.
