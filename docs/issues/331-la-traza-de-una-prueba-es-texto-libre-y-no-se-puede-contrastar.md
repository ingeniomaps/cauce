---
caso: 331
titulo: la traza de una prueba es texto libre y no se puede contrastar
estado: resuelto
resuelto-en: 0.104.0
prioridad: alta
version-detectada: 0.103.6
---

# 331 — `tests: CN → …` lo redacta un agente, y ningún lector acierta qué parte es el nombre de la prueba

**🟢 resuelto en 0.104.0** · detectado en 0.103.6 · prioridad **alta**.

**Prioridad alta**: es lo que impide cerrar el 330, y sin esto `ops evidence` no puede ser confiable por más
que se lo siga ajustando.

## Resumen

`ops evidence` contrasta contra el código la prueba que cada traza de `tests:` nombra. La traza es prosa: la
escribe Verify en un campo de texto y Done la copia. Una traza real nombra la prueba y sigue con una
aclaración, código entre backticks y salidas entre comillas, y eso se escribe igual que una prueba inventada.
Por la forma no se puede saber qué es qué.

## Lo medido

Tres versiones del lector, cada una con su revisión independiente (caso 330):

| Lector | Trazas honestas mal marcadas | Pruebas inventadas que pasan |
|---|---|---|
| 0.103.6: todo lo entrecomillado es el nombre | 6 de 10 en una instancia real | ninguna de 40 |
| Sólo lo que está «en su lugar» | pocas | 36 de 60 |
| Decide la hoja, lo demás se informa | 24 de 67 (igual que 0.103.6 en 23) | 4 de 40 sin aviso, 12 con aviso |

Cada revisión encontró formas nuevas mal leídas, y las va a seguir encontrando: cada herramienta nombra sus
pruebas distinto —`archivo::test_x`, `TestX/sub_caso`, `Clase#método`, la salida pegada con `✓` y `3ms`—.

## Causa raíz

`automatization/workflows/autobuild.js`: Verify devuelve `covered: [{ criterion, test }]`, con `test` como
cadena libre, y Done arma `tests:` con eso. El contrato de `done/` dice «nombre de prueba o comando»
(`template/planning/done/README.md`). El dato estructurado —qué archivo, qué prueba— existe en la cabeza de
quien verifica y se pierde al escribirlo.

## Fix propuesto

Que el dato viaje estructurado desde donde se conoce, como se hizo con las rutas de `review` en el caso 321:

1. **Verify devuelve cada cobertura por partes**: `criterion`, `file`, `name` —el nombre de la prueba tal como
   figura en el archivo— y, aparte, `note` para la aclaración.
2. **El recorrido arma la traza**, siempre igual: `CN → archivo › nombre — nota`. Es determinista: no se le
   pide a quien escribe.
3. **`ops evidence` lee esa forma exacta**: el archivo, el nombre hasta ` — `, y nada más. Lo que no tenga esa
   forma —las entradas ya escritas, o las de quien no usa `autobuild`— se contrasta por el archivo y se dice
   que el nombre no se pudo leer.
4. **El contrato de `done/`** nombra la forma.

## Por qué hacerlo

Es la única salida que hace innecesario seguir puliendo un lector de prosa. Y recupera lo que el 316 quería:
que una prueba inventada o renombrada se vea.

## Riesgos y regresiones

- **Cambia el contrato de `done/`**, que baja a todas las empresas en su próximo `upgrade`. Las entradas ya
  escritas quedan con la forma vieja: `check` no puede empezar a rechazarlas.
- **Cambia qué devuelve Verify.** Es tocar el esquema de una fase: hay que comparar una entrada de antes con
  una de después sobre la misma tarea, que es lo que el caso 301 enseñó.
- **Una prueba sin archivo**: un comando, una comprobación manual. El esquema tiene que admitirla sin
  inventar un archivo.
- **Varias pruebas para un criterio**, y una prueba para varios.
- **El nombre que el runner arma** —`it.each`, subpruebas de Go— no está escrito igual en el archivo. Quien
  verifica tiene que dar el nombre como está en el fuente, y eso hay que decirlo.
- **Lo que hoy hay del 330 en la rama** quedaría reemplazado en la parte que adivina; la separación entre lo
  que decide y lo que se informa sigue sirviendo para las entradas viejas.

## Qué habría que probar

- La misma tarea con el recorrido de antes y el de después: la entrada de `done/`, lado a lado.
- `ops evidence` sobre la entrada nueva: cada prueba `encontrado`, y una renombrada a mano, `parcial`.
- Las entradas viejas de una instancia real: ninguna peor que hoy.
- Una corrida real: es un cambio de quién escribe qué.

## Recomendación

