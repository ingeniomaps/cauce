---
caso: 306
titulo: edge-unproven frena un caso probado por como se escribe su nombre
estado: resuelto
resuelto-en: 0.103.5
prioridad: media
version-detectada: 0.103.4
---

# 306 — Un borde con su prueba en rojo frena igual, si el rojo y el borde nombran la prueba distinto

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **media**.

**Prioridad media**: el trabajo está bien y la corrida para. Es la tercera forma del mismo freno de más.

## Resumen

Build declara los casos borde que fijó, cada uno con su prueba, y la lista de pruebas que vio en rojo. El
recorrido exige que el rojo nombre a la prueba del borde. Los dos campos los escribe el mismo agente por
separado, y los escribe distinto.

## Reproducción

Dos corridas reales, textuales:

```
borde  src/a.service.spec.ts › segregación: sin decisión legible el actor no aprueba → 403
rojo   src/a.service.spec.ts › AService.resolve › segregación: sin decisión legible el actor no aprueba → 403

borde  src/b.controller.spec.ts › el 404 también sale con no-store: todas las consultas comparten URL
rojo   src/b.controller.spec.ts — 'consulta con el token del header …' y 'el 404 también sale con no-store: …'
```

## Síntoma

`edge-unproven`: «su campo "test" no nombra ninguno de los rojos declarados». En la segunda corrida frenó la
tercera tarea a mitad de Build.

## Causa raíz

`automatization/workflows/autobuild.js`, `namesTest`: compara por contención, sin la anotación final entre
paréntesis. En la primera forma el rojo tiene el `describe` en el medio; en la segunda junta dos casos del
mismo archivo y usa otro separador. Ninguno contiene al otro.

## Fix propuesto

- Comparar lo que los dos tienen en común: los tramos con que cada uno nombra la prueba.
- Que siga frenando lo que tiene que frenar: el caso que no está en ningún rojo.

## Tradeoffs

- Es la tercera vez que se afloja esta comparación. Cada forma nueva que escriba un modelo puede pedir otra.
- Aflojar de más es el lado caro: un borde que entra sin prueba. Buscar el nombre del caso como texto dentro
  del rojo lo hacía.

## Contexto de descubrimiento

La corrida del 304, y una anterior de la misma instancia con el mismo motivo.

## Relacionados

- R26 — una puerta que estorba se termina apagando.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **Por tramos — se hizo.** Todo tramo con que el borde nombra su prueba —archivo, `describe`, caso— tiene
  que estar, igual, entre los del rojo. En un rojo que junta varios casos, cada uno entre comillas cuenta
  como un tramo.
- **Lo que sigue frenando — se hizo y se probó**, con ocho formas.
- **Tradeoffs — se pagan los dos.**

### Lo que este caso encontró y no preveía

**La primera versión daba verde de más.** Buscaba el nombre del caso dentro del rojo y comparaba el archivo
por su nombre sin carpeta. Una revisión independiente del diff lo mostró con ejemplos: «rechaza el token»
pasaba contra «no rechaza el token de servicio», y `src/users/service.spec.ts` contra
`src/orders/service.spec.ts`. La prueba de entonces afirmaba cuidar «el mismo nombre en otro archivo» y lo
probaba con dos archivos que no se parecían. Se reescribió por tramos enteros, y esos ejemplos son hoy la
prueba.

### Qué se corrió

- **Las dos formas reales, en el arnés**, con los textos de las corridas: ya no frenan.
- **Las ocho que tienen que frenar**: otro caso, otro archivo, el mismo nombre de archivo en otra carpeta, un
  archivo cuyo nombre termina igual, un caso contenido en otro, el mismo caso en otro `describe`, un rojo que
  no nombra el archivo, y un nombre de dos letras. Las ocho salen con `edge-unproven`.
- **Tres mutaciones en rojo, en una copia**: sin comparar por tramos, alcanzando con un tramo, y sin contar
  los casos entre comillas. Una cuarta sobrevivió —exigir más de un tramo— y esa condición se sacó: no
  decidía nada que la contención no decidiera ya.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una corrida real que declare un borde. En los bancos las tareas son chicas y Build
  no declaró ninguno.
