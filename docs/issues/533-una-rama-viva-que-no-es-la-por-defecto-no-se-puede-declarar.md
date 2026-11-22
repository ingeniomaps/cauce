---
caso: 533
titulo: una rama viva que no es la por defecto del remoto —develop, staging, production— no se puede declarar
estado: abierto
prioridad: media
version-detectada: 0.123.1
---

# 533 — una rama viva que no es la por defecto del remoto —develop, staging, production— no se puede declarar

**🔴 abierto** · detectado en 0.123.1 · prioridad **media**: con `allowPush` puesto, un agente empuja y commitea
directo en `develop` o `production` sin ninguna aprobación. En GitFlow esas ramas son tan vivas como `main`.

## Resumen

Cauce cuenta como vivas `main`, `master` y la rama por defecto de cada remoto. `push` las frena aunque `allowPush` esté
puesto, salvo que la persona las nombre en `runner.pushToLiveBranches`, y `live-commit` frena un commit que cae en ellas.
Una empresa con GitFlow tiene más ramas vivas —`develop` (a la que se integra), `staging`, `production`— y no tiene
cómo declararlas: para Cauce son ramas de trabajo.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto) && cd "$BANCO"
git init -q --bare ../remoto.git && git remote add origin ../remoto.git
git push -q origin HEAD:main && git remote set-head origin main
git branch develop && git branch production
# runner.allowPush = true en ops.config.json
for c in 'git push origin main' 'git push origin develop' 'git push origin production'; do ./hook.sh "$BANCO" pre-shell "$c"; done
git checkout -q develop && ./hook.sh "$BANCO" pre-shell 'git commit -m x'
git checkout -q main    && ./hook.sh "$BANCO" pre-shell 'git commit -m x'
```

## Síntoma

```
== git push origin main
BLOQUEADO: 'git push' publica cambios en main, la rama viva, y requiere una acción humana: …
== git push origin develop
exit=0
== git push origin production
exit=0
== commit en develop
exit=0
== commit en main
BLOQUEADO: 'git commit' cae en main, la rama viva de suelto. No hace falta preguntarle a nadie: cortá una rama, …
```

## Causa raíz

`engine/hooks/push.js:51-59` (`liveBranches`): el conjunto arranca en `main` y `master` y suma el `refs/remotes/*/HEAD`
de cada remoto. No lee ninguna llave de configuración. `engine/hooks/live-commit.js:65` usa la misma función, así que el
commit tiene el mismo hueco. `engine/hooks/config-keys.js` no tiene una llave para sumar ramas.

## Fix propuesto

Una llave nueva, `runner.liveBranches` (lista de nombres exactos), que `liveBranches` suma a las que ya cuenta. Así la
declaración cubre a la vez el push y el commit. `pushToLiveBranches` sigue siendo lo que la habilita para push, igual que
hoy con `main`.

## Tradeoffs

- **Sacar una rama de la lista es una quita** (R29): deja empujar donde antes frenaba. La llave nueva entra en
  `PROTECTED` de `engine/hooks/ops-config.js:37`, junto a `allowPush` y `pushToLiveBranches`, para que el agente no se
  la escriba (caso 114). Esa protección se prueba en rojo quitándola.
- No cambia nada para quien no la declara: el default sigue siendo `main`, `master` y la rama por defecto.
- Patrones (`release/*`) no entran: `pushToLiveBranches` exige nombres exactos (`engine/config/validate.js:322-325`) y
  conviene que las dos llaves hablen igual. Si una empresa lo pide, es otro caso.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real que trabaja con GitFlow. Su guard propio frena el push a
`develop`, `staging` y `production` porque Cauce no lo hacía.

## Relacionados

- 108: `allowPush` dejaba empujar a la rama viva; se arregló contando `main`, `master` y la por defecto.
- 114: el agente se escribía el permiso de push en `ops.config.json`.
