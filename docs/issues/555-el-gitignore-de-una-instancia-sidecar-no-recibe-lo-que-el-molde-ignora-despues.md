---
caso: 555
titulo: el `.gitignore` de una instancia sidecar no recibe lo que el molde empezó a ignorar después de crearla
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 555 — el `.gitignore` de una instancia sidecar no recibe lo que el molde empezó a ignorar después de crearla

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: archivos que son de una máquina —rastros de aprobaciones, el
staging de una integración con lo que bajó una persona— quedan listos para commitear en toda instancia sidecar anterior
a la línea que los ignora. `check` avisa por los rastros y no por el staging; `upgrade` no dice nada. No sube a alta
porque los dos rastros más delicados ya tienen aviso y `.ops-approval` dejó de aprobar fuera de su checkout en 0.116.0.

## Resumen

En sidecar, el `.gitignore` de la instancia se copia del molde una vez, en `init`, y `upgrade` no lo vuelve a tocar: es
de tipo `init` (`engine/core/ownership.js:268`). El bloque de Cauce que se rehace en cada `upgrade` existe sólo en modo
embebido: `ignoreInstance` vuelve sin hacer nada si el modo no es `embedded` (`engine/cli/instance.js:145-146`), aunque se
llama igual en el upgrade (`:369`) y en `init` (`engine/cli/ops.js:122`).

Así, las líneas que el molde sumó después no llegan nunca a una instancia sidecar ya creada. Con su primera versión:

| Línea del molde | Desde | Quién avisa hoy si falta |
|---|---|---|
| `planning/.push-log` | 0.83.0 | `check` (`engine/core/trails.js:72-79`) |
| `planning/.grant-log` | 0.86.0 | `check` |
| `integrations/*/staging/` (caso 222) | 0.100.0 | nadie |
| `ops.config.local.json` | 0.100.0 | nadie |
| `planning/.ops-approval` | 0.116.0 | `check` |

El wiring del runner (`.claude/workflows/`, `.agents/plugins/cauce/hook.js`, 0.106.1) **no** es parte de este caso:
`ignoreInstance` lo deja afuera a propósito (`engine/core/ignore-block.js:22`) y lo suma `automation install` al bloque
del repositorio donde quedan los archivos (`ignoreLoose`, `engine/automation/machine-bound.js:150-159`, caso 513).

La omisión no es un descuido sin rastro: `engine/core/trails.js:34-40` la describe y la justifica —«`upgrade` no lo toca,
porque es de la empresa y puede llevar líneas propias que un reemplazo se llevaría puestas»— y pone el aviso de `check`
como mitigación. Esa razón valía contra reemplazar el archivo; el bloque de 513 no lo reemplaza, así que ya no la
sostiene.

## Reproducción

Con el motor de la rama (0.124.0 sin publicar; `package.json` todavía dice 0.123.1), en un banco sidecar, con el
`.gitignore` de una instancia anterior a tres de esas líneas:

```bash
OPS=$(node engine/cli/ops.js bench sidecar --force 2>/dev/null) && cd "$OPS"
sed -i -e '/^integrations\/\*\/staging\/$/d' -e '/^planning\/\.grant-log$/d' -e '/^planning\/\.ops-approval$/d' .gitignore
git add .gitignore
git -c user.email=b@x.invalid -c user.name=Banco commit -qm "gitignore anterior"
mkdir -p integrations/jira/staging && echo '{"key":"X-1"}' > integrations/jira/staging/X-1.json
touch planning/.grant-log planning/.ops-approval
node tools/ops.js upgrade .
git status --short
git check-ignore -v integrations/jira/staging/X-1.json planning/.grant-log planning/.ops-approval; echo "exit=$?"
node tools/ops.js check planning
```

El `add` y el `commit` van en dos llamadas: el guard `git-add` de este repositorio frena las dos juntas.

## Síntoma

Corrido el 2026-11-24:

```
✓ Cauce 0.123.1 → 0.123.1
  37 ruta(s) del sistema y 1 del runtime actualizadas
  planning, organization y todo lo propio quedaron intactos
?? integrations/jira/
?? planning/.grant-log
?? planning/.ops-approval
exit=1
```

y de `check`, entre sus avisos y con salida 0:

```
⚠ 2 rastro(s) local(es) que git no ignora (planning/.grant-log, planning/.ops-approval); agregá esas líneas a tu .gitignore o van a entrar al repositorio
```

