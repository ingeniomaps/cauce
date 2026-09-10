---
caso: 072
titulo: Un punto y coma dentro de la prosa de `tests:` parte la traza, y el error no nombra la causa
estado: resuelto
resuelto-en: 0.75.0
prioridad: media
version-detectada: 0.74.0
---

# 072 — El separador de trazas es el signo más común de la prosa española, y el mensaje manda a revisar lo único que estaba bien

**🟢 resuelto en 0.75.0** · detectado en 0.74.0 · prioridad **media** — no rompe nada, cuesta una vuelta de diagnóstico cada vez, y la vía por la que se sale mal es empobrecer la evidencia

## Resumen

`check` valida el campo `tests:` de una entrada de DONE partiéndolo por `;` y exigiendo que **cada
fragmento** sea una traza:

```js
const TEST_TRACE = /^(?:n\/a\s*[—-]\s*.+|(?:A|C\d+)\s*(?:→|->)\s*\S.+)$/i
function validTestTrace(value) {
  return String(value || '').split(/\s*;\s*/).filter(Boolean)
    .every((item) => TEST_TRACE.test(item))
}
```

El campo, además de trazar, lleva prosa: el contrato pide `CN → prueba` y en la práctica se escribe
también qué demuestra esa prueba y cómo se la vio fallar, que es lo que R9 exige. Y la prosa en español
lleva punto y coma.

Entonces esto, que es una sola traza correcta, se rechaza:

```
tests: A → `runtime.test.ts`, con los rojos por mutación: quitar el HEALTHCHECK pone rojos tres
casos; `--start-period=1m` pone rojo el techo de 30 s; y un `USER root` posterior pone rojo el
caso del usuario.
```

Se parte en tres. El primer fragmento valida; el segundo empieza con un backtick y el tercero con «y»,
así que ninguno matchea, y el campo entero se rechaza.

**Comprobado el 2026-09-10** llamando al validador con cuatro campos, que es la diferencia entre leer el
regex y verlo decidir:

```
pasa   traza sola
pasa   traza con prosa, sin punto y coma
FALLA  la misma prosa con un ; adentro
pasa   dos trazas de verdad: "A → uno.test.js; C1 → dos.test.js"
```

Las cuatro filas juntas son el caso entero: el separador funciona como se documentó y la prosa lo pisa.

## Reproducción

Cualquier entrada de DONE con un `;` dentro de la prosa de `tests:`:

```
$ node tools/ops.js check planning
✗ done/<slug>.md <slug>: tests debe rastrear A/CN → prueba o justificar n/a — razón
```

Sacar los punto y coma —cambiarlos por comas o por puntos— hace pasar el mismo contenido sin tocar una
sola afirmación.

## Síntoma

**El mensaje describe la ausencia que no es.** Dice que falta la traza `A/CN → prueba`, y la traza está
—es lo primero del campo—. Quien lo lee va a revisar la parte correcta, y lo que está mal es un signo de
puntuación treinta palabras más adelante. En una instancia real pasó **dos veces en dos días**, sobre
dos entradas distintas, y las dos veces el diagnóstico costó abrir el motor para leer el `split`.

**Y la salida fácil empeora la evidencia.** Frente a un `tests:` que no valida y un mensaje que no
explica por qué, lo que uno hace es acortar: quitar la prosa hasta que pase. Lo que se pierde ahí es
justamente lo que R9 pide —qué mutación puso roja cada aserción—, y el campo queda cumpliendo la forma
con menos adentro. El contrato termina premiando la entrada más pobre.

## Causa raíz

`engine/planning/contracts.js`. El `;` cumple dos papeles a la vez y sólo uno está anunciado:

- **Separador**, deliberado y documentado para `commit:` —R8 dice que los commits de una tarea van
  «separados por `;`»— y por simetría aplicado a `tests:`.
- **Puntuación**, en un campo que el propio contrato quiere en prosa: `PROTOCOL.md` pide `CN → prueba`
  y las guías piden decir cómo se vio fallar.

Los dos usos conviven en el mismo carácter y el validador no puede distinguirlos, porque no hay nada que
distinguir: son idénticos.

## Fix propuesto

Lo más barato, y suficiente para que deje de costar una vuelta:

```diff
- tests debe rastrear A/CN → prueba o justificar n/a — razón
+ tests debe rastrear A/CN → prueba o justificar n/a — razón.
+ Ojo: el `;` separa trazas. Si tu prosa lleva uno, el campo se parte ahí y cada
+ pedazo tiene que ser una traza — cambialo por coma o punto.
```

Nombrar la causa en el mensaje resuelve el 100 % del costo observado, porque el problema no es que la
regla exista sino que no se adivina.

**Y hay una tercera vía, más barata que cambiar el contrato y más precisa que el mensaje**, que este caso
no consideró: **decir dónde se partió**. El validador ya tiene los fragmentos en la mano, así que puede
nombrar el que no valida en vez de rechazar el campo entero:

```diff
- tests debe rastrear A/CN → prueba o justificar n/a — razón
+ tests: el fragmento «`--start-period=1m` pone rojo el techo» no es una traza.
+ El `;` separa trazas, así que un punto y coma en la prosa parte el campo ahí.
```

Eso apunta al carácter exacto sin pedirle a nadie que se acuerde de una regla, y no cuesta una migración.
`validTestTrace` está exportada, así que se puede probar sin montar un planning.

