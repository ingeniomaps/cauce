---
caso: 113
titulo: Dos raíces cuya carpeta se llama igual dan servicios con el mismo nombre
estado: resuelto
resuelto-en: 0.82.0
prioridad: baja
version-detectada: 0.81.0
---

# 113 — `inventory` nombra cada raíz por su carpeta, y `gouduet/keycloak` y `hypixo/keycloak` salen los dos `keycloak`

**🟢 resuelto en 0.82.0** · detectado en 0.81.0 · prioridad **baja**. No se pierde ningún aviso, pero nombra un servicio
que no se puede ubicar: para saber de qué repositorio es la credencial hay que abrirlos todos.

## Resumen

Con varias raíces declaradas, el inventario le pone a cada servicio el nombre de la **carpeta** de su raíz
como prefijo. Si dos raíces terminan en una carpeta con el mismo nombre, sus servicios salen con el mismo
nombre en `check`, `onboard` y `scan`, y nada los distingue. La raíz ya tiene un nombre que la distingue,
el `name` que exige `ops.config.json`, y no se usa.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: un sidecar con dos raíces que terminan las dos en
`keycloak`, cada una con una credencial en su ejemplo, y una épica, porque con la instancia recién creada
el aviso no corre.

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js; A=$BANCO/acme-ops
for r in gouduet hypixo; do
  mkdir -p $BANCO/$r/keycloak
  printf '{"name":"keycloak","scripts":{"start":"node server.js"}}\n' > $BANCO/$r/keycloak/package.json
  printf 'KC_DB_PASSWORD=\n' > $BANCO/$r/keycloak/.env.example
done
node $OPS init $A --mode sidecar --runner ninguno --no-install >/dev/null
node -e "const f='$A/ops.config.json',c=JSON.parse(require('fs').readFileSync(f)); c.workspaceRoots=[
  {name:'gouduet',path:'../gouduet/keycloak'},{name:'hypixo',path:'../hypixo/keycloak'}]
require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
cp $A/planning/roadmap/epic-000-template.md $A/planning/roadmap/epic-001-primera.md
sed -i 's/^status: template/status: open/; s/^epic: .*/epic: 001/' $A/planning/roadmap/epic-001-primera.md
node $OPS check $A/planning 2>&1 | grep 'nadie las carga'
(cd $A && node $OPS onboard . 2>&1 | grep keycloak; node $OPS scan 2>&1 | head -5)
```

## Síntoma

Corrido el 2026-09-11 contra la rama `fix/102-111-aviso-de-variables` (base `main` 437170a8):

```
⚠ credenciales por nombre sin dueño (2, en keycloak): KC_DB_PASSWORD (keycloak), KC_DB_PASSWORD (keycloak) — no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga. …
Mientras tanto, esto es lo que hay: keycloak, keycloak
keycloak [raíz] — sin comandos declarados
    espera KC_DB_PASSWORD (.env.example)
keycloak [raíz] — sin comandos declarados
    espera KC_DB_PASSWORD (.env.example)
```

Con las raíces declaradas un nivel más arriba (`../gouduet` y `../hypixo`) el mismo banco da
`KC_DB_PASSWORD (gouduet/keycloak), KC_DB_PASSWORD (hypixo/keycloak)`. El choque aparece sólo cuando la
**última carpeta** de dos raíces coincide.

## Causa raíz

`engine/core/scan.js:205`: el prefijo es `path.basename(workspace)`, la última carpeta de la ruta
resuelta. `workspaceRoots` (`scan.js:177`) devuelve sólo las rutas y descarta el `name` de cada entrada,
así que `inventory` (`scan.js:200`) no tiene otra cosa con qué nombrar.

`validateWorkspaces` (`engine/config/validate.js:71`) exige el `name` de cada raíz, pero no que sea
único, así que tampoco garantiza hoy que ese nombre distinga.

El nombre llega a tres salidas: el aviso de credenciales (`engine/core/onboarding.js`, que itera
`inventory`), el listado de `onboard` (`engine/cli/wiring.js:175`) y el de `scan` sin argumento
(`engine/cli/wiring.js:139`). Viene de c9b6e4bf (2026-08-22), antes del cambio del 102.

## Fix propuesto

Nombrar por el `name` declarado y exigir que sea único:

```diff
 function workspaceRoots(root) {
-    const declared = (config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path || '.'))
+    // devolver { name, dir } y que los que sólo quieren la ruta lean .dir
 ...
