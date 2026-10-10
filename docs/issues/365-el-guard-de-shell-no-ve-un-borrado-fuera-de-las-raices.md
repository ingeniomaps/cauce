---
caso: 365
titulo: el guard de shell no ve un borrado fuera de las raíces
estado: resuelto
resuelto-en: 0.106.1
prioridad: media
version-detectada: 0.106.0
---

# 365 — El guard de límites frena escribir fuera de las raíces por shell y deja pasar borrar ahí: `rm`, `rm -rf` y `find -delete` no cuentan como escritura, y tampoco `touch` ni `mkdir`

**🟢 resuelto en 0.106.1** · detectado en 0.106.0 · prioridad **media**.

**Prioridad media**: no es de esta versión ni rompe nada que hoy ande. Es un hueco de una defensa: la misma
ruta que el guard no deja tocar con un `echo >` se puede borrar entera con un `rm -rf`. Lo catastrófico ya
está cuidado aparte —`/`, el home, el directorio padre, el árbol entero (caso 337)—; lo que queda afuera es
todo lo demás: la carpeta de otro proyecto, o el servicio original visto desde una línea de trabajo.

## Resumen

`shell-boundary` decide si un comando escribe fuera de las raíces declaradas. Lo que cuenta como escritura
es una lista: una redirección, `tee`, `truncate`, `cp`, `mv`, `install`, `rsync` y `sed -i`. Borrar no está
en la lista, y crear un archivo vacío o una carpeta tampoco. Es la forma que R27 nombra: una defensa escrita
como lista de lo que protege deja abierto lo que nadie agregó.

## Reproducción

En una instancia con el runner instalado, fuera del temporal del sistema —el guard lo exime por diseño—, con
el pedido que manda Claude Code y una carpeta `otra/` al lado, fuera de toda raíz:

```bash
ask() { printf '{"cwd":"%s","tool_name":"Bash","tool_input":{"command":"%s"}}' "$PWD" "$1" \
  | CLAUDE_PROJECT_DIR="$PWD" ops/automatization/hooks/guard-shell.sh; echo "exit $? · $1"; }
```

## Síntoma

Medido el 2026-10-10 sobre una copia de una instancia real, desde la carpeta de una línea de trabajo. Las
rutas se dieron enteras; acá van abreviadas:

```
exit 2 · echo x > ../otra/x.txt            BLOQUEADO: el comando escribe en …/otra/x.txt, fuera de las raíces
exit 2 · cp CLAUDE.md ../otra/c.md
exit 2 · mv ../otra/sub ../otra/sub2
exit 2 · tee ../otra/tee.txt
exit 2 · sed -i s/a/b/ ../otra/x.txt
exit 2 · truncate -s 0 ../otra/x.txt
exit 0 · rm ../otra/x.txt
exit 0 · rm -rf ../otra
exit 0 · rm -rf <servicio original>/src     el producto, visto desde la línea por su ruta entera
exit 0 · find ../otra -delete
exit 0 · touch ../otra/t.txt
exit 0 · mkdir ../otra/d
```

La herramienta de archivos no tiene el hueco: no borra.

## Causa raíz

- `engine/hooks/shell.js`, `EVERY_ARG` y `LAST_ARG` — las dos listas de verbos que escriben: `tee|truncate`
  y `cp|mv|install|rsync`, más `sed -i` y las redirecciones. `writesWithBase` no produce nada para `rm`,
  `unlink`, `rmdir`, `find … -delete`, `touch` ni `mkdir`.
- `engine/hooks/removal.js` sí resuelve lo que un `rm -r` borra, tramo a tramo y siguiendo el `cd`, pero lo
  usa sólo `destructive`, para preguntar si el destino es el árbol entero.

## Fix propuesto

