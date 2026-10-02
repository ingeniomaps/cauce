---
caso: 209
titulo: las rutas escribibles de una máquina viven en el archivo compartido
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 209 — `writableOutsideRoots` sólo se lee de `ops.config.json`, que se versiona

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: no rompe nada. Pero obliga a versionar rutas de una persona, que viajan a todos los que clonan el
repositorio ops, y una instancia que se toma en serio no dejar rutas de una máquina en su código no tiene dónde
ponerlas.

## Resumen

`writableOutsideRoots` declara las rutas fuera de las raíces de trabajo donde el agente puede escribir. Casi siempre
son de una persona: la memoria de su runner, la carpeta de casos de otro proyecto suyo. Cauce sólo la lee de
`ops.config.json`, que es del proyecto y se versiona, así que esas rutas quedan publicadas para todos.

## Reproducción

En una instancia real (`acme-ops`, Cauce 0.99.2), `ops.config.json` tiene:

```json
"writableOutsideRoots": [
  "~/.claude/projects/-home-manuel-Code-acme-servers/memory",
  "~/Code/personal/cauce/docs/issues",
  "~/Code/personal/tyrell/docs/issues"
]
```

La primera lleva el nombre de usuario dentro del nombre de la carpeta; las otras dos son proyectos personales. Para
otra persona del equipo no existen y no hacen nada, pero están en el repositorio.

## Síntoma

No hay dónde declarar una ruta escribible que sea sólo de quien trabaja. Las opciones son versionarla, o no
declararla y que el guard frene la escritura.

## Causa raíz

`engine/config/paths.js:23` arma la lista sólo de `config.writableOutsideRoots`, y `config` es el `ops.config.json`
de la instancia (`engine/hooks/ops-config.js:22`, `INSTANCE_CONFIG`). No hay un archivo local que se sume.

## Fix propuesto

Sumar las de un archivo local que no se versiona, con la misma forma, por ejemplo `ops.config.local.json` en la raíz
de la instancia, y que `ops init` lo agregue al `.gitignore`:

```diff
 function writableOutsideRoots(root, config) {
-  const declared = config && Array.isArray(config.writableOutsideRoots) ? config.writableOutsideRoots : []
+  const local = readLocalConfig(root) // ops.config.local.json, o {} si no existe
+  const declared = [config, local]
+    .flatMap((c) => (c && Array.isArray(c.writableOutsideRoots) ? c.writableOutsideRoots : []))
   return declared.filter((entry) => typeof entry === 'string' && entry.trim())
     .map((entry) => ({ declared: entry, path: resolvePath(root, entry) }))
 }
```

`check` muestra las dos listas con su origen, para que se vea cuál es de la persona.

## Tradeoffs

- Un archivo más que leer. A cambio, el patrón ya existe en las instancias: `integrations/jira/config.local.json`
  guarda la cuenta de cada persona por la misma razón.
- Lo local se suma y nunca resta: una ruta que el proyecto declara no se puede quitar desde el archivo de una persona.

## Contexto de descubrimiento

Revisión de rutas absolutas y nombres propios en `acme-ops`, el 2026-10-01. Todo lo demás se pudo sacar del código
de la instancia; esto no, porque la clave sólo se lee del archivo compartido.

## Relacionados

- `integrations/jira/config.local.json` de las instancias: el mismo reparto entre proyecto y persona.

## Cierre

Resuelto en 0.100.0 como lo proponía el caso, con dos cosas que el fix no decía.

- **Reproducción, antes de tocar nada:** en un banco `suelto` con `ops.config.local.json` declarando una ruta
  del scratchpad, el guard `workspace-boundary` devolvió exit 2 («está fuera de las raíces declaradas en
  ops.config.json») y `check` no mostró ninguna ruta exenta. Las citas `engine/config/paths.js:23` y
  `engine/hooks/ops-config.js:22` coincidían.
- **Sumar las rutas de un archivo local con la misma forma** — se hizo. `writableOutsideRoots` en
  `engine/config/paths.js` lee también `ops.config.local.json` de la raíz, y cada ruta lleva de qué archivo
  salió. Lo usan los dos guards de límites y `check`, así que los tres responden igual.
- **Que `ops init` lo agregue al `.gitignore`** — se hizo, en `template/gitignore`. Una instancia anterior no
  lo recibe, porque `upgrade` no toca su `.gitignore`. El CHANGELOG le dice que agregue la línea antes de
  crear el archivo.
- **`check` muestra las dos listas con su origen** — se hizo. El aviso de ruta exenta empieza ahora por el
  archivo que la declaró.
- **Tradeoff: un archivo más que leer** — aceptado, con el mismo reparto que `integrations/jira/config.local.json`.
- **Tradeoff: lo local se suma y nunca resta** — se mantiene así. No hay forma de quitar desde el archivo de una
  persona una ruta que declaró el proyecto.

Lo que el caso no decía:

- **De ese archivo se lee sólo `writableOutsideRoots`.** Fusionarlo con la configuración entera habría dejado
  declarar `runner.allowPush` desde un archivo que nadie revisa y que el guard `ops-config` no mira. `check`
  avisa cualquier otra llave («no rige acá»), y una prueba comprueba que `allowPush` puesto ahí no autoriza
  ningún push.
- **Un archivo local roto exenta menos, nunca más.** El guard no bloquea por él —el límite queda entero, sin
  sus rutas—, a diferencia de un `ops.config.json` ilegible, que sí bloquea porque sin él no hay límite.
  `check` lo avisa sin fallar.
- **El mensaje del bloqueo nombra la salida nueva.** Antes mandaba sólo a `ops.config.json`, que es justo lo
  que el caso quería evitar para las rutas de una persona.

Prueba real:

- **La misma reproducción después del arreglo:** el guard sale 0 y `check` muestra `⚠ ops.config.local.json:
  …/w209 está exenta del límite de raíces`. Con `"runner":{"allowPush":true}` en el local, `check` agrega `de
  este archivo sólo se lee writableOutsideRoots; runner no rige acá`. Con `{bad` el guard vuelve a salir 2 y
  `check` sigue `ok=true` con el aviso `no se puede leer`.
- **Seis mutaciones en una copia, cada una en rojo por `test/hooks/local-config.test.js`:**
  - Sin leer el local: rojas la escritura y `check`.
  - Sin los avisos del local en `check`: rojo `check`.
  - Con el rótulo fijo en `ops.config.json`: rojo `check`.
  - Sin avisar las llaves ajenas: rojo el aviso.
  - Con el local fusionado sobre toda la configuración: rojos el push, el local roto y la escritura.
  - Sin la línea del `.gitignore`: rojo `init`.
