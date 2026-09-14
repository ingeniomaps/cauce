---
caso: 145
titulo: El guard que exige que ninguna ruta de un adaptador dé por sentado dónde se instala excluye los .js, así que no mira los recorridos
estado: resuelto
resuelto-en: 0.89.0
prioridad: media
version-detectada: 0.89.0
---

# 145 — La puerta que cuida las rutas instalables no mira los archivos donde vivió el defecto

**🟢 resuelto en 0.89.0** · detectado en 0.89.0 · prioridad **media** — la exclusión resultó correcta, y
ahora tiene su razón medida y una prueba que vigila que siga siéndolo

## Resumen

`test/wiring/runners.test.js` tiene una puerta llamada «ninguna ruta de un adaptador da por sentado dónde
se instala». Su encabezado declara el alcance con todas las letras: «esto lo declara de una vez para todo
lo instalable, incluido lo que se agregue después».

No es todo lo instalable. El recorrido del bucle salta los `.js`:

```js
if (!fs.existsSync(file) || file.endsWith('.js')) continue
```

Los nueve recorridos que instala cada adaptador son `.js`. Nunca entraron.

## Reproducción

El caso 139 es la reproducción: `automatization/shared/workflow-root.js` definía la raíz de todos los
recorridos como una ruta **relativa**, las consignas dictaban comandos que sólo resolvían si el agente
estaba parado donde el instalador supuso, y esta puerta estuvo en verde todo el tiempo.

```bash
node --test test/wiring/runners.test.js   # verde, con el defecto presente en los nueve recorridos
```

## Síntoma

La puerta no falla: informa que todo lo instalable ancla sus rutas, y su encabezado invita a confiar en
que cubre lo que se agregue después. Quien la lea al revisar un adaptador nuevo va a creer que los
recorridos están cubiertos.

Y la exclusión **no tiene razón escrita**. El comentario contiguo explica por qué se renderiza con el
marcador puesto, no por qué se saltan los `.js`.

## Causa raíz

`test/wiring/runners.test.js`, en la prueba nombrada arriba. La exclusión es de una línea y su motivo hay
que reconstruirlo: lo más plausible es que un `.js` trae código además de prosa, así que el regex de rutas
—pensado para texto— daría falsos positivos sobre expresiones, nombres de módulo y literales. Eso es una
hipótesis: **no consta en el archivo**.

## Fix propuesto

No está decidido, y lo primero es establecer el motivo de la exclusión antes de quitarla.

1. **Recorrer también los `.js` y acotar el regex a lo que un recorrido dicta.** Lo que hay que cuidar en
   un recorrido no es cualquier mención de una ruta sino la que termina en el prompt de un agente. Exige
   distinguir un literal dictado de una expresión, que es lo que hace el trabajo real.
2. **Una puerta propia para los recorridos**, con su criterio: que toda ruta que viaje a un agente cuelgue
   de la raíz declarada. Es más honesto que estirar una prueba escrita para otra cosa, y deja la de
   adaptadores como está.
3. **Como mínimo, escribir la razón de la exclusión.** No arregla nada y evita que el próximo lector
   —o el próximo caso— vuelva a descubrir el hueco desde cero.

## Tradeoffs

- La 1 mete ruido en una puerta que hoy es limpia: un falso positivo sobre un recorrido manda a «anclar»
  algo que no es una ruta, y una puerta que molesta se termina apagando.
- La 2 duplica maquinaria —renderizar, recorrer, comparar— y hay que decidir dónde vive para que no se
  pudra al lado de la otra.
- **Vale la pena mirar si hay más exclusiones sin razón escrita en las puertas del repositorio**, porque
  el modo de fallo no es este archivo sino una condición de salto que nadie justificó.

## Prioridad

**Media.** No rompe nada por sí sola, pero es una puerta que declara más alcance del que tiene, y eso vale
menos que no tenerla: enseña a confiar. El defecto que dejó pasar costó una corrida de `autobuild` entera
en una instancia real.

## Contexto de descubrimiento

Salió de arreglar el 139 el 2026-09-14. Al buscar qué puerta debía haber atrapado la raíz relativa de los
recorridos, ésta parecía la indicada y resultó que los excluye por extensión.

## Relacionados

- **139** — el defecto que esta puerta no vio.
- **137**, **138** — la misma familia de supuestos sobre el directorio de invocación.

## Cierre

**🟢 resuelto en 0.89.0** · `test/wiring/runners.test.js`, `test/repo/repo.test.js`

