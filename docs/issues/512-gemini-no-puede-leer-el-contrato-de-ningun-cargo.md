---
caso: 512
titulo: Gemini no puede leer el contrato de ningún cargo, porque el puntero lo manda a una ruta dentro de node_modules
estado: abierto
prioridad: alta
version-detectada: 0.120.0
---

# 512 — Gemini no puede leer el contrato de ningún cargo, porque el puntero lo manda a una ruta dentro de node_modules

**🔴 abierto** · detectado en 0.120.0 · prioridad **alta** para toda instancia con Gemini: cada cargo trabaja con su
descripción de una línea y sin su contrato, y nada lo avisa.

## Resumen

`automation install gemini` deja en `.agents/skills/<cargo>/SKILL.md` un puntero que dice «Leé
`ops/node_modules/@ingeniomaps/cauce/agents/roles/system/<cargo>/SKILL.md` para el contrato completo». Gemini CLI 0.63.0
se niega a leer cualquier ruta con un segmento `node_modules`: «Path not in workspace». No depende del `.gitignore` ni
se arregla incluyendo la carpeta. Antigravity, con el mismo puntero, sí lo lee.

## Reproducción

```bash
npx -y @ingeniomaps/cauce@0.120.0 init --runner gemini --install
GEMINI_CLI_TRUST_WORKSPACE=true gemini --yolo -o json -p 'Con read_file (no la terminal) leé
ops/node_modules/@ingeniomaps/cauce/agents/roles/system/backend-engineer/SKILL.md y copiá su primera línea con #, o el
error exacto.'
```

## Síntoma

Las cinco sondas, con Gemini CLI 0.63.0, en el proyecto de prueba `gemini` del 2026-11-14:

| Sonda | Resultado |
|---|---|
| contrato en `ops/node_modules/…` (ignorado por `ops/.gitignore:1`) | `Path not in workspace: … resolves outside the allowed workspace directories` |
| lo mismo con `context.fileFiltering.respectGitIgnore: false` | el mismo rechazo |
| `ops/ignorado/x.md`, ignorado y fuera de `node_modules` | `File path … is ignored by configured ignore patterns.` (otro mensaje) |
| `lib/node_modules/pkg/x.md` **sin** ignorar (`git check-ignore` exit 1) | `Path not in workspace` |
| contrato con `context.includeDirectories: ['…/ops/node_modules/@ingeniomaps/cauce/agents']` | `Path not in workspace … allowed workspace directories: …/gemini, …/cauce/agents` — rechazado aunque la carpeta figura como permitida |
| `ops/AGENTS.md` (control) | `# Reglas de construcción` |

Lo rechaza cualquier ruta con `node_modules`. Durante el onboard real (sesión de Gemini del 2026-11-14) también falló un
`grep_search` sobre `ops/node_modules/@ingeniomaps/cauce`. Antigravity 1.5.8, con el mismo puntero: `# Backend Engineer`.

## Causa raíz

- `engine/automation/roles.js:26-45` (`roleSkill`): el puntero remite a `${role.reference}/SKILL.md` y a sus
  `references/`, que en una instancia instalada resuelven bajo `ops/node_modules/@ingeniomaps/cauce/agents/…`.
- El límite es de Gemini, no de Cauce: no hay ajuste de su configuración que lo abra (tres medidos arriba).

## Fix propuesto

**Decisión que pide a la persona:** dónde lee Gemini el contrato.

- **A — copiar el contrato al skill, sólo para Gemini (recomendada).** `installRoleSkills` escribe en
  `.agents/skills/<cargo>/` el `SKILL.md` completo y sus `references/`, en vez del puntero, cuando el runner lo necesite
  (una capacidad en el manifiesto, p. ej. `"roleSkills": { "copy": true }`). Tamaño medido: 318 archivos, 6,1 MB para
  los cargos del sistema sin `evaluations/`. La copia la rehace `install`/`upgrade` y se registra en el manifiesto como
  el resto de lo entregado.
- **B — un espejo del catálogo fuera de `node_modules`**, por ejemplo `ops/.cauce/agents/`, y el puntero apuntando ahí
  para todos los runners. Una sola copia, pero cambia lo que leen los cuatro.

## Tradeoffs

- A es una segunda copia del contrato; si el `upgrade` no la rehace, se pudre. Por eso va al manifiesto y la compara
  `automation check` como a lo demás entregado.
- `.agents/skills/` lo lee también Codex: con A sólo para Gemini, cuando los dos están instalados, el que gane la
  escritura define qué ve el otro. Hay que medirlo con los dos instalados (caso 360 ya vio «Skill conflict detected»).
- Hay que correr un cargo de verdad en Gemini después del arreglo y ver que cite su contrato, no sólo que `read_file`
  devuelva el archivo.

## Contexto de descubrimiento

Prueba de punta a punta de 0.120.0 (2026-11-14), «lo básico» de Gemini: el onboard funcionó, y en sus errores apareció
un `grep_search` rechazado sobre el paquete.

## Relacionados

- 092 (Gemini rechaza `.env` por su cuenta, el mismo mensaje).
- 360 (Gemini y Codex leyendo `.agents/skills` a la vez).
