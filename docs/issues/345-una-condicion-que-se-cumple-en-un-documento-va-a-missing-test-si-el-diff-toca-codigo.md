---
caso: 345
titulo: Una condición que se cumple en un documento va a missing-test si el diff también toca código
estado: resuelto
resuelto-en: 0.106.0
prioridad: alta
version-detectada: 0.104.1
---

# 345 — Una condición de aceptación que se cumple en un `.md` o en un comentario se clasifica `missing-test` cuando el diff también toca código: el recorrido pide una prueba para prosa, y o la consigue o para en `verify-hollow`

**🟢 resuelto en 0.106.0** · detectado en 0.104.1 · prioridad **alta**.

**Prioridad alta**: es el camino principal y no un borde. Una tarea de código cuya aceptación pide además
dejar algo escrito —un riesgo en un registro, un comentario corregido— es lo habitual en una instancia con
reglas de documentación, y en la instancia que lo reporta pasó en cinco de nueve tareas seguidas y paró tres
corridas. Cada parada cuesta la corrida entera.

## Resumen

Verify clasifica cada criterio sin prueba con una causa. `no-surface` es la que deja pasar lo que se cumple
en un artefacto que no se ejecuta, pero el pedido la permite **sólo si la tarea no tocó ningún archivo
ejecutable**. Con código en el diff, la misma condición —«`docs/RIESGOS.md` gana la entrada X», «se corrige
el comentario de `archivo:línea`»— sale como `missing-test`. De ahí hay dos finales, y los dos son malos:

1. El paso de pruebas faltantes escribe una prueba que lee el `.md` o el fuente y asercia su texto. Verify
   la acepta y la tarea cierra con una prueba que no cuida ninguna conducta.
2. No hay nada que aserciar —un comentario—, la segunda pasada devuelve el mismo criterio y la corrida
   para en `verify-hollow`, con el código construido, revisado y sin commitear.

La salida que el motor ya tiene, `(fuera de verify: <razón>)`, funciona, pero nadie que escriba o aclare
una aceptación la conoce para este caso: `check` sólo la sugiere para condiciones que nombran el commit o
`done/`, y Ready no la menciona.

## Reproducción

No se reprodujo desde un directorio vacío: depende del veredicto de un modelo. La forma mínima es una tarea
en cola como ésta, sobre un servicio con pruebas:

```
- [ ] **doc-y-codigo** [lite] — El handler rechaza X. _Aceptación: 1. el handler responde 403 ante X;
  2. `docs/RIESGOS.md` anota el riesgo aceptado._ (service: api)
```

Con el diff tocando `src/handler.ts`, su spec y `docs/RIESGOS.md`, Verify devuelve la condición 2 en
`uncovered` con `cause: missing-test`. Con el diff tocando sólo `docs/RIESGOS.md`, la devuelve `no-surface`.

## Síntoma

Las seis veces que corrió `missing-tests` en cuatro corridas del 2026-10-08, leídas de los registros de los
agentes. En cinco la condición pedida era prosa:

```
swagger-no-pasa-si-el-guard-devuelve-false
  result: {"stopped": true, "reason": "verify-hollow", "detail": "sin test que lo codifique: La entrada de
  RIESGOS.md dice que el acceso se conserva hasta que la sesión termina o pasa por una ruta protegida…"}
auto-login-log-sin-texto-del-error
  missing-tests: «…no toques el código de producción: Se corrige el comentario de
  verification.controller.ts:155, que afirmaba que el texto se redacta»
  result: {"stopped": true, "reason": "verify-hollow", "detail": "sin test que lo codifique: Se corrige el
  comentario de verification.controller.ts:155, que afirmaba que el texto se redacta"}
domain-map-roto-frena-el-arranque
  uncovered: [missing-test] «5. Los dependientes de la quita quedan corregidos en el mismo cambio
  (comentario de src/config/app.config.ts y entrada de docs/RIESGOS.md)»  → segunda pasada: uncovered []
variables-de-pgadmin-sin-uso
  uncovered: [missing-test] «2. El comentario final del schema deja de decir que…», «5. docs/RIESGOS.md
  cierra el riesgo de…»  → segunda pasada: uncovered []
lockout-por-ip-mira-todo-el-multi
  result: {"stopped": true, "reason": "verify-hollow", "detail": "sin test que lo codifique: 3.
  docs/RIESGOS.md gana dos entradas con el formato de R33 y estado «aceptado»"}
```

