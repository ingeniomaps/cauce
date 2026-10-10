---
caso: 361
titulo: evidence aborta por memoria cuando una raíz tiene archivos binarios grandes
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 361 — `ops evidence` lee como texto y guarda en memoria cada archivo de las raíces, también los binarios: con una raíz que trae modelos e imágenes, una traza que no se encuentra aborta el proceso por falta de memoria

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: no pasa en toda instancia ni en toda entrada, y cuando pasa no da una respuesta
equivocada: no da ninguna. Pero cae justo en la entrada que más importa contrastar —la que cita algo que no
está—, y el proceso muere sin decir de qué.

## Resumen

Para una traza que no nombra un archivo, `evidence` busca el nombre adentro de todos los archivos de las
raíces declaradas. Los lee enteros, como texto, y los guarda para no releerlos. El tope es de 5.000 archivos
por raíz y no mira tamaños ni tipos.

Si el nombre aparece pronto, la búsqueda corta y nadie lo nota. Si no aparece, se leen todos.

## Reproducción

Medido en sólo lectura sobre una instancia real cuya raíz trae pesos de modelos, imágenes y bibliotecas
compiladas, pidiendo el contraste de una traza de una sola palabra que no existe:

```bash
node --max-old-space-size=1500 -e '…EV.contrast("A → TestQueNoExisteEnNingunLado", raíces, [planning])'
```

## Síntoma

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

Con el límite por defecto de Node llegó a 4 GB antes de abortar. Lo que esa raíz le ofrece a la búsqueda,
contado sin leer:

```
raíces 3 · archivos 6.062 · 3.426 MB   — una sola raíz trae 5.038 archivos y 3.412 MB
.safetensors 1.142 MB · .png 853 MB · .so 530 MB · .onnx 428 MB · .pth 248 MB · .jpg 58 MB · .py 39 MB
```

En otra instancia real, con seis raíces y sin binarios grandes, la misma búsqueda lee 1.168 archivos y
69 MB en medio segundo.

Pasa igual con el motor de `main` y con el de la rama: es anterior. Es además la explicación de un dato que
venía sin leer: en las comparaciones de `evidence` sobre esa instancia, una de sus 60 entradas no devolvía
nada con ningún motor.

## Causa raíz

- `engine/core/evidence.js`, `contrast` — `read` hace `fs.readFileSync(…, 'utf8')` de cada archivo y lo
  guarda en `texts`, sin tope de tamaño.
- `engine/core/evidence.js`, `sourceFiles` — el tope es la cantidad de archivos por raíz, no su peso, y no
  distingue un fuente de un binario.

## Fix propuesto

No leer lo que no puede ser una prueba: saltear el archivo que pasa de un tamaño —una prueba no pesa
megas— mirando su tamaño antes de abrirlo. Y decirlo: si se salteó algo, `evidence` lo cuenta, para que un
`ausente` no se lea como «busqué en todo».

## Valor

`evidence` vuelve a contestar en las instancias cuyo producto trae datos o modelos, que es donde hoy muere.
De paso baja el tiempo y la memoria de toda búsqueda sin archivo.

## Qué podría salir mal

1. **Saltear un archivo que sí tenía la prueba.** Un archivo de pruebas generado o enorme existe. El tope
   tiene que ser holgado y lo salteado tiene que decirse.
2. **Cambiar un veredicto.** Sólo puede pasar de `encontrado` a `ausente` si lo citado estaba únicamente en
   un archivo salteado. Se mide sobre las instancias reales, con el motor anterior y con el nuevo.
3. **Elegir por extensión.** Una lista de extensiones binarias queda corta siempre; el tamaño no depende de
   que alguien se acuerde de ampliarla (R27).

## Cierre

**Resuelto en 0.106.0**, con el fix propuesto y una parte más que la medición mostró necesaria.

### El recorrido de lo que este caso enumeró

