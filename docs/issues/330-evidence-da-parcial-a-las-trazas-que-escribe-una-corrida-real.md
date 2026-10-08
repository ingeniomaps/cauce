---
caso: 330
titulo: evidence da parcial a las trazas que escribe una corrida real
estado: resuelto
resuelto-en: 0.104.0
prioridad: alta
version-detectada: 0.103.6
---

# 330 — `ops evidence` marca `parcial` seis de diez trazas reales que dicen la verdad

**🟢 resuelto en 0.104.0** · detectado en 0.103.6 · prioridad **alta**.

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

## Recomendación

**No cerrarlo solo.** Se cierra con el 331, que saca de este lector la parte que adivina.

## Relacionados

- 316 y 331.

## Cierre

**Resuelto en 0.104.0**, por otro camino que el propuesto: el arreglo de fondo es el caso 331.

### El recorrido de lo que este caso enumeró

- **«Detrás de `›`, un nombre por tramo» — se hizo distinto.** Decide sólo el último tramo, que es la prueba;
  los de arriba se buscan y se informan.
- **«Sin `›`, lo entrecomillado es el caso sólo si la traza empieza por el archivo o por una comilla» — se
  hizo distinto.** Decide lo primero entre comillas después del archivo; lo demás que la traza cite se dice al
  lado si no aparece.
- **«Los backticks dejan de marcar un caso» — se hizo**, salvo cuando abren el tramo.
- **«Un `encontrado` falso» — ocurrió, y se midió.** De 40 trazas con una prueba inventada, 0.103.6 marcaba
  las 40; esta lectura marca 24, avisa en 12 y deja pasar 4 sin aviso.
- **«Cortar el nombre de más» — ocurre** en un tramo sin comillas, y son esas 4.
- **«Las formas que 0.103.6 ya resolvía dan lo mismo» — se cumplió**: las 17 del caso 316.
- **Las once trazas con la forma real, antes y después — se hizo**: cinco `parcial` falsos, y ninguno después.

### Lo que este caso encontró y no preveía

**Leer prosa no converge.** Hubo tres versiones del lector y tres revisiones; cada una encontró formas nuevas
mal leídas. La tercera probó 67 trazas honestas con formas de seis herramientas: 24 no dan `encontrado`, 23 de
ellas igual que en 0.103.6. Por eso el arreglo no está acá: desde 0.104.0 `autobuild` escribe la traza con una
forma fija y `ops evidence` la lee tal cual (caso 331). Esta lectura queda para las entradas escritas antes
y para las escritas a mano, y es lo mejor que se puede decir de ellas: qué se buscó y qué no apareció.

### Qué se corrió

- **El comando sobre once trazas con la forma de una instancia real**, antes y después: cinco `parcial` falsos
  pasan a `encontrado`, y las dos inventadas siguen `parcial`.
- **Las 40 inventadas y 15 honestas de la primera revisión**: 24 `parcial`, 12 con aviso, 4 sin aviso; las 15
  honestas, `encontrado`.
- **38 mutaciones en rojo, en una copia**, antes de las dos últimas correcciones; después, sólo la puerta.
- **Tres revisiones independientes**, y **la puerta entera**, `npm run ci`.
- **Lo que no se corrió**: el comando en la instancia real que mostró el defecto.
