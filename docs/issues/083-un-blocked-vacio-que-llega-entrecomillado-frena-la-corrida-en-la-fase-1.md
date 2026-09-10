---
caso: 083
titulo: Un `blocked` vacío que el agente re-emite como `""` es truthy y frena la corrida citando un archivo que no existe
estado: resuelto
prioridad: alta
version-detectada: 0.77.0
---

# 083 — La ausencia de bloqueo llega como la cadena `""`, y dos comillas alcanzan para parar el recorrido

**🟢 resuelto en 0.78.0** · detectado en 0.77.0 · prioridad **alta** — intermitente (3 de 24 lecturas medidas), corta en la primera fase, y el motivo que da apunta a un archivo que no está

## Resumen

`ops context --json` emite `"blocked": ""` cuando no hay gate. El agente que lo lee lo re-emite dentro
de su esquema, y **a veces lo entrega como la cadena de dos caracteres `""`** en vez de la cadena vacía:

```json
{"blocked": "\"\"", "hasTask": true, "queued": 2, "slug": "dashboard-migrations-explicit", …}
```

Dos comillas literales. En JavaScript eso es **truthy**, así que cualquier comprobación de la forma
`if (blocked)` concluye que hay un bloqueo. El recorrido para en la fase 1 con:

```
{"stopped":true,"reason":"awaiting-human-review",
 "detail":"venotal-ops/planning/AWAITING_REVIEW.md tiene un checkpoint humano sin resolver"}
```

**Ese archivo no existe.** El gate es real —lo pide el protocolo— pero no se disparó por su causa: se
disparó por el valor mal serializado del campo que dice si hay causa.

## Reproducción

No es determinista y por eso se mide en vez de reproducirse a mano. Contando sobre los journals de siete
corridas de una instancia real:

```
$ grep -ho '"blocked":"[^,]*' wf_*/journal.jsonl | sort | uniq -c
     21 "blocked":""
      3 "blocked":"\"\""
```

**21 correctas, 3 corruptas** — alrededor del 12 %. El CLI, en cambio, es consistente:

```
$ node tools/ops.js context planning --json | jq -r '.blocked | @json'
""
$ … | python -c "…; print(len(d['blocked']))"
0
```

## Síntoma

Tres capas de daño, en orden creciente:

1. **La corrida se detiene sin haber hecho nada.** 2 agentes, 142 k tokens, 71 segundos.
2. **El motivo es falso y verificable como falso**: nombra un archivo que no existe. Quien lo lea va a
   buscar un checkpoint que nadie escribió.
3. **Y es intermitente**, así que relanzar «funciona» ~7 de cada 8 veces. Eso es lo peor para
   diagnosticar: el que lo sufre concluye que fue un hipo y sigue, y el defecto queda.

Vale notar que el campo venía corrupto **también en corridas que no se detuvieron** — aparece en los
journals de corridas anteriores que siguieron de largo. O sea que la comprobación que lo consume cambió
o no siempre corre, y el valor malo estaba desde antes esperando a que alguien lo mirara.

## Causa raíz

El recorrido no lee la salida del CLI: se la pide a un agente, que la devuelve conformada a un esquema
donde `blocked` es `{ type: 'string' }`. Un modelo que rellena un campo de texto con «el valor vacío»
puede escribir la cadena vacía o **escribir las comillas**, y las dos satisfacen el esquema.

El consumidor confía. `''` y `'""'` son indistinguibles para el esquema y opuestos para una condición.

Es la misma familia que el caso 056 y el 074 —no distinguir ausencia de contenido— con el eje corrido:
allá el problema era leer un directorio inexistente, acá es que **la ausencia viaje intacta** por una
frontera donde un modelo la transcribe.

## Fix propuesto

Dos capas, la primera basta para cerrar el caso:

```diff
+ Al recibir el contexto, normalizar `blocked`: recortar espacios y comillas envolventes.
+ `''`, `'""'` y `"''"` significan lo mismo, y sólo uno de los tres lo dice bien.
```

Y la de fondo, que cierra la clase:

```diff
- blocked: { type: 'string' }
+ blocked: { type: ['string', 'null'] }   // null explícito para «no hay»
+ o bien un booleano `hasBlocker` junto al texto, que es lo que la condición pregunta.
```

