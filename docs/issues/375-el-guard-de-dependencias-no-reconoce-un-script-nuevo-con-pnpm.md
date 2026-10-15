---
caso: 375
titulo: el guard de dependencias no reconoce un script nuevo con pnpm
estado: resuelto
resuelto-en: 0.108.0
prioridad: alta
version-detectada: 0.106.1
---

# 375 — `lockUnaffected` sólo afloja con `package-lock.json`: con pnpm, sumar un script a `package.json` frena el commit aunque el lockfile no cambie

**🟢 resuelto en 0.108.0** · detectado en 0.106.1 · prioridad **alta** — subida de media al cerrar: el rodeo que el
guard provocaba, aprobar `package.json` para siempre, abría el agujero que el guard existe para cerrar. Medido
clave por clave con pnpm 10.30.2, `pnpm-lock.yaml` afloja igual que el de npm.

## Resumen

El caso 181 dejó pasar un `package.json` que cambia sólo claves inertes (un script, la descripción) sin su
lockfile. La excepción se midió con npm y quedó atada a él: con `pnpm-lock.yaml` no se afloja nada, así que en
un proyecto pnpm cada script nuevo frena el commit como si fuera un cambio de dependencias.

## Reproducción

Banco temporal con pnpm 10.30.2, sin dependencias:

```bash
printf '{"name":"x","version":"1.0.0","scripts":{"a":"echo a"}}\n' > package.json
pnpm install --lockfile-only && cp pnpm-lock.yaml before.yaml
printf '{"name":"x","version":"1.0.0","scripts":{"a":"echo a","verify:b":"echo b"}}\n' > package.json
pnpm install --lockfile-only && cmp before.yaml pnpm-lock.yaml
```

## Síntoma

```
cmp → sin diferencias (LOCK-IGUAL); `grep -c scripts pnpm-lock.yaml` → 0
```

El lockfile de pnpm no registra los scripts, igual que el de npm. Aun así, el commit con ese `package.json` y
sin `pnpm-lock.yaml` lo frena el guard de dependencias. En uso le costó a una corrida de autobuild un
`commit-failed` en la fase Commit, con la tarea ya construida y verificada. El operador terminó aprobando
`package.json` en `.ops-approval` para siempre, lo que también deja pasar un cambio real de dependencias sin
lockfile: justo lo que el guard existe para frenar.

## Causa raíz

`engine/hooks/shell.js`, `lockUnaffected` (línea 223):

```js
if (path.basename(file) !== 'package.json' || lockfiles.join() !== 'package-lock.json') return false
```

El comentario de arriba lo dice: «Sólo se midió el lock de npm, así que con otro gestor no se afloja nada».
Es una limitación declarada, no un descuido; este caso pide medir el siguiente gestor.

## Fix propuesto

Medir `INERT_KEYS` con `pnpm install --lockfile-only` —como se hizo con npm 11.16.0, una clave por vez— y
aceptar `pnpm-lock.yaml` en la condición con la lista que salga. Lo de arriba sólo mide `scripts`. A medir con
cuidado: `pnpm` lee del `package.json` claves propias que sí afectan la resolución (`pnpm.overrides`,
`pnpm.patchedDependencies`, `packageManager`) y que no están en la lista de npm. Hay que confirmar que ninguna
de las inertes de npm mueve el lock de pnpm.

## Qué podría salir mal

- Una clave que pnpm sí registra y quedó como inerte deja pasar un lock desactualizado. Se evita midiendo cada
  clave, igual que con npm, en vez de reusar la lista.
- `lockfiles` con más de un lock (npm y pnpm a la vez) sigue sin aflojar, y está bien que siga así.

## Contexto de descubrimiento

Instancia sidecar `acme-ops`, proyecto `platform` (pnpm), 2026-10-13. Las tareas del hito
`cuenta-como-ancla` suman cada una un script `verify:*` a `package.json`.

## Relacionados

