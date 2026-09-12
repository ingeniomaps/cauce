---
caso: 110
titulo: Cuando el paquete empieza a traer un guard con el nombre de uno propio, `upgrade` lo pisa sin decir nada
estado: resuelto
resuelto-en: 0.82.0
prioridad: media
version-detectada: 0.81.0
---

# 110 — `upgrade` reemplaza el guard propio de la empresa por uno nuevo del toolkit con el mismo nombre

**🟢 resuelto en 0.82.0** · detectado en 0.81.0 · prioridad **media** — pisa contenido de la empresa sin una línea que lo
diga, y el guard que ella había escrito deja de correr; hace falta que el nombre coincida, lo que hoy es raro.
Sube a **alta** el día que se arregle el 100: ahí deja de haber cualquier caso en que se conserve

## Resumen

`template/AGENTS.md:93` le dice a la empresa que cree su guard en `automatization/hooks/guard-<nombre>.sh` y
promete que «sobrevive a cada actualización, porque el toolkit no lo conoce». Eso vale mientras el toolkit
no traiga un archivo con ese nombre. El día que una versión nueva trae `guard-<nombre>.sh`, `upgrade` copia
el del paquete encima del de la empresa: sin «editado localmente», sin «conservado», sin detenerse, y con la
salida de siempre —«planning, organization y todo lo propio quedaron intactos»—. El archivo de la empresa se
pierde salvo que esté commiteado, y lo que corre con ese nombre pasa a ser el guard del toolkit.

0.81.0 trajo dos nombres nuevos, `guard-chat.sh` y `guard-secrets-shell.sh`; cada versión que agregue uno
abre la misma ventana.

## Reproducción

Desde un directorio vacío, con los paquetes publicados:

```bash
B=$(mktemp -d); cd "$B"
npx -y @ingeniomaps/cauce@0.80.0 init "$B/acme" --mode embedded --runner ninguno --install >/dev/null; cd acme
printf '#!/usr/bin/env bash\n# guard-chat de ACME: frena el deploy de los viernes\nexit 0\n' \
  > automatization/hooks/guard-chat.sh
grep -c guard-chat .cauce/manifest.json
npm install --save-exact @ingeniomaps/cauce@0.81.0 >/dev/null 2>&1
node tools/ops.js upgrade . --check | grep -cE 'editado|guard-chat'
node tools/ops.js upgrade . > upgrade.log; echo "exit=$?"
grep -E '^✓|ruta\(s\)|intactos' upgrade.log
grep -cE 'editado|conservado|guard-chat' upgrade.log
head -2 automatization/hooks/guard-chat.sh
cmp -s automatization/hooks/guard-chat.sh node_modules/@ingeniomaps/cauce/automatization/hooks/guard-chat.sh \
  && echo "idéntico al del paquete"
```

Y la variante que hoy sí se salva: el mismo guard, registrado por un `upgrade` en 0.80.0 —el defecto del
100— y editado después.

```bash
B=$(mktemp -d); cd "$B"
npx -y @ingeniomaps/cauce@0.80.0 init "$B/acme" --mode embedded --runner ninguno --install >/dev/null; cd acme
printf '#!/usr/bin/env bash\n# guard-chat de ACME: frena el deploy de los viernes\nexit 0\n' \
  > automatization/hooks/guard-chat.sh
node tools/ops.js upgrade . >/dev/null; grep -c guard-chat .cauce/manifest.json
echo '# ajuste' >> automatization/hooks/guard-chat.sh
npm install --save-exact @ingeniomaps/cauce@0.81.0 >/dev/null 2>&1
node tools/ops.js upgrade . | grep -E 'guard-chat|conservados por'
head -2 automatization/hooks/guard-chat.sh
```

## Síntoma

Salida real, 2026-09-11, de 0.80.0 a 0.81.0 publicados. La primera:

```
0
0
exit=0
✓ Cauce 0.80.0 → 0.81.0
  35 ruta(s) del sistema y 1 del runtime actualizadas
  planning, organization y todo lo propio quedaron intactos
0
#!/usr/bin/env bash
# Shim: qué registra está en engine/hooks/run.js → guards['chat']. Sale siempre con 0: el runner lo corre
idéntico al del paquete
```

