---
caso: 373
titulo: el agente se declara solo las rutas que el límite le frena
estado: resuelto
resuelto-en: 0.107.0
prioridad: alta
version-detectada: 0.106.1
---

# 373 — El límite de raíces se abre editando la configuración que lo define, y esa edición no la confirma nadie: el agente agrega una ruta —o una raíz— y lo que estaba frenado pasa, para siempre y por prefijo

**🟢 resuelto en 0.107.0** · detectado en 0.106.1 · prioridad **alta**. **Decidido el 2026-10-10**: se cierra, junto con
el [370](./370-el-guard-de-limites-no-tiene-salida-por-el-chat.md).

**Prioridad alta**: el límite existe para contener al agente cuando trabaja solo, y hoy el agente lo mueve
sin que nada lo frene ni lo muestre en el momento. No es una vía rebuscada: es la que el propio bloqueo
indica, y se midió en uso.

## Resumen

Los dos guards de límites frenan lo que cae fuera de las raíces y mandan a declarar la ruta en
`writableOutsideRoots`. El archivo donde se declara lo escribe el agente como cualquier otro: `ops-config`
protege ahí las dos llaves del push y deja pasar el resto, a propósito, para que esa salida exista (caso
090). Lo que quedó sin mirar es que la salida la toma quien el límite contiene.

Y son tres puertas, no una: la lista de rutas escribibles, **la lista de raíces de producto** —que el
límite lee igual— y el archivo de la máquina, `ops.config.local.json`, que no mira ningún guard.

## Reproducción

En un banco `suelto`, preguntándoles a los guards con `executeAll` y sin ejecutar ningún comando:

```
*** escritura de ops.config.json con  "writableOutsideRoots": ["~"]
*** escritura de ops.config.json sumando a workspaceRoots la carpeta personal
*** escritura, edición por fragmento o `echo … >` de ops.config.local.json con  {"writableOutsideRoots":["~"]}
```

## Síntoma

Medido el 2026-10-10:

```
FRENA   rm -rf ~/.config/<editor>/snapshots                      (configuración de fábrica)
pasa    Write ops.config.json        con writableOutsideRoots ["~"]
pasa    Write ops.config.json        sumando como raíz la carpeta personal
pasa    Write ops.config.local.json  con writableOutsideRoots ["~"]
pasa    Edit  ops.config.local.json  (un fragmento)
pasa    echo … > ops.config.local.json
FRENA   Edit  ops.config.json        (un fragmento: no se puede comparar)
FRENA   echo … > ops.config.json
--- con cualquiera de las tres primeras en disco ---
pasa    rm -rf ~/.ssh                pasa    rm ~/.aws/credentials
pasa    rm -rf ~/Code/<otro>         pasa    echo x > ~/.bashrc
FRENA   rm -rf ~                     (lo cuida `destructive`, que no tiene salida)
```

Sobre las sesiones reales de cuatro proyectos, 129 bloqueos de este límite: en al menos 6 lo que siguió, sin
ningún mensaje de la persona en el medio, fue el agente declarando la ruta; en 2 paró y le habló a la
persona. En los seis, lo frenado era un archivo y lo declarado fue su carpeta: una memoria del runner, la
carpeta de casos de otro repositorio. El conteo es por heurística —las llamadas que siguen al bloqueo— y no
dice si la persona lo había pedido antes en la sesión.

## Causa raíz

- `engine/hooks/ops-config.js`, `PROTECTED` — sólo `allowPush` y `pushToLiveBranches`. Su encabezado dice por
  qué: proteger el archivo entero «repondría el candado que el 090 sacó».
- `engine/hooks/ops-config.js`, `target` — el único archivo que mira es `ops.config.json`.
  `ops.config.local.json` no lo mira nadie, ni por archivo ni por shell.
- `engine/hooks/input.js`, `writableRoots` — el límite sale de `workspaceRoots`, de `writableOutsideRoots`
  de los dos archivos y del scratchpad de la sesión. Las dos primeras las escribe el agente.
