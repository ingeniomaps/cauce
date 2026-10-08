---
caso: 317
titulo: el guard de límites no resuelve enlaces simbólicos
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 317 — Escribir por un enlace que está dentro de una raíz y apunta afuera pasa

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: es un hueco en el guard que cuida dónde se escribe. No se vio usado en ninguna corrida.

## Resumen

Los dos guards de límites comparan la ruta como está escrita contra las raíces declaradas. Si dentro de una
raíz hay un enlace simbólico hacia afuera, la ruta escrita cae adentro y la escritura real cae afuera.

## Reproducción

Con los guards reales, una raíz con `enlace -> ../afuera`:

```
echo x > <afuera>/a.js          → FRENA: el comando escribe en …, fuera de las raíces
echo x > enlace/a.js            → PASA
herramienta de archivos, enlace/a.js   → PASA
```

## Causa raíz

`engine/hooks/shell.js` y `engine/hooks/files.js` usan `path.resolve`, que no mira el disco. No hay ningún
`realpath` en `engine/hooks/`.

## Fix propuesto

- Resolver el tramo de la ruta que existe con su ruta real antes de comparar.
- Resolver igual las raíces, o la comparación deja de coincidir donde la raíz misma se alcanza por un enlace.

## Por qué hacerlo

Es anterior a todo lo de esta semana y es un hueco real: un guard de límites que se puede cruzar con un
enlace. La forma habitual de cruzarlo no es maliciosa: es un monorepo con una carpeta enlazada.

## Riesgos y regresiones

**Acá el riesgo es frenar de más**, y es alto si se hace a medias:

- **Enlaces legítimos**: `node_modules` enlazado por el gestor de paquetes, carpetas compartidas de un
  monorepo, y en macOS el temporal, que es un enlace. Todo eso hoy pasa y podría empezar a frenar.
- **El motor enlazado en un banco** del propio toolkit.
- **La ruta que todavía no existe**: hay que resolver hasta el último tramo que sí está.

## Qué habría que probar

- Los tres casos de arriba, y cada enlace legítimo de la lista, con el guard instalado.
- Una instancia real antes de publicar: es donde hay enlaces que un banco no tiene.

## Recomendación

**Hacerlo, pero no en la misma tanda que los demás.** Pide una corrida en una instancia real antes de salir,
porque el modo de fallo es frenar a todos.

## Relacionados

- R23 y R27.