1. Que lo que un comando borra entre al mismo juicio que lo que escribe: los objetivos de `rm`, `unlink`,
   `rmdir` y `find … -delete` se resuelven —`removal.js` y `test-evidence-shell.js` ya lo hacen cada uno a
   su modo— y pasan por `beyond`, con las mismas exenciones: el temporal del sistema, `writableOutsideRoots`
   y el árbol de una tarea.
2. `touch` y `mkdir` como escritura en cada argumento.
3. La prueba que R27 pide para una lista que no se puede cerrar por defecto: una que recorra los verbos que
   modifican el disco y falle hasta que cada uno esté clasificado.

## Valor

Cierra la mitad que faltaba de un límite que ya existe. En una línea de trabajo es donde más pesa: el
servicio original queda al lado, fuera de las raíces de la línea, y es el trabajo de otra persona.

## Qué podría salir mal

1. **Frenar borrados legítimos que hoy pasan**: una caché en el home, un `rm` de un archivo que el propio
   comando creó fuera de las raíces. Cada uno pide declarar la ruta o aprobar en el chat. Cuántos son no
   está medido; los diarios de corridas lo pueden decir antes de construir.
2. **Dos resolvedores de «qué borra un comando»** que ya existen y no coinciden en todo. Sumar un tercero
   sería peor que elegir uno.
3. **Un comodín o una variable que no se pueden resolver.** `test-evidence-shell` ya decidió qué hacer con
   eso para su caso; acá hay que decidirlo de nuevo, y frenar todo lo irresoluble sería demasiado.

## Cierre

**Resuelto en 0.106.1.** Lo que un comando borra entra al mismo juicio que lo que escribe.

### El recorrido de lo que este caso enumeró

- **Fix 1, los borrados al mismo juicio — se hizo**, con las mismas exenciones que una escritura: el temporal
  del sistema, `writableOutsideRoots`, el árbol de una tarea y el producto que una línea enlaza.
- **Fix 2, `touch` y `mkdir` como escritura — se hizo, y distinto de como estaba propuesto.** No van en la
  lista de verbos que escriben, que los busca como palabra en cualquier lado: ahí `docker exec app mkdir -p
  /app/data` y `grep -rn mkdir /usr/share/doc` se frenaban. Se leen como el verbo que el comando corre.
- **Fix 3, la prueba que recorre los verbos que modifican el disco — se decidió que no.** No hay de dónde
  recorrerlos: el motor no tiene un registro de comandos del shell, y una lista escrita para la prueba sería
  la misma lista con otro nombre. Queda como está dicho en el encabezado del guard: frena la forma habitual
  y no se presenta como completo. Un `-exec rm`, un `python -c` o un script propio siguen sin verse.
- **Qué podría salir mal 1, frenar borrados legítimos — medido, y es chico.** Hipótesis escrita antes: los
  frenos nuevos son pocos y todos sobre rutas de afuera; la desmentía un patrón corriente que empezara a
  frenarse. Se corrieron el guard anterior y el nuevo, en sólo lectura, sobre los comandos de shell de las
  sesiones reales de cuatro instancias:

  ```
  comandos    con un verbo de éstos    frenos nuevos
    20.099                    1.730                9
  ```

  Ocho son de una sola sesión y una sola forma: borrar los resultados de herramientas que el runner guarda
  en la carpeta personal, fuera del proyecto. Escribir ahí ya se frenaba; se resuelve declarando la ruta.
  El noveno es un `rm` de archivos en la carpeta de otro proyecto, que es lo que el caso vino a frenar. En
  tres de las cuatro instancias, cero. Y ninguno que antes frenara dejó de frenar. Los números son los de
  la versión final, con lo que corrigieron las dos revisiones. La misma comparación sobre `destructive`,
  que comparte el resolvedor: 16 comandos que ya frenaba y sigue frenando, ninguno nuevo y ninguno menos.