Las dos que pasaron en la segunda vuelta lo hicieron con una prueba que asercia el texto del documento. En
la primera parada el paso había escrito una así, y quien retomó la corrida la borró.

## Causa raíz

- `automatization/workflows/autobuild.js:1665` — el pedido de Verify: «no-surface vale sólo si la tarea no
  tocó ningún archivo que no termine en `.md`, `.txt`, …; con cualquier otro en el diff es missing-test». La
  condición es por diff y no por criterio, así que una condición sobre un documento hereda la causa del
  código que viaja con ella.
- `automatization/workflows/autobuild.js:1706-1711` — `lacking()` excluye sólo `no-surface` y lo declarado
  fuera de verify, y lo que queda se le manda a `missing-tests` con «escribí sólo las pruebas que faltan»,
  sin distinguir si el criterio nombra un artefacto ejecutable.
- `automatization/workflows/autobuild.js:1124-1127` — Ready aclara la redacción de la aceptación y no sabe
  que existe la marca.
- `engine/planning/contracts.js:190-199` — `check` sugiere `(fuera de verify: …)` sólo cuando la condición
  nombra algo que existe después de Verify.

## Fix propuesto

Es una propuesta. Tres formas, de la más chica a la más de fondo:

1. **Que Ready marque.** Sumarle a su pedido que una condición que se cumple en un documento, un comentario
   o una decisión escrita lleva `(fuera de verify: <razón>)`, y que la devuelva reescrita. Es texto, y deja
   el filtro de `lacking()` como está.
2. **Que `no-surface` sea por criterio.** El criterio que nombra un archivo no ejecutable —la misma lista
   `NON_EXECUTABLE`— puede salir `no-surface` aunque el diff toque código; los demás criterios de la tarea
   siguen obligados a `missing-test`.
3. **Que `missing-tests` no escriba pruebas de prosa.** Pedirle que, si lo único aserciable es el texto de
   un archivo no ejecutable, lo devuelva como tal en vez de escribir la prueba.

## Tradeoffs

- La restricción por diff está puesta a propósito: el comentario de `:1703-1705` dice que `no-surface` no
  debe servir para cerrar sin pruebas. La forma 2 abre esa puerta por criterio; lo que la sostiene es que
  el resto de los criterios siga sin poder usarla. No está medido cuánto la usaría un modelo de más.
- La forma 1 depende de que Ready la siga. En la instancia que lo reporta una nota equivalente, escrita en
  el contexto de la épica, alcanzó en tres de cuatro tareas.
- Hay proyectos que quieren la prueba de prosa —un registro de riesgos que no puede perder una entrada—.
  Para ésos la condición sin marca tiene que seguir pidiendo prueba; la forma 3 les sacaría eso.

## Revisión del 2026-10-09

Las citas se abrieron contra el fuente de 0.105.0 y coinciden. Una cosa que el enunciado no decía, y que
acota el primer tradeoff:

- **`check` ya admite el `n/a` por criterio.** `surfaceWithoutTests`, en
  `engine/planning/contracts.js:206-210`, juzga «el n/a entero y no el mixto»: una tarea que rastrea algún
  criterio con su prueba y declara otro sin superficie pasa, aunque el commit toque código. O sea que la
  forma 2 no abre una puerta que `check` tenga cerrada; lo que `check` sigue frenando es la tarea de
  código que no rastrea **ningún** criterio. Lo que queda sin medir es lo mismo que decía el tradeoff:
  cuánto usaría un modelo `no-surface` de más sobre criterios que sí se podían probar.

## Cierre

**Resuelto en 0.106.0** por la forma 2: la causa se le pide a Verify criterio por criterio. Era una frase del
pedido —«no-surface vale sólo si la tarea no tocó ningún archivo que no termine en …; con cualquier otro en
el diff es missing-test»— y se cambió por «la causa es de cada criterio y no de la tarea». El resto del
recorrido ya trataba la tarea mixta: el rebote filtra por causa, Done recibe `sin-superficie=` y `check`
admite el `n/a` por criterio.

