---
caso: 041
titulo: `shell-boundary` ignora el `cd` del propio comando y resuelve las rutas relativas contra el directorio equivocado
estado: resuelto
resuelto-en: 0.66.0
prioridad: alta
version-detectada: 0.65.0
---

# 041 — Un `cd` delante deja escribir fuera de las raíces

**🟢 resuelto en 0.66.0** · detectado en 0.65.0 · prioridad **alta** — falla abierto y también cerrado, según a dónde apunte el error

## Resumen

`shell-boundary` resuelve las rutas relativas de un comando contra el directorio de trabajo que recibe
del runner, y no mira el `cd` que el propio comando ejecuta antes de escribir. Con eso juzga una ruta
que no es la que se va a escribir.

El error va para los dos lados, y el que importa es el segundo:

- **Bloquea de más** cuando la ruta real estaba permitida y la resuelta no.
- **Deja pasar** cuando la ruta resuelta cae dentro de una raíz declarada y la real, afuera.

El motor ya sabe hacerlo bien en otro guard: `gitDirectory` (`engine/hooks/input.js`) lee el `cd` del
comando para decidir sobre qué repositorio pregunta. Es el mismo caso que
[036](036-git-c-ruta-add-a-esquiva-la-prohibicion-de-stagear-todo.md) por su forma: el motor resuelve
la pregunta en un guard y no en el otro.

## Reproducción

Con `../api` declarada como raíz y el runner abierto en el directorio de arriba:

```bash
# La ruta real queda fuera de toda raíz; la resuelta contra el cwd del runner, adentro.
mkdir -p /home/manuel/Code/personal/api
cd /home/manuel/Code/personal && echo sonda > api/sonda.txt
#   → exit 0, sin bloqueo
ls -l /home/manuel/Code/personal/api/sonda.txt
#   → -rw-rw-r-- … el archivo existe, fuera de las raíces
```

*Verificado* el 2026-09-07 sobre 0.65.0. El archivo se escribió realmente: no es que el comando fallara
por otra razón, el guard no dijo nada y la escritura ocurrió.

La cara de falso positivo, con el mismo mecanismo al revés:

```bash
cd /tmp/<scratchpad-de-la-sesion> && echo v1 > sonda.txt
#   → BLOQUEADO: «escribe en <cwd-del-runner>/sonda.txt, fuera de las raíces»
```

Ahí el destino real estaba en el temporal del sistema, que el guard no juzga por diseño. La
resolución equivocada lo sacó de esa exención y lo mandó a una ruta que nadie iba a escribir.

## Causa raíz

El guard toma el `cwd` que le entrega el runner y hace `path.resolve(cwd, rutaRelativa)`. El `cd` que
aparece en el texto del comando no participa de esa resolución, aunque es lo primero que el shell va a
ejecutar.

`gitDirectory` ya tiene el patrón que falta, y lo usa para lo mismo —saber sobre qué directorio
pregunta—:

```js
const cd = command.match(/(?:^|[;&|]\s*)cd\s+(['"]?)([^\s'";&|]+)\1/)
return path.resolve(cwd, flag ? flag[2] : cd ? cd[2] : '.')
```

No es el caso de la variable. En las dos reproducciones el `cd` lleva una **ruta literal**; la regla de
no adivinar el valor de una variable no aplica y no explica el fallo.

## Fix propuesto

Resolver el cwd efectivo antes de juzgar destinos, reusando lo que ya existe:

```diff
+// El `cd` del propio comando cambia contra qué se resuelve una ruta relativa, y es lo primero que el
+// shell ejecuta. Sin esto el guard juzga una ruta que nadie va a escribir: bloquea la que estaba
+// permitida y deja pasar la que no. `gitDirectory` ya resuelve esto mismo para el repositorio.
+const effectiveCwd = cdTargetOf(command, cwdOf(input))
-const target = path.resolve(cwdOf(input), relativePath)
+const target = path.resolve(effectiveCwd, relativePath)
```

Con dos bordes que conviene decidir explícitamente, porque son los que vuelven a abrir el hueco:

- **`cd` con variable** (`cd $R && …`): el valor no se puede saber. Acá la conclusión tiene que ser la
  opuesta a la de un destino con variable —que se deja pasar por no adivinar—: si no se sabe desde
  dónde se resuelve, **ninguna** ruta relativa del comando es juzgable, y lo que corresponde es
  bloquear pidiendo la ruta absoluta. Es el criterio que [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md)
  ya fijó para el índice: un guard que no puede verificar no autoriza.