- **Fix, saltear por tamaño — se hizo, y no alcanzaba.** Medido sobre la instancia del síntoma, sin cargar
  nada: con un tope de 2 MB quedaban 824 MB por leer, porque lo que más pesa son imágenes de uno o dos megas.
  Salteando además lo binario quedan 70 MB. Se hacen las dos cosas: binario por contenido, y un tope de 5 MB
  para el texto enorme, que se mira antes de abrir.
- **Fix, decirlo — se hizo.** `evidence` imprime cuántos archivos no leyó y de qué clase, y lo lleva en
  `--json`. Calla cuando no salteó nada.
- **Qué podría salir mal 1, saltear un archivo que tenía la prueba — acotado**: en las dos instancias
  medidas, el archivo de pruebas más grande pesa 355 KB, catorce veces menos que el tope. Y lo salteado se
  dice.
- **2, cambiar un veredicto — medido, no cambió ninguno.** Motor anterior contra éste sobre tres instancias
  reales, en sólo lectura: 161 entradas y 152 trazas, ningún veredicto distinto.
- **3, elegir por extensión — no se hizo así**: binario es un byte nulo en los primeros 8 KB.

### Lo que este caso encontró y no preveía

La otra instancia medida, sin modelos, también gana: la misma búsqueda pasó de 475 ms a 61 ms, porque dejó
de leer 41 binarios y dos archivos enormes que nadie había notado.

Lo que no se tocó: la lectura desde un commit, que usa `git show` con un tope propio de salida.

### Qué se corrió

- **Sobre la instancia que abortaba**, en sólo lectura, la misma búsqueda del síntoma:

  ```
  antes     FATAL ERROR: Reached heap limit … JavaScript heap out of memory
  después   veredicto: ausente · 1.065 ms · 90 MB de memoria · 1.051 binarios y 34 enormes sin leer
  ```

  Y la entrada de esa instancia que no devolvía nada con ningún motor ahora contesta.
- Rojo previo: las dos pruebas de `test/planning/evidence-binary.test.js`.
- Seis mutaciones, cada una en rojo: leyendo lo binario, leyendo lo enorme, mirando el tamaño después de
  cargar, sin contar lo salteado, sin decirlo, y diciéndolo siempre.
- La comparación de veredictos de arriba.

No tuvo revisión independiente.

### Lo que encontró la segunda revisión del conjunto (2026-10-09)

Un hallazgo: **la lectura desde un commit seguía cargando todo como texto**, que es lo que este cierre había
dejado dicho como «no se tocó». Un commit que agrega un modelo o una imagen repetía el problema por ese
camino, y sin contarlo. Ahora la decisión de qué se lee vive en un solo lugar y la usan los dos: el tamaño
de cada archivo del commit se pregunta de una vez, lo enorme no se pide y lo binario no se guarda. Rojo
previo con un commit que trae los tres archivos, y dos mutaciones en rojo.

### Lo que encontró la tercera revisión (2026-10-09)

Un hallazgo, de costo: para saltear lo enorme en un commit se le pedía a git el tamaño de **todos** los
archivos junto con el listado, y eso lo hace resolver cada blob. Medido en un repositorio de 3.126 archivos:
0,30 s contra 0,01 s del listado solo, por cada commit citado. Ahora el tamaño se pregunta por archivo y
recién al leerlo. La prueba del commit con un binario y un volcado sigue en verde, y la mutación que deja de
mirar el tamaño, en rojo.

### Lo que encontró la cuarta revisión (2026-10-09)

Un hallazgo: preguntar el tamaño antes de cada archivo eran dos procesos por archivo, y un tamaño que no se
podía leer contaba como cero. Ahora es un solo pedido con el tope puesto en lo que se acepta recibir: lo que
lo pasa se corta ahí y cuenta como enorme.

## Contexto de descubrimiento

Apareció el 2026-10-09 al medir cuánto cuesta resolver la ruta real de cada carpeta en `sourceFiles`, que
había quedado anotado sin medir en el cierre del 353.

## Relacionados

- **353** — de donde sale la medición, y el recorrido de archivos que este caso toca.
- **330** — el contraste de una traza contra el fuente.
