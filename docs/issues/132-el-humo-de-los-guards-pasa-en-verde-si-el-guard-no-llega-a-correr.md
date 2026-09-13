---
caso: 132
titulo: La prueba de humo de los guards no distingue «el guard bloqueó» de «el guard no llegó a correr», así que pasa en verde con el guard ausente
estado: resuelto
resuelto-en: 0.87.0
prioridad: media
version-detectada: 0.86.0
---

# 132 — `hooks-smoke.sh` sale en verde aunque el guard que comprueba no exista

**🟢 resuelto en 0.87.0**

## Resumen

`test/tools/hooks-smoke.sh` es lo primero que corre `npm test`, y su trabajo es comprobar que los
wrappers de guards son ejecutables y que bloquean lo que tienen que bloquear. Su primera comprobación
—que `guard-git-add.sh` frene un `git add .`— **está escrita al revés de como hay que escribir una
prueba negativa**: mira si el guard sale con 0 y, si no, da por bueno que bloqueó.

El problema es que hay dos formas de no salir con 0, y sólo una es «bloqueó». La otra es que el guard
**no haya corrido**: no existe, no es ejecutable, se renombró, o la ruta cambió. Las dos se ven igual
desde el `if`, así que el script imprime su `✓` y sale 0 con el guard borrado del disco.

Es la misma familia que el 130 y el 131 —la herramienta que cuida algo no está cuidada— pero acá no es
una prueba que falta: es una prueba que existe y **no puede fallar por la razón que dice cuidar**.

## Reproducción

```bash
# Control: con todo en su lugar.
bash test/tools/hooks-smoke.sh    # ✓ wrappers de hooks ejecutables, exit 0

# Se saca de en medio el guard que la primera comprobación dice ejercitar:
mv automatization/hooks/guard-git-add.sh automatization/hooks/guard-git-add.sh.off

bash test/tools/hooks-smoke.sh    # sigue: ✓ wrappers de hooks ejecutables, exit 0
```

## Síntoma

Medido el 2026-09-13 sobre una copia desechable. La salida es **idéntica** con el guard y sin él:

```
=== CONTROL: con todo en su lugar ===
  ✓ wrappers de hooks ejecutables
  exit=0

=== el guard no existe: ¿lo nota? ===
  ✓ wrappers de hooks ejecutables
  exit=0
```

## Causa raíz

`test/tools/hooks-smoke.sh:7-10`:

```bash
if printf '%s' "$payload" | "$root/automatization/hooks/guard-git-add.sh" >/dev/null 2>&1; then
  echo "guard-git-add permitió un comando bloqueado" >&2
  exit 1
fi
```

La condición es «salió con 0», y su negación —la rama que el script considera éxito— junta **bloqueó**
(código 2) con **no se ejecutó** (código 127, «command not found»). El `2>&1` a `/dev/null`, que está ahí
para que el mensaje del guard no ensucie la salida, se lleva también el `command not found` que habría
delatado el caso. Y `set -eu` no ayuda: un comando que falla **dentro de la condición de un `if`** no
aborta el script, que es el comportamiento correcto de bash y justo el que acá esconde el problema.

La segunda comprobación —`guard-destructive.sh` con un comando inocuo, líneas 12-13— **no** tiene el
defecto: espera éxito, así que un guard ausente la hace fallar y `set -e` corta. O sea que el script ya
contiene la forma correcta, dos líneas más abajo.

## Fix propuesto

Comprobar el **código concreto**, no «distinto de 0». El contrato de los guards está escrito: 2 es
bloqueo —`run-hook.sh` sale 2 cuando no encuentra el motor y cuando un guard bloquea— y 127 es que no se
ejecutó.

**Corregido al arreglarlo**: «no se ejecutó» son **dos** códigos, no uno. Medido el 2026-09-13: 127 con el
archivo ausente y **126** con el archivo presente y sin permiso de ejecución, dentro y fuera de la
tubería. Comparar contra 127 solo habría dejado la mitad del caso pasando en verde.

```bash
set +e
printf '%s' "$payload" | "$root/automatization/hooks/guard-git-add.sh" >/dev/null 2>&1
code=$?
set -e
if [ "$code" -ne 2 ]; then
  echo "guard-git-add: se esperaba 2 (bloqueo) y salió $code" >&2
  exit 1
fi
```

Con eso, el guard ausente sale 127, no coincide con 2 y el humo falla diciendo qué pasó.

Vale la pena mirar además si conviene comprobar antes que el archivo exista y sea ejecutable
—`[ -x "$guard" ]`—: es una línea, da un mensaje más directo que un código numérico, y cubre el caso de
un wrapper sin permiso de ejecución, que hoy también pasa en verde.

## Tradeoffs

- **Fijar el código exacto acopla el humo al contrato de salida de los guards.** Es acoplamiento
  deseado: ese contrato es lo que el humo existe para comprobar, y hoy no lo comprueba nadie más desde
  bash. Si el código de bloqueo cambiara, que este script falle es lo correcto.
- **No se puede probar con una prueba de Node sin duplicar el montaje.** ~~Lo que este caso arregla es un
  script de quince líneas que corre **antes** de la suite, a propósito.~~ **Falso, y se comprobó
  construyéndolo**: se prueba montando una raíz falsa —dos guards de mentira que contestan el código que
  el caso pida— y corriendo el script sobre ella. No duplica ningún montaje y no le quita al humo su
  propiedad de correr antes: el script sigue siendo el mismo y la prueba lo ejercita aparte. Lo que sí
  sería un error es probarlo rompiendo los guards de verdad, que es lo que R23 manda no hacer.
