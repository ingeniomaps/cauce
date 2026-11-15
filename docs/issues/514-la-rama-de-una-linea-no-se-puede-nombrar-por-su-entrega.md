---
caso: 514
titulo: La rama de una línea no se puede nombrar por su entrega, y una instancia que trabaja una rama por PR la renombra a mano
estado: aplazado
reabrir-si: una segunda instancia distinta pide la rama local con el nombre de la entrega, o una instancia pierde trabajo o una rama por el nombre de la rama de una línea
prioridad: baja
version-detectada: 0.120.0
---

# 514 — La rama de una línea no se puede nombrar por su entrega, y una instancia que trabaja una rama por PR la renombra a mano

**⏸ aplazado** · detectado en 0.120.0 · prioridad **baja**: no pierde trabajo —medido: el retiro se niega mientras la
rama renombrada no llegó a la rama viva—, pero toda línea de una instancia que nombra sus ramas por entrega
(`feat/<entrega>`) vive con un aviso permanente (exit 0) y deja la rama, ya mergeada, al retirarse.

## Resumen

`ops line` arma la rama de cada árbol como `line/<línea>` y no acepta otra. Una instancia que trabaja con una rama por
PR —trunk-based: la rama se llama por lo que entrega, sale de la rama viva y vuelve a ella en un solo PR, y la línea
vive lo que dura ese PR— tiene que renombrarla a mano. Desde ahí `ops lines` la da por desviada en cada corrida, y
`lines join` retira la línea pero deja la rama.

El motivo no es el del 482, que quería `line/<persona>-<línea>` para que dos personas no compartieran rama: acá la línea
**es** la entrega, y el nombre de su rama es el título del PR que va a abrir. **Pero la decisión que pide es la misma**
que el 470 tomó en contra y el 482 descartó: declarar la rama de una línea en `ops.config.json` (ver «Revisión»).

La versión anterior de este caso decía que esta forma de trabajo es la que recomiendan DORA y el Release Flow de
Microsoft. No lo es, y se sacó. DORA llama *trunk-based* a integrar al trunk «at least once (and potentially several
times) a day», con ramas que «typically last no more than a few hours», y lo contrapone a las ramas por funcionalidad
que duran días (dora.dev/capabilities/trunk-based-development, leída el 2026-11-15). Una línea que dura lo que un PR de
varias tareas es una de esas. El post de Release Flow (devblogs.microsoft.com, 2018) no describe ramas de trabajo
nombradas por entrega.

## Reproducción

En un directorio vacío, con el Cauce del repositorio:

```bash
mkdir app && git init -q -b main app && echo x > app/a.txt && git -C app add a.txt && git -C app commit -qm init
node <cauce>/engine/cli/ops.js init ops --mode sidecar --no-install
git init -q -b main ops && git -C ops add -A && git -C ops commit -qm init
node <cauce>/engine/cli/ops.js line ops entrega app
node <cauce>/engine/cli/ops.js line ops entrega app --branch feat/entrega-x
git -C lines/entrega/app branch -m feat/entrega-x
echo y > lines/entrega/app/b.txt && git -C lines/entrega/app add b.txt && git -C lines/entrega/app commit -qm "feat: b"
node <cauce>/engine/cli/ops.js lines ops
git -C app merge -q --no-ff feat/entrega-x -m "Merge feat/entrega-x"
node <cauce>/engine/cli/ops.js lines join ops entrega --apply
git -C app branch --format='%(refname:short)'
```

## Síntoma

Salida real, 2026-11-15, en un banco `sidecar` en el scratchpad:

```
✓ …/lines/entrega/app  (line/entrega)
  sale de: main
line: bandera desconocida --branch. Acepta: --json.
```

Con la rama renombrada a mano:

```
entrega  (línea declarada)
  app  …/lines/entrega/app  (line/entrega)  el árbol está en feat/entrega-x, no en line/entrega  +1 / -0
```

Retirada después del merge:

```
RETIRAR la línea entrega  (1 repositorio(s))
  app  llegó a main
  queda feat/entrega-x en app: no es de la línea, y el retiro no la borra
✓ retirada: sin árboles, sin line/entrega y fuera de ops.config.json, que hay que commitear
```

Y `git branch` deja `feat/entrega-x` y `main`. El conteo contra la rama viva y el retiro funcionan; lo que falla es que
el motor no sepa que ésa es la rama de la línea.

## Causa raíz

- `engine/core/line-trees.js:21`: `const BRANCH = 'line/'`.
- `engine/cli/lines.js:85`: `plant` arma `${BRANCH}${name}`, y `engine/cli/lines.js:30` busca el árbol por ese nombre.
- `engine/cli/lines-join.js:25`, `:133` y `:279`: traer y retirar resuelven la rama con el mismo prefijo.
- `engine/schemas/ops-config.schema.json:203`: `lines` es `{ línea: [repos] }`, sin dónde guardar la rama.

