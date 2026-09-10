---
caso: 073
titulo: El borrado del banco deja objetos de git y el manifiesto, y `rmSync` vuelve sin lanzar
estado: resuelto
resuelto-en: 0.75.0
prioridad: media
version-detectada: 0.75.0
---

# 073 — Por primera vez sabemos qué sobrevive

**🟢 resuelto en 0.75.0** · detectado en 0.75.0 · prioridad **media** — la guarda instrumentada nombró al
escritor en su primer disparo: `git maintenance`, que `git commit` deja corriendo detrás

## Resumen

`evaluate --bench --force` borra el banco entero antes de rehacerlo. A veces `fs.rmSync` vuelve **sin
lanzar** y quedan archivos. Eso se sabía desde hacía semanas y se había rodeado tres veces —reintentos en
el borrado, `force` en el andamiaje, un `rm` antes del enlace—; el [066](066-el-banco-que-no-se-rehace-falla-mudo.md)
puso una guarda que corta la corrida **nombrando lo que sobrevivió**, y declaró que la próxima falla en
CI iba a traer con qué diagnosticar.

Ocurrió el 2026-09-10 en `ci (current)` de un PR que no tocaba nada de esto —y **dos veces, no una**:
ver «Medición del 2026-09-10»—:

```
.cauce-eval/product-manager/09-proteccion no se pudo borrar entero y el banco tiene que ser nuevo.
Sobrevivieron al borrado: .cauce/manifest.json,
  .git/objects/01/3e17d45912f4d1dbe939e696b90a2a4b221417,
  .git/objects/08/76cf69d55d0ac92708145ae3afb6dc3cb57659,
  .git/objects/0e/a6bb27a92d78cbebbc904bb445311c7ceaa077,
  .git/objects/40/e27686a2053310898e43cbcec38c48ad73e594.
```

~~**Los sobrevivientes no son cualquier cosa**: son exactamente lo que produce la creación del banco —
`IN.scaffold` escribe `.cauce/manifest.json`, y `git init` + `git add --all` escriben los objetos.~~

**Eso no se puede leer de ahí**, y es el primer error de este caso: el listado **cortaba en cinco**. Con
el corte, «borró casi todo y quedaron cuatro objetos» y «no borró nada» se ven idénticos, y son problemas
opuestos. Que las dos corridas empiecen su listado en directorios de objetos distintos —`81/` una, `08/`
la otra— dice que lo que cambia es el orden de `readdir`, no el subconjunto que sobrevivió.

## Reproducción

**No se logró**, ni en el primer intento ni en el segundo. Los dos están abajo porque midieron cosas
distintas y el primero midió la pata equivocada.

- Seis corridas seguidas de los **seis archivos de prueba que tocan `.cauce-eval`**, juntos y en
  paralelo, sobre esta máquina: cero fallos, cero borrados incompletos.
- La contención sola, en este entorno, no alcanza.
- **Y eso corrió con Node 24, que es la pata que nunca falló.** Ver la medición de abajo: las dos veces
  que la guarda disparó fue bajo Node 26.8.2. Repetido con esa versión —doce corridas de la suite
  entera, seis con `node --test` pelado y seis con la invocación exacta de CI, cobertura incluida—:
  cero. La versión sola tampoco alcanza.

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

~~La hipótesis que queda en pie —y **es hipótesis**, no se comprobó— es una carrera: el borrado completa,
y entre que completa y que se lo comprueba, otro proceso vuelve a escribir ahí. Encaja con que los
sobrevivientes sean lo que escribe la creación de un banco y no restos arbitrarios. Lo que no encaja
todavía es quién lo escribe, porque dentro de un mismo archivo de prueba las pruebas corren en serie.~~

**Esa hipótesis no tiene por dónde ser cierta, y se cierra con dos hechos:**

