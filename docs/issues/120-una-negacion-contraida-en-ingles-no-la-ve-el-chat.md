---
caso: 120
titulo: Una negación contraída en inglés no la ve el registro del chat, así que prohibir algo lo autoriza
estado: resuelto
resuelto-en: 0.84.0
prioridad: baja
version-detectada: 0.83.0
---

# 120 — «the tool doesn't read the .env» autoriza leer el `.env`

**🟢 resuelto en 0.84.0** · detectado en 0.83.0 · prioridad **baja** — la negación de `chat.js` reconoce `not` y
`don't`, y no las contraídas con auxiliar: `doesn't`, `isn't`, `can't`, `won't`. Una frase que prohíbe
cuenta como pedido

## Resumen

`mentions()` marca una aparición como negada si su frase trae una negación antes del nombre
(`engine/hooks/chat.js:47`). La lista cubre el español entero —`no`, `nunca`, `jamás`, `ni`, `sin`— y en
inglés sólo `not`, `never` y `don't`. Las contraídas con auxiliar no están, así que «the tool doesn't read
the .env» no se lee como negación: queda como una frase con el verbo `read` y el nombre `.env`, o sea un
pedido, y el guard deja leer la credencial.

Es el borde que el **098** nombró y el **109** acotó, en la mitad que no se miró: los dos trabajaron sobre
la negación en español.

## Reproducción

Desde un checkout de Cauce, banco desechable, cada mensaje en su propia sesión de guards. Se registra el
mensaje como lo haría el hook `chat` y después se prueba una lectura con `secrets-read`.

```js
const session = `neg-${++n}`
execute('chat', { session_id: session, prompt_id: 'p', prompt })
execute('secrets-read', { session_id: session, prompt_id: 'p', cwd: bank,
  tool_input: { file_path: path.join(bank, '.env') } })
```

## Síntoma

Salida real, 2026-09-12, motor de 0.83.0 sin publicar:

```
PASA   «the tool doesn't allow the .env»
PASA   «the tool doesn't read the .env»
PASA   «it isn't allowed to touch the .env»
frena  «it isn't reading the .env»
PASA   «we can't allow the .env»
PASA   «we can't read the .env»
frena  «the tool does not allow the .env»
frena  «the tool does not read the .env»
```

Las dos últimas frenan porque `not` sí está. La cuarta frena por otra razón y no por la negación:
`reading` no es un verbo de la lista, así que la frase no pide nada.

## Causa raíz

`engine/hooks/chat.js:47`, `NEGATION`: la alternancia es
`no|nunca|jam[aá]s|ni|sin|not|never|don'?t`. `doesn't`, `isn't`, `can't`, `won't`, `didn't` y `aren't` no
aparecen, y el ancla `(?:^|[^\p{L}])` con el cierre `(?![\p{L}])` hace que tampoco entren por dentro de
otra palabra.

## Fix propuesto

Agregar las contraídas con auxiliar a `NEGATION`, con el apóstrofo opcional como ya lo tiene `don'?t`:
`(?:do|does|did|is|are|was|were|ca|wo|would|should)n'?t`. Alcanza con un término más en la alternancia y no
cambia nada del español.

## Tradeoffs

- **La negación sigue mirando sólo lo que va antes del nombre**, que es lo que el 109 decidió no cambiar.
  Esto no lo toca: arregla qué cuenta como negación, no dónde se la busca.
- **Toca a todos los guards** que pasan por `mentions`, no sólo al de credenciales. Es la dirección segura
  —revocar—, así que lo que cambia es que algunas frases dejan de autorizar; ninguna pasa a autorizar.
- Una frase como «I can't tell if the .env is right» dejaría de autorizar y costaría un «dale». Es el mismo
  costo que el 109 aceptó para el español.

## Prioridad

**Baja.** El daño es real —una frase que prohíbe autoriza— pero pide que la persona escriba en inglés con
una contracción y que el agente intente justo esa lectura. En español, que es el idioma de la mayoría de
las sesiones de este proyecto, la negación funciona entera.

## Contexto de descubrimiento

2026-09-12, cerrando el **118**. Al medir si las palabras de autorizar que ese caso agrega abrían una clase
nueva de falso positivo, se probó la negación contraída sobre un verbo nuevo (`allow`) y sobre uno viejo
(`read`): los dos autorizan. O sea que no lo trajo el 118 y estaba desde el 098; por eso sale como caso
propio en vez de arreglarse ahí.

## Relacionados

- **098** — abrió la vía del chat y cerró «nombrar no es autorizar» con la negación. Ésta es la mitad en
  inglés que quedó afuera.
- **109** — acotó qué cuenta como pedido con la lista de verbos, y declaró en sus tradeoffs que la negación
  mira sólo lo que va antes del nombre.
- **118** — lo encontró al medir el vocabulario de autorizar.

## Cierre

**🟢 resuelto en 0.84.0** · `engine/hooks/chat.js`, `test/wiring/hooks.test.js`

### Contra lo que el caso enumeró

**El fix propuesto** — hecho tal cual: la alternancia `(?:do|does|did|is|are|was|were|ca|wo|would|should)n'?t`
entró en `NEGATION` con el apóstrofo opcional. `don'?t` salió de la lista porque `do` + `n't` ya lo cubre, y
dos reglas para lo mismo es lo que R11 pide no dejar.

**Tradeoff «la negación sigue mirando sólo lo que va antes del nombre»** — se cumple: este cambio no toca
dónde se la busca, sólo qué cuenta como negación.

**Tradeoff «toca a todos los guards que pasan por `mentions`»** — se cumple, y se midió: la puerta completa
quedó en 767 de 767, así que ninguna frase que antes pasaba dejó de pasar en lo que ya estaba probado. La
dirección sigue siendo la segura: lo que cambia es que algunas frases dejan de autorizar, ninguna pasa a
autorizar.

**Tradeoff «"I can't tell if the .env is right" costaría un «dale»»** — asumido con la razón del caso: es el
mismo costo que el 109 aceptó para el español.

### Qué se corrió

- **Rojo previo**: la prueba nueva sobre el motor sin tocar — `tests 98, pass 97, fail 1`, con
  `Missing expected exception` en `hooks.test.js:2277`. O sea que una frase que prohíbe estaba autorizando.
- **Verde**: 115 de 115 en las dos suites tocadas; `npm run ci` y `npm test` en 0, **767 de 767**.
- **Mutación** (M1, en copia desechable, R23): devolver `CONTRACTED` a sólo `don'?t` pone la prueba en rojo.
  Sin eso el verde sólo diría que la prueba corre.
- **El control dentro de la prueba** —«the tool does not read the .env», la forma sin contraer, que ya
  frenaba— está para que lo que mida sea la contracción: sin él, un `NEGATION` roto entero daría el mismo
  verde.
