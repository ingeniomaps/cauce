---
caso: 073
titulo: El borrado del banco deja objetos de git y el manifiesto, y `rmSync` vuelve sin lanzar
estado: abierto
prioridad: media
version-detectada: 0.75.0
---

# 073 — Por primera vez sabemos qué sobrevive

**🔴 abierto** · detectado en 0.75.0 · prioridad **media** — la condición que el 066 declaró sin causa
acaba de ocurrir **con la evidencia puesta**

## Resumen

`evaluate --bench --force` borra el banco entero antes de rehacerlo. A veces `fs.rmSync` vuelve **sin
lanzar** y quedan archivos. Eso se sabía desde hacía semanas y se había rodeado tres veces —reintentos en
el borrado, `force` en el andamiaje, un `rm` antes del enlace—; el [066](066-el-banco-que-no-se-rehace-falla-mudo.md)
puso una guarda que corta la corrida **nombrando lo que sobrevivió**, y declaró que la próxima falla en
CI iba a traer con qué diagnosticar.

Ocurrió el 2026-09-10, en `ci (current)` de un PR que no tocaba nada de esto:

```
.cauce-eval/product-manager/09-proteccion no se pudo borrar entero y el banco tiene que ser nuevo.
Sobrevivieron al borrado: .cauce/manifest.json,
  .git/objects/01/3e17d45912f4d1dbe939e696b90a2a4b221417,
  .git/objects/08/76cf69d55d0ac92708145ae3afb6dc3cb57659,
  .git/objects/0e/a6bb27a92d78cbebbc904bb445311c7ceaa077,
  .git/objects/40/e27686a2053310898e43cbcec38c48ad73e594.
```

**Los sobrevivientes no son cualquier cosa**: son exactamente lo que produce la creación del banco —
`IN.scaffold` escribe `.cauce/manifest.json`, y `git init` + `git add --all` escriben los objetos.

## Reproducción

**No se logró.** Se intentó y eso también es un resultado:

- Seis corridas seguidas de los **seis archivos de prueba que tocan `.cauce-eval`**, juntos y en
  paralelo, sobre esta máquina: cero fallos, cero borrados incompletos.
- La contención sola, en este entorno, no alcanza.

Lo que sí quedó establecido es una precondición que nadie había mirado: **`node --test` corre los
archivos de prueba en paralelo**, medido con dos archivos que se anotan al empezar y al terminar
—`a inicio · b inicio · b fin · a fin`—, y **seis archivos del repositorio tocan `.cauce-eval`**:

```
test/agents/bench.test.js         test/agents/evaluations.test.js
test/flows/flows-eval.test.js     test/workflows/workflows-eval.test.js
test/instance/ops.test.js         test/instance/scan.test.js
```

## Síntoma

En CI, una de las pruebas del banco corta con el mensaje de arriba. Antes del 066 el mismo hecho salía
como `true !== false` sobre un archivo rastro, sin nombrar nada — que es por lo que tres investigaciones
lo dejaron en «no está establecido».

## Causa raíz

**No establecida todavía.** Lo que sí se puede descartar y afirmar:

- **No son permisos.** Medido sobre un banco recién creado: los directorios de `.git/objects` son
  `drwxrwxr-x` y los objetos sueltos `-r--r--r--`. Borrar un archivo pide permiso de escritura en su
  **directorio**, no en el archivo, así que el modo de sólo lectura de los objetos no lo explica.
- **No es que `rmSync` se rinda en silencio por sus reintentos.** Los agota y lanza; acá no lanzó.
- **Sí hay paralelismo**, y no estaba declarado en ningún lado. Seis archivos de prueba comparten el
  árbol `.cauce-eval` y corren a la vez.

La hipótesis que queda en pie —y **es hipótesis**, no se comprobó— es una carrera: el borrado completa,
y entre que completa y que se lo comprueba, otro proceso vuelve a escribir ahí. Encaja con que los
sobrevivientes sean lo que escribe la creación de un banco y no restos arbitrarios. Lo que no encaja
todavía es quién lo escribe, porque dentro de un mismo archivo de prueba las pruebas corren en serie.

## Fix propuesto

Ninguno, y es deliberado: **el próximo paso es diagnosticar, no arreglar.** Rodearlo una cuarta vez es
lo que este caso existe para no repetir.

Lo que haría falta para establecer la causa, de más barato a menos:

- **Que la guarda diga también quién más estaba corriendo**: el nombre del archivo de prueba y el `pid`,
  en el mismo mensaje. Si la carrera es entre archivos de prueba, eso la nombra en la primera repetición.
- **Dar a cada archivo de prueba su propia raíz de bancos** en vez de compartir `.cauce-eval`. Si el fallo
  desaparece, la causa era la carrera; si sigue, no lo era. Es un experimento con respuesta en las dos
  direcciones, que es lo que R20 pide.
- **Correr la suite con concurrencia 1** en una tanda larga, sólo para medir: si nunca falla, confirma;
  si falla igual, descarta el paralelismo entero.

## Tradeoffs

- **Diagnosticar cuesta corridas de CI y el fallo es intermitente.** No apareció en seis corridas locales
  con contención, así que medirlo pide o muchas corridas o el experimento de la raíz separada, que
  contesta sin esperar a que se repita.
- **Dar raíz propia a cada archivo de prueba puede esconder el defecto en vez de arreglarlo.** Si el
  paralelismo es la causa, el banco compartido seguiría roto para cualquier otro uso concurrente — el
  arreglo correcto sería que rehacer un banco tolere la concurrencia, no que la evitemos en las pruebas.

## Contexto de descubrimiento

Corriendo CI del PR de las reglas estrictas, que no toca ni el banco ni las pruebas del banco. Es la
primera vez que la guarda del 066 se dispara desde que existe, y trajo exactamente lo que ese caso dijo
que traería.

## Relacionados

- [066](066-el-banco-que-no-se-rehace-falla-mudo.md) — puso la guarda que produjo esta evidencia y
  declaró que la próxima falla iba a permitir diagnosticar. Se cumplió; esto es su continuación.