Se tomó la **opción 3**, y las otras dos **se descartaron con un número, no con una opinión**. El caso
pedía «establecer el motivo de la exclusión antes de quitarla», y eso es exactamente lo que cambió el
desenlace: medido, el regex sobre los nueve recorridos da **52 coincidencias y cero defectos**.

### Contra lo que el caso enumeró

- **«Lo primero es establecer el motivo de la exclusión antes de quitarla»** — hecho, y es el hallazgo del
  caso. Las 52 coincidencias se clasificaron una por una y caen en tres familias, todas legítimas: prosa
  de comentarios; comandos dictados que **ya anclan** —«corré X desde `${ROOT}`», y desde el 139 esa raíz
  es absoluta—; y código que compara rutas en disco, que no viaja a ningún agente.
- **Opción 1, recorrer también los `.js` acotando el regex** — **se decidió que no**. Incluirlos hoy daría
  52 avisos y ningún hallazgo: una puerta que no se apaga por molesta sino que **nace apagada**. Y acotar
  el regex a «lo dictado» no alcanzaría, porque lo que separa un dictado sano de uno roto no es la ruta
  sino si la consigna dice desde dónde — que es otra propiedad, y ya la cuida `workflows-build.test.js`
  sobre `ROOT` desde el 139.
- **Opción 2, una puerta propia para los recorridos** — **se decidió que no**. Construiría maquinaria para
  atrapar una clase que hoy no tiene un solo ejemplar. Si algún día aparece uno, el conteo nuevo lo va a
  delatar, que es para lo que quedó la prueba de abajo.
- **Opción 3, escribir la razón** — construida, y con más de lo que pedía: la razón queda junto a la
  exclusión **con el número que la sostiene**, y una prueba nueva vuelve a contar las coincidencias en cada
  corrida. Un número envejece; sin algo que lo revise, una exclusión medida se degrada a una supuesta, que
  es el defecto que este caso vino a denunciar.
- **Tradeoff «la 1 mete ruido en una puerta que hoy es limpia»** — confirmado con la medición: 52 avisos
  sobre cero hallazgos es exactamente el ruido que el tradeoff anticipaba.
- **«Vale la pena mirar si hay más exclusiones sin razón escrita en las puertas»** — se miró, y el hallazgo
  es **más chico** de lo que el caso temía. De siete saltos que descartan archivos por nombre o extensión,
  seis tienen su razón escrita; la única sin justificar era ésta. El primer barrido dio siete «sin razón»
  porque miraba las dos líneas anteriores al salto, y varias razones viven sobre el `test(` que las
  contiene — el instrumento estaba mal, no el repositorio.

### Lo que el caso no preveía

- **Estuve a punto de reportar diez defectos que no existen.** Al medir si los comandos dictados anclaban,
  diez líneas aparecieron «sin ancla»: `"node tools/ops.js flow list"`, `"node tools/ops.js check
  planning"`. Miradas en contexto, cuelgan de un encabezado que sí ancla —«From `${WORKDIR}`, run exactly
  these commands»— que un grep línea a línea no ve. Otras tres ni siquiera son consignas: son textos de
  `stop()` que le explican a una persona qué correr.
- **La exclusión que el caso denunciaba era correcta.** El caso nació de buscar qué puerta debía haber
  atrapado el 139 y encontrar que ésta excluye los `.js`. La conclusión intuitiva era que el hueco estaba
  ahí; medirlo mostró que el hueco estaba en **otra** propiedad —si la consigna dice desde dónde—, que es
  la que el 139 arregló. Esta puerta nunca fue la indicada.

### Qué se corrió

- **La clasificación de las 52 coincidencias**, una por una y con su contexto, sobre los nueve recorridos
  renderizados: ninguna es una ruta que viaje a un agente sin anclar.
- **El contraste de las diez «sin ancla»** contra las seis líneas previas de su prompt, que es lo que
  mostró el encabezado que las ancla.
- **El barrido de exclusiones del repositorio**, rehecho tras descubrir que el primero clasificaba mal:
  seis de siete ya tenían su razón.
- **Mutación**: bajar el conteo esperado de 52 a 51 rompe la prueba nueva, así que la aserción vigila de
  verdad y no es un número decorativo.
- **Pasada de comentarios R11 a 0.22**: los cinco párrafos nuevos entraron a la comparación y ninguno
  aparece; el par más alto que toca este archivo es 0.317, preexistente, contra un fondo de 0.941.
- **Verde**: `npm run ci` en 0 y **824 pruebas**.
