---
caso: 375
titulo: el guard de dependencias no reconoce un script nuevo con pnpm
estado: abierto
prioridad: media
version-detectada: 0.106.1
---

# 375 — `lockUnaffected` sólo afloja con `package-lock.json`: con pnpm, sumar un script a `package.json` frena el commit aunque el lockfile no cambie

**🔴 abierto** · detectado en 0.106.1, sigue en 0.107.0 · prioridad **media**.

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