- **2, dos resolvedores de qué borra un comando — no se sumó un tercero.** Se generalizó el de `destructive`,
  que ya seguía el `cd` tramo a tramo, y el guard de límites lo usa. `destructive` sigue juzgando sólo el
  `rm` recursivo, que es lo que cuidaba: un `find . -name '*.tmp' -delete` y un `rm -f *` no son borrar el
  árbol, y están probados. El de `test-evidence-shell` no se tocó: resuelve comodines mirando la carpeta,
  que es otra pregunta.
- **3, lo que no se puede resolver — no se juzga.** Una variable que el comando no asigna, o una ruta
  relativa después de un `cd` a un destino desconocido: `cd "$DIR" && rm -rf node_modules` es la limpieza
  de cualquier script. Lo catastrófico de esa forma lo sigue cuidando `destructive`. Las variables que el
  propio comando asigna sí se resuelven.

### Lo que este caso encontró y no preveía

- **Borrar un enlace no es borrar lo que hay detrás.** `rm servicio/enlace` quita el enlace; con una barra
  al final, o nombrando algo de adentro, se borra lo de afuera. El último tramo de la ruta no se sigue.
- **Una redirección se leía como destino del borrado.** La medición sobre sesiones reales dio primero dos
  frenos falsos, «el comando borra /2>»: en `rm -f x 2> /dev/null` se tomaban `2>` y `/dev/null` por cosas
  a borrar. El resolvedor de `destructive` ya lo hacía y ahí no se notaba.
- **La primera medición no medía nada.** Corrido en proceso, el guard no encontraba la instancia desde la
  carpeta de la sesión y dejaba pasar todo: dio cero frenos, también de los que ya existían. El hook la
  recibe por `OPS_ROOT`; con eso exportado un comando de control frenó, y recién ahí valió el número.
- **Desde una línea, borrar en el producto a través del enlace de la línea pasa**, igual que escribir: esas
  carpetas son del proyecto. Lo que se frena es nombrar el original por su ruta entera.

### Lo que encontró la revisión independiente (2026-10-10)

Diez hallazgos, reproducidos sobre el texto de los comandos, y los diez se atendieron. Tres eran frenos a
comandos legítimos, que en un guard es el error caro:

- **Un borrado citado se juzgaba como si corriera**: el mensaje de un commit que nombraba un `rm -rf`, un
  `echo`, lo que un `docker exec … sh -c "…"` o un `ssh` corren en otra máquina. Los tramos se partían en
  todo `;` y `&&`, también dentro de una cadena. Para el guard de límites se parten sólo fuera de las
  comillas. `destructive` sigue partiendo en todos, a propósito: así ve el `rm -rf .` de adentro de un
  `sh -c`, y lo que cuida no admite el error de no verlo.
- **`mkdir` y `touch` como palabra en cualquier lado**, que es el Fix 2 de arriba.
- **`cd "$DIR" && mkdir -p build` se frenaba y `cd "$DIR" && rm -rf build` no.** Ahora ninguno: sin saber
  dónde quedó parado no se inventa un destino. Y `touch -r <referencia> <archivo>` ya no toma por destino
  el archivo del que copia la fecha.

Los otros siete eran formas corrientes de borrar que no se veían, y ahora se ven: `carpeta-enlazada/*`,
`$HOME/…`, el `rm` detrás de `then`, `do`, `!` o `sudo -n`, el de varias líneas con barra al final, el de
adentro de un subshell `(cd afuera && rm -rf sub)`, `cd` sin destino, `{a,b}`, y `find -L afuera … -delete`.
Un subshell además devuelve la carpeta al cerrarse: `(cd /otra && ls); rm -rf build` juzga `build` donde
estaba.

Cuatro de esas siete valen también para `destructive`, que usa el mismo resolvedor, y ahí son un freno más
y no uno menos: `if …; then rm -rf .; fi`, `sudo -n rm -rf .`, el `rm -rf` de varias líneas sobre `.` y
`cd && rm -rf <algo>` frenan donde antes pasaban. La revisión probó antes del cambio que nada de lo que
`destructive` frenaba dejó de frenar, y las pruebas de ese guard siguen en verde.