- **La ruta que falla tiene un solo escritor en todo el repositorio.**
  `.cauce-eval/product-manager/09-proteccion` la escribe una única prueba —`bench.test.js:118`, `:121` y
  `:127`, tres invocaciones seriales dentro de la misma función— y las dos fallas cayeron en la tercera.
  Los seis archivos que comparten `.cauce-eval` usan cada uno su propio caso: el paralelismo que este
  caso midió es real y **no toca esta ruta**.
- **Y el único proceso de fondo que el propio banco podría dejar no corre.** `git commit` sí lanza
  `git maintenance run --auto` —verificado con `GIT_TRACE=1`, git 2.43.0—, y ése es el que se detacha y
  escribiría en `.git/objects`. Pero un banco recién creado tiene **107 objetos sueltos** contra un
  umbral `gc.auto` de **6700**: no hay trabajo, no hay detach, no hay escritor.

Lo que sí apareció, y es lo único que las dos fallas tienen en común, es la **versión de Node**.

## Medición del 2026-09-10

Cuatro cosas, todas contra los logs de CI y el motor real, y ninguna costó una corrida nueva.

**1. No disparó una vez: disparó dos, y siempre bajo la misma versión de Node.** Barridos los quince
últimos CI en rojo, buscando el mensaje de la guarda y los síntomas viejos:

| corrida | pata | Node | qué apareció |
|---|---|---|---|
| 34478170425 | `ci (current)` | **26.8.2** | la guarda |
| 34433767727 | `ci (current)` | **26.8.2** | la guarda |
| 34263930218 | `ci (24)` | 24.20.0 | `EEXIST` (síntoma viejo) |
| 34074751559 | `ci (current)` | 26.8.2 | `EEXIST` (síntoma viejo) |
| 33808678183 | `ci (24)` | 24.20.0 | `ENOTEMPTY` (síntoma viejo) |
| las otras diez | las dos | — | nada de esto |

La matriz declara `node: ["24", current]`, y `current` resuelve hoy a **26.8.2**. Las dos veces que el
borrado volvió **sin lanzar y sin borrar** fue ahí. Los síntomas viejos —que sí lanzaban— aparecen en las
dos patas, o sea que no son el mismo fenómeno.

**2. La reproducción anterior corrió con Node 24**, la pata que nunca falló. Rehecha con 26.8.2: seis
corridas de la suite entera con `node --test` y seis más con la invocación exacta de CI —cobertura, los
dos reporters, el mismo glob—. **Cero.** La versión sola no alcanza, así que no es «Node 26 borra mal»
sino algo que sólo se da allá.

**3. La ruta que falla tiene un solo escritor**, y eso mata la hipótesis de la carrera entre archivos de
prueba. Está en «Causa raíz».

**4. El banco tiene 215 archivos en 123 directorios**, y 107 objetos sueltos en git. El primero es la
calibración que faltaba: la próxima vez que la guarda hable, «sobrevivieron 4» y «sobrevivieron 210» son
diagnósticos opuestos y ahora se distinguen. El segundo cierra lo del `gc`.

## Fix propuesto

Ninguno, y es deliberado: **el próximo paso es diagnosticar, no arreglar.** Rodearlo una cuarta vez es
lo que este caso existe para no repetir.

**Lo que se hizo, que es instrumentar la guarda para que la próxima vez alcance.** El listado cortado en
cinco era el techo del diagnóstico; ahora el mensaje trae, y cada cosa separa dos diagnósticos distintos:

- **Cuántos archivos y directorios quedaron**, no una muestra. Contra los 215/123 de un banco entero, el
  número dice solo si `rmSync` borró casi todo o no borró nada.
- **Si cada sobreviviente es anterior al borrado o se escribió durante**, comparando su fecha de
  modificación contra el instante en que arrancó el `rmSync`. **Ésta es la pregunta central del caso**:
  posterior significa que alguien reescribió mientras borrábamos; anterior, que el borrado no lo tocó.
- **Qué hace un segundo borrado.** No lo rodea —la corrida se corta igual— y distingue lo transitorio de
  lo permanente, que se arreglan distinto.
- **La versión de Node**, que es la única correlación que las dos fallas tienen.