El `upgrade` termina bien, el `.gitignore` queda byte a byte igual y no dice nada. `check` nombra los rastros; el
staging, con el JSON que bajó la persona, no lo nombra nadie.

## Causa raíz

`engine/cli/instance.js:143-146`: el comentario afirma que «en sidecar la instancia tiene el suyo y no hace falta», y
vale sólo para el día del `init`. Lo que el molde ignora después no tiene por dónde llegar.

## Fix propuesto

- `ignoreInstance` corre también en sidecar, sobre el `.gitignore` de la instancia, con el mismo `IB.add` que usa en
  embebido. `IB.add` (`engine/core/ignore-block.js:64-112`) no repite una línea que la persona escribió ni una que git ya
  cubre con otra regla, y salta la que ignoraría archivos versionados, juzgada con sus negaciones.

  Probado en una copia (`ops copy`), cambiando sólo la guarda de `instance.js:146` a `if (O.mode(root) === 'toolkit')
  return []` y apuntando el `node_modules/@ingeniomaps/cauce` del banco a la copia, sobre la misma reproducción:

  ```
  ✓ …/sidecar/ops/.gitignore: planning/.grant-log, planning/.ops-approval, integrations/*/staging/ al bloque de Cauce
  ✓ Cauce 0.123.1 → 0.123.1
   M .gitignore
  .gitignore:55:integrations/*/staging/	integrations/jira/staging/X-1.json
  .gitignore:53:planning/.grant-log	planning/.grant-log
  .gitignore:54:planning/.ops-approval	planning/.ops-approval
  exit=0
  ```

  `check` deja de avisar (0 líneas de «rastro»), un segundo `upgrade` no cambia el archivo, y una sidecar recién creada
  no recibe bloque.

- **Lo anterior no alcanza para el staging de las instancias que más lo necesitan.** Una sidecar con Jira creada antes
  de 0.100.0 tiene versionados `integrations/jira/staging/README.md` y `.gitkeep`, que el molde entrega en `init` desde
  la primera versión y que nada ignoraba entonces. Ahí `IB.add` salta la línea, con razón:

  ```
  ✓ …/.gitignore: planning/.grant-log, planning/.ops-approval al bloque de Cauce
    integrations/*/staging/ no se agregó: ignoraría 2 archivo(s) que el repositorio versiona (integrations/jira/staging/.gitkeep, integrations/jira/staging/README.md). Si alguno es local, ignoralo vos.
  ?? integrations/jira/staging/X-1.json
  ```

  Lo mismo le pasa hoy a una embebida con Jira anterior a 0.100.0. Lo que lo cierra es cambiar la línea del molde por
  `integrations/*/staging/*` con `!integrations/*/staging/README.md` y `!integrations/*/staging/.gitkeep`. Probado en la
  copia sobre ese mismo banco: entra al bloque con sus dos negaciones, `X-1.json` queda ignorado y el README no. En una
  instancia al día no agrega nada: git ya ignora la ruta de prueba con la línea vieja. **Es decisión de producto**
  (pregunta 1).

- Se corrigen los comentarios que afirmaban lo contrario: `instance.js:143-144`, la cabecera de
  `engine/core/ignore-block.js:6-8` («los dos `.gitignore` que el de la instancia no alcanza») y
  `engine/core/trails.js:34-40`, cuya razón deja de valer. El aviso de `trails.js` se queda: sigue haciendo falta cuando
  `IB.add` salta una línea o el rastro ya está versionado.

- ~~Se suma `*.log` al molde.~~ Sale del caso (pregunta 2): Cauce no escribe ningún `*.log` —buscado en `engine/`,
  `automatization/` y `template/`, cero—, así que es una línea de cualquier repositorio, como `*.tgz` o `.DS_Store`.
  Ésas están en `LEFT_OUT` (`ignore-block.js:22`), y con ese mismo criterio `*.log` no llegaría por el bloque a ninguna
  instancia existente, que era lo que el caso le atribuía.

## Decisiones para la persona

1. **¿Se cambia la línea del staging en el molde por la forma con negaciones?** Baja a todas las instancias en su
   próximo `upgrade` (embebidas y, con este caso, sidecar). Recomendación: **sí**. Sin eso el arreglo deja afuera a
   las instancias con Jira anteriores a 0.100.0, que son las que motivaron el caso. Efecto lateral: una instancia
   nueva empieza a versionar `staging/README.md` y `.gitkeep`, que hoy un clon no recibe aunque `ownership` los entrega
   en `init`.
