---
caso: 337
titulo: rm -rf . y cd $X && rm -rf . pasan el guard destructivo
estado: resuelto
resuelto-en: 0.105.0
prioridad: media
version-detectada: 0.104.1
---

# 337 — `rm -rf .` y `cd $X && rm -rf .` pasan el guard destructivo, que sí frena `rm -rf ..`

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **media**.

**Prioridad media**: es un guard de disciplina, como el README de hooks declara, no un límite de seguridad.
Pero las dos formas que pasan son las que R23 nombra como el desastre canónico, y el propio comentario del
guard, en la regla de `git checkout -- .`, ya dice por qué `.` es peligroso.

## Resumen

Con payload real, cwd en la raíz del repo:

| Comando | Guard que debería mirar | Resultado |
|---|---|---|
| `rm -rf .` | destructive | pasa |
| `cd $X && rm -rf .` | destructive | pasa |
| `rm -rf ../acme` (el padre, por nombre) | destructive | pasa |
| `rm -rf ..` | destructive | frena |
| `find . -delete` | destructive | pasa |
| `rm -rf apps/api` | destructive | pasa |
| `mv apps/api/resta.test.js /tmp/` (prueba commiteada) | test-evidence-shell | pasa |
| `rm apps/api/resta.test.js` | test-evidence-shell | frena |

La regla de `rm -r` cubre `/`, `~`, `$HOME` y `..` literales. El cwd, el padre nombrado y el borrado por
`find` no entran. Y el comentario de la regla de `git checkout -- .` en el mismo archivo dice por qué `.`
es peligroso: «el cwd suele tener más de lo que uno está mirando».

## Reproducción

```bash
cd <repo con ops/ y guards de Claude instalados>
for c in 'rm -rf .' 'cd $X && rm -rf .' 'rm -rf ../acme' 'find . -delete' 'mv apps/api/resta.test.js /tmp/'; do
  printf '%s' "{\"session_id\":\"s\",\"cwd\":\"$PWD\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$c\"}}" \
    | CLAUDE_PROJECT_DIR=$PWD ops/automatization/hooks/guard-shell.sh; echo "$c → exit=$?"
done
```

`resta.test.js` tiene que estar commiteado; el guard de pruebas sólo cuida lo que ya está en el historial.

## Síntoma

```
rm -rf . → exit=0
cd $X && rm -rf . → exit=0
rm -rf ../acme → exit=0
find . -delete → exit=0
mv apps/api/resta.test.js /tmp/ → exit=0
```

Y, para contraste, en la misma corrida: `rm -rf ..` → `BLOQUEADO: 'rm -r' sobre /, home o el directorio
padre es catastrófico.` y `rm apps/api/resta.test.js` → `BLOQUEADO: el comando borra …, que es una prueba.`

## Causa raíz

- `engine/hooks/shell.js`, `destructive`, regla de `rm`: el patrón alterna `\/\*?|~\/?|\$\{?HOME\}?\/?|\.\.`
  como destino. No contempla `.`, un destino que resuelva al cwd o a su padre, ni `find … -delete`.
- `engine/hooks/test-evidence-shell.js`, `removed`: reconoce `rm`, `unlink` y el `rm` de git. `mv` con una
  prueba como origen no se mira.

## Fix propuesto

En `destructive`, resolver el destino de `rm -r` contra el cwd como ya hace `shell-boundary` con
`writesWithBase`: si el destino resuelto es el cwd, una raíz declarada, la raíz ops o un ancestro de
cualquiera de ellas, frenar con la misma regla sin salida. `cd $X && rm -rf .` cae ahí porque la base es
`null`, y la regla de R23 es justamente «no se resuelve, no se autoriza».

Lo que no se toca: `rm -rf apps/api` nombrando una subcarpeta sigue siendo trabajo corriente.

## Lo que se descarta, y por qué

En la misma medición pasaron `rm -rf ../acme` (el padre por nombre), `find . -delete` y `mv` de una prueba
commiteada a `/tmp`, que `test-evidence-shell` no mira. No se agregan: cada una es una regla de texto más
que se esquiva componiendo, como el README ya dice, y ninguna está en la lista de R23. Si alguna aparece
en una corrida real, se abre con ese registro.

## Tradeoffs

