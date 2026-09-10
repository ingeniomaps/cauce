---
caso: 070
titulo: El `CI=true` que arregló el 068 quita el aborto y deja que pnpm reescriba el `node_modules` real por el enlace
estado: abierto
prioridad: alta
version-detectada: 0.74.0
---

# 070 — El aborto era lo único que protegía al `node_modules` del proyecto, y 0.74.0 lo quitó

**🔴 abierto** · detectado en 0.74.0 · prioridad **alta** — cambia un bloqueo ruidoso por una escritura silenciosa sobre el entorno del proyecto, y quien la sufre no tiene cómo relacionarla con el commit que la causó

## Resumen

El [caso 068](068-verify-sobre-el-indice-y-pnpm-quiere-borrar-node-modules.md) describía esto: `verify`
materializa el índice y **enlaza** el `node_modules` real del proyecto; pnpm ve un árbol que no instaló
ahí y decide reinstalar, lo que empieza por borrar el directorio. Y decía —correctamente— que lo único
que lo detenía era la falta de TTY.

0.74.0 lo resolvió poniendo `CI=true` en la copia. Con esa variable pnpm **deja de preguntar**. Pero no
deja de querer sincronizar: sigue viendo un árbol que no instaló ahí, y ahora procede. Lo que antes
terminaba en un aborto ruidoso ahora termina en una escritura **sobre el directorio enlazado**, que es
el del proyecto.

Medido: tras correr un gate con `CI=true` dentro de una copia materializada, el
`node_modules/.modules.yaml` **del proyecto real** quedó así:

```yaml
"virtualStoreDir": "../../../../../../tmp/…/scratchpad/v74.XXXX/node_modules/.pnpm"
```

Apuntando al temporal. Ese temporal se borra con la copia, así que el proyecto queda con su metadata
señalando un directorio que ya no existe.

## Reproducción

**Reproducido el 2026-09-10 con pnpm 10.30.2**, o sea que no depende de la 11. Lo que lo dispara no es
la versión sino el ajuste `verify-deps-before-run`, que en pnpm 11 viene encendido:

```bash
mkdir p070 && cd p070
cat > package.json <<'JSON'
{ "name": "p070", "version": "1.0.0", "scripts": { "test": "node -e \"console.log('ok')\"" } }
JSON
printf 'node_modules/\n' > .gitignore
echo 'console.log(1)' > app.js
pnpm add is-number@7.0.0
git init -q . && git add package.json app.js .gitignore pnpm-lock.yaml && git commit -qm base

# La copia que arma `verify`, con el node_modules del proyecto enlazado:
T=$(mktemp -d) && git checkout-index -a -f --prefix="$T/" && ln -s "$PWD/node_modules" "$T/node_modules"

# El commit parcial: en el índice hay una dependencia que no está instalada.
python3 -c "import json,io;p='$T/package.json';j=json.load(io.open(p));\
j.setdefault('dependencies',{})['is-odd']='3.0.1';io.open(p,'w').write(json.dumps(j))"

cd "$T" && CI=true npm_config_verify_deps_before_run=install pnpm run test
cd - && node -e "require('is-number')"
```

## Síntoma

El paso final falla, y **el daño es mayor que el que este caso reportó**:

```
require('is-number') en el proyecto : Error: Cannot find module 'is-number'
node_modules/is-number              : NO existe
node_modules/.modules.yaml          : NO existe
lo que queda en .pnpm               : is-number@7.0.0  lock.yaml
```

~~El proyecto queda con su metadata señalando un directorio que ya no existe.~~ No es un puntero
colgado: **el árbol de dependencias del proyecto se borró**. Queda el almacén `.pnpm` y nada de lo que
`require()` necesita. Reparar el puntero a mano no alcanza porque no hay puntero que reparar.

**Y la instalación no necesita completarse para hacer daño.** En la corrida medida, `pnpm install`
abortó con `ERR_PNPM_OUTDATED_LOCKFILE` —el lockfile de la copia no coincidía con su `package.json`— y
para cuando abortó **ya había borrado el árbol por el enlace**. Que el gate termine en verde o en rojo no
dice nada sobre si tu proyecto sobrevivió.

