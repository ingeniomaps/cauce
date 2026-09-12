---
caso: 127
titulo: Una concesión del chat no tiene alcance declarado ni procedencia, y la persona no puede fijar ninguno de los dos
estado: resuelto
resuelto-en: 0.86.0
prioridad: baja
version-detectada: 0.86.0
---

# 127 — Lo concedido ya se ve, y sigue sin poder decirse hasta cuándo vale ni quién lo autorizó

**🟢 resuelto en 0.86.0**

## Resumen

El **117** pedía tres cosas y 0.86.0 hizo una: que lo concedido en el chat se vea en `ops check`. Las otras
dos siguen sin existir, y salen acá para no quedar archivadas dentro de un caso cerrado —que es exactamente
lo que R15 describe y lo que produjo los casos 121, 122 y 123—.

Lo que falta:

1. **Alcance declarado.** `granted` es un array plano de rutas. No se puede decir «vale mientras dure esta
   tarea» ni «vale hasta que cierre esta operación»: dura lo que dura la sesión, o hasta que alguien lo
   niegue. La forma que el 117 proponía era un archivo aparte —`planning/.ops-grants`, con ruta, guard y
   alcance— que el agente no escribe ni borra, y cuyas líneas `task:` caducan al cerrar la tarea.
2. **Procedencia.** Una línea concedida no dice de dónde salió. El 117 proponía que la escribiera el hook
   del mensaje —el único que oyó a la persona— con su marca: `# vía chat, 2026-09-12, sesión 5c17daac`. Sin
   eso, «vía chat» es una afirmación que nadie puede contrastar.

## Reproducción

Este caso se escribió diciendo que no había defecto que reproducir, sólo una capacidad ausente. **Medirlo
mostró que eso era falso**, y el hallazgo cambia el enunciado: la persona **ya dice el alcance** y el motor
lo descarta al guardar.

Sobre una instancia recién creada, con el guard real:

```js
execute('chat', { session_id: s, prompt_id: 'm1', cwd: root,
  prompt: 'escribí planning/rules/process.md mientras dure la tarea t-014' })
CHAT.unauthorized(input, ['planning/rules/process.md'])   // [] → el guard la deja pasar y la concede
```

## Síntoma

```
campos del registro: id, text, human, flow, root, approved, granted, pending
granted:             ["planning/rules/process.md"]
¿hay alcance?:       NO — cadenas planas
¿hay procedencia?:   NO
tras otro mensaje que no lo nombra: []   ← sigue concedido
```

Y así lo muestra `check`:

```
⚠ 1 ruta(s) concedidas en el chat de esta sesión: planning/rules/process.md
```

De «mientras dure la tarea t-014» sobrevivió la ruta. El alcance no es algo a lo que haya que inventarle
una sintaxis para que la persona lo escriba: **ya venía escrito en el mensaje**, y se pierde al guardar.

## Causa raíz

`engine/hooks/chat.js`: `granted` se guarda como un array de cadenas dentro del registro de la sesión, y
`grantedIn()` lo devuelve tal cual. No hay campo para alcance ni para procedencia, así que no hay dónde
escribirlos sin cambiar la forma del registro.

Es la misma causa que el 117 nombró para `.ops-approval` —«una línea es una ruta y nada más»— trasladada al
mecanismo que lo reemplazó.

Y hay un precedente que este caso no veía cuando se escribió: **un hook ya escribe dentro de la instancia**.
El rastro del **112** vive en `planning/.push-log` (`engine/hooks/push.js:144-155`): una línea JSON por push
autorizado, con `authorizedAt`, destino, vía y sesión, y **sólo agrega**, porque «lo que una auditoría
pregunta es justamente la entrada vieja». Su encabezado además acota la invariante que parecía chocar con
este caso: lo que se queda en el temporal es **el texto de la persona** —donde el 098 lo dejó—, no el hecho
de que hubo una autorización.

O sea que la procedencia del punto 2 no estrena superficie ni contradice a `chat.js`: tiene un molde ya
decidido y en uso. El alcance del punto 1 es otra cosa —no es un rastro sino estado vivo que los guards
consultan y que tiene que caducar—, y ahí sí hay una decisión de producto.