2. **¿`*.log` va al molde?** Recomendación: **no**. No lo produce Cauce, y es del repositorio de la empresa decidirlo.

## Tradeoffs

- **Cambia lo que hace `upgrade` en sidecar** (R29): pasa a escribir un bloque en un archivo que hasta hoy no tocaba. Se
  sostiene con la salida de antes y la de después sobre la misma instancia (arriba), y con la prueba de que lo escrito
  por la persona fuera del bloque queda igual.
- Una sidecar al día no recibe nada: medido, `init` de una sidecar nueva y un `upgrade` sobre ella no dejan bloque.
- **Una línea del molde que la empresa quitó a propósito vuelve dentro del bloque, y negarla afuera no la saca.** El
  caso decía lo contrario («escribir la negación fuera del bloque»), y no funciona. `render` deja siempre el bloque al
  final del archivo, y en git gana la última regla. Medido en el banco: con `!planning/.ops-approval` escrito arriba
  del bloque, `check-ignore` sigue dando `.gitignore:56:planning/.ops-approval`. Escrita debajo, la próxima vez que
  `IB.add` escribe la sube por encima del bloque (medido con `IB.add` directo sobre un archivo de prueba). La única
  salida que dura es versionar el archivo, y entonces `IB.add` salta la línea y lo dice. Es el contrato que ya tiene
  embebido desde el 513; no sale como caso propio mientras nadie lo haya sufrido, y se anota acá.
- `destroy` en sidecar no se lleva nada de la persona por esto. Saca el bloque del `.gitignore` de la instancia y del
  repositorio de arriba (`engine/cli/destroy.js:46-53`, `:126-128`) y después borra la carpeta entera de la instancia
  (`:146`), como ya hacía. Medido con la copia: el producto de al lado (`../app`), con su árbol y su `git status`,
  queda con la misma huella antes y después del `destroy --force`.
- Una sidecar que vive dentro de otro repositorio (la forma de `test/instance/ignore-block.test.js:52`) recibe el bloque
  en el `.gitignore` de la instancia, no en el de arriba. `decide` traduce el prefijo de la subcarpeta
  (`ignore-block.js:74-82`).
- Quien depende: `test/instance/ignore-block.test.js` no fija hoy que el `.gitignore` de una sidecar quede intacto. Con
  la guarda cambiada en la copia pasan las 117 pruebas de `test/instance/*.test.js` (115 pass, 0 fail). Hace falta una
  prueba nueva: sidecar anterior, `upgrade`, bloque con lo que faltaba, y lo de afuera igual. Los comentarios de
  `trails.js` e `ignore-block.js` de arriba también dependen.

## Contexto de descubrimiento

Al revisar, el 2026-11-23, si el `.gitignore` que reciben las empresas es completo, contrastado contra el de una
instancia sidecar en uso: su parte del molde es de una versión anterior y le falta la línea genérica del staging; la de su
integración la había escrito a mano.

Se miró también si la carpeta `lines/` de la sesión, con sus worktrees y los respaldos de `.env` que guarda
`ops lines env --apply` (`engine/cli/line-env.js:171`), quedaba sin ignorar cuando la sesión es un repositorio. No:
`ops line` la anota en el `.git/info/exclude` de ese repositorio (`engine/cli/lines.js:66-78`), y
`git check-ignore -v lines/<línea>/app/.env` lo confirmó en el banco. No sale como caso. En esta revisión se leyó
el código y no se volvió a correr.

## Relacionados

- 513: el bloque de Cauce en un `.gitignore` ajeno. Este caso lo extiende al de la instancia sidecar y hereda su
  contrato de negaciones (Tradeoffs).
- 222: el staging de una integración, la línea que no llega y la única sin aviso.
- 445: las aprobaciones a mano como rastro que `check` avisa (`trails.js`).

## Cierre

Se recorrió el caso entero, con las decisiones de la persona del 2026-11-24 (la línea del staging con negaciones, sí;
`*.log`, no):

- **Fix, `ignoreInstance` también en sidecar**: se hizo (`engine/cli/instance.js`), con el mismo `IB.add` de embebido.
- **Fix, la línea del staging con negaciones**: se hizo en `template/gitignore`: `integrations/*/staging/*` con
  `!…/README.md` y `!…/.gitkeep`.
