---
caso: 145
titulo: El guard que exige que ninguna ruta de un adaptador dé por sentado dónde se instala excluye los .js, así que no mira los recorridos
estado: abierto
prioridad: media
version-detectada: 0.89.0
---

# 145 — La puerta que cuida las rutas instalables no mira los archivos donde vivió el defecto

**🔴 abierto** · detectado en 0.89.0 · prioridad **media** — la puerta existe, pasa en verde, y el defecto
que debía atrapar vivió tres versiones en un archivo que ella no recorre

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