**Valor**: en la instancia que lo reporta eran cinco de nueve tareas y tres corridas paradas; cada parada
cuesta la corrida. **Riesgo que se tomó**: que un modelo use `no-surface` para esquivar la prueba de un
criterio de código. Es el que la restricción por diff cuidaba, y es lo que se midió abajo.

### El recorrido de lo que este caso enumeró

- **Forma 1, que Ready marque `(fuera de verify: …)` — se decidió que no.** Una condición marcada no llega a
  Verify ni a QA; con la forma 2 sigue llegando a las dos, y queda en `done/` como `CN → n/a — razón`, que es
  más rastro y no menos. Además dependía de que Ready la siguiera: en la instancia, tres de cuatro.
- **Forma 2, `no-surface` por criterio — se hizo**, en `VERIFY_ASK` (`autobuild.js`). La lista
  `NON_EXECUTABLE` sigue siendo una sola y el pedido la nombra; se sumó «un comentario», que es dos de las
  cinco condiciones del síntoma y no vive en un archivo de esa lista.
- **Forma 3, que `missing-tests` no escriba pruebas de prosa — se decidió que no.** Le sacaba la prueba al
  proyecto que la quiere. Con la forma 2 ya no se le pide: la condición de documento no entra en su lista.
- **Final 1 del resumen, la prueba que asercia el texto de un `.md` — deja de pedirse.** Lo que no cambia: un
  Build que la escriba por su cuenta. No se observó y nada lo impide.
- **Final 2, `verify-hollow` por un comentario — cerrado**: sale `no-surface` y no frena.
- **Causa raíz, Ready y `check` no ofrecen la marca para este caso — no se tocó**, porque la marca dejó de
  hacer falta acá. `check` la sigue sugiriendo sólo para lo que existe después de Verify.
- **Tradeoff «abre la puerta que el comentario de `:1703` cuidaba» — medido, y acotado.** El comentario se
  movió al pedido y dice lo que de verdad sostiene cada caso: `check` juzga el `n/a` entero contra el commit,
  y en la tarea mixta cada `n/a` queda escrito con su razón. En las nueve corridas de abajo, el criterio de
  código sin prueba salió `missing-test` las nueve veces. No está medido con otro modelo ni con criterios
  de otra clase; lo mide la primera instancia que lo use.
- **Tradeoff «depende de que Ready la siga» — no aplica**: la forma 1 no se hizo.
- **Tradeoff «hay proyectos que quieren la prueba de prosa» — sigue en pie, y cambia de lado.** Antes la
  conseguían sin pedirla, cuando el diff traía código. Ahora la piden: la condición dice que una prueba lo
  asercia, o Build la escribe y Verify la da por cubierta. Va en el CHANGELOG, que es donde lo lee quien
  la tenía.
- **Reproducción «no se reprodujo desde un directorio vacío» — se reprodujo**, sin correr el recorrido
  entero: el pedido textual de Verify sobre un repositorio de prueba. Es lo que este caso no preveía, y lo
  que permitió medirlo.

### Lo que encontró la revisión independiente

Un subagente revisó el diff sin partir de que estaba bien, con sondas sobre el arnés. De este caso encontró un
borde que las nueve corridas no ejercían: una tarea con código a la que Verify le declara **todos** los
criterios sin superficie. Con la regla por diff eso rebotaba en Verify; con la causa por criterio llegaba a
Done y `check` lo rechazaba ahí, con Build, Review y Verify ya pagados, y QA recibía «no tiene superficie
ejecutable» sobre un diff con código. Se cerró en el recorrido: si la tarea escribió pruebas y todo lo sin
cubrir es `no-surface` con nada cubierto, cuenta como prueba faltante y frena en Verify. Tiene su prueba y su
mutación en rojo. Lo que queda afuera: una tarea de código que no escribió ninguna prueba; ahí el freno
sigue siendo `check`, como antes de este caso.

### Qué se corrió

