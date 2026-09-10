---
caso: 078
titulo: Por qué `rmSync` vuelve sin lanzar bajo una carrera sigue sin establecerse, y tres rodeos siguen puestos por eso
estado: abierto
prioridad: baja
version-detectada: 0.76.0
---

# 078 — La causa del 073 está apagada; el mecanismo por el que se manifestaba, no

**🔴 abierto** · detectado en 0.76.0 · prioridad **baja** — no rompe nada hoy: es un desconocido que
sostiene tres rodeos, y que quedó escrito dentro de un caso cerrado

## Resumen

El [073](073-el-borrado-del-banco-deja-objetos-de-git-y-no-lanza.md) estableció **quién escribía**
—`git maintenance`, que `git commit` deja corriendo detrás— y lo apagó. Lo que no estableció es **cómo**
esa carrera hace que `fs.rmSync` vuelva sin lanzar dejando archivos.

Sale como caso propio y no como una línea dentro de aquél porque tiene una consecuencia viva: **tres
rodeos siguen en el código sostenidos por este desconocido**, y mientras no se sepa, retirarlos es una
apuesta.

## Reproducción

**Sólo la mitad.** Con un escritor concurrente sincronizado contra el borrado —un proceso que recrea el
árbol mientras `rmSync` lo recorre— la carrera se reproduce con facilidad y produce la cara **ruidosa**:

```
node v24.18.0 · 20 vueltas → limpio 3 · lanzó 17 ENOTEMPTY · volvió sin lanzar y dejó cosas 0
node v26.8.2  · 20 vueltas → limpio 1 · lanzó 19 ENOTEMPTY · volvió sin lanzar y dejó cosas 0
```

`ENOTEMPTY` es literalmente el síntoma que los reintentos del `rmSync` vinieron a tapar. La cara
**silenciosa** —volver sin lanzar y dejar 90 archivos en 27 directorios, que es lo que la guarda capturó
en CI— no se reprodujo ni una vez en 40 vueltas.

## Síntoma

Ninguno, desde que la causa está apagada. Lo que hay es código que nadie puede retirar con criterio.

## Causa raíz

No establecida, y es de terceros: `fs.rmSync` recursivo está implementado en C++ desde Node 22 —
`binding.rmSync(path, maxRetries, recursive, retryDelay)`, y `force` **no** se le pasa—, así que el
recorrido y su manejo de errores no se pueden leer desde JavaScript.

Hay una clase de fallo documentada que encaja en forma pero no en entorno: `nodejs/node#61067` describe
`rmSync` como no-op que **no lanza**, y está acotado a rutas no ASCII en Windows. Acá el entorno es Linux
y las rutas son ASCII, así que **no es ése**; se nombra porque establece que la implementación nativa
tiene ese modo de fallo y no para atribuirle éste.

## Fix propuesto

Ninguno de producto: no hay defecto que arreglar. Lo que hay que decidir es **qué se hace con los tres
rodeos**, y para eso hace falta el mecanismo o una espera:

- **Los reintentos del `rmSync`** —`maxRetries: 5, retryDelay: 50`— puestos por el `ENOTEMPTY`.
- **El `force` del andamiaje**, puesto porque algo sobrevivía al borrado.
- **El `rm` antes del enlace**, por lo mismo.

Los tres tapaban caras del mismo escritor, que ya no corre. Las dos vías:

- **Esperar y mirar.** Si no vuelven a disparar durante varias versiones, retirarlos con esa medición como
  evidencia. Barato y lento, y **es lo que está pasando ahora sin que nadie lo mire**: ése es el motivo
  de este caso.
- **Establecer el mecanismo.** Caro: pide reproducir la cara silenciosa, y 40 vueltas con contención no
  la produjeron. Sin ella no se puede afirmar que un `rmSync` sin escritor concurrente sea seguro.

## Tradeoffs

- **Retirar los tres sin saber** deja al banco sin red frente a cualquier otro escritor transitorio, y el
  fallo que produciría es el mudo que costó tres investigaciones.
- **Dejarlos para siempre** es deuda que se lee como decisión: el próximo que los toque no va a saber si
  cuidan algo vivo o son restos.
- **Perseguir el mecanismo** es trabajo sobre un runtime ajeno para retirar tres líneas propias. Casi
  seguro no lo vale — y decirlo es el resultado, no una excusa para no anotarlo.

## Contexto de descubrimiento

Cerrando el 073, y de una pregunta del operador: «¿aún tenemos algún hueco?». La respuesta era que sí y
que vivía adentro de un caso cerrado — la forma que R15 nombra como la que se pierde. Se saca acá para
que tenga condición de activación y alguien que la mire.

## Relacionados

- [073](073-el-borrado-del-banco-deja-objetos-de-git-y-no-lanza.md) — estableció el escritor y lo apagó.
  Este caso es el desconocido que aquél declaró y los rodeos que ese desconocido sostiene.
- [066](066-el-banco-que-no-se-rehace-falla-mudo.md) — puso la guarda que capturó la evidencia.