## Fix propuesto

Decidido el 2026-09-12 por el dueño del producto, con la reproducción hecha y el precedente a la vista.
Lo que sigue reemplaza a la forma que proponía el 117, y dice por qué.

**1. El alcance se lee del mensaje; no se declara aparte.** La medición mostró que la persona **ya lo
escribe** y que se pierde al guardar, así que no hace falta inventarle una sintaxis ni un archivo que cada
instancia reciba. `mentions()` ya aísla la cláusula donde aparece la ruta —para decidir si va negada y si
pide algo— y la descarta: de ahí sale el alcance.

- Se guarda **al lado** de `granted` y no adentro. `granted` se compara con `.includes(item)` en `why()`,
  se deduplica con un `Set` de cadenas en `grant()` y se acumula en `grantedIn()`: convertir sus entradas
  en objetos rompería el **116** en tres lugares, y ninguno falla ruidosamente.
- **Caduca cuando la tarea nombrada deja de ser la del WIP.** `readWip()` devuelve `null` con el WIP en
  IDLE, así que «la tarea se cerró» ya se puede leer sin mecanismo nuevo. Un hook leyendo el WIP tiene
  precedente en `files.js:229`, que además fija el orden: primero el camino barato, y el planning sólo
  cuando hace falta.
- **Y vencer es la dirección de la que se vuelve.** El WIP en IDLE, el archivo ausente y el `planning`
  ilegible son el mismo caso —`readWip` los devuelve todos como nada, porque su lectura traga el error—,
  así que en los tres el alcance vence y quien lo necesite lo vuelve a pedir. Lo distinto es **no tener
  instancia**: ahí no hay WIP contra el cual comparar y el acote se respeta, porque revocar sería castigar
  a quien trabaja fuera de una instancia por algo que nunca dijo.
- Lo que **no** cubre: un alcance que la persona no escriba con palabras reconocibles queda como hoy,
  valiendo toda la sesión. Es la misma decisión que el **118** tomó con los verbos —lista corta, y lo que
  no se reconoce no se pierde: vale lo de antes—.

**2. La procedencia sigue el molde del `.push-log`.** Un rastro que sólo agrega, una línea JSON por
concesión, con la fecha, la vía y la sesión, y **sin el texto de la persona**, que se queda en el temporal
donde el **098** lo dejó.

- `trail()` no está exportado y **no se puede importar desde `chat.js`**: `push.js` ya importa `chat.js`,
  así que el require sería circular. Sale a un módulo compartido, con su razón escrita una sola vez.
- El rastro **no viaja**: `template/gitignore` lo declara igual que a `.push-log`, y
  `test/instance/lifecycle.test.js` lo fija. La instancia no recibe ningún archivo nuevo que commitear.

## Tradeoffs

- **Leer el alcance del lenguaje natural puede entender de menos o de más.** De menos es el caso benigno y
  ya decidido: vale lo de hoy, la sesión entera. De más sería conceder con un alcance que la persona no
  dijo, y por eso se lee sobre la **misma cláusula** que ya decide si la ruta fue pedida, y no sobre el
  mensaje entero.
- **La procedencia se puede falsificar si la escribe el proceso equivocado**, así que la escribe el hook
  del mensaje y no el agente — igual que el `.push-log`.
- **Un rastro que sólo agrega crece sin techo.** Es deliberado, y es lo que el 112 eligió: lo que una
  auditoría pregunta es justamente la entrada vieja. Como no viaja en git, lo que cuesta es disco local.
- **Extraer `trail()` toca código que funciona**, que R6 pide evitar. La alternativa era duplicar ocho
  líneas y con ellas su razón, que es la copia que R11 describe: se pudre sin que nada falle.
- **El archivo aparte ya no aplica.** No se eligió `planning/.ops-grants`, así que ninguna instancia
  recibe superficie nueva y el tradeoff que el 117 marcaba —«dos archivos en vez de uno»— no se paga.

## Prioridad