### Lo que encontró la segunda revisión (2026-10-10)

Acotada a lo que la primera había hecho reescribir. Ocho hallazgos, y se atendieron los ocho:

- **Una regresión de `destructive`, mía.** Al hacer que un `cd` sin destino deje en la carpeta personal,
  `cd && rm -rf .` pasó a resolverse ahí, y la carpeta personal no estaba entre lo que ese guard cuida
  cuando el proyecto no vive adentro de ella. Antes se frenaba por casualidad —se leía como el directorio
  actual—. Ahora la carpeta personal se cuida por nombre, y `cd $HOME && rm -rf .` también.
- **Los paréntesis se contaban tramo por tramo.** El `)` de un `$(ls | wc -l)` queda en otro tramo que su
  `$(` y cerraba un subshell que seguía abierto: frenaba `(cd servicio && n=$(ls | wc -l) && cd /otra); rm
  -rf viejo`, y dejaba pasar el borrado de adentro. Se cuentan sobre el comando entero.
- **Lo que una sustitución lee se tomaba por lo que el comando borra**: `rm -f $(cat ~/lista.txt)` frenaba
  por `~/lista.txt`. Una sustitución queda como una variable sin resolver, y no se parte adentro de ella.
- **Un apóstrofo en un comentario abría una cadena** y lo citado en la línea siguiente se juzgaba.
- **`touch -mr` y `touch --reference`** seguían tomando la referencia por destino.
- **Un `cd` con redirección, o a una ruta con espacios, dejaba la base en la carpeta de antes.** El primero
  ahora se lee; el segundo deja sin base, que es no juzgar.
- **`if`, `while`, `until` y `elif`** no estaban entre lo que puede ir delante de un verbo.
- **El comando se recorría dos veces.** Borrados y creaciones salen de una sola lectura.

### Qué se corrió

- **El guard instalado, sobre un banco con una línea y una tarea reclamada**, fuera del temporal, con el
  pedido de Claude Code. Ningún comando se ejecutó: el guard sólo lee el texto.

  ```
  exit 2 · echo x > …/otra/x.txt       el comando escribe en …
  exit 2 · rm …/otra/x.txt             el comando borra …
  exit 2 · rm -rf …/otra
  exit 2 · rm -rf <servicio original>/src
  exit 2 · find …/otra -delete
  exit 2 · unlink …/otra/x.txt
  exit 2 · touch …/otra/t.txt          el comando escribe en …
  exit 2 · mkdir …/otra/d
  exit 0 · rm -rf <servicio>-<tarea>/src
  exit 0 · find <servicio>-<tarea> -name '*.tmp' -delete
  exit 0 · mkdir -p <servicio>-<tarea>/nuevo
  exit 0 · rm -rf /tmp/lo-que-sea
  exit 0 · rm -f <servicio>-<tarea>/x 2>/dev/null
  ```

- Rojo previo: `test/hooks/removal-boundary.test.js`, cuatro de sus pruebas, antes del cambio.
- Treinta y siete mutaciones en rojo, en una copia fuera del árbol. De la primera tanda: sin juzgar borrados,
  sin eximir el temporal, juzgando variables sin resolver, juzgando sin saber desde dónde, siguiendo siempre
  el enlace, no siguiéndolo nunca, contando un `find` sin `-delete`, sin sacar las redirecciones, sin
  `touch` ni `mkdir`, sin las variables asignadas, sin la carpeta personal, sólo `rm`, sin las rutas de
  `find`, y dos sobre `destructive`: tomar un `find` por borrar el árbol y tomar todo `rm` por recursivo.
  De lo que corrigió la revisión, una por hallazgo: partir dentro de las comillas al borrar y al crear, sin
  `$HOME`, sin `then` ni `do`, sin las banderas de un prefijo, sin unir las líneas, sin devolver la carpeta
  de un subshell, sin el `cd` vacío, sin las llaves, perdiendo la barra del glob, sin las opciones de
  `find`, con el archivo de referencia de `touch` y sin ver el `cd` de un subshell. De la segunda: sin
  cuidar la carpeta personal, sin `if` ni `while`, tomando el paréntesis de una sustitución por un
  subshell, partiendo adentro de una sustitución, leyendo lo que una sustitución lee, sin cortar el
  comentario, dejando la base de antes tras un `cd` ilegible, sin leer el `cd` con redirección y quitando
  sólo el `-r` suelto de `touch`, y sin las comillas invertidas —ésa la pidió el piso de cobertura, que bajó
  hasta que la rama tuvo su caso—. Seis sobrevivieron la primera vez y cada una se llevó su caso de prueba.