El guard no estaba registrado (0), `--check` no lo nombra (0), el `upgrade` sale con 0 y ninguna de sus
líneas dice «editado», «conservado» ni `guard-chat` (0). La línea «# guard-chat de ACME» ya no está: el
archivo es, byte por byte, el del paquete. El banco no es un repositorio git, así que el contenido no vuelve.

La variante registrada y editada:

```
1
= conservado automatization/hooks/guard-chat.sh (editado localmente)
= 1 archivo(s) conservados por tu edición
#!/usr/bin/env bash
# guard-chat de ACME: frena el deploy de los viernes
```

Se salva porque el registro del 100 le había tomado la huella y la edición la hace diferir: `upgrade` lo
confunde con un guard del toolkit editado. Es una protección accidental, y el arreglo del 100 la quita.

## Causa raíz

- `engine/core/manifest.js:125-132`, `edited()`: `if (!recorded[key]) return false` (`:129`). Un archivo sin
  huella registrada no cuenta como edición; el comentario de `:123-124` lo justifica —«llegó con una versión
  anterior a este mecanismo, o lo agregó el proyecto»— y el segundo caso es justamente éste.
- `engine/core/ownership.js:299-311`, `localChanges`, sólo reporta lo que `edited()` devuelve, así que el
  guard no entra en `conservados` (`engine/cli/instance.js:307`).
- `engine/cli/instance.js:71`, `copyRuntime`: escribe cada archivo del paquete que `conservar` no pida
  saltear, exista o no en disco. Con el nombre coincidiendo, lo que hay en disco se reemplaza.

La protección que hoy existe para un contenido que Cauce no entregó —`RETIRED_COMPARTIDO`,
`engine/core/ownership.js:251`, aplicada en `engine/cli/instance.js:382-385`— cubre sólo las rutas que el
toolkit retira, no los archivos que empieza a traer.

## Fix propuesto

**Decisión pendiente del usuario:** qué hace `upgrade` con un archivo del runtime que el paquete trae, que
el manifiesto no registra y cuyo contenido difiere del del paquete.

- **(a) Conservarlo y nombrarlo**, como hace `RETIRED_COMPARTIDO` con lo que no entregó: se saltea al copiar
  y la corrida dice algo como «automatization/hooks/guard-chat.sh: ya existía y Cauce no lo entregó; lo
  conservé y el guard nuevo no se instaló. Renombrá el tuyo y repetí, o repetí con --force». Con `--force`
  se reemplaza y la salida lo dice.
- **(b) Pisarlo**, que es lo de hoy. Sostenible sólo si `template/AGENTS.md:93` deja de prometer que un guard
  propio sobrevive siempre.
- **(c) Reservar un prefijo para los guards de la empresa** —p. ej. `guard-local-<nombre>.sh`— que el
  toolkit se compromete a no usar nunca, y cambiar `template/AGENTS.md:93` para que lo pida. Evita la
  colisión a futuro, pero no ayuda a los guards que ya existen con otro nombre, y editar `template/` baja a
  todos los consumidores en su próximo `upgrade`.

**Recomendación: (a).** Es el único que no pierde nada sin decirlo, reusa una forma que el motor ya tiene y
no le pide a ninguna empresa renombrar lo que ya escribió. (c) puede sumarse después como convención, pero
sola no protege a nadie hoy.

La forma de (a): antes de `copyRuntime`, en cada ruta del runtime, los archivos que están en disco y en el
paquete, sin huella en el manifiesto y con digest distinto del del paquete, entran a una lista de colisiones
que `conservar` saltea y el informe nombra. Un archivo sin huella pero idéntico al del paquete no es
colisión: se registra y listo.

## Tradeoffs

- **Instancias anteriores al manifiesto.** Para ellas «sin huella» también significa «lo entregó una versión
  vieja» (el comentario de `manifest.js:123-124`), y (a) conservaría cada guard del toolkit que cambió desde
  entonces. Se acota aplicando la regla sólo si el manifiesto ya registra algo en esa ruta. No medido cuántas
  instancias así quedan.