-    path: service.path === '.' ? path.basename(workspace) : `${path.basename(workspace)}/${service.path}`,
+    path: service.path === '.' ? name : `${name}/${service.path}`,
```

y en `validateWorkspaces`, un error si dos entradas repiten `name`.

## Tradeoffs

- **Cambia el nombre que se ve cuando la carpeta y el `name` difieren.** Hoy, en la forma más común
  (`{name: 'gouduet', path: '../gouduet'}`), coinciden y no cambia nada. Donde difieren, el nombre pasa a ser
  el que la persona escribió, que es el que eligió para hablar de esa raíz.
- **`workspaceRoots` tiene más consumidores que el inventario**, y `onboard --json` lo emite tal cual
  (`roots`). Cambiar lo que devuelve cambia ese JSON. Una función aparte para los nombres lo evita.
- **La unicidad rompe la validación de una instancia que hoy repite `name`.** El error nombra las dos
  entradas y el arreglo es renombrar una.

## Contexto de descubrimiento

Al cerrar el 102, corriendo `check` sobre los repositorios reales de una empresa: el aviso de tope salió como
`keycloak (21 de 61), keycloak (16 de 56)`, dos servicios distintos con el mismo nombre. Está en el cierre
del 102. Una primera reproducción con las raíces un nivel más arriba no lo mostraba, y de ahí sale lo que
dice el Síntoma sobre la última carpeta.

## Relacionados

- **102**: cambió qué avisa y agregó el aviso de tope. Los dos muestran el nombre que este caso rompe.

## Cierre

Resuelto en 0.82.0, en `fix/113-nombre-de-raiz`. El prefijo del inventario pasa a ser el `name` declarado de
cada raíz, y el validador exige que no se repita.

Recorrido de lo que el caso enumeró:

- **Resumen** — cierto tal como estaba escrito: el `name` ya existía, `ops.config.json` ya lo exigía y nadie
  lo leía. `declaredRoots`, en `engine/core/scan.js`, es lo que lo empieza a leer.
- **Reproducción** — se corrió literal, en un banco desechable bajo el scratchpad, contra un `git archive` de
  `main` (`41673984`) y contra el arreglo. Las dos salidas, abajo.
- **Síntoma** — reproducido línea por línea sobre `main`, y no sólo sobre la rama del 102 donde se registró.
- **Causa raíz** — las citas se contrastaron contra el fuente, una por una, y las siete daban: `scan.js:205`
  era el `path.basename(workspace)`, `scan.js:177` `workspaceRoots`, `scan.js:200` `inventory`,
  `validate.js:71` `validateWorkspaces`, `onboarding.js:125` el bucle del aviso, `wiring.js:175` el listado
  de `onboard` y `wiring.js:139` el de `scan`. `c9b6e4bf` es del 2026-08-22, como decía.
- **Fix propuesto, «que `workspaceRoots` devuelva `{name, dir}`»** — hecho distinto, por lo que el propio
  caso anticipaba en su segundo tradeoff: se agregó `declaredRoots`, que devuelve `{ name, dir }`, y
  `workspaceRoots` quedó como su proyección a rutas. Así `inventory` tiene el nombre y el contrato de
  `onboard --json` no se mueve.
- **Fix propuesto, «el prefijo es el `name`»** — hecho tal cual.
- **Fix propuesto, «un error si dos entradas repiten `name`»** — hecho en `validateWorkspaces`, con el
  índice de las dos entradas adentro del mensaje: `ops.config.json: workspaceRoots[1].name "keycloak" es el
  mismo que el de workspaceRoots[0]: el nombre de la raíz es el que nombra a sus servicios, así que dos
  iguales los vuelven indistinguibles. Renombrá una`. Compara el nombre sin espacios a los lados, que es lo
  mismo que ya miraba la validación de obligatoriedad.
- **Tradeoff «cambia el nombre que se ve cuando la carpeta y el `name` difieren»** — se asume: es el punto
  del cambio. Donde coinciden, que es la forma más común, no cambia nada, y la prueba con `../api` y
  `../web` que ya existía lo fija.
- **Tradeoff «`workspaceRoots` tiene más consumidores»** — se comprobó cuáles, y son dos:
  `engine/cli/wiring.js:164`, que es el campo `roots` de `onboard --json`, y el propio `inventory`. Ningún
  otro archivo del repositorio lo llama. Con `declaredRoots` aparte, `roots` sigue emitiendo rutas; lo fijan
  una aserción propia y la mutación M5.
- **Tradeoff «la unicidad rompe la validación de una instancia que hoy repite `name`»** — se asume tal como
  el caso lo escribió: el `check` de esa instancia pasa a fallar y el arreglo es renombrar una raíz. Va al
  CHANGELOG como lo que hay que hacer, que es donde lo lee quien actualiza.
- **Contexto de descubrimiento** — el aviso de tope del 102 (`keycloak (21 de 61), keycloak (16 de 56)`)
  sale del mismo `service.path` que el de credenciales, así que se arregla con esto y no había un segundo
  defecto que tocar. Comprobado leyendo `orphanCredentials`: `cut` y `orphans` usan el mismo campo.
- **Relacionados, 102** — las dos salidas que el 102 agregó nombran ahora la raíz declarada.

Lo que el enunciado no preveía: **una raíz sin `name` sólo la rechaza `check`, y `scan` y `onboard` corren
igual sobre esa configuración**. Tomando `entry.name` a secas el prefijo habría salido `undefined`, peor que
el defecto que se estaba arreglando. `declaredRoots` cae a la carpeta cuando el `name` falta o está en
blanco —que es exactamente cómo se nombraba antes—, y la mutación M2 lo cubre.

### Qué se corrió

La reproducción del caso, literal. Antes, sobre `git archive 41673984`:

```
⚠ credenciales por nombre sin dueño (2, en keycloak): KC_DB_PASSWORD (keycloak), KC_DB_PASSWORD (keycloak) — …
Mientras tanto, esto es lo que hay: keycloak, keycloak
keycloak [raíz] — sin comandos declarados
    espera KC_DB_PASSWORD (.env.example)