**Hacerlo**, antes de publicar nada más sobre `ops evidence`. Decidido por el dueño el 2026-10-07: no se
publica el arreglo intermedio del 330.

## Relacionados

- 330 y 316 — el lector de prosa y sus tres versiones.
- 321 — el mismo movimiento, para las rutas de `review`.
- 301 — cambiar quién escribe es una quita.

## Cierre

**Resuelto en 0.104.0.**

### El recorrido de lo que este caso enumeró

- **1. Verify devuelve cada cobertura por partes — se hizo**: `criterion`, `file`, `name` y `note`.
- **2. El recorrido arma la traza — se hizo**: `archivo › «nombre» — aclaración · criterio: …`. El nombre va
  entre `«»` para que pueda traer adentro lo que sea.
- **3. `ops evidence` lee esa forma exacta — se hizo.** De la aclaración no mira nada. Lo que no tiene la forma
  sigue por la lectura del caso 330.
- **4. El contrato de `done/` nombra la forma — se hizo**, en `PROTOCOL.md` y en el README de `done/`.
- **«Las entradas ya escritas: `check` no puede empezar a rechazarlas» — se cumplió**: `check` sigue pidiendo
  sólo `A/CN →`.
- **«Cambia qué devuelve Verify» — se comparó**, abajo.
- **«Una prueba sin archivo» — se hizo**: `file` vacío, y la traza no inventa uno. `ops evidence` la da por
  `inbuscable`.
- **«Varias pruebas para un criterio, y una para varios» — se hizo**: una entrada por prueba. En la corrida
  real una misma prueba cubrió cuatro criterios y salieron cuatro trazas.
- **«El nombre que el runner arma» — se pidió y no se probó.** El prompt pide el nombre como está en el
  archivo, sin lo que el runner le agrega. Con una subprueba de Go o un `it.each` quien verifica puede dar el
  nombre armado, y ahí sale `parcial`.
- **«Lo que hay del 330 quedaría reemplazado en la parte que adivina» — así quedó.**

### Lo que este caso encontró y no preveía

La revisión independiente mostró tres formas en que la traza armada se leía mal, las tres corregidas:

- **La ruta cambiada por el nombre del servicio.** Un servicio que se llama `backend` y vive en `api/` daba
  `ausente` sobre una prueba real. La ruta va ahora como está en disco desde su raíz.
- **Una ruta con espacios** no entraba en la forma y se leía partida. Va en la aclaración, y la traza queda
  sin archivo antes que con uno mal leído.
- **Un `file` que trajera `›` o `«»`** hacía leer otro nombre.

Y el nombre viaja sin lo que partiría la traza —un `;`, un salto, un `»`—, así que `ops evidence` lo compara
con el archivo leído de la misma manera. Si no, una prueba con un `;` en el nombre daba `parcial` para siempre.

### Lo que queda como está, y dicho

- **La salida sin prueba sigue abierta**: con `file` vacío y `uncovered` vacío el recorrido llega a Done sin
  que nada lo frene, igual que antes con el texto libre.
- **Dos servicios con la misma ruta relativa** se confunden: la traza no dice de cuál es.

### Qué se corrió

- **Lo que Verify devolvía antes**, de las corridas reales de esta rama: 156 coberturas, 145 distintas, todas
  texto libre; ninguna con una forma fija.
- **Una corrida real de `autobuild`** con el recorrido nuevo, sobre la misma tarea: 16 agentes, cerró la
  tarea y `check` quedó en verde. Verify llenó las partes como se le pide —la ruta desde la raíz del servicio,
  el nombre como está en el archivo, la aclaración aparte— y Done copió cada traza sin tocarla:

  ```
  A → test/resta.test.js › «la resta de dos numeros» — assert.equal(resta(5, 3), 2) … · criterio: `resta(a, b)` devuelve `a - b` …
  ```

  `ops evidence` sobre esa entrada: las cuatro `encontrado`. Con una renombrada a mano en la copia:
  `[parcial] — el archivo existe; no aparece en él: la resta de tres numeros`, y las otras tres `encontrado`.
- **La corrida usó la primera versión del armado**, anterior a las tres correcciones de arriba. Lo que
  cambiaron es qué ruta se escribe cuando viene absoluta, con espacios o con separadores; en esa corrida la
  ruta vino relativa y limpia, así que la traza es la misma. Las tres están en la prueba del arnés.
- **25 mutaciones en rojo, en una copia.** Una sobrevivió y tiene ahora su aserción.
- **Una revisión independiente**, que además armó una entrada con siete trazas de nombres difíciles
  (`C2 → algo`, `n/a — nada`, una flecha adentro): pasa `check` y `evidence` las parte bien.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real, ni una tarea con pruebas de Go o de `it.each`.