- **Fix, los comentarios que afirmaban lo contrario**: se corrigieron `instance.js`, la cabecera de
  `engine/core/ignore-block.js` y `engine/core/trails.js`. El aviso de `trails.js` se queda y ahora nombra el
  `upgrade` que trae la línea «cuando puede»: la revisión marcó que no puede con un `.gitignore` que es enlace o con
  una negación de la empresa más abajo.
- **`*.log` al molde**: se decidió que no.
- **Tradeoff, `upgrade` en sidecar escribe un archivo que antes no tocaba**: es así; antes y después lado a lado abajo, y
  lo de afuera del bloque queda igual. Se dice en el CHANGELOG.
- **Tradeoff, una línea quitada a propósito vuelve**: es así, y negarla arriba no la saca; se dice en el CHANGELOG.
- **`destroy` en sidecar**: lo midió la revisión del caso; no se lleva nada de la persona.
- **Lo que el enunciado no preveía**, y queda anotado sin caso propio:
  - Una instancia creada entre 0.100.0 y hoy ya tiene la línea vieja `integrations/*/staging/` y la conserva: lo bajado
    sigue ignorado, y su README también. `IB.add` sólo agrega; reescribir el bloque para retirar una línea del molde es
    otra decisión, del contrato del 513. Se dice en el CHANGELOG.
  - Una instancia anterior a 0.100.0 que commiteó JSON del staging no recibe la línea: `IB.add` la salta porque
    ignoraría lo versionado, y lo dice («ignoralo vos»). Es la regla del 513.

Lo que se corrió, guardado en el scratchpad de la sesión, fuera del repositorio:

- La reproducción del caso en un banco sidecar (`ops bench sidecar`, el motor enlazado), en dos formas: el
  `.gitignore` sin las líneas posteriores, y además con el README y el `.gitkeep` del staging versionados (la instancia
  anterior a 0.100.0). Antes, en las dos: el staging, `.grant-log` y `.ops-approval` sin ignorar y 1 aviso de rastros en
  `check`. Después, con el motor final: los tres ignorados por el bloque, el README no, 0 avisos, y las líneas de
  afuera iguales.
- Las pruebas nuevas en `test/instance/ignore-block.test.js`: la de la sidecar anterior en rojo antes del arreglo y en
  verde después; la de una sidecar nueva sin bloque, en verde antes y después (cuida que no cambie).
- 3 mutaciones en una copia, las 3 rojas: sólo embebido, la línea vieja del staging, y sin negaciones.
- Dos pasadas de revisión independiente; la segunda, sin nada que impida entregar.
- `npm run ci`: 1982 de 1982, exit 0.

**Sin probar:** una sidecar que no es repositorio git, y un `.gitignore` que es enlace (la revisión leyó que `IB.add` no
escribe ahí, y el aviso de `check` ya no promete el `upgrade`).

### Lista de cierre

1. hecho: la reproducción en las dos formas con el motor anterior, guardada antes del arreglo.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: la prueba nueva de la sidecar anterior, en rojo antes del arreglo y en verde después.
4. hecho: 3 mutaciones en una copia, las 3 rojas.
5. hecho: cambia lo que hace `upgrade` en sidecar; la salida de antes y la de después sobre el mismo banco, lado a lado.
6. hecho: un banco sidecar real, sin dobles; se midió que los archivos dejaron de quedar sin ignorar y que `check` dejó
   de avisar.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: la reproducción se repitió con el motor final, en las dos formas.
9. hecho: dos formas de instancia (con y sin el staging versionado), y la sidecar nueva.
10. hecho: dependían `test/wiring/jira-staging.test.js` (fijaba el texto de la línea vieja; ahora mide el efecto con
    `check-ignore`), `test/planning/ignored-trails.test.js` (su comentario decía que `upgrade` nunca trae la línea), y
    los comentarios de `trails.js` e `ignore-block.js`.
11. hecho: dos pasadas de revisión; los hallazgos de la primera se arreglaron o se anotaron arriba, y la segunda no trajo
    nada que impida entregar. El texto del aviso de `trails.js` cambió después, por un hallazgo de la segunda, y tuvo una
    tercera pasada acotada a él: sin nada que impida entregar; de sus sugerencias se tomaron la concordancia del aviso y
    el comentario que enumeraba mal.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, exit 0.
14. hecho: este cierre recorre el Fix propuesto, las decisiones y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