Y la guarda **por fin tiene prueba**. No la tenía: el caso que parecía cubrirla —«un banco que no se
puede rehacer lo dice»— quita permiso de escritura, y entonces `rmSync` lanza y el CLI muere antes de
llegar a la guarda. Se prueba la función que arma el mensaje, que es lo que se puede medir sin saber
provocar el fallo.

~~Lo que haría falta para establecer la causa, de más barato a menos:~~ **Las tres vías que este caso
proponía, revisadas con lo de arriba:**

- ~~**Que la guarda diga también quién más estaba corriendo**: el nombre del archivo de prueba y el
  `pid`.~~ **No sirve para esto**: no hay otro escritor de esa ruta a quien nombrar. Lo que sí hacía
  falta era fechar los sobrevivientes, que es lo que se puso.
- ~~**Dar a cada archivo de prueba su propia raíz de bancos.**~~ **Contesta una pregunta ya contestada**:
  cada caso ya tiene su propia ruta, y ninguna la comparte. Además escondería el defecto en vez de
  arreglarlo, como el propio caso anotaba en sus tradeoffs.
- **Correr la suite con concurrencia 1** en una tanda larga sigue en pie **como experimento en CI**, no
  acá: acá no falla ni con concurrencia máxima. Cuesta corridas de CI y por eso va después de la
  instrumentación, que es gratis y puede contestar en la primera repetición.

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
que traería — con un techo que ese caso no había previsto, el corte en cinco.

## Qué lo cierra

Una repetición más de la guarda, ya instrumentada. El mensaje va a decir si el árbol entero sobrevivió o
sólo un puñado, si lo que quedó es de antes del borrado o de durante, y si un segundo intento lo saca.
Con eso la causa queda establecida o descartada, y recién entonces corresponde arreglar.

## Relacionados

- [066](066-el-banco-que-no-se-rehace-falla-mudo.md) — puso la guarda que produjo esta evidencia y
  declaró que la próxima falla iba a permitir diagnosticar. Se cumplió; esto es su continuación.

## Cierre

**Resuelto en 0.75.0**, y la causa quedó establecida el mismo día por el camino que este caso eligió:
instrumentar en vez de rodear. La guarda mejorada disparó **una sola vez** después de instrumentada y con
eso alcanzó.

### Quién escribía

```
Sobrevivieron 90 archivo(s) en 27 directorio(s), con Node v24.20.0:
  .cauce/manifest.json                  (anterior al borrado)
  .git/info/refs                        (escrito durante el borrado)
  .git/objects/info/packs               (escrito durante el borrado)
  .git/objects/maintenance.lock         (ya no está)
  .git/objects/pack/multi-pack-index    (anterior al borrado)
un segundo borrado sí lo sacó.
```

**`maintenance.lock`**, y dos archivos fechados **durante** el borrado, en un árbol que ninguna otra
prueba toca. Eso es `git maintenance` escribiendo mientras `rmSync` borraba. `git commit` lo lanza
—`run_command: git maintenance run --auto`, verificado con `GIT_TRACE=1` sobre git 2.43.0—, se detacha, y
sigue vivo después de que el comando volvió. El banco se rehace milisegundos más tarde, y ahí está la
carrera.

Encaja con todo lo que se venía rodeando: `ENOTEMPTY` al rehacer un banco recién creado, `EEXIST` sobre
el enlace, y el borrado que vuelve sin lanzar. **Son tres caras del mismo escritor**, y por eso cada
rodeo tapaba una y dejaba las otras.

### El arreglo

`maintenance.auto=false` en la configuración del banco, antes del commit. **No `gc.auto=0`**: medido con
`GIT_TRACE=1`, ése deja que el commit lance el mantenimiento igual —sólo hace que su tarea de `gc` no
encuentre trabajo— y el proceso toma su lock y escribe lo mismo. Se le quita el motivo de lanzarlo, no lo
que hace una vez lanzado. Es la misma forma que el [070](070-el-ci-true-de-la-copia-deja-que-pnpm-reescriba-el-node-modules-real.md).