Un servicio de prueba con una tarea sin commitear que toca `src/handler.js`, su prueba y `docs/RIESGOS.md`,
y el pedido de Verify tal como lo arma el recorrido —sacado del arnés, antes y después del cambio—, corrido
con `claude -p` y el motor congelado. Lo que la corrida no tiene del recorrido real: el esquema lo impone
una instrucción al final del pedido y no la herramienta.

Hipótesis escrita antes: con el pedido viejo las condiciones 3 y 4 salen `missing-test`; con el nuevo,
`no-surface`. Lo que la desmentía: que la 2 —código sin prueba— saliera `no-surface` con el pedido nuevo.

```
pedido viejo, 3 corridas    2 [missing-test]  3 [missing-test]  4 [missing-test]   1 covered
pedido nuevo, 3 corridas    2 [missing-test]  3 [no-surface]    4 [no-surface]     1 covered
```

La razón que dio el pedido viejo, textual de una corrida: «La fila está en el diff de docs/RIESGOS.md, pero
ninguna prueba asercia su presencia». Y la del nuevo: «Se cumple en un comentario, que no se ejecuta: la
línea 3 de api/src/handler.js».

Segundo escenario, tres corridas más con el pedido nuevo: todo el código con su prueba y una quinta
condición puesta para tentar, «`handle` no escribe el cuerpo del pedido en ningún log» —conducta del código,
difícil de probar—. Salió `missing-test` las tres veces («Es una conducta del código y ninguna prueba la
asercia»), con 3 y 4 en `no-surface` y `passed=true`. Nueve corridas, USD 2,51.

- Rojo previo y mutación: la prueba nueva de `test/workflows/autobuild-surface.test.js` falló antes del
  cambio; con la frase vieja devuelta al lado de la nueva, la aserción de ausencia se puso en rojo.
- `test/planning/no-surface.test.js` fija que `check` acepta la entrada mixta en la forma que escribe el
  recorrido, `C1 → prueba; C2 → n/a — razón`, sobre un commit que toca código.
- Regresión: 251 de 251 en `test/workflows/` y la puerta entera, `npm run ci`, con 1306 pruebas.

### Corrida real de punta a punta (2026-10-09)

Después de cerrar los casos de esta versión se corrió `/autobuild` de verdad, con el runner instalado y el
motor de la rama, sobre una instancia de prueba con dos líneas armadas con `ops line`. En `admin`, una tarea
con una condición de código, una de documento y una de comentario, de Triage a Done y al checkpoint del
hito: 12 minutos y cerca de un millón de tokens. En `auth`, una tarea cuya aceptación pedía una decisión que
nadie había tomado: paró en Ready a los 3 minutos. Se leyeron el diario de cada corrida y lo que quedó en
disco.

De este caso: Verify devolvió la condición de código cubierta por su prueba y las otras dos como
`no-surface` —«se cumple en un documento», «se cumple en un comentario»—, sin vuelta de pruebas faltantes.
Done las escribió una por una, `A → n/a — Se cumple en un documento, docs/RIESGOS.md línea 5…`, junto a la
traza de la prueba, y `ops check` quedó en verde sobre un commit que toca código.

## Contexto de descubrimiento

Instancia `acme-ops`, hito de nueve tareas sobre un servicio NestJS, el 2026-10-08, con 0.104.1 y 0.105.0.
Las reglas del proyecto piden que todo riesgo quede en `docs/RIESGOS.md` en el mismo cambio, así que casi
toda aceptación trae una condición de documento. Tres corridas pararon por esto: unos 7,6 millones de
tokens las dos primeras, según el propio recorrido, para dos tareas cerradas y una construida.

## Relacionados

- [189](./189-verify-no-tiene-como-clasificar-un-criterio-que-ninguna-prueba-puede-codificar.md) — creó
  `no-surface`; este caso es lo que queda afuera por la condición «sólo si el diff no toca código».
- [195](./195-verify-no-respeta-la-marca-fuera-de-verify-que-check-pide-escribir.md) y
  [290](./290-verify-hollow-para-por-una-condicion-declarada-fuera-de-verify.md) — la marca funciona; acá
  lo que falta es que alguien la ponga.
- [346](./346-verify-no-tiene-vuelta-de-correccion-propia.md) — la otra forma en que la misma fase termina
  en `verify-hollow`. Este caso va antes: la única observación de aquél nace de una condición de documento.
