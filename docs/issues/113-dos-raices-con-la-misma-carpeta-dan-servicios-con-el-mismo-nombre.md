---
caso: 113
titulo: Dos raíces cuya carpeta se llama igual dan servicios con el mismo nombre
estado: abierto
prioridad: baja
version-detectada: 0.81.0
---

# 113 — `inventory` nombra cada raíz por su carpeta, y `gouduet/keycloak` y `hypixo/keycloak` salen los dos `keycloak`

**🔴 abierto** · detectado en 0.81.0 · prioridad **baja**. No se pierde ningún aviso, pero nombra un servicio
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