- `engine/hooks/input.js`, `DECLARE_IT` — el texto que manda a tomar esa salida, sin decir quién.

## Fix propuesto

1. **Agregar una ruta a cualquiera de las dos listas, en cualquiera de los dos archivos, lo confirma una
   persona.** Se compara lo que entra contra lo que hay en disco, ya resuelto: lo que la escritura **agrega**
   o **ensancha** queda frenado con la entrada a la vista —`declara <ruta resuelta>`— y pasa con la
   confirmación del bloqueo o con su línea en `planning/.ops-approval`. Es lo que `self-approval` ya hace con
   las líneas de la aprobación.
2. **Quitar o angostar no se pregunta**: una lista más corta autoriza menos.
3. **Lo que no se puede comparar se frena**, igual que hoy en `ops.config.json`: un fragmento de `Edit` o un
   comando no dicen con qué queda el archivo. Vale también para el archivo de la máquina.
4. **Sin heredar y sin orden por chat**, por las mismas dos razones medidas en el 370.
5. Reescribir `DECLARE_IT`: la declaración es cosa de la persona, y para una vez alcanza con confirmar.

Vale mirar, antes de construir, si `outsideRoots` trata bien una entrada `/`: en la sonda una raíz `/`
escrita en disco no abrió nada —la comparación le suma un separador y queda `//`—. Hoy cae del lado seguro
por accidente; si se arregla, tiene que ser con este caso ya cerrado.

## Valor

El límite vuelve a contener a quien dice contener. Y lo que una persona declara queda decidido por ella,
con la ruta a la vista, en vez de aparecer después en `check`.

## Qué podría salir mal

1. **Dejar al límite sin ninguna salida.** Si esto sale sin el 370, lo único que queda es que la persona
   edite el archivo a mano: van en la misma versión, y el 370 primero, porque esto usa su confirmación.
2. **Frenar las corridas sin persona que hoy se destraban solas.** Las seis declaraciones medidas dejarían
   de pasar: en una sesión conversada es una pregunta; en un recorrido, un bloqueo que vuelve a quien lo
   lanzó. Es el efecto buscado, y hay que medirlo sobre los mismos 129 bloqueos antes de publicar.
3. **Volver a poner el candado del 090.** Lo que el 090 arregló era que `plan-first` frenara toda edición del
   archivo. Acá se frena una clase de cambio, y el resto del archivo sigue pasando; la prueba del 090 tiene
   que seguir en verde.
4. **Comparar mal dos listas.** Una entrada reescrita con otra forma —`~/x` y su ruta absoluta— no es una
   entrada nueva, y una que cubre a otra —`~/a` donde había `~/a/b`— sí ensancha. Se compara resuelto.
5. **Que la instalación o `upgrade` queden frenados.** Escriben la configuración desde el CLI, que los guards
   ven como un comando y no como una escritura. **Hipótesis** hasta correrlo en un banco.

## Cierre

Vive en `engine/hooks/ops-config.js`, que ya era el guard de ese archivo: ahora mira los dos y, además de las
llaves del push, lo que una escritura ensancha. Recorrido de lo que el caso enumeraba:

- **Fix 1, confirmar lo que agrega o ensancha, en los dos archivos y las dos listas**: hecho. Se compara lo
  entrante, resuelto, contra la unión de los dos archivos en disco —una ruta que el compartido ya declara no
  es nueva en el de la máquina—, y por prefijo, como lee el límite. El ítem es `declara <ruta resuelta>` y
  pasa por la confirmación del 370 o por la línea en `planning/.ops-approval`.
- **Fix 2, quitar o angostar no se pregunta**: hecho; la prueba lo asercia con angostar, reordenar, reescribir
  igual y poner una entrada bajo otra declarada.
- **Fix 3, lo que no se puede comparar se frena, también el archivo de la máquina**: hecho; `Edit` y
  `echo >` sobre `ops.config.local.json` frenan con el mismo texto que ya tenía el compartido.
