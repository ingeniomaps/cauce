---
caso: 330
titulo: evidence da parcial a las trazas que escribe una corrida real
estado: abierto
prioridad: alta
version-detectada: 0.103.6
---

# 330 — `ops evidence` marca `parcial` seis de diez trazas reales que dicen la verdad

**🔴 abierto** · detectado en 0.103.6 · prioridad **alta**.

**Prioridad alta**: es una regresión de lo que 0.103.6 publicó para el caso 316. Un informe que marca mal más
de la mitad de las trazas enseña a no leerlo, que es el error que aquel caso quería evitar.

## Resumen

Desde 0.103.6, `ops evidence` busca dentro del archivo el caso que la traza nombra. Toma por nombre de caso
todo lo que venga entre comillas o detrás de `›`. Una corrida real no escribe así: nombra el caso y después
sigue en prosa, con código entre backticks y salidas entre comillas.

## Reproducción

Con el motor publicado, en un banco con las formas de dos entradas de una instancia real (nombres cambiados):

```
… › «el listado trae la acción retenida y no cruza cuentas», pendiente de CI y no verde: usa contenedores …
   [parcial] — no aparece en él: «el listado trae … no cruza cuentas», pendiente de CI y no verde: usa con…
… › PedidosService.list, mutación declarada …: sin el cruce, C1 falla con `Expected: "…" / Received: null`
   [parcial] — no aparece en él: Expected: "Sube el tope diario a 80" / Received: null
… › «la consulta pública por token …»: `expect(first.body).toEqual({ … })`
   [parcial] — no aparece en él: expect(first.body).toEqual({ … })
mutación observada en la copia: api/test/core.describe.ts:728 «expected 200 "OK", got 404 "Not Found"» …
   [parcial] — no aparece en él: Not Found
```

En los cuatro el caso nombrado existe en el archivo. Sobre once trazas de esa forma: cinco `parcial` falsos,
dos verdaderos, cuatro `encontrado`.

## Causa raíz

`engine/core/evidence.js`, `parts`: con algo entre comillas en la traza, todo lo entrecomillado es nombre de
caso, backticks incluidos; y detrás de `›`, el tramo entero. Las pruebas del 316 traían trazas que terminan
en el nombre. Una real sigue: `: aserción`, `, nota`, `(detalle)`, `— criterio: …`.

## Fix propuesto

- **Detrás de `›`**, un nombre por tramo: lo que va entre comillas si el tramo empieza con una —`'…'`, `"…"`,
  `«…»`, `“…”`—, o el tramo hasta el primer `:`, `,`, ` — ` o ` (`.
- **Sin `›`**, lo entrecomillado es el caso sólo si la traza empieza por el archivo o por una comilla. Una
  traza que empieza en prosa («mutación observada en la copia: …») nombra un archivo, no un caso.
- **Los backticks dejan de marcar un caso**: en una traza real encierran código.

## Por qué hacerlo

Lo que 0.103.6 prometió para el 316 no vale sobre las entradas de la única instancia real que lo corrió.

## Riesgos y regresiones

- **Un `encontrado` falso**: al leer menos como nombre, una traza cuyo caso no existe puede quedar en
  «se comprobó el archivo». Hay que probar que el caso inventado detrás de `›` o entre comillas siga `parcial`.
- **Cortar el nombre de más**: un caso cuyo nombre trae `:` o `,` y viene sin comillas detrás de `›` se
  buscaría truncado. Truncado sigue estando en el archivo, así que erra hacia `encontrado`.
- **Las formas que 0.103.6 ya resolvía** tienen que dar lo mismo: están en la prueba del 316.

## Qué habría que probar

- Las once trazas de arriba, antes y después, por el comando.
- La prueba del 316 entera, con los cambios de veredicto justificados uno por uno.

## Estado al 2026-10-07

**Sigue abierto, con un arreglo intermedio en la rama y sin publicar.** Lo decidió el dueño: el arreglo de
fondo es el caso 331.

- **El «Fix propuesto» de arriba es la primera versión, y se descartó.** Una revisión independiente mostró que
  daba `encontrado` a 36 de 60 pruebas inventadas. La segunda versión, que exigía todo lo citado, volvió a
  marcar `parcial` trazas honestas con otras formas.
- **Lo que quedó en el código es la tercera**: decide la prueba que la traza nombra —el último tramo detrás
  de `›`, o lo primero entre comillas— y lo demás que cite se busca y se dice al lado. La salida dice qué se
  buscó: `[encontrado] — en el archivo: X; cita y no aparece: Y`.
- **Medido**: las once trazas con la forma de la instancia real, cinco `parcial` falsos antes y ninguno
  después; los dos casos inventados siguen `parcial`. Las 17 formas del 316 conservan su veredicto. Sobre las
  40 inventadas de la revisión: 24 `parcial`, 12 `encontrado` con aviso, 4 sin aviso (0.103.6: 40 `parcial`).
- **Lo que una tercera revisión encontró y no se arregló**: 24 de 67 trazas honestas con formas de otras
  herramientas siguen sin dar `encontrado`, 23 de ellas igual que en 0.103.6. Las dos regresiones que
  encontró —un `>` dentro de las comillas de un nombre, y un nombre entre comillas de dos letras— sí.
- **Qué se corrió**: 38 mutaciones en rojo antes de esas dos últimas correcciones, y no después; la puerta
  entera, `npm run ci`, después.

## Recomendación

**No cerrarlo solo.** Se cierra con el 331, que saca de este lector la parte que adivina.

## Relacionados

- 316 y 331.