Un campo cuya ausencia se codifica como «texto vacío» le pide a quien lo rellena que acierte una
convención invisible. Un `null` o un booleano no tienen esa ambigüedad.

Y en el gate concreto: **antes de parar por `AWAITING_REVIEW.md`, comprobar que el archivo exista.** Es
una línea y convierte un motivo falso en ninguno.

## Tradeoffs

- Normalizar comillas puede recortar un bloqueo legítimo cuyo texto empiece y termine con comillas. Es
  improbable y se evita recortando sólo cuando lo que queda es vacío.
- Cambiar el esquema toca todas las fases que leen el contexto. Por eso la normalización va primero: es
  local y no rompe nada.

## Contexto de descubrimiento

Instancia real (sidecar, 0.77.0), 2026-09-10, en una **medición controlada** del recorrido pedida por el
operador: una sola tarea, para ver si cierra y a qué costo, después de que 0.77.0 cerrara el caso 081.

Es la segunda medición seguida que un defecto distinto impide contestar. La anterior la frenó el 074
—`claim` mintiendo sobre el BACKLOG—; ésta, dos comillas. En las dos, el freno funcionó como debía y el
recorrido paró barato; lo que no se pudo medir es si construye y cierra.

## Relacionados

- **056 y 074** — la misma familia: un estado que no se pudo determinar se presenta como un hecho.
- **081** — su arreglo es lo que hizo esta corrida posible; el que la frenó fue otro.
- **OPS-001** — `planning/` es la fuente de verdad. Un gate que se dispara sin que exista el archivo que
  lo declara está inventando estado que la fuente no tiene.

## Cierre

**🟢 resuelto en 0.78.0** · `automatization/workflows/autobuild.js`, `test/workflows/autobuild.test.js`

Recorrido de lo que el caso enumeró, ítem por ítem.

### Lo que el caso pedía

**«Normalizar `blocked`: recortar espacios y comillas envolventes»** — hecho, y de a pares en vez de con
un regex: se desenvuelve mientras la primera y la última comilla sean la misma. Es lo correcto —una
comilla suelta no es un envoltorio— y además esquiva el caso **084**, que salió de acá.

**«`type: ['string', 'null']` o un booleano `hasBlocker`»** — se hizo distinto, con razón. Los dos
pierden la causa: el consumidor necesita saber **cuál** de los dos bloqueos es, porque cada uno manda a
un archivo distinto. Lo que se puso es un `enum` con el vocabulario que el motor efectivamente emite
—`engine/cli/planning.js:346` decide entre `''`, `awaiting-review` y `blocked-on-human`—, igual que su
hermano `lane`, que ya lo tenía.

Y el `enum` **no es la defensa**: no se pudo comprobar acá si el runtime rechaza una respuesta que lo
viola —eso exigiría correr el recorrido contra el runtime real, no el arnés—, así que lo que sostiene el
arreglo es la lectura por valor, que sí está probada. El `enum` documenta el contrato; no lo cierra.

**«Antes de parar por `AWAITING_REVIEW.md`, comprobar que el archivo exista»** — se decidió que no, y no
por costo: **el recorrido no puede**. Un workflow no tiene acceso al sistema de archivos; todo lo que
sabe se lo cuenta un agente. Comprobar la existencia significaría una llamada más a un agente para
preguntar por un archivo, que es exactamente la frontera donde el valor se corrompió. La comprobación
tiene sentido, pero del lado del motor —`ops context` ya la hace con `existsSync`—, y ahí ya está.

### Lo que los tradeoffs anticipaban

**«Recortar comillas puede recortar un bloqueo legítimo… se evita recortando sólo cuando lo que queda es
vacío»** — no hizo falta esa restricción, y el motivo es mejor: el campo es un vocabulario cerrado, así
que lo que queda después de desenvolver o está en él o para como desconocido. Un bloqueo legítimo
entrecomillado no existe.

**«Cambiar el esquema toca todas las fases que leen el contexto»** — medido, y no: de las 24 lecturas de
contexto de siete corridas reales, **`blocked` lo consulta una sola fase**, Triage, y una sola vez por
corrida. El resto de las lecturas lo trae y nadie lo mira.