- Resolver el cwd en `destructive` lo vuelve dependiente de `cwd` en el payload, como ya lo es
  `shell-boundary`. Sin `cwd`, cae a `OPS_ROOT`, que es la instancia: una forma de pasar, no de frenar.

## Por qué hacerlo

R23 dice que `cd $X && rm -rf .` con `X` vacío borra donde estabas y que la comprobación es del destino,
no de la intención. Hoy el guard mira la intención escrita —`..`, `~`— y deja pasar el destino que se
construye solo. No lo vuelve un límite de seguridad; lo pone a la altura de lo que su propio comentario
reconoce.

## Riesgos y regresiones

1. **Trabajo legítimo sobre temporales**: `cd $(mktemp -d) && rm -rf .` es una forma de limpiar una copia.
   `mktemp.js` ya resuelve dónde cae un `mktemp`, así que el destino se conoce y no se frena. Hay que medirlo.

## Contexto de descubrimiento

Campaña del 2026-10-08, matriz de cien comandos sobre el guard de shell con payload real y banco fuera de
`/tmp`. Las primeras corridas sin `cwd` daban falsos pases en otros guards; estas formas siguieron pasando
con el payload correcto.

## Relacionados

- 317, el guard de límites y los enlaces simbólicos: otra forma de destino que no se resuelve.
- 327, `mktemp` que falla y deja el `cd` en la carpeta personal: el mismo `cd $X` con `X` vacío.

## Cierre

Recorrido contra el caso entero:

- **Resolver el destino de `rm -r` contra el cwd y frenar si es el cwd, la raíz ops, una raíz declarada o
  un ancestro** — hecho, en `engine/hooks/removal.js`, que `destructive` consulta después de sus reglas de
  texto. Se hizo en archivo aparte por lo mismo que el 334: `shell.js` volvía a cruzar las 500 líneas y la
  unidad —a dónde cae un borrado— tiene vida propia, como `mktemp.js`. Lo que `shell.js` le presta se pide al
  usarlo, porque `shell.js` carga este archivo.
- **`cd $X && rm -rf .`** — frena por la regla de R23: base sin resolver y destino relativo.
- **`rm -rf apps/api` nombrando una subcarpeta sigue pasando** — sí, salvo que esa carpeta sea una raíz
  declarada en `ops.config.json`, y entonces frena: la raíz es lo que se cuida. En el banco de la campaña,
  con una sola raíz `..`, `rm -rf apps/api` pasa; en la prueba, con `apps/api` declarada, frena.
- **Lo que se descarta** — sigue descartado: `../acme` por nombre entra ahora sólo si es ancestro de algo
  cuidado, que es exactamente el caso del banco; `find -delete` y `mv` de una prueba no se agregaron.
- **Tradeoff «depende de `cwd` en el payload»** — como `shell-boundary`; sin `cwd` cae a `OPS_ROOT`.
- **Riesgo «limpiar una copia en un temporal»** — medido: `cd $(mktemp -d) && rm -rf .` pasa, porque el
  `cd` a un `mktemp` se resuelve dentro del temporal del sistema y ahí no hay nada cuidado.

Cómo se supo que funciona:

- Rojo previo: la prueba nueva en `test/hooks/destructive.test.js` falló antes del arreglo —trece formas que
  frenan y ocho que pasan— y pasa después; `test/hooks/` en 243 de 243. La primera versión del arreglo no
  reconocía `cd $(mktemp -d)` porque el patrón del `cd` cortaba en el espacio, y la prueba lo encontró.
- Mutación: anular el freno (`if (true) continue`) deja la suite en 12 de 13; restaurada, 13 de 13.
- Corrida real sobre el banco de la campaña con el motor del fuente: `rm -rf .` → «'rm -r' sobre …/acme se
  lleva el directorio actual (destino resuelto …)»; `cd $X && rm -rf .` → «el comando hace `cd` a un destino
  que no se puede resolver acá y después borra .»; `rm -rf ops/` → «se lleva la raíz ops»; y `rm -rf dist`,
  `rm -rf apps/api/dist`, `rm -rf /tmp/banco-123` y `cd $(mktemp -d) && rm -rf .` pasan. Antes del arreglo
  los tres primeros daban exit 0.