### El recorrido de lo que este caso enumeró

- **«Que la guarda diga también quién más estaba corriendo» — se hizo distinto y funcionó.** No se puso
  el `pid` de otro proceso: se puso la fecha de cada sobreviviente contra el instante del borrado, y fue
  eso —dos archivos «escritos durante»— lo que nombró al escritor. El `pid` no habría servido: el proceso
  no es un archivo de prueba, es un hijo de git que nadie lista.
- **«Dar a cada archivo de prueba su propia raíz de bancos» — no se hizo, y habría dado la respuesta
  equivocada.** Cada caso ya tiene su ruta propia; el escritor vivía adentro de esa ruta.
- **«Correr la suite con concurrencia 1» — no se hizo y ya no corresponde.** Habría salido en verde y
  habría hecho concluir que el paralelismo entre archivos era la causa, que no lo es: la carrera es entre
  dos invocaciones **seriales** del mismo comando, con un proceso de fondo en el medio.
- **Tradeoff «diagnosticar cuesta corridas de CI y el fallo es intermitente» — se pagó una corrida**, la
  primera después de instrumentar.
- **Tradeoff «dar raíz propia puede esconder el defecto» — no se pagó**, porque no se tomó esa vía.
- **Los tres rodeos anteriores se quedan, y se dice por qué.** Los reintentos del `rmSync`, el `force` del
  andamiaje y el `rm` antes del enlace ya no tapan esta causa —está apagada— pero cubren a cualquier otro
  escritor transitorio. Sacarlos es una decisión aparte; lo que la activaría es que dejen de disparar
  durante varias versiones. **Esa espera y el desconocido que la sostiene salen como el
  [078](078-por-que-rmsync-vuelve-sin-lanzar-sigue-sin-establecerse.md)**: dicho sólo acá, adentro de un
  caso cerrado, era la forma en que R15 dice que una dimensión se pierde.

### Dos afirmaciones mías que este disparo desmiente

- **«Las dos veces fue bajo Node 26.8.2» ya no es una correlación: esta tercera fue bajo Node 24.20.0.**
  Eran dos muestras y las dos cayeron del mismo lado; con la tercera, la versión no distingue nada.
- **«El `gc` no corre: 107 objetos sueltos contra un umbral de 6700» era un razonamiento equivocado**, no
  un dato equivocado. Los dos números son correctos y la conclusión no se sigue: `git commit` lanza
  `git maintenance run --auto` **sin mirar ese umbral**, y el proceso toma su lock y escribe aunque su
  tarea de `gc` termine sin hacer nada. Yo di por cerrada la hipótesis correcta con un número que no la
  cerraba.

### Qué se corrió

- **La guarda instrumentada, en CI**: un disparo, y es la evidencia de arriba.
- **`GIT_TRACE=1` sobre git 2.43.0**, tres repos de sonda: por defecto el commit lanza **1** mantenimiento;
  con `maintenance.auto=false`, **0**; con `gc.auto=0`, **1** — que es lo que descarta esa vía.
- **La carrera, reproducida localmente**: con un escritor concurrente sincronizado contra el borrado,
  `rmSync` falla en **17 de 20** vueltas bajo Node 24 y **19 de 20** bajo Node 26. Reproduce la cara
  ruidosa —`ENOTEMPTY`, que es literalmente el síntoma que los reintentos vinieron a tapar— y **no** la
  silenciosa, así que el modo exacto en que `rmSync` vuelve sin lanzar bajo esta carrera **sigue sin
  establecerse**. No hace falta para el arreglo —lo que se quita es el escritor— y sí para decidir sobre
  los rodeos, así que vive en el [078](078-por-que-rmsync-vuelve-sin-lanzar-sigue-sin-establecerse.md).
- **La prueba de ausencia**: un commit dentro del banco creado no lanza ningún mantenimiento. Dos
  mutaciones, las dos en rojo: sacar la línea —la regresión exacta— y cambiarla por `gc.auto=0`.
- **La puerta entera**: 643 pruebas, 0 fallos.
