---
caso: 256
titulo: una mutación declarada y no corrida termina en una fila
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 256 — La mutación que Build o Review declaran sin haberla corrido va a `HUMAN_ACTIONS.md` en vez de correrse

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: fueron 3 de las 20 filas de globex. Con el 250 arreglado dejan de pedirle algo a una persona, pero la
mutación sigue sin correrse.

## Resumen

Era el punto 2 del fix del 250, y se separó porque pide una decisión que el resto de ese caso no
necesita. Cuando Build o Review escriben «hipótesis, no comprobada: romper X pondría rojo Y», eso es
trabajo que un agente puede hacer en una copia. Hoy termina como pregunta a una persona, que la cierra
pidiendo que se corra.

## Reproducción

Sin arnés. En `globex-ops`, rama `chore/cierre-parser-y-routing`, `planning/HUMAN_ACTIONS.md` tiene las
tres filas; dos se leen así:

```
Decidir si el caso de presencia del test del logger del `api` (`req.id`, método y URL siguen saliendo) necesita su propia mutación vista en rojo.
Decidir si los casos `it.each(['human','system'])` del e2e necesitan su rojo registrado. Reportado por el build: no se vieron en rojo en esa corrida
```

## Síntoma

El de arriba. Según el 250, las tres se cerraron corriendo la mutación, y en una el revisor ya la había
corrido en una copia y la fila quedó abierta igual. Eso último no se contrastó acá.

## Causa raíz

La de 250: para Build, lo que nota y no arregla es `open`, y `open` es una fila. No hay camino por el que
una hipótesis llegue a QA como caso a correr.

## Fix propuesto

Que lo marcado como mutación sin correr entre a QA como caso, se corra en su copia y el resultado vaya a
`qa:`. Pide decidir antes cuánto puede crecer QA por tarea: un tope de mutaciones por corrida, y a dónde
va lo que pasa del tope.

## Tradeoffs

- QA cuesta más por tarea. No está medido cuánto: depende de cuántas declare cada Build.
- Una mutación mal descrita no se puede correr, y QA tiene que poder decirlo sin frenar la entrega.

## Contexto de descubrimiento

Al ordenar los casos el 2026-10-05, separado del 250.

## Relacionados

- 250 — el recorrido registra como acción humana toda observación que no corrige.

## Cierre

**Resuelto en 0.101.0**, con el tope que el dueño aceptó el 2026-10-05: tres por tarea.

`discovered[].kind` suma `mutation`. QA recibe hasta tres, las corre en una copia desechable y reporta
cada una en `mutations` con `red`. Lo que dio va a `qa:` de la entrada de `done/`: la que se puso roja,
la que sobrevivió y la que nadie corrió se leen distinto.

### El recorrido de lo que este caso enumeró

- **Fix, que entre a QA como caso y el resultado vaya a `qa:` — se hizo.**
- **«Un tope de mutaciones por corrida, y a dónde va lo que pasa del tope» — se hizo**: tres, y el resto
  queda contado en el hecho de build, como las otras clases.
- **Tradeoff «QA cuesta más por tarea» — se paga, sin medir.** Lo activa la primera corrida real con
  mutaciones declaradas; ahí se lee cuánto tardó QA.
- **Tradeoff «una mutación mal descrita no se puede correr» — se hizo**: la que QA no reporta queda como
  «declarada sin correr», y ninguna de las tres salidas frena la entrega.
- **Síntoma, «el revisor ya la había corrido y la fila quedó abierta» — no se contrastó**, y deja de
  importar: ya no hay fila.

### Lo que el caso no preveía

- **Una mutación que sobrevive no frena.** Dice que la prueba no cuida lo que nombra, y queda escrito en
  mayúsculas en `qa:`; pararla ahí sería un freno nuevo sobre trabajo que ya pasó Verify y QA.
- **Sin QA no se corre.** En el carril mecánico y en una tarea sin superficie ejecutable quedan como
  «declaradas sin correr».

### Qué se corrió

- **Antes y después en el arnés**: la mutación iba a `build-debt`; ahora está en el prompt de QA, no abre
  fila ni entrada de INBOX, y el prompt de Done trae `mutaciones: … roja (1 failing)`, o «SOBREVIVIÓ», o
  «1 declarada(s) sin correr».
- **Siete mutaciones.** Seis en rojo a la primera; **una sobrevivió** —quitar la frase que dice que una
  que sobrevive no hace fallar el QA—, se agregó la aserción y se vio en rojo.
- **Lo que no se corrió**: un QA real corriendo una mutación en una copia. El arnés mira el prompt.

### Un QA real, el 2026-10-05

Con el prompt literal de la fase QA y dos mutaciones declaradas, sobre un repositorio de verdad: una que
tenía que ponerse roja y otra que no tenía prueba que la viera. El agente corrió cada una en una copia
bajo el temporal, con la copia en verde antes de mutar. Devolvió la primera con `red: true` y la salida
del `node --test` en rojo; la segunda con `red: false` —«la mutación sobrevive: `assert.throws` no
comprueba el mensaje»— y `passed: true`. Comprobado en el disco: el repositorio quedó con el árbol limpio
y en el mismo commit. Lo que sigue sin correrse es la fase dentro de un `autobuild` entero: en las dos
corridas reales Build corrió sus mutaciones él mismo y no declaró ninguna.
