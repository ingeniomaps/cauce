---
caso: 328
titulo: formas de comillas que la lectura de un comando no conoce
estado: descartado
prioridad: media
version-detectada: 0.103.5
---

# 328 — `echo $'a\'' ; rm -rf / ; echo 'b'` pasa el guard: cuatro formas que la lectura no conoce

**⚪ descartado** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: las cuatro dejan pasar algo que el shell ejecuta. Son rebuscadas y no se vieron en
ninguna corrida; un agente no las escribe por accidente.

## Resumen

Los guards vacían lo que va entre comillas antes de leer un comando. Desde el caso 312 esa lectura conoce la
comilla escapada y el comentario. Quedan cuatro formas en que toma por cadena algo que el shell ejecuta.

## Reproducción

Las mostró la revisión del caso 312, con el guard `destructive`. Pasan antes y después de ese cambio:

```
echo $'a\'' ; rm -rf / ; echo 'b'              comillas ANSI-C: adentro de $'…' la barra sí escapa
echo "$(echo ")" ; rm -rf / ; echo "(")"       comillas dentro de $(…) dentro de comillas dobles
echo `'`; rm -rf / ;''                          comillas dentro de backticks
echo "rm -rf /" | /bin/sh                       un shell nombrado por su ruta después de una tubería
```

En las tres primeras bash ejecuta lo del medio: se comprobó con un comando inocuo en lugar del `rm`. La
cuarta no se corrió contra bash; que `/bin/sh` ejecute lo que recibe es **documentado**, no verificado acá.

## Causa raíz

`engine/hooks/input.js`: `QUOTED` lee `'…'` y `"…"` como si no pudieran anidar una sustitución ni llevar el
prefijo `$`, y `FEEDS_SHELL` reconoce el shell por su nombre suelto.

## Fix propuesto

- `$'…'` como forma propia, donde la barra escapa.
- Dentro de comillas dobles, saltar `$(…)` y los backticks con su propio anidamiento, o dejar a la vista
  toda cadena doble que traiga una sustitución, que es lo que `asRun` ya hace.
- `FEEDS_SHELL` con ruta opcional delante del nombre.

## Por qué hacerlo

Son el resto de la misma clase que el 312 cerró, y van hacia el lado que deja pasar.

## Riesgos y regresiones

**Alto, igual que el 312.** La lectura la usan todos los guards que leen comandos.

- **Anidar sustituciones con una expresión regular no alcanza**: pide un lector con estado. Un lector nuevo
  es una forma nueva de errar, y hay que contrastarlo contra bash igual que se hizo en el 312.
- **Dejar a la vista toda cadena con sustitución** frena de más: un `echo "hoy es $(date)"` seguido de texto
  que un guard reconoce pasaría a frenar.

## Qué habría que probar

- Cada forma contra bash de verdad, con el barrido del 312 ampliado a `$`, backticks y paréntesis: los
  escondidos tienen que llegar a cero sin que suba lo que frena de más.
- Los comandos corrientes que la revisión del 312 pasó por nueve guards: ninguno cambia de veredicto.

## Recomendación

**Hacerlo, en una tanda propia**, con el contraste contra bash como condición de entrada.

## Cierre

**Descartado.** Lo decidió el dueño el 2026-10-07, con la recomendación de no hacerlo.

- **Se decidió que no**, porque son formas que un agente no escribe por accidente, y estos guards contienen
  accidentes, no adversarios. Y porque cada forma nueva que se le enseñó a esta lectura en 0.103.6 trajo una
  regresión hacia el lado que deja pasar, que hubo que encontrar con una revisión aparte (casos 312 y 313).
  Queda como límite declarado: el comentario de `QUOTED`, en `engine/hooks/input.js`, nombra este caso.
- **Cuándo reabrirlo**: si una de las cuatro formas aparece en una corrida real, o si la lectura se
  reemplaza por un lector con estado; ahí el contraste contra bash es la condición de entrada.
- **Qué se corrió**: las tres primeras formas contra bash, con un comando inocuo en lugar del `rm`: lo
  ejecuta. Y el barrido de la revisión del 312, 194.712 comandos con `$`, backticks y paréntesis: quedan 9
  escondidos, todos de la tercera forma. La cuarta no se corrió contra bash.

## Relacionados

- 312, 286 y 259.