- **Fix 4, sin heredar y sin orden**: hecho, con `confirmedOnly` de `boundary.js`, el mismo del 370. Nombrar
  el archivo sigue saltando el juicio de las dos llaves del push, como decidió el 119, y **no** salta el del
  ensanche.
- **Fix 5, reescribir `DECLARE_IT`**: hecho; dice que lo declara una persona, o que lo escribe el agente y ella
  confirma la entrada.
- **La entrada `/`**: no se tocó. Sigue cayendo del lado seguro por el separador, y el riesgo de arreglarlo
  antes de cerrar esto ya pasó; queda anotado en el caso, sin caso propio, porque no abre nada.
- **Riesgo 1, dejar al límite sin salida**: va en la misma versión que el 370 y después de él.
- **Riesgo 2, frenar lo que hoy se destraba solo**: es el efecto buscado; la medición contra `main` está
  abajo.
- **Riesgo 3, reponer el candado del 090**: `plan-first` sigue exento sobre `ops.config.json` —y, se comprobó
  con una sonda, también sobre `ops.config.local.json`—; el resto de los dos archivos pasa. La prueba del
  114 cambia en dos aserciones que afirmaban justo lo que este caso cierra —que una raíz o una ruta nueva
  pasaba sola— y dice por qué.
- **Riesgo 4, comparar mal**: `~/x` y su absoluta son la misma entrada, `~/a` donde había `~/a/b` ensancha y
  al revés no; las tres tienen aserción.
- **Riesgo 5, que `init` o `upgrade` queden frenados**: la hipótesis se contestó con prueba: `node tools/ops.js
  upgrade .` y `npx cauce init .` pasan `ops-config-shell`, porque un comando que no redirige ni escribe
  con una herramienta conocida no es una escritura para ese guard.

**Prueba corrida.** `test/hooks/roots-declared.test.js`, cuatro pruebas: tres en rojo antes del cambio —«ops-config
no bloqueó»— y las cuatro en verde después, con la puerta entera.

**Comparación contra `main`**, en sólo lectura, sobre las llamadas reales que tocan `ops.config*.json` en las
transcripciones de esta máquina: 430 juzgadas, 425 iguales, **5 distintas, las cinco «pasa → frena»**: tres
`Edit` por fragmento de `ops.config.local.json` que agregaban rutas, un `printf` que lo escribía entero por
shell y un `cat > ops.config.local.json <<EOF` con una memoria del runner adentro. Son las auto-declaraciones
que el caso midió, vistas desde el otro lado. Lo que no aparece como distinto es cada `Write` entero de esos
mismos días: hoy esas rutas ya están en disco, así que contra el disco de hoy no ensanchan —la comparación
mira el estado actual, no el de entonces—.

**Mutaciones**, en una copia fuera del árbol, cinco, todas en rojo:

- comparar por igualdad y no por prefijo → «quedar bajo lo declarado»;
- no contar lo que el archivo de la máquina ya declara → la misma prueba, después de que la primera versión
  de esa aserción no lo cubría —escribía sobre una instancia que ya lo declaraba en el compartido— y la
  mutación sobrevivió hasta corregirla;
- no mirar el archivo de la máquina → dos pruebas;
- admitir la orden por nombre → «la confirma una persona»;
- saltar el ensanche cuando el mensaje nombra el archivo → la misma.

## Revisión del conjunto

Una revisión independiente del diff entero de la rama encontró tres huecos en este caso y dos cosas de forma.
Los tres huecos tienen prueba y mutación, y la comparación contra `main` repetida después dio las mismas cinco
diferencias:

- **Comparaba por texto y el límite compara por dónde cae.** Declarar `../app/enlace`, un enlace de adentro
  que lleva afuera, quedaba «bajo la raíz» y pasaba sin confirmar; después el límite abría lo de afuera.
  `opened` devuelve ahora `real()` de cada entrada, y el bloqueo muestra a dónde lleva.