- **Lo que no tuvo**: una pasada independiente sobre esta última versión. La sostienen las pruebas, las
  mutaciones y la comparación sobre los comandos reales.
- La medición de arriba.

### Tres comprobaciones después de cerrar (2026-10-10)

Corridas dentro de una jaula de sólo lectura —todo el disco montado sin escritura, salvo una carpeta de
resultados—, para que ni un error de la propia medición pudiera tocar nada.

- **La comparación, sin tope y sobre el corpus más duro.** A las cuatro instancias se sumaron las sesiones
  de este repositorio, que son las que más arman copias, bancos y scripts de mutación por shell, juzgadas
  contra una instancia que declara este repositorio como su única raíz:

  ```
  comandos    con un verbo de éstos    frenos nuevos    perdidos
    62.212                    5.959               43           0
  ```

  Los 43 se agruparon por destino y se leyó el comando de cada grupo, veinticinco destinos en total; tres
  que no eran evidentes se leyeron enteros. Todos escriben o borran de verdad fuera de las raíces —bancos en
  `/var/tmp`, la carpeta personal, otro árbol de trabajo—, con las variables que el comando asigna bien
  resueltas. Lo que la medición buscaba era un comando mal leído, como el `/2>` de la primera vuelta, y no
  apareció ninguno. En `destructive`: 76 que ya frenaba y sigue frenando, ninguno nuevo, ninguno menos.
- **Una cosa que esa lectura deja a la vista.** Dos de los 43 son un `rm -rf` de una caché en la carpeta
  personal, de una limpieza de disco. Ahora se frena, y la única salida que el guard ofrece es declarar la
  ruta: no tiene la aprobación por el chat que sí tienen otros. Es el mismo trato que ya tenía escribir
  ahí; si estorba, la salida es darle esa aprobación a los dos, no aflojar uno.
- **Borrar por la herramienta de archivos no tiene este hueco.** `*** Delete File:` de un parche ya se
  juzgaba. Probando el formato entero apareció otro, que salió como caso propio: el
  [366](./366-un-parche-que-renombra-un-archivo-lo-saca-de-las-raices-sin-que-lo-vea-ningun-guard.md).

## Contexto de descubrimiento

Al probar la versión 0.106.0 sobre una copia de una instancia real con una línea de trabajo, preguntándole
al guard por un borrado en el servicio original. No es una regresión: el guard nunca miró borrados.

## Relacionados

- [337](./337-rm-rf-punto-y-cd-x-rm-rf-punto-pasan-el-guard-destructivo.md) — el borrado del árbol entero, que sí
  está cuidado, y de donde sale `removal.js`.
- [360](./360-en-una-linea-el-arbol-de-la-tarea-queda-fuera-de-las-raices-cuando-la-raiz-es-el-repositorio.md) —
  el árbol de una tarea, que tiene que seguir pudiendo borrarse.
- [164](./164-el-override-de-noclobber-evade-el-guard-de-escrituras.md) — otra forma de escritura que la lista
  no tenía.