### La línea que el caso dejó abierta

El caso observaba que el campo venía corrupto **también en corridas que no se detuvieron**, y concluía
que «la comprobación que lo consume cambió o no siempre corre». Se recorrió, y las dos hipótesis son
falsas. Contando sobre los journals de las siete corridas de la instancia:

```
lecturas de contexto: 24 · corruptas: 3
primeras lecturas (la única que consulta blocked): 7 · corruptas: 1
```

Las tres corruptas están en `wf_3384aad9-361` (línea 9 del journal), `wf_e11ded79-602` (línea 51) y
`wf_e16b60dd-958` (línea 5). **Sólo la última cayó en la primera lectura**, que es la que Triage
consume; las otras dos cayeron en relecturas posteriores, que traen el campo y no lo consultan. O sea
que la comprobación no cambió ni se saltea: la corrupción es por lectura —3 de 24, ~12 %— y sólo una
lectura de cada corrida puede frenarla.

Eso baja la tasa real de detención a **1 de 7 corridas** en vez de 1 de 8 lecturas, y explica por qué se
veía como un hipo.

### Lo que el caso no preveía y salió midiendo

**Un segundo defecto, determinista, en la misma línea.** El caso culpaba a las dos comillas; leyendo
`engine/cli/planning.js:346` aparece que `blocked` **ya era un vocabulario de tres valores**, y el
recorrido lo probaba por verdad. Así que `blocked-on-human` —la cola trabada por acciones humanas
pendientes— frenaba con `awaiting-human-review` y mandaba a mirar `AWAITING_REVIEW.md`, un archivo que en
ese escenario no existe. No era intermitente: fallaba **siempre** que la cola estuviera trabada por
acciones humanas.

Y es más alcanzable desde 0.77.0, no menos: el arreglo del **081** hace que un plan rechazado dos veces
escriba una acción humana, que es una de las formas de llegar a `blocked-on-human`.

**El caso 084**, sobre las dos puertas que analizan un workflow sin parsearlo y se desincronizan con una
comilla dentro de un literal de regex. Salió del arreglo obvio de este caso; el arreglo final lo esquiva,
así que 083 no depende de él.

### Qué se corrió

`node --test test/workflows/autobuild.test.js` — 30 en verde, con la prueba nueva «blocked se lee por su
valor, y lo que no es del vocabulario no se adivina», que recorre las cuatro direcciones juntas porque
cada una sola deja pasar a las otras.

Una prueba preexistente hubo que corregirla, y su fixture era el defecto: «un checkpoint humano sin
resolver corta antes de tocar nada» pasaba `blocked: 'hito anterior sin revisar'`, prosa libre que el
motor no emite nunca. Verde sobre una precondición que no ocurre — lo que R9 nombra en su último párrafo.

**Siete mutaciones, en un clon desechable bajo `/tmp` (R23), todas en rojo:**

```
M1 vuelve a leerse por verdad (el defecto original): fail 1 → ROJA
M2 no se desenvuelven las comillas:                  fail 1 → ROJA
M3 no se recortan los espacios:                      fail 1 → ROJA
M4 lo desconocido se sigue como si no hubiera:       fail 1 → ROJA
M5 blocked-on-human vuelve a nombrar el gate:        fail 1 → ROJA
M6 no se nombra qué tarea está trabada:              fail 1 → ROJA
M7 sólo una comilla cuenta como envoltorio:          fail 1 → ROJA
```

Las siete se comprobaron aplicadas antes de contar —una sustitución que falla en silencio se lee igual
que una defensa que funciona—.

Medición del antes y el después a través del arnés, que es lo que el caso pedía ver:

```
""                → (siguió)              "awaiting-review"  → awaiting-human-review · AWAITING_REVIEW.md
"\"\""            → (siguió)              "blocked-on-human" → blocked-on-human       · HUMAN_ACTIONS.md
"  "              → (siguió)              "otra-cosa"        → context-unavailable    · fuera del vocabulario
```

`npm run ci`: 663 pruebas, 663 en verde.
