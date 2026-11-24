---
caso: 545
titulo: sobrescribir un archivo de reglas del sistema no deja conservar las que no se reemplazan, y lo que se escribe para conservarlas no llega a ningún agente
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 545 — sobrescribir un archivo de reglas del sistema no deja conservar las que no se reemplazan, y lo que se escribe para conservarlas no llega a ningún agente

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: una instancia real pierde hoy R28, y en parte R3 y R17, en
cada agente, aunque escribió que las conserva. Es la condición que el cierre del caso 160 dejó escrita para hacer esto:
«una empresa que quiera reemplazar una y conservar otra».

## Resumen

El override de una regla del sistema es por archivo: un `planning/rules/process.md` propio reemplaza a
`system/process.md` entero. `effectiveRules` (`engine/core/ownership.js:221`) entrega a cada agente los archivos enteros
que rigen, y el sobrescrito no está. `check` avisa cuáles dejan de regir (`engine/planning/structure.js:117`,
`engine/cli/validate.js:238`).

Una instancia que sólo quiere reemplazar dos o tres reglas de un archivo no tiene cómo conservar las demás. La que se
midió sobrescribe `process.md` y `code-shape.md`, y `check` le dice:

```
⚠ planning/rules/code-shape.md sobrescribe code-shape.md (override explícito); deja de regir R5, R6, R7, R11, R18, R27
⚠ planning/rules/process.md sobrescribe process.md (override explícito); deja de regir R1, R2, R3, R4, R17, R25, R28
```

Para las que quiere conservar escribió un archivo propio con una tabla: «R28 … **se adopta por referencia**», «R3 …
**parcial** … rigen desde `system/process.md` R3». El motor no lee esa tabla, así que esas reglas no le llegan a ningún
agente. Es la forma exacta que el caso 160 describió: prosa que el motor no lee.

## Reproducción

Sin modelo, en un banco suelto (`ops bench suelto`). Se escribe un `planning/rules/process.md` propio con R1 y R2, y se
le agrega el frontmatter que la decisión propone:

```
---
adopta: R3, R17, R28
---
```

`check` sigue diciendo `deja de regir R3, R4, R17, R25, R28`. `effectiveRules` devuelve `planning/rules/process.md` y no
`system/process.md`. El `adopta:` no hace nada, que es lo esperado: no existe.

## Síntoma

La instancia cree que R28 rige, porque lo escribió, y no rige en ningún agente. Nada falla: el aviso de `check` sale en
cada corrida igual que si no hubiera hecho nada, y se aprende a no leerlo.

## Causa raíz

El 160 decidió no construir un mecanismo por regla «para un caso que nadie tuvo», y dejó escrito qué lo activaría.
Ahora hay una instancia que lo tiene.

## Fix propuesto

Decidido (Manuel, 2026-11-22): un `adopta:` en el frontmatter del archivo que sobrescribe.

- `adopta: R3, R17, R28` nombra reglas del archivo del sistema que se reemplaza y que la instancia conserva.
- **Cómo llegan al agente**: un import trae un archivo entero, no una sección, así que las secciones adoptadas se
  materializan en un archivo generado, `planning/rules/system/adopted/<archivo>.md`, con el texto de cada `## RN` del
  sistema y una línea arriba que dice de dónde sale. Lo escriben `install` y `upgrade`, igual que el bloque de reglas, y
  `effectiveRules` lo entrega junto al propio.
- **`check`**:
  - deja de listar las adoptadas entre las que dejan de regir;
  - falla si `adopta:` nombra una regla que el archivo del sistema no define, o una que el propio también define (dos
    textos bajo el mismo número, que es lo que la mutación del 160 cuidaba);
  - avisa si el generado quedó viejo respecto del sistema, como avisa hoy un bloque de reglas viejo (`staleLines`).
- **El peso** de lo adoptado cuenta en el bloque, como cualquier regla que se carga.

## Tradeoffs

- **Un archivo generado en `system/`** se reemplaza en cada `upgrade`, que es justo cuando el texto del sistema puede
  cambiar: va del lado correcto. Pero hay que medir que `upgrade` no lo borre como un archivo que el molde no trae
  (`RETIRED` y el manifiesto).
- **Las referencias cruzadas**: una regla adoptada puede citar otra del mismo archivo que no se adoptó («ver R17»). Se
  deja como está, y `check` lo puede avisar.
- **Los cuatro runners**: el bloque de Claude importa por `@`, y los otros listan rutas. Las dos formas tienen que
  incluir el generado; se prueba en los cuatro.
- **Alternativa descartada**: cargar el archivo del sistema entero cuando hay `adopta:`. Da dos textos bajo R1 y R2,
  que es lo que el 160 midió como defecto.

## Contexto de descubrimiento

Paso 5 de la auditoría de una instancia (2026-11-22), ítem B del nivel 3. La instancia mantiene el archivo
`sistema-apagado.md` con la tabla de lo que «se adopta por referencia», al día con Cauce 0.94.0.

## Relacionados