Más de fondo, si se quiere: que el separador sea un salto de línea con sangría —la forma en que ya se
escriben los campos multilínea— y el `;` deje de ser sintaxis. Es un cambio de contrato y de todas las
entradas existentes, así que no lo propongo como primera opción; lo dejo dicho porque el mensaje mejor
redactado sigue pidiéndole a quien escribe que se acuerde de un carácter reservado en medio de un texto
libre.

## Tradeoffs

- Ampliar el mensaje lo hace más largo, y `check` ya emite una línea por error. Es una línea a cambio de
  una vuelta de diagnóstico, y sólo aparece cuando el campo falla.
- Cambiar el separador rompe toda entrada de DONE con más de un commit, que es la forma que R8 prescribe.
  No se hace sin migración.

## Contexto de descubrimiento

Instancia real (sidecar, 0.74.0), 2026-09-09 y 2026-09-10, dos entradas de DONE distintas escritas por
la misma persona con dos días de diferencia. La segunda vez el diagnóstico fue inmediato **porque ya
había pasado**, no porque el mensaje lo dijera.

## Contrastado contra el código, 2026-09-10

| Afirmación | Veredicto |
|---|---|
| El campo se parte por `;` y cada fragmento debe ser traza | **se sostiene** (`contracts.js:12-15`) |
| El mensaje no nombra la causa | **se sostiene** (`contracts.js:50`, texto literal) |
| Sacar los `;` hace pasar el mismo contenido | **se sostiene**, medido con cuatro campos |
| Sólo hay dos vías: mejorar el mensaje o cambiar el separador | **incompleto**: falta nombrar el fragmento |

Nada de esto baja la prioridad ni la sube: sigue siendo una vuelta de diagnóstico por vez, con la salida
fácil empobreciendo la evidencia.

## Relacionados

- **R8** — establece el `;` como separador de commits. Es de ahí que el carácter es sintaxis, y la
  simetría con `tests:` es razonable; lo que falta es que el error lo recuerde.
- **R9** — pide que la evidencia diga cómo se vio fallar la prueba. Es lo que empuja a escribir prosa en
  `tests:`, o sea lo que hace probable este choque.

## Cierre

**Resuelto en 0.75.0**, y ninguna de las tres vías que se habían enumerado es la que se tomó — porque
leyendo el archivo apareció que la decisión **ya estaba tomada quince líneas más abajo**.

- **`validCommitTrace` resolvió este mismo problema y nadie lo llevó a `tests:`.** Corta en `;` sólo
  cuando detrás viene un sha, y su comentario dice por qué: «el `;` aparece también dentro del paréntesis
  final… cortar ahí convertiría una nota en un commit que falta». Es exactamente este caso, un campo más
  arriba. Lo que se hizo fue aplicar esa decisión a `tests:`: se corta sólo cuando detrás **empieza otra
  traza** —`A →`, `Cn →`, `n/a —`—.
- **La vía «mejorar el mensaje» no se tomó y ya no hace falta.** El mensaje mandaba a revisar la traza
  porque el campo se rechazaba entero; ahora no se rechaza. Cuando `tests:` falle de verdad, «debe
  rastrear A/CN → prueba» es una descripción correcta de lo que pasa.
- **La vía «nombrar el fragmento que no valida», que este caso agregó al diagnosticarlo, tampoco.**
  Habría explicado bien un corte que ya no ocurre; era mejor que el mensaje y peor que quitar la causa.
- **La vía «cambiar el separador por un salto de línea» sigue descartada**, por lo que el propio caso
  decía: rompe toda entrada de DONE con más de un commit y pide migración.
- **Tradeoff «ampliar el mensaje lo hace más largo» — no se pagó**, porque no se amplió.
- **Tradeoff «cambiar el separador rompe toda entrada con más de un commit» — no se pagó**: el separador
  sigue siendo `;` y las entradas existentes valen igual.
- **El tradeoff que sí se paga y el caso no tenía:** una prosa que contenga `; A → algo` se va a partir
  ahí, porque desde afuera es indistinguible de dos trazas. Es la misma concesión que `commit:` aceptó
  para el sha, y es mucho más rara que un punto y coma cualquiera.

**Probado con el validador corriendo**, en las dos direcciones, porque una sola no dice nada:

```
pasa   la del caso: una traza con dos ; en la prosa
pasa   tres trazas de verdad separadas por ;
pasa   «A → uno.js; esto tampoco» — el ; que no abre traza es puntuación
FALLA  «esto no es una traza»
```

Y por el otro lado del contrato: un criterio citado y rastreado a los dos lados de un separador de verdad
sigue pasando, y uno citado que nadie rastrea se sigue cazando.

Dos mutaciones comprobadas: volver al corte a secas —que es la regresión exacta— y un validador que
acepta todo. Las dos ponen la prueba en rojo.

**Lo que apareció al probar y no era cierto: una afirmación mía.** El comentario que escribí decía que
compartir el corte entre `validTestTrace` y `testedCriteria` evitaba que discreparan «y sólo se vería
cuando un criterio citado quedara sin rastrear». Una tercera mutación —hacer que cada uno parta distinto—
**sobrevivió**: con los datos de hoy las dos formas dan el mismo resultado, porque un `;` que no abre
traza no produce un fragmento que empiece por `Cn →`. Se comparte igual, para que no se separen el día
que una cambie, y el comentario ahora dice eso y no lo otro.