- [181](./181-el-guard-de-manifest-mira-el-indice-y-su-mensaje-promete-un-desbloqueo-que-no-implementa.md) — la
  excepción que esto extiende.
- [151](./151-la-mitigacion-de-pnpm-en-verify-es-un-no-op-y-ningun-commit-con-lockfile-pasa.md) — otro hueco
  de pnpm en el mismo camino.
- [374](./374-editar-solo-comentarios-de-la-aprobacion-frena-sin-salida.md) — encontrado en la misma sesión.

## Cierre

**Resuelto en 0.108.0.** `lockUnaffected` acepta `pnpm-lock.yaml` además de `package-lock.json`, con la misma lista
inerte. La medición que el caso pedía se hizo entera, no sólo `scripts`.

**La medición.** `pnpm install --lockfile-only` con pnpm 10.30.2, el 2026-10-14, sobre un manifiesto con una
dependencia (`ms@2.1.3`), cambiando una clave por vez y comparando el `pnpm-lock.yaml` con el de base:

- **Inertes** las dieciséis de `INERT_KEYS` y además, a diferencia de npm, `name`, `version`, `license`, `engines`,
  `bin`, `funding`, `workspaces`, `os`, `cpu`, los scripts `preinstall`, `install` y `postinstall`,
  `packageManager`, `pnpm.onlyBuiltDependencies`, `peerDependenciesMeta` y `overrides`.
- **Mueven el lock** `pnpm.overrides` y `resolutions`; `pnpm.patchedDependencies` falla la resolución sin el
  parche, que para el guard es lo mismo que mover. Ninguna de las tres está en la lista inerte, así que el guard
  ya las frenaba y sigue frenándolas: no hubo que agregar nada.

Los scripts de instalación se siguen tratando como en npm, que es más estricto que lo medido para pnpm: cuesta
un rechazo raro y no un lock viejo.

**Lo que se corrió para saber que funciona.**

- `test/hooks/commit.test.js`: la aserción que fijaba «con pnpm un script tampoco pasa» se invirtió a propósito y
  se sumaron `pnpm.overrides` y `resolutions` sin lock, que frenan. En rojo antes del cambio en `shell.js`, en
  verde después; mutación en copia, `MEASURED_LOCKS` sólo con npm, en rojo.
- El guard real, `engine/hooks/run.js dependencies` con el payload del runner sobre un repositorio pnpm en
  `/var/tmp` declarado como el de la sesión: una dependencia nueva sin lock sale 2 con «cambió package.json sin
  actualizar su lockfile»; un script nuevo con `pnpm-lock.yaml` intacto sale 0; `pnpm.overrides` sin lock sale 2.
  El mismo script nuevo contra el motor de antes sale 2, que es el defecto del caso.

**Lo que el caso no preveía.** El guard sólo opina sobre un repositorio de la sesión (R26, caso 258): sobre un
banco en `/var/tmp` sin declararlo pasa todo con 0 y parece que funciona. La prueba real se corre con
`CLAUDE_PROJECT_DIR` y `OPS_ROOT` apuntando al banco, o no mide nada.

**Recorrido de lo que el caso enumeraba.**

- **Medir `INERT_KEYS` con pnpm, una clave por vez — se hizo**, y con las claves propias de pnpm que el caso
  nombraba como riesgo.
- **Aceptar `pnpm-lock.yaml` con la lista que salga — se hizo**, con la misma lista: no hubo que partirla por
  gestor.
- **«Dos locks a la vez siguen sin aflojar» — se conserva**: `MEASURED_LOCKS` compara el conjunto entero, y la
  prueba de dos locks sigue frenando.

**Revisión del PR 819.** Un lock que sigue en el índice y ya no en disco —la migración de npm a pnpm a medias— impide
aflojar sin que el mensaje dijera por qué. Ahora lo nombra: «hay otro lockfile en el índice y no en disco». Prueba
en `commit.test.js`; mutación en copia, sin nombrarlo, en rojo.