- **El arreglo no agranda la cobertura de nada**: no hay número que suba. Lo único que cambia es que una
  prueba que no podía fallar ahora puede.

## Prioridad

**Media.** No rompe nada hoy y los guards funcionan —el 0.86.0 los ejercitó en vivo, uno por uno—. Lo
que hace es que la primera línea de defensa de `npm test` sea decorativa para el caso que más importa:
que un wrapper haya dejado de estar. Sube a alta el día que un `install` o un `upgrade` deje un wrapper
sin permiso de ejecución, porque ese día el humo va a decir que todo está bien.

## Contexto de descubrimiento

Salió contando qué herramientas de `test/tools/` tiene pruebas, después de cerrar el 129: ninguna prueba
nombra a `hooks-smoke.sh`. La primera lectura fue «le falta una prueba», y leer el fuente —quince
líneas— mostró que el caso era otro y mejor: no le falta una prueba, tiene una que no puede fallar.

Eso también es lo que decidió no agruparlo con el 131. Comparten el hallazgo que los originó y se
arreglan por separado, que es lo que el README de esta carpeta pide.

## Relacionados

- **130** — las cuatro ramas de la puerta de cobertura que ninguna aserción mira.
- **131** — `dead-code.js`, la otra herramienta de `ci` que ninguna prueba vigila.
- **117** — el 0.86.0 ejercitó los guards contra una instancia real; ese recorrido es lo que hoy sostiene
  que funcionan, y no este script.

## Cierre

**🟢 resuelto en 0.87.0** · `test/tools/hooks-smoke.sh`, `test/repo/hooks-smoke.test.js`

### Contra lo que el caso enumeró

- **«La primera comprobación no puede fallar por lo que dice cuidar»** — arreglada. Se compara el código
  exacto contra 2, que es el que `run.js` fija para un bloqueo, y las dos formas de no-correr fallan
  nombrando cuál fue.
- **El «Fix propuesto» decía 127 para «no se ejecutó»** — incompleto, y corregido arriba: son 126 y 127.
  Es la mitad que el caso no había medido, y la que habría quedado pasando con el fix tal como estaba
  escrito.
- **«Vale la pena mirar si conviene comprobar antes con `[ -x "$guard" ]`»** — se miró y **se hizo
  distinto**. Comparar el código cubre las dos formas con un solo mecanismo y se apoya en el contrato que
  el motor ya declara; `-x` habría necesitado además su propia rama para el archivo ausente, o sea dos
  comprobaciones donde alcanza una. El mensaje no perdió nada: nombra el código y su causa.
- **Tradeoff «acopla el humo al contrato de salida de los guards»** — cierto y aceptado, por la razón que
  el caso ya daba: si ese contrato cambia, que este script falle es lo correcto.
- **Tradeoff «no se puede probar desde Node»** — falso, corregido arriba y probado construyéndolo.
- **Tradeoff «no agranda la cobertura de nada»** — cierto: `test/` no entra en el piso, ningún número
  subió. Lo que cambió es que una prueba que no podía fallar ahora puede.
- **Prioridad: «sube a alta el día que un `install` o un `upgrade` deje un wrapper sin permiso de
  ejecución»** — esa condición ya no puede cumplirse en silencio: ése es exactamente el caso de 126, y
  hoy falla nombrándolo. La escalada queda cerrada por el arreglo y no por decisión.
- **La segunda comprobación (líneas 12-13)** — el caso decía que no tiene el defecto porque espera éxito,
  y se confirmó: no se tocó.

### Lo que el caso no preveía

- **El guard presente y sin permiso de ejecución pasaba en verde igual que el ausente.** El caso lo
  sospechaba en una frase suelta del «Fix propuesto»; medirlo lo convirtió en la mitad del defecto y en
  su propio caso de prueba.
- **La primera versión de la prueba no medía lo que yo creía.** Aceptaba `/126/` o `/127/` sueltos, y el
  mensaje genérico de la rama `*)` también los contiene, así que dos de las tres mutaciones
  **sobrevivían**: borrar una rama del `case` no mataba a nadie. Se afinaron las dos aserciones para
  exigir la frase específica —`no se pudo ejecutar (código 126)`— y recién ahí mordieron. Lo destapó
  exigir ver **cuál** caso moría en vez de leer el conteo de fallos.

### Qué se corrió

- **Las cuatro situaciones, medidas antes de tocar nada**, sobre una raíz falsa: bloquea (2) → pasa;
  deja pasar (0) → falla; **sin permiso → pasaba**; **ausente → pasaba**.
- **Los códigos, medidos y no recordados**: 2 al bloquear, 126 sin permiso, 127 ausente, iguales dentro y
  fuera de la tubería.
- **Rojo previo**: 4 casos, 2 en verde —los que no dependen del arreglo— y 2 en rojo, los dos de
  no-correr. El desglose es lo que descarta que el roto fuera el arnés.
- **Verde**: 4 de 4, y el humo real sobre este repositorio sale 0.
- **Tres mutaciones en copia por `tar`, con verde de control antes y después.** `-ne 0` en vez de `-ne 2`
  devuelve el defecto y mata dos casos; quitar el `126` mata sólo al de permisos; quitar el `127` sólo al
  del ausente. Ninguna sobrevivió.
- **La puerta entera**: `npm run ci` en 0 y la suite en **792 pruebas, 792 en verde** —cuatro más que
  antes, que son las de este caso—.