keycloak [raíz] — sin comandos declarados
    espera KC_DB_PASSWORD (.env.example)
```

Después, sobre el arreglo:

```
⚠ credenciales por nombre sin dueño (2, en gouduet, hypixo): KC_DB_PASSWORD (gouduet), KC_DB_PASSWORD (hypixo) — …
Mientras tanto, esto es lo que hay: gouduet, hypixo
gouduet [raíz] — sin comandos declarados
    espera KC_DB_PASSWORD (.env.example)
hypixo [raíz] — sin comandos declarados
    espera KC_DB_PASSWORD (.env.example)
```

El `grep keycloak` del paso de `onboard` de la reproducción ahora no devuelve nada, y ésa es la mitad que
faltaba comprobar: no que aparezca el nombre nuevo, sino que el viejo se haya ido.

- **Rojo previo.** Las tres pruebas nuevas sobre `git archive 41673984`: 3 rojas de 31. «dos raíces que
  terminan en la misma carpeta se distinguen por el name declarado» falla con `actual: [ 'keycloak',
  'keycloak' ]` contra `expected: [ 'gouduet', 'hypixo' ]`; «el aviso distingue dos raíces que terminan en
  la misma carpeta», con la línea de `check` diciendo `KC_DB_PASSWORD (keycloak), KC_DB_PASSWORD
  (keycloak)`; y «dos raíces con el mismo name se rechazan, y el error nombra a las dos», con `actual: 0`
  errores contra `expected: 1`. Sobre el arreglo, 31 de 31 en verde.
- **Mutaciones.** Cada parte del fix apagada a mano en su propia copia desechable —nunca en el árbol de
  trabajo—, comprobando que el texto mutado estuviera antes de correr:

  | Mutación | Qué se apagó | Prueba que se puso roja |
  |---|---|---|
  | M1 | el prefijo vuelve a ser `path.basename(dir)` | «…se distinguen por el name declarado» y «el aviso distingue…» |
  | M2 | la raíz sin `name` deja de caer a la carpeta | «…se distinguen por el name declarado» |
  | M3 | el validador deja de exigir que el `name` sea único | «dos raíces con el mismo name se rechazan…» |
  | M4 | el error no dice contra cuál entrada choca | «dos raíces con el mismo name se rechazan…» |
  | M5 | `workspaceRoots` emite objetos en vez de rutas | «…se distinguen por el name declarado» |

  Ninguna sobrevivió.