- 160: el corte de `runs.md` fuera de `process.md`, y la condición que activa este caso.
- 099 y 105: `effectiveRules`.
- 440: las reglas que se nombran por superficie (`aplica:`) y no se cargan.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, `adopta:` en el frontmatter** — se hizo, en `engine/planning/adopted.js`.
  - Cómo llega al agente: se hizo como decía el caso, con un cambio de lugar. Las secciones se copian a
    `planning/rules/adopted/<archivo>.md`, fuera de `system/` y no adentro, porque `upgrade` trata esa carpeta como suya
    entera. Lo escribe `automation install` antes de armar el bloque, y `effectiveRules` lo entrega: los cuatro runners
    lo nombran.
  - `upgrade` no lo escribe: si el sistema cambió, `check` avisa que el generado quedó viejo, y `install` lo rehace.
  - `check`: hecho en los tres puntos. Las adoptadas dejan de figurar en «deja de regir». Falla si se adopta una regla
    que el sistema no define, una que el propio redefine, o si un archivo que no sobrescribe nada declara `adopta:`.
    Avisa si lo generado no coincide con lo declarado.
  - El peso: se hizo distinto. Lo adoptado se carga y pesa en el bloque, pero no cuenta como propio, porque es texto del
    sistema y no algo que la instancia escribió o pueda achicar.
- **Tradeoffs: un archivo generado en `system/`** — se evitó, poniéndolo afuera. La revisión verificó que `upgrade` y
  `upgrade --check` no lo tocan y que `localChanges` no lo reporta.
- **Tradeoffs: las referencias cruzadas** — no se hizo nada. Una regla adoptada que cita otra no adoptada queda como
  está, y no se agregó el aviso.
- **Tradeoffs: los cuatro runners** — hecho, y la revisión lo comprobó en los cuatro.
- **Tradeoffs: la alternativa de cargar el archivo entero** — descartada, como decía el caso.
- **Lo que el enunciado no preveía.** La revisión lo encontró y quedó arreglado, con su prueba:
  - Una regla que el propio redefine no se copia, aunque se adopte, para no dar dos textos bajo el mismo número.
  - Lo adoptado hereda el `aplica:`, así que una regla que se carga sólo por superficie (R29) sigue igual.
  - `install` se niega, nombrando la ruta, si en el lugar del generado hay un archivo escrito a mano, un enlace o una
    carpeta. Antes lo pisaba, y con un enlace escribía afuera.

Lo que se corrió:

- Línea de base, en «Reproducción»: un `adopta:` escrito a mano no hacía nada. Antes y después en `bench-545.log` del
  scratchpad:
  - sin `adopta:` dejan de regir R3, R4, R17, R25 y R28; con él, R4 y R25;
  - el generado trae R3, R17 y R28, `CLAUDE.md` lo importa, y lo propio pesa 0,1 KB.
- `test/wiring/adopted-rules.test.js`, 8 pruebas. Con `adopted.js` en la copia y la integración de HEAD, cuatro en rojo
  por conducta; las de la línea de base y de las funciones puras, verdes como corresponde.
- 20 mutaciones en una copia, las 20 rojas y la copia sin mutar verde. Las dos que sobrevivieron en el camino mostraron
  dos filtros redundantes, que se quitaron.
- `npm run ci` con los archivos nuevos stageados: 1906 de 1906, exit 0.

**Sin probar:** `ops init` con instalación embebida, y Windows. Una sección cuyo texto lleve un bloque de código con `## `
adentro se cortaría ahí, igual que `ruleIds`; hoy ningún archivo del sistema tiene uno, y queda anotado. La segunda revisión dejó otro borde: si el `aplica:` heredado pasa de unos 382
caracteres, la marca cae fuera de los primeros 400 que mira `marked`. Ahí `install` se negaría sobre su propio
generado. El más largo del sistema mide hoy 139; la salida, si hace falta, es buscar la marca después del frontmatter.

**Lo que se cambió después** (2026-11-23, a pedido de Manuel): la clave pasó de `adopta:` a `adopts:`, antes de publicar
0.124.0. Es una clave que lee el código, y esas se nombran en inglés (`AGENTS.md`, Convenciones). Lo de arriba conserva
el nombre con que se decidió y se midió. `adopta:` deja de leerse: la prueba lo asierta, se vio en rojo con el código de
antes, y la mutación que acepta las dos claves la pone roja. El CHANGELOG y el README de reglas ya dicen `adopts:`.

### Lista de cierre

1. hecho: la reproducción de «Reproducción», antes y después en el banco.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo sin la integración y en verde después.
4. hecho: 20 mutaciones en una copia, las 20 rojas; las que sobrevivieron se contestaron quitando lo que sobraba.
5. hecho: cambia lo que `check` da por perdido y lo que carga el bloque; la prueba sin `adopta:` asierta que lo de antes sigue igual, y el banco muestra los dos lados.
6. hecho: banco sin modelo con la CLI real y el runner instalado; se midió que las adoptadas ya no figuran como perdidas y que el agente las carga.
7. no aplica: no depende de un modelo; los cuatro runners se probaron por su bloque instalado.
8. hecho: las mutaciones, el banco y la puerta corrieron sobre la versión final.
9. hecho: dos runners por forma de bloque (imports y lista), varios archivos sobrescritos a la vez en la revisión, y un generado propio al lado de uno escrito a mano.
10. hecho: dependían `check` (`retiredByOverride`, `validateRules`), `effectiveRules` y con él `ops context` y el aviso de bloque viejo, el peso, `install` y el README de reglas; todos se tocaron o se comprobaron.
11. hecho: dos pasadas de revisión independiente; la primera no halló nada que impida entregar y sus cuatro hallazgos se arreglaron; la segunda, sobre esos arreglos, tampoco.
12. hecho: pasada de comentarios en `adopted.js`, `ownership.js`, `structure.js`, `rules.js` e `index.js`.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1906 de 1906, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0 («Agregado»).