**Baja**, y con una razón concreta: lo que sostenía al 117 en media era el agujero de auditoría —una
exención que no aparecía en ninguna corrida—, y eso se cerró en 0.86.0. Lo que queda es una capacidad que
nadie pidió todavía en trabajo real: no bloquea a nadie y no ensancha ningún permiso más allá de la sesión.

**Sube a media** el día que alguien necesite conceder algo por más de una sesión, o que una auditoría tenga
que establecer quién autorizó una ruta concreta y no pueda.

## Contexto de descubrimiento

Salió al cerrar el **117** en 0.86.0. La decisión del dueño fue «hacer visible lo concedido», que es el
punto 4 de aquel «Fix propuesto» y la mitad de auditoría del punto 1; los puntos 1 —alcance— y 2
—procedencia— no se construyeron, y cerrarlos dentro del 117 los habría dejado adentro de un caso resuelto.

## Relacionados

- **117** — de donde salió; su cierre nombra este caso como destino de lo que no se construyó.
- **116** — el que trajo `granted`, o sea el mecanismo al que le falta el alcance.
- **112** — una aprobación consumida no deja rastro; la procedencia que se pide acá es lo mismo visto desde
  la auditoría.
- **128** — salió de acá: una línea nueva del `.gitignore` no llega a una instancia que ya existe.

## Cierre

**🟢 resuelto en 0.86.0** · `engine/hooks/chat.js`, `engine/hooks/trail.js`, `engine/hooks/push.js`,
`template/gitignore`, `test/planning/grants.test.js`, `test/instance/lifecycle.test.js`

### Contra lo que el caso enumeró

**Punto 1, «el alcance se lee del mensaje» — hecho.** `mentions()` ya aislaba la cláusula de la ruta para
decidir si iba negada y si pedía algo, y la descartaba; ahora saca de ahí el acote. Se guarda en un mapa
paralelo a `granted` y no adentro, porque `granted` se compara con `.includes(item)`, se deduplica con un
`Set` de cadenas y se acumula en `grantedIn()`: convertir sus entradas en objetos habría roto el 116 en
tres lugares sin que nada fallara ruidosamente.

**Punto 1, la caducidad — hecha, y terminó siendo más simple de lo previsto.** Vale mientras esa tarea sea
la del WIP. No hizo falta ningún mecanismo nuevo: `readWip` devuelve nada con el WIP en IDLE.

**Punto 1, «lo que no cubre» — se cumple tal cual se declaró.** Un alcance sin la palabra `tarea`/`task`
no se reconoce y la concesión vale lo de antes, la sesión entera. Es la misma decisión que el 118 tomó con
los verbos, y está aserciado: la prueba «una concesión sin alcance no la toca el WIP» existe para eso.

**Punto 2, «la procedencia con el molde del `.push-log`» — hecha.** Una línea JSON por concesión en
`planning/.grant-log`, con `grantedAt`, el ítem, el alcance, la vía y la sesión, y **sin el texto de la
persona**, aserciado explícitamente.

**Tradeoff «leer lenguaje natural puede entender de menos o de más»** — se resolvió del lado de entender
de menos: `SCOPE` exige la palabra `tarea` o `task`, y se lee sobre la misma cláusula que ya decide si la
ruta fue pedida, no sobre el mensaje entero. Entender de menos deja lo de hoy; entender de más habría
concedido con un acote que nadie dijo.

**Tradeoff «la procedencia se puede falsificar si la escribe el proceso equivocado»** — se cumple: la
escribe el hook del mensaje, nunca el agente, igual que el `.push-log`.

**Tradeoff «un rastro que sólo agrega crece sin techo»** — asumido, y es lo que el 112 eligió. No viaja en
git, así que lo que cuesta es disco local.

**Tradeoff «extraer `trail()` toca código que funciona»** — se pagó y se comprobó: la prueba del 112 fija
el orden exacto de las claves de su rastro, y quedó en verde con el refactor puesto. `push.js` bajó de 209
a 183 líneas y su razón compartida quedó escrita una sola vez.