## Fix propuesto

`ops line <ops-root> <línea> <repo>... --branch <rama>`, que guarde la rama en la declaración de la línea, por ejemplo
`"lines": { "entrega": { "repos": ["app"], "branch": "feat/entrega-x" } }`, y siga aceptando la forma de lista con
`line/<línea>` por defecto. Desde ahí, `plant`, el aviso de `ops lines` y `lines join` leen la rama declarada en vez de
armarla, y el retiro borra esa rama (la local; la del remoto la borra el merge del PR).

Que la rama no tenga que empezar con el nombre de la línea: la línea es dónde se trabaja, la rama es qué se entrega.

## Revisión (2026-11-15)

- **Citas:** las cuatro de «Causa raíz» y la de `line-trees.js:63`, contrastadas contra el fuente de la rama
  `fix/e2e-120-findings`: coinciden.
- **Reproducción:** corrida entera en `/var/tmp/rev-514`, con el motor de la rama; la salida es la de «Síntoma».
- **Lo que el caso no medía:** si renombrar la rama arriesga trabajo. No: con la rama renombrada y **sin** mergear,
  `lines join ops entrega --apply` se niega —«el árbol … está en feat/entrega-x, que no llegó a main: mergeá
  feat/entrega-x a main … y volvé a retirarla»— y no toca nada. El retiro lee la rama real del árbol, no `line/<línea>`.
  `/autobuild` en una línea commitea en la rama que tenga el árbol (`autobuild.js:418`, `tree.branch`), y
  `currentLine` (`engine/planning/lines.js:27`), que sí deduce la línea del nombre de la rama, es la vía deprecada de las
  líneas anteriores a 0.111.0 y no mira los árboles de producto.
- **Lo que revierte:** el 470 (`## Cierre`: «Declarar la rama en `ops.config.json`. Se decidió que no: … una clave nueva
  baja a todas las empresas sin un daño medido») y el 482 (descartado el 2026-11-03: «Se reabre si una instancia pierde
  trabajo o una rama por ese nombre»). La condición de reapertura no se cumple: no se pierde trabajo y la rama queda.
- **Si vale:** el daño medido es el mismo que el 482 juzgó insuficiente —un aviso con exit 0 y una rama mergeada que
  queda—. Lo nuevo es una segunda forma de nombrar la rama, en una instancia que puede o no ser la del 482 (los dos
  casos están saneados). **Propuesta: aplazarlo**, con `reabrir-si` una segunda instancia distinta lo pida o se pierda
  trabajo o una rama, y anotar el aviso en la guía de esa instancia, como hizo la del 482.

## Tradeoffs

- **Callar un desvío real.** El aviso de `lines.js` es el único que ve un árbol que quedó en otra rama por error. Con
  la rama declarada sigue igual de firme: compara contra lo declarado y no contra un patrón, así que no hay coincidencia
  por sufijo que confunda dos líneas (la objeción del 482).
- **El id del runner** (`line-trees.js:63`, `runnerOf`) usa `#line/<línea>`. Si pasa a usar la rama declarada, cambia el
  id de los runners de una línea ya abierta; si sigue con el nombre de la línea, no cambia nada.
- **Dos formas de `lines` en la configuración.** El schema tiene que aceptar las dos, y `check` las valida.

## Contexto de descubrimiento

Una instancia sidecar multi-repo que adoptó una rama por entrega (HU, hito o grupo de hitos) en vez de una por tarea, con
merge normal a la rama viva y líneas para el trabajo que va aparte del principal. Al escribir la regla de cómo se abre
una línea, la rama `line/<línea>` era la única pieza que no encajaba. Se saneó el nombre de la instancia.

## Relacionados

Casos 470 (resuelto en 0.118.0: el mensaje sin rama viva, y la decisión de no declarar la rama en la configuración) y
482 (descartado: la rama con persona). Caso 515, la misma entrega trabajada en la principal.

## Aplazamiento

**Aplazado el 2026-11-15 por decisión de la persona**, con el acuerdo de la sesión de la instancia que lo abrió. La
instancia no necesita que la rama **local** se llame por la entrega: su lanzador lee la rama real del árbol y sus guards
de push miden contra `origin/main`. Lo que necesita es que el PR salga de `feat/<entrega>`, y eso se resuelve sin tocar
el motor, medido en `/var/tmp/rev-514c` con un remoto:

- `git push -u origin line/<línea>:feat/<entrega>` desde el árbol de la línea crea la rama del PR en el remoto;
- con `git config push.default upstream` en ese árbol, un `git push` sin argumentos sigue mandando ahí;
- `ops lines` no avisa nada (`app … (line/entrega) +2 / -0`);
- después del merge y un `git fetch`, `lines join --apply` retira la línea y borra `line/<línea>`, y el repositorio queda
  sólo con `main`.

El PR lo abre con `--head feat/<entrega>` explícito. Se reabre en las condiciones de `reabrir-si`.