- **Varios `cd` encadenados** (`cd a && cd b && …`): el patrón de `gitDirectory` toma el primero. Para
  este guard hace falta el último que preceda a cada escritura, o bloquear cuando haya más de uno.

## Tradeoffs

Bloquear ante un `cd` con variable va a frenar comandos legítimos —armar un directorio de trabajo en
una variable es corriente—, y la salida es escribir la ruta absoluta, que es una línea. A cambio
desaparece un camino por el que hoy se escribe fuera de las raíces sin que nada lo diga.

Lo que no sirve es dejarlo como está por ser «conservador»: no lo es. Falla en las dos direcciones, y
una de ellas es un permiso que nadie dio.

## Prioridad

**Alta.** La cara silenciosa deja escribir fuera de las raíces declaradas, que es exactamente lo que
este guard existe para impedir, y no deja ningún rastro. Se llega con `cd` seguido de una escritura
relativa, que no es una forma rebuscada sino la más común de trabajar en otro directorio.

## Contexto de descubrimiento

En `gouduet`, el 2026-09-07, en la pasada de verificación posterior a 0.65.0: se montaba un repositorio
desechable para probar las reglas destructivas sin riesgo, y el guard bloqueó la creación de un archivo
en el temporal de la sesión nombrando una ruta que no era la del comando. Al mirar por qué apareció la
resolución contra el cwd equivocado, y de ahí la otra dirección.

## Cierre

**🟢 resuelto en 0.66.0.** Lo que este caso enumeró, ítem por ítem:

- **Resolver el cwd efectivo antes de juzgar destinos** → hecho, y no reusando `gitDirectory` como el
  diff proponía. Aquel toma el **primer** `cd` y ahí alcanza, porque un comando elige un repositorio;
  acá dos escrituras pueden caer bajo `cd` distintos, así que se recorre por tramos llevando la cuenta.
  Reusarlo habría movido el error de lugar en vez de arreglarlo.
- **El borde del `cd` con variable** → resuelto como el caso pedía y como fijó el 031: si no se sabe
  desde dónde se resuelve, ninguna ruta relativa es juzgable y se bloquea pidiendo la absoluta. Con su
  contraparte, que es lo que evita que el arreglo se cumpla bloqueando de más: una ruta **absoluta** no
  depende del `cd`, así que sigue juzgándose igual.
- **El borde de varios `cd` encadenados** → se eligió la primera de las dos salidas que el caso ofrecía
  —el último `cd` que precede a cada escritura— y no la de bloquear. Bloquear habría frenado
  `cd a && cd b`, que es corriente y perfectamente juzgable.
- **`cd` a secas** → el caso no lo nombraba y el shell lo tiene: va a HOME, así que también cambia
  contra qué se resuelve lo que sigue. Tiene su caso.
- **Los dos sentidos, medidos** → antes de tocar nada. La cara de falso positivo **no** reprodujo con la
  reproducción tal como estaba escrita: pide además que el runner esté abierto fuera de las raíces, con
  la raíz llegando por `CLAUDE_PROJECT_DIR`. Con el runner adentro, la ruta resuelta cae dentro de la
  raíz y no hay bloqueo. El enunciado del caso es correcto; le faltaba esa condición.
- **Lo que apareció al escribir la prueba**: el banco no puede vivir en el temporal del sistema, que
  este guard exime por diseño — montado ahí, la prueba mide la exención, pasa siempre y el defecto
  parece no existir. Ya había pasado reproduciendo el 033, así que en vez de resolverlo a mano quedó
  como helper de la suite con la razón escrita al lado.

## Relacionados

- [036](036-git-c-ruta-add-a-esquiva-la-prohibicion-de-stagear-todo.md) — misma forma: el motor resuelve
  bien la pregunta en un guard y no en el otro. Ahí fue el subcomando de `git`; acá, el directorio.
- [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) — de ahí sale el criterio para el borde
  del `cd` con variable: si no se puede verificar, no se autoriza.
- [033](033-el-destino-de-una-escritura-se-lee-cruzando-el-salto-de-linea.md) — el otro caso en que este
  guard nombró en el bloqueo una ruta que no estaba en el comando.
