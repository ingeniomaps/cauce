---
caso: 006
titulo: el comando de upgrade que documenta el README convierte el pin exacto en un rango
estado: resuelto
prioridad: baja
version-detectada: 0.55.0
resuelto-en: 0.56.0
---

# 006 — El upgrade documentado rompe el pin exacto que puso `init`

**🟢 resuelto en 0.56.0** · detectado en 0.55.0 · prioridad **baja** — la invariante que el README declara deja de valer

## Resumen

`init` declara el motor con la versión exacta. El primer paso del upgrade que documenta el README
—`npm install --save-dev @ingeniomaps/cauce@latest`— lo reemplaza por un rango con caret. A partir de
ahí, la razón que el propio README da para no saltear ese paso deja de ser cierta.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.54.0 init ops --mode sidecar --install
cd ops
node -p "require('./package.json').devDependencies['@ingeniomaps/cauce']"   # 0.54.0

npm install --save-dev @ingeniomaps/cauce@latest
node -p "require('./package.json').devDependencies['@ingeniomaps/cauce']"   # ^0.55.0
```

## Síntoma

```text
tras init:                              0.54.0
tras el comando que documenta el README: ^0.55.0
```

Contra `README.md:274`:

> El primero no se puede saltear: `init` fija la versión exacta, así que `npm update` no la mueve y
> `upgrade` compara contra el motor instalado.

Con `^0.55.0` la premisa cae: `npm update` sí la mueve. Dentro de `0.x` el caret sólo habilita el
patch —comprobado: `^0.55.0` satisface `0.55.0` y `0.55.1`, no `0.56.0`—, y Cauce publica patches
(`0.53.1`, `0.53.2`, entre otros). Así que un `npm install` en otra máquina, o un `npm update`, puede
dejar el motor en `0.55.1` mientras `ops.config.json` sigue diciendo `cauceVersion: 0.55.0`.

El daño es acotado: el lockfile commiteado lo contiene, un cambio de `template/` o de `system/` sube
minor y el caret no lo alcanza, y `upgrade --check` termina reportando la diferencia. Lo que no es
acotado es que la documentación afirme una garantía que el comando de al lado desarma.

## Causa raíz

No hay bug de código. `declareEngine` (`engine/cli/instance.js:78`) escribe la versión sin rango, que
es lo correcto:

```js
pkg.devDependencies = { ...pkg.devDependencies, '@ingeniomaps/cauce': version }
```

El rango lo introduce npm, que por defecto guarda con caret. El comando documentado no le pide otra
cosa.

## Fix propuesto

Dos caminos, ninguno excluyente:

1. **Documentar el comando que preserva el pin** —`README.md:266` y el `Makefile` del molde, si tiene
   el atajo—:

   ```diff
   -npm install --save-dev @ingeniomaps/cauce@latest   # trae el motor nuevo
   +npm install --save-exact --save-dev @ingeniomaps/cauce@latest   # trae el motor nuevo
   ```

2. **Que `upgrade` lo repare**, que es más robusto porque no depende de cómo se haya instalado: al
   terminar, reescribir `devDependencies['@ingeniomaps/cauce']` con la versión exacta que acaba de
   aplicar. Es la misma operación que ya hace `declareEngine`, y `upgrade` ya escribe
   `ops.config.json` en ese punto.

El segundo deja además una propiedad que hoy no existe: después de un `upgrade`, el manifiesto, el
`ops.config.json` y el `package.json` dicen los tres la misma versión.

## Tradeoffs

Con el pin exacto, un patch con un arreglo no llega hasta que alguien corra el upgrade. Es lo que el
README ya declara como intención —el motor no se mueve solo—, así que no es un cambio de política sino
hacerla cumplir. Quien prefiera lo contrario puede escribir el rango a mano; la diferencia es que
pasaría a ser una decisión y no un efecto lateral.

## Contexto de descubrimiento

Actualizando `venotal-ops` de 0.54.0 a 0.55.0 el 2026-09-03, siguiendo el README al pie de la letra. Se
notó al comparar el `package.json` antes y después. Se corrigió a mano volviendo a `0.55.0` exacto.

## Resolución

**Resuelto en 0.56.0**, por los dos caminos que proponía el caso, que no se pisan.

Los tres lugares que dictan el comando —`README.md`, el `upgrade` del `Makefile` del molde y la salida
de `upgrade --check`— llevan `--save-exact`, y una prueba los recorre para que no vuelva a divergir
uno solo. Y `upgrade` repone el pin al terminar, que es lo que vuelve la propiedad independiente de
cómo se haya instalado: una instancia que ya quedó con caret se repara sola en la próxima
actualización, sin que nadie tenga que enterarse.

El párrafo del README que daba la garantía ahora dice también por qué el flag está ahí, así que la
razón y el comando dejan de contradecirse.

Verificado el 2026-09-03: con `^0.55.0` a mano en `package.json`, `upgrade` lo devuelve a `0.55.0`
diciéndolo en su salida —`package.json: ^0.55.0 → 0.55.0`—, deja intactos los `scripts` del repo
anfitrión, y no crea un `package.json` en una instancia que no lo tenía. `--save-exact` comprobado
contra npm 11.16.0, y el alcance del caret contra semver 7.8.1: `^0.55.0` satisface `0.55.1` y no
`0.56.0`.

## Relacionados

Ninguno.