**Tradeoff «el archivo aparte ya no aplica»** — confirmado: ninguna instancia recibe un archivo nuevo.

**Prioridad, «sube a media si una auditoría tuviera que establecer quién autorizó una ruta y no pudiera»** —
esa mitad queda cubierta por el rastro. **La otra no**: conceder algo por más de una sesión sigue sin
poder hacerse, porque el registro muere con ella. No sube de baja por eso.

### Lo que apareció y el caso no preveía

**El caso decía que no había defecto que reproducir, y era falso.** Medirlo mostró que la persona **ya
escribe** el alcance —«escribí X mientras dure la tarea t-014»— y que el motor lo tiraba al guardar. No
había que inventarle una sintaxis: había que dejar de descartar la que ya usaba.

**Escribí una rama que no se puede alcanzar, y con ella una limitación falsa.** Puse un
`catch { return true }` en `scopeAlive` y lo documenté como «si el WIP no se puede leer, el alcance se
respeta». `readWip` **no puede lanzar**: su lectura traga el error y devuelve nada —comprobado con un
directorio en lugar del `.md` y con el `planning` inexistente, `null` en los dos—. O sea que la rama era
inalcanzable por el camino de producción, que es lo que R9 llama quedar verde para siempre sobre algo que
nadie va a vivir, y la limitación no existía. Se sacó, y lo que de verdad pasa es lo contrario y es mejor:
sin WIP legible el alcance **vence**, que es la dirección de la que se vuelve.

**`chat.js` no podía importar a `push.js`.** El require habría sido circular —`push.js` ya lo importa a
él—, y eso decidió solo que `trail()` saliera a un módulo compartido en vez de duplicarse.

**`check` sigue sin mostrar el alcance de lo que lista**, y es deliberado: la decisión que se pidió fue
dónde vive el alcance, no cómo se muestra, y cambiar el mensaje habría roto el contrato que el 117 acaba
de fijar. **Lo activa** que alguien necesite distinguir en `check` una concesión acotada de una que no lo
está.

**El `.gitignore` de una instancia existente no recibe la línea nueva**, así que ahí el rastro aparece en
`git status`. No es de este caso y no se tapó: salió como **128**, y el CHANGELOG dice la línea que hay que
copiar a mano, porque quien actualiza sí puede actuar sobre eso.

**`coverage:update` iba a bajar el piso de un archivo que no toqué.** Registrar el de `trail.js` bajaba
`engine/planning/contracts.js` de 99 a 98 en líneas, por una corrida floja de las tres. Se restituyó el 99
y la puerta pasa igual, así que el piso se sostiene y esa regresión no quedó horneada en el registro.

### Qué se corrió

- **Rojo previo**, con el motor sin tocar: la prueba del alcance devolvía `[]` donde esperaba la ruta —la
  concesión sobrevivía al cierre de la tarea— y la del rastro moría con `ENOENT` sobre `.grant-log`. La
  aserción del `.gitignore` en `lifecycle.test.js` también se vio roja, con el archivo real volcado.
- **Verde**: `tests 5, pass 5` en `grants.test.js`, **98 de 98** en el cableado de guards —que importa acá
  porque `chat.js` lo consultan siete—, `lifecycle` en 1 de 1, `npm run ci` en **0** y `npm test` en **774
  de 774**.
- **Mutaciones**, en copia desechable bajo el scratchpad (R23), con la copia verde antes de mutar y con
  `trail.js` copiado a mano porque todavía no estaba trackeado:
  - que `mentions()` deje de leer el alcance → 2 rojas;
  - **caducar todo y no sólo lo acotado → roja la de «sin alcance»**, que es la que le da sentido a esa
    aserción de ausencia: pasaba igual antes y después del arreglo;
  - no anotar el rastro → roja la del rastro;
  - no guardar el alcance en el registro → roja la de caducidad;
  - vencer también sin instancia → roja la de fuera de instancia.
- **Cobertura**: `chat.js` volvió a 88.11 % de ramas contra su piso de 88, que está en 88 desde hace seis
  versiones y no se bajó. `trail.js` quedó registrado en 100/100/100.