## Síntoma

Lo que hace difícil de rastrear este caso es **cuándo** se manifiesta. La escritura ocurre durante un
commit; el proyecto sigue andando el resto de esa sesión, porque `node_modules` en disco no se tocó.
Rompe en el siguiente comando de pnpm, que puede ser horas después y en otro contexto, con un mensaje
que habla de borrar módulos y no menciona ni a git ni al commit que lo causó.

El 068 al menos frenaba el commit y nombraba el problema en el momento. Esto no frena nada.

## Causa raíz

`engine/hooks/shell.js`, `commitTree()`: la copia se declara no interactiva con `env: { CI: 'true' }`.
La variable resuelve el síntoma que el 068 reportó —el gate no arranca— y no toca la causa, que sigue
siendo que **el gate puede escribir sobre lo enlazado**. El propio 068 lo decía en su fix propuesto:

> `CI=true` … No arregla la causa —un gate sigue pudiendo escribir por el enlace— pero cierra el camino
> que hoy está abierto.

Lo que no se previó es que quitar el aborto **abre** un camino distinto: el aborto no era sólo ruido,
era la barrera. Sin él, la sincronización que pnpm quería hacer avanza —y basta con que avance—.

**Y `CI=true` hace una segunda cosa que nadie miró, en dirección contraria.** Enciende
`frozen-lockfile`; lo dice el propio pnpm al fallar: «Note that in CI environments this setting is true
by default». O sea que la variable **a la vez** desarma la confirmación de purga y arma otra guarda
distinta. Su efecto neto depende del escenario, que es exactamente lo que no se puede razonar desde
«es la variable que pnpm nombra»:

| escenario | qué hace `CI=true` |
|---|---|
| el lockfile de la copia coincide con lo instalado | deja que la reinstalación **se complete** sobre el enlace |
| el lockfile de la copia difiere —commit parcial de un lockfile— | `frozen-lockfile` aborta el install… **después** de haber borrado |

**La palanca precisa no es `CI`, es `verify-deps-before-run`.** Medido con pnpm 10.30.2, forzando cada
valor:

| valor | qué hace | daño |
|---|---|---|
| `false` (o ausente) | corre el script y no mira nada | **ninguno** |
| `error` | se niega y dice «Run "pnpm install"» | ninguno, pero frena el gate |
| `install` | reinstala solo | **borra el árbol por el enlace** |

Eso explica también por qué las dos primeras reproducciones de este análisis **no reprodujeron nada**:
en pnpm 10.30 el ajuste viene apagado, así que el gate corría y no pasaba nada. El caso lo atribuía a la
versión; es al ajuste, y la versión sólo cambia su valor por defecto.

## Fix propuesto

**Apagar la comprobación previa en la copia, y devolver el aborto.** Comprobado en el mismo escenario
que produce el daño:

```diff
- return { root: temp, temp, env: { CI: 'true' } }
+ return { root: temp, temp, env: { npm_config_verify_deps_before_run: 'false' } }
```

```
mismo escenario, con verify-deps-before-run=false
  la suite corre           : ok
  is-number en el proyecto : presente
  .modules.yaml            : presente
```

El valor es `false` y no `error` a propósito: `error` frena el gate cuando el lockfile de la copia
difiere de lo instalado, que es justo lo que pasa al commitear un cambio de lockfile por partes. La
copia no tiene que sincronizar nada — tiene que correr el gate sobre el código.

**Y se propone quitar `CI=true`,** que es lo que este caso enseña. Su única justificación era que pnpm
no preguntara antes de purgar; con la comprobación previa apagada, pnpm no llega a querer purgar. Lo que
`CI` sí hace es desarmar la confirmación de **cualquier** herramienta, que es la barrera que este caso
descubrió que era lo único que protegía. La regla que queda: **no se desarma la confirmación de una
herramienta; se le quita el motivo de preguntar.**

Lo que **no** cierra ninguna de las dos cosas, y sigue siendo la clase entera:

