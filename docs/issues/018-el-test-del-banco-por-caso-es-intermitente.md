---
caso: 018
titulo: el test "cada caso recibe su propio banco" falla a veces y su salida no dice por qué
estado: abierto
prioridad: media
version-detectada: 0.60.0
resuelto-en:
---

# 018 — Un test de bancos falla a veces y no deja ver la causa

**🔴 abierto** · detectado en 0.60.0 · prioridad **media** — la puerta se pone roja sin explicar nada

## Resumen

`cada caso recibe su propio banco` (`test/agents/bench.test.js:109`) falló una vez en CI y pasó al
re-correr **el mismo árbol**. Dos problemas distintos, y el segundo es el que importa:

1. Es intermitente: la misma corrida, con el mismo commit y el mismo Node, da resultados distintos.
2. **Cuando falla no dice por qué.** La aserción de la línea 125 no lleva el `stderr` del comando, así
   que el log de CI muestra `1 !== 0` y nada más. Las dos aserciones equivalentes de las líneas 114 y
   115 sí lo llevan.

Lo segundo es lo caro: sin la causa, la única manera de saber si un rojo es intermitencia o regresión es
descartar hipótesis a mano, y eso cuesta media hora cada vez que pasa.

## Reproducción

No reproduce a pedido. Lo que se puede reproducir es la ceguera:

```bash
# quitarle el exit 0 al comando y mirar qué dice el fallo
node --test test/agents/bench.test.js
# AssertionError: Expected values to be strictly equal: 1 !== 0
#   at test/agents/bench.test.js:125
```

Y la intermitencia se observó así:

```bash
gh run view 33802758197 --log-failed   # ✖ cada caso recibe su propio banco
gh run rerun 33802758197 --failed      # mismo árbol
gh run view 33802758197                # completed success
```

## Síntoma

```text
✖ cada caso recibe su propio banco (441.14583ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  1 !== 0

      at TestContext.<anonymous> (test/agents/bench.test.js:125:10)
    actual: 1,
```

El log completo de esa corrida no tiene una sola línea más sobre el banco: el `stderr` del comando que
salió 1 no se imprime en ningún lado.

## Causa raíz

Dos, una por problema.

**La ceguera** es la aserción, `test/agents/bench.test.js:125`:

```js
assert.equal(run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit).status, 0)
```

Sin tercer argumento. Las de las líneas 114-115 del mismo test sí lo pasan —`primero.stderr`,
`segundo.stderr`—, así que la diferencia es un descuido y no una decisión.

**La intermitencia** no está establecida. Lo que se descartó, con evidencia:

| Hipótesis | Cómo se descartó |
|---|---|
| Regresión del código | El mismo árbol pasó al re-correr |
| El bump a 0.60.0 | Reproducido local con `package.json` en 0.60.0: verde |
| Versión de Node distinta | Las dos corridas bajaron `v26.8.1`, leído en los dos logs |
| Flaky conocido | Único fallo de CI en las últimas 25 corridas |
| Carrera entre archivos de test | Sólo `bench.test.js` ejecuta bancos; `ops.test.js` sólo parsea argumentos |
| Flakiness local | Cinco corridas seguidas en verde |

Lo que queda como **hipótesis, no comprobado**: el archivo crea 15 bancos con `--bench`, y cada banco es
un `scaffold` completo del molde. Todos van a `.cauce-eval/` **dentro del repositorio**
(`engine/cli/catalog.js:88`), no a un directorio temporal como el resto de la suite. Un runner cargado
hace ese I/O más lento y más expuesto a lo que ocurra en paralelo en el mismo checkout.

Que el banco viva en el repo es deliberado —lo explica el comentario de `catalog.js:89`: recrear un
banco donde alguien trabajó borra la evidencia, y el registro de la evaluación se escribe desde ahí—.
Pero eso es un argumento sobre el banco de una corrida real, no sobre el de un test.

## Fix propuesto

1. **Que la aserción diga la causa**, que es lo único que no depende de entender la intermitencia:

   ```diff
   -assert.equal(run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit).status, 0)
   +const rehecho = run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit)
   +assert.equal(rehecho.status, 0, rehecho.stderr)
   ```

   Con eso, el próximo rojo trae la causa en el log y este caso se cierra o se convierte en otro.

2. **Recién después, decidir sobre el aislamiento.** Si el `stderr` muestra una colisión de directorio,
   el banco de los tests puede recibir su raíz por entorno y salir del repositorio. Si muestra otra
   cosa, esto no hacía falta.

El orden importa: aislar primero es arreglar a ciegas algo que todavía no se estableció.

## Tradeoffs

El punto 1 no tiene ninguno: es el tercer argumento que ya llevan las aserciones vecinas.

El punto 2 sí, y por eso no va todavía. Mover el banco fuera del repositorio lo aleja de cómo corre de
verdad —una evaluación real escribe en `.cauce-eval/` del toolkit— y un test que mide un mecanismo en un
lugar donde ese mecanismo no vive mide otra cosa.

## Contexto de descubrimiento

Publicando 0.60.0 el 2026-09-03. `ci (current)` falló en el PR de release con el árbol que había pasado
en verde dos minutos antes, en el PR del fix. Descartar las hipótesis de la tabla llevó más tiempo que
cualquiera de los tres arreglos que ese release publicaba, y todo ese tiempo se gastó por no tener una
línea de `stderr`.

## Resolución parcial

**El punto 1 entró en 0.60.1.** La aserción pasa el `stderr`, como sus dos vecinas:

```js
const rehecho = run(['evaluate', 'product-manager', '--bench', '11-otro', '--force'], toolkit)
assert.equal(rehecho.status, 0, rehecho.stderr)
```

Comprobado forzando el fallo del comando: antes el rojo decía `1 !== 0` y ahora encabeza con la causa
—`AssertionError: el banco no se pudo rehacer: motivo de prueba`—, que es lo que faltaba en el log de
la corrida que originó el caso.

**El caso queda abierto** porque su punto 2 no se resolvió, y no se puede resolver todavía: falta ver un
fallo real con su causa. Cuando ocurra, el `stderr` va a decir si hay que aislar el banco o si el
problema era otro. Hasta entonces, este caso está esperando evidencia, no trabajo.

## Relacionados

Ninguno.
