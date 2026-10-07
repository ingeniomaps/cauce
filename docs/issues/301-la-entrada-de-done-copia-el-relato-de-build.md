---
caso: 301
titulo: la entrada de done copia el relato de build
estado: resuelto
resuelto-en: 0.103.5
prioridad: alta
version-detectada: 0.103.4
---

# 301 — Desde 0.103.4 la entrada de `done/` dice «sin commit ni push» al lado de su commit

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **alta**.

**Prioridad alta**: es una regresión publicada, sobre el registro que después se audita. La tarea se entrega
bien y la entrada pasa `ops check`; lo que queda mal es lo que alguien lee meses después.

## Resumen

0.103.4 pasó la escritura de `done/` a un agente que no carga las instrucciones del proyecto (caso 295). El
prompt le da los hechos de la corrida y le pide copiarlos. El agente anterior no los copiaba: los acomodaba
por su cuenta, y nada en el prompt lo pedía. Al cambiar de agente esa conducta se fue sin que nadie la
hubiera nombrado.

## Reproducción

La misma tarea `lite`, en dos bancos sidecar instalados desde npm: uno con 0.103.3 y otro con 0.103.4.

## Síntoma

El campo `done:` de las dos entradas:

```
0.103.3  nuevos `app/src/resta.js` (…) y `app/test/resta.test.js` (…); ningún archivo existente modificado.
         Verificado con node v24.18.0: RED `node --test` desde app/ exit 1 …
0.103.4  resta-dos-numeros construida en app (fase Build; sin commit, sin push ni PR, como se pidió).
         Archivos nuevos (…): /tmp/…/ws/app/src/resta.js — …
```

| | 0.103.3 | 0.103.4 |
|---|---|---|
| `done:`, caracteres | 1.021 | 2.911 |
| rutas absolutas en `done:` | 0 | 3 |
| rutas absolutas en `qa:` | 0 | 1 |

En la instancia real que lo reportó la entrada decía «Build … terminado en <ruta de la máquina>, sin commit ni
push» con el commit en el campo de abajo, y en `decisions` seguía «la fase de commit tiene que decidir si
corta rama», que ya estaba resuelto.

Las rutas absolutas de `review:` están en las dos versiones: ese campo va textual a propósito.

## Causa raíz

`automatization/workflows/autobuild.js`, el prompt de `done`: pasa `build=${buildFact}` y `qa=${qa.evidence}`,
que son lo que Build y QA escribieron con la tarea abierta, y sólo dice cómo tratar `lane` y `review`.

El caso 295 cambió quién escribe y comprobó lo que aparecía: que el archivo existiera, que tuviera sus campos
y que `ops check` pasara. No comparó el contenido contra una entrada del agente anterior. Era una quita —la
de lo que ese agente hacía solo— y R9 pide probarla al revés.

## Fix propuesto

- Que quien escribe la entrada vuelva a tener a la vista las instrucciones y las reglas del proyecto.
- Que el prompt diga cómo se escriben `done` y `qa`: lo entregado, sin lo que contaba el momento de Build.
- Rutas relativas al servicio en los campos que no van textuales.
- Mirar si los otros dos archivos que escribe ese agente —el WIP y la compuerta del hito— perdieron algo.

## Tradeoffs

- Cargar las instrucciones cuesta: el agente de escritura pasa de arrancar en unos 10.000 a 14.000 tokens a
  unos 42.000 a 49.000. Sigue por debajo de los 73.000 a 96.000 del agente de siempre.
- Decir en el prompt cómo va `done` es dictar una redacción. Si una regla del proyecto pide otra, gana la regla:
  el agente la tiene cargada y su propio contrato lo dice.

## Contexto de descubrimiento

La primera corrida de 0.103.4 en una instancia real, pedida para mirar justo esa entrada.

## Relacionados

- 295 — el cambio que lo introdujo.
- 211 — `lane` y `review` textuales.
- 277 — rutas de la máquina en `done/`.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **Las instrucciones del proyecto, de vuelta — se hizo.** `cauce-scribe` ya no lleva `omitClaudeMd`: carga
  lo mismo que el agente de siempre, con menos herramientas. Es lo que arregla la clase entera y no sólo este
  campo: lo que la empresa escribió rige porque está cargado, sin que el recorrido tenga que nombrarlo.
- **Cómo se escriben `done` y `qa` — se hizo.** El prompt lo dice, y dice qué sacar: que no había commit, en
  qué fase estaba, qué pasos del WIP tildó, qué no tocó.
- **Rutas relativas — se hizo**, para `done`, `qa`, `tests` y `decisions`.
- **El WIP y la compuerta — se miró**, comparando 0.103.3 con 0.103.4. El WIP mide lo mismo. La compuerta trae
  las mismas secciones y ninguna ruta absoluta; la de 0.103.3 sumaba acciones que el agente deducía, como
  decidir el merge de la rama. No se cambió nada ahí.
- **Tradeoffs — se pagan los dos.**

### Lo que este caso encontró y no preveía

**La entrada se commiteaba sin validar.** En una corrida del arreglo el agente escribió las trazas de `tests`
como «A (condición) → prueba». `ops check` salió en rojo recién en `closing`, que lo reparó con la entrada ya
commiteada y dejó un cambio suelto. Ahora el prompt da la forma de la traza y pide correr `check` antes de
terminar.

**El primer arreglo era un parche.** Corrigió el campo desde el prompt y dejó al agente sin las reglas. El
dueño lo objetó sobre el caso 302 —«todo lo de la empresa debe ganar»—, y vale igual acá: un agente que
redacta sin las reglas del proyecto cumple sólo las que alguien se acordó de copiarle.

### Qué se corrió

- **La misma tarea en cuatro motores**, para leer el campo `done:` lado a lado:

  | | 0.103.3 | 0.103.4 | sólo el prompt | prompt y reglas cargadas |
  |---|---|---|---|---|
  | caracteres | 1.021 | 2.911 | 1.442 y 1.832 | 959 |
  | rutas absolutas en `done:` y `qa:` | 0 | 4 | 0 y 0 | 0 |
  | arranca con | los archivos entregados | «construida en app (fase Build; sin commit…» | «Dos archivos nuevos…» | «Dos archivos nuevos…» |

- **`ops check`** válido en la corrida final, y `closing` sin nada que reparar: dos llamadas.
- **Lo que cuesta ahora**, tokens escritos a caché por paso, contando cada mensaje una vez:

  | Paso | 0.103.3 | 0.103.4 | 0.103.5 |
  |---|---|---|---|
  | `wip` | 86.675 a 101.604 | 14.740 a 15.616 | 45.488 y 47.724 |
  | `done` | 84.726 a 110.385 | 28.442 a 44.138 | 64.664 |
  | compuerta del hito | 76.876 | 17.006 a 26.189 | 55.249 |

  La mitad de lo que 0.103.4 ahorraba en estos pasos se devuelve.
- **Tres mutaciones en rojo, en una copia**: el prompt sin decir cómo van `done` y `qa`, sin pedir rutas
  relativas, y sin validarse. Y una más sobre el agente: con `omitClaudeMd` de vuelta, falla la prueba de
  instalación.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real con este arreglo. Es donde se vio el defecto, y lo confirma ella.