- **Bind mount de sólo lectura** donde el sistema lo permita: cualquier herramienta que quiera «arreglar»
  lo enlazado falla en vez de escribir. Es lo único que cierra la clase, y es lo menos portable — el
  [069](069-la-copia-de-verify-solo-esta-aislada-para-lo-trackeado.md) ya lo descartó por eso.
- **Comprobar después del gate** que lo enlazado no cambió y avisar. No previene; convierte una escritura
  silenciosa en una que se ve en el momento.

## Contrastado y medido, 2026-09-10

Lo que este caso afirma se reprodujo antes de tomarlo. Queda dicho qué se sostuvo y qué cambió, porque
quien lo arregle va a leer las dos cosas:

| Afirmación | Veredicto |
|---|---|
| `CI=true` deja que pnpm proceda y escriba por el enlace | **se sostiene**, reproducido |
| El daño es un puntero colgado en `.modules.yaml` | **peor**: se borra el árbol; `require()` falla |
| Hace falta pnpm 11 | **no**: reproducido con 10.30.2 forzando `verify-deps-before-run=install` |
| El aborto era la única barrera | **se sostiene**, y es la lección del caso |
| Reparar el puntero a mano no alcanza | **se sostiene**, por otra razón: no hay puntero, hay ausencia |
| El gate en verde significa que no pasó nada | **falso**: el install borró y **después** abortó |

Lo que el caso no tenía y decide el arreglo: `CI=true` **también** enciende `frozen-lockfile`, y la
palanca que gobierna la reinstalación es `verify-deps-before-run`.

## Tradeoffs

- **`verify-deps-before-run=false` es específico de pnpm** y no cubre a otro gestor que decida
  sincronizar antes de correr. Cierra el caso medido y deja la clase abierta; el bind mount es al revés.
- **Quitar `CI=true` cambia lo que ve cualquier gate**: vuelve el color, vuelven los prompts de otras
  herramientas —y un prompt en un proceso sin terminal aborta, que es precisamente la barrera que se
  quiere de vuelta—. Un gate que dependiera de `CI` para portarse distinto deja de verlo; eso es
  observable y hay que decirlo en el CHANGELOG.
- **Un bind mount de sólo lectura puede romper gates legítimos** que sí escriben en su entorno —un
  compilador que cachea dentro de `node_modules/.cache`—. Conviene medir antes de cerrarlo del todo.

## Contexto de descubrimiento

Instancia real (sidecar, 0.74.0), 2026-09-10. La escritura la provocó **la verificación del propio
arreglo del 068**: se reprodujo la copia a mano y se corrió `CI=true pnpm run test` para comprobar que
la variable destrababa el gate. Destrabó, y de paso dejó el `node_modules` del proyecto apuntando al
temporal. El síntoma apareció después, al correr la suite en el proyecto, y el diagnóstico tardó porque
nada relacionaba una cosa con la otra.

Vale la pena decirlo así: el arreglo se comprobó, funcionó, y comprobarlo rompió el entorno. Eso es
señal de que la variable resuelve lo que se veía y no lo que estaba pasando.

## Relacionados

- **068** — este caso es su continuación directa. Aquél está `resuelto en 0.74.0` y lo que se resolvió
  es el bloqueo; la escritura sobre el enlace sigue.
- **0.74.0, «Un gate ya no pisa lo que vos construiste»** — el otro arreglo de esa versión va en la
  dirección correcta: los directorios que un gate FABRICA se construyen dentro de la copia. La lección
  es la misma y `node_modules` quedó del otro lado del corte, **con razón**: un gate no puede fabricarlo.
  Lo que este caso agrega es que «no fabricable» no implica «sólo lectura».
- [069](069-la-copia-de-verify-solo-esta-aislada-para-lo-trackeado.md) — cerró declarando exactamente
  esta grieta: «una ruta ignorada que un gate escriba y que no esté en la lista sigue cayendo en el árbol
  del usuario. Lo que lo reabriría es que aparezca una». Apareció, y es `node_modules`.