- **Mientras la colisión no se resuelva, el guard nuevo del toolkit no está instalado.** Es lo que (a) elige
  a propósito, y por eso la línea tiene que decirlo.
- **Choca con el 100 si se arregla primero.** Con el registro podado a lo que trae el paquete, ningún guard
  propio queda registrado y la variante que hoy se salva pasa a pisarse igual que la primera. Ninguno de los
  dos casos debería publicarse sin el otro.

## Qué tiene que probar el cierre

- La primera reproducción termina con `# guard-chat de ACME` en el archivo y una línea que nombra la
  colisión; vista en rojo con el `upgrade` de hoy.
- Con el arreglo del 100 puesto, la variante registrada y editada también se conserva y se nombra: la
  protección no se pierde en el camino.
- Un guard del toolkit registrado y sin editar se sigue actualizando en silencio, y uno sin huella pero
  idéntico al del paquete no produce ninguna línea: el arreglo no puede volver ruidoso el caso normal.
- Si la decisión es (a), `--force` lo reemplaza y la salida lo dice, y lo que dice coincide con lo que quedó
  en disco —no la línea falsa del 100 y el 048—.
- Si la decisión es (b) o (c), `template/AGENTS.md:93` deja de prometer lo que no se cumple.

## Contexto de descubrimiento

2026-09-11, al mejorar el 100: su arreglo deja de registrar los guards propios, y había que ver qué hacía
`upgrade` con uno que el paquete empieza a traer. No se vio en una instancia real; se reprodujo con los dos
nombres que agregó 0.81.0 (`guard-secrets-shell.sh` entró en `938f5364`).

## Relacionados

- **100** — el mismo registro, del otro lado: ahí un guard propio registrado ensucia la lista de editados;
  acá uno no registrado se pisa. El arreglo de 100 convierte a todo guard propio en el caso de éste, así que
  se deciden juntos.
- **044** — `upgrade` sin resolución por archivo.
- **048** — `upgrade` diciendo «descartado» sobre lo que conservó: si (a) agrega un `--force` que reemplaza,
  su línea tiene que decir lo que pasó.
- `template/AGENTS.md:93` y la entrada 0.55.0 del CHANGELOG (`CHANGELOG.md:1359-1367`), que prometen que un
  guard propio en esa carpeta sobrevive.

## Cierre

**🟢 resuelto en 0.82.0** · `engine/core/ownership.js` (`collisions`), `engine/cli/instance.js`,
`engine/automation/index.js`, cerrado junto con el 100

### Contra lo que el caso enumeró

- **Decisión pendiente** — el usuario eligió (a): conservarlo y nombrarlo.
- **La forma de (a)** — hecha como se propuso: `collisions` junta los archivos del runtime que el paquete trae,
  que están en disco sin huella y con contenido distinto. `upgrade` los saltea al copiar, los nombra, no los
  registra —así la corrida siguiente los vuelve a ver— y `--check` los cuenta y sale con 1. Sin huella e
  idéntico al del paquete no es choque: se registra en silencio.
- **Tradeoff «instancias anteriores al registro»** — hecho como se propuso: sólo cuenta si el registro ya
  conoce la ruta; si no, se actualiza como antes, sin ninguna línea.
- **Tradeoff «mientras no se resuelva, el guard nuevo no está instalado»** — se cumple, y la línea lo dice.
- **Tradeoff «choca con el 100»** — resuelto: salen en el mismo cambio.
- **Cada ítem de «Qué tiene que probar el cierre»**:
  - la reproducción conserva el guard y nombra el choque, vista en rojo con el `upgrade` de antes: hecho;
  - con el 100 puesto, la variante registrada y editada se sigue conservando: hecho, con prueba propia;
  - un guard sin huella e idéntico no produce línea, y uno registrado sin editar se actualiza en silencio:
    hecho, lo segundo con las pruebas de `upgrade.test.js` que siguen en verde;
  - `--force` lo reemplaza, lo dice, y lo que dice coincide con el disco: hecho;
  - el ítem sobre (b) o (c) no aplica: la decisión fue (a), y `template/AGENTS.md:93` sigue siendo cierto.