- **Un fragmento de `Edit` que era JSON válido se juzgaba como el archivo.** `["/"]` donde había `[]` no tiene
  `writableOutsideRoots` y no ensanchaba nada; `{"allowPush": true}` tampoco movía las llaves. Un `Edit` se
  frena siempre, y un JSON que no es un objeto también.
- **Por shell, nombrar el archivo saltaba el juicio.** «abrí ops.config.json y fijate» dejaba pasar un `sed`
  que ensanchaba las raíces. Eso lo había decidido el 119 para las llaves del push, por las dos vías; queda
  sólo por la herramienta de edición, que trae el contenido. La prueba del 119 cambia y dice por qué.
- Las raíces de producto se resuelven ahora como las resuelve el límite —sin expandir `~`—, para que la
  entrada que se confirma sea la que rige.

Una segunda pasada, acotada a esos arreglos, encontró que cerrar la vía por nombre dejaba a Codex sin ninguna:
escribe sólo por `apply_patch`, que llega como parche y no como archivo, así que shell frenaba siempre y el
parche caía en «no se puede comparar». La escritura por comando se frena igual, pero ofrece la confirmación
angosta del 370 con el ítem `escribe <archivo>`, y el bloqueo dice que quien confirma no va a ver con qué
queda el archivo. **Es un límite dicho**: por esa vía el ensanche no se ve, lo decide la persona a ciegas, y
vale por un turno. Y lo declarado se resuelve una sola vez, que la primera versión hacía dos.

Una tercera pasada, sobre eso, encontró dos huecos más y un límite que se queda:

- **La línea para pegar dejaba la escritura a ciegas abierta para siempre.** `HOW` ofrecía `escribe <archivo>`
  para `.ops-approval`, y `confirmedOnly` la honraba; y el agente podía pedir esa línea nombrando el archivo.
  La confirmación por shell no ofrece nada que pegar y no lee el archivo de aprobación: vale el turno y nada
  más. Prueba: la línea pegada a mano no abre nada.
- **El archivo se reconocía por texto.** Escribirlo por un enlace con otro nombre, o por la ruta real de una
  raíz enlazada, no se juzgaba; ahora se compara por dónde cae, por las dos herramientas.
- **Lo que se queda, y es del canal:** un bloqueo pendiente lo aprueba cualquier mensaje siguiente que no
  niegue ni pregunte (caso 184), así que un «sí» a otra pregunta aprueba también la escritura a ciegas. Antes
  de esta rama las llaves del push no tenían vía por confirmación; la que había —nombrar el archivo— tenía
  la misma debilidad por el otro lado. En Claude Code lo resuelve el diálogo nativo, que muestra el motivo y es
  por llamada (caso 221); en Codex y Gemini queda como está en todos los guards, y se dice.

## Sesión real

Claude Code (`claude -p`) sobre un banco `suelto`, el 2026-10-10: pedido de reescribir `ops.config.json` con
`writableOutsideRoots: ["~/<carpeta>"]`, el guard frenó con «ensancha lo que el límite de raíces deja
escribir: agrega <ruta resuelta>» y la línea `declara <ruta>` para pegar; el archivo quedó sin la clave.

## Contexto de descubrimiento

Al analizar cuál de las salidas del 370 era más segura: la opción de dejarlo «estricto» resultó ser la más
abierta de las tres.

## Relacionados

- [370](./370-el-guard-de-limites-no-tiene-salida-por-el-chat.md) — la salida angosta que reemplaza a ésta.
- [090](./090-plan-first-frena-el-ops-config-donde-el-limite-manda-a-declarar.md) — por qué la configuración
  quedó editable.
- [114](./114-el-agente-se-escribe-el-permiso-de-push-en-ops-config.md) — el mismo defecto, sobre las llaves del
  push.
- [209](./209-las-rutas-escribibles-de-una-maquina-viven-en-el-archivo-compartido.md) — de donde sale el
  archivo de la máquina.