### Lo que el caso no preveía

- **`automation check` mandaba a una vuelta sin salida.** Con el choque conservado, decía
  «`guard-chat.sh`: quedó atrás del paquete […]; corré `cauce upgrade` antes de instalar el runner», y
  `upgrade` lo conservaba otra vez: el runner no se podía instalar. Ahora, para un choque, dice «es tuyo y se
  llama como uno que trae el paquete […]; renombrá el tuyo y corré `cauce upgrade`». Comprobado en la
  instancia real antes del arreglo, y con prueba.

### Qué se corrió

- **El rojo previo**: la prueba nueva sobre la base, en rojo.
- **Una instancia real**, hecha con el 0.80.0 publicado, con un `guard-chat.sh` propio, y actualizada con el
  paquete empaquetado de la rama:

  ```
  --- upgrade --check
    choca con uno tuyo: automatization/hooks/guard-chat.sh
  exit=1
  --- upgrade
  = conservado automatization/hooks/guard-chat.sh: ya existía y Cauce no lo entregó, así que el del paquete no
    se instaló. Renombrá el tuyo y repetí, o repetí con --force para reemplazarlo.
  guard-chat conserva el de ACME: 1
  --- upgrade --force
  − reemplazado automatization/hooks/guard-chat.sh, que era tuyo y se llamaba como uno del paquete
  guard-chat conserva el de ACME tras --force: 0
  ```
- **Mutaciones, en una copia desechable (R23)**, las seis del 110 rojas: sin detección de choques, el choque
  conservado queda registrado, choca aunque el registro no conozca la ruta, `--check` no los cuenta, un
  archivo idéntico sin huella cuenta como choque, y `automation check` vuelve a mandar a correr `upgrade`.
- **La pasada de comentarios** en 0.22 contra la base: ningún par nuevo.
- `npm run ci`, con los archivos nuevos ya en el índice: código 0, 702 de 702, cobertura de 61 archivos en su
  piso o por encima, ningún export sin uso.

### Recorrido de la auditoría (2026-09-12)

Tres ítems que este cierre había dejado sin recorrer.

- **La condición de escalada del encabezado** —«sube a **alta** el día que se arregle el 100: ahí deja de
  haber cualquier caso en que se conserve»— **resultó con la premisa falsa, y eso es lo que hay que
  registrar**. El 100 se arregló en este mismo cambio y **sigue habiendo** un caso en que se conserva: un
  guard propio que una versión vieja registró y que el paquete ahora trae, exactamente lo que asevera
  `test/instance/upgrade-own-guards.test.js:98`. La prioridad se queda en **media** por eso, y no por
  omisión.
- **«No medido cuántas instancias así quedan»** (Tradeoffs) — **salió como caso propio: el 125**. Contarlas
  sigue siendo imposible desde acá, pero la pregunta de abajo sí se pudo medir: **si importa**. Se montaron
  tres instancias y se corrió el `upgrade` real en cada una — sin manifiesto, con el manifiesto de `init`, y
  con una huella vieja. En la primera, **el guard propio se perdió**: `--check` dijo «la instancia está al
  día», el `upgrade` salió 0 sin nombrar el archivo, y quedó el shim del paquete. Las otras dos lo
  conservaron y lo nombraron, que es lo que este caso arregló.

  O sea que el acote que este cierre eligió —aplicar la regla sólo si el manifiesto ya conoce la ruta— deja
  afuera justo el caso que más duele, y ante la duda elige sobrescribir. Eso no le toca a este caso, que ya
  está publicado: va al **125**, con la reproducción y los tres escenarios adentro.
- **«Un guard del toolkit registrado y sin editar se sigue actualizando en silencio»** — el cierre lo
  sostenía en «las pruebas de `upgrade.test.js` que siguen en verde», que no nombra ninguna. Es
  `upgrade.test.js:72`, «upgrade conserva lo editado, actualiza el resto y lo dice». La cobertura estaba;
  faltaba la cita, que es lo que permite contrastarla sin rehacer el trabajo.
