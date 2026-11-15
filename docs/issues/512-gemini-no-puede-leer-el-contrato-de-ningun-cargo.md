---
caso: 512
titulo: Gemini no puede leer el contrato de ningún cargo, porque el puntero lo manda a una ruta dentro de node_modules
estado: resuelto
resuelto-en: 0.121.0
prioridad: alta
version-detectada: 0.120.0
---

# 512 — Gemini no puede leer el contrato de ningún cargo, porque el puntero lo manda a una ruta dentro de node_modules

**🟢 resuelto en 0.121.0** · detectado en 0.120.0 · prioridad **alta** para toda instancia con Gemini: cada cargo trabaja con su
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

## Cierre

Se tomó la opción A. El manifiesto de Gemini declara `roleSkillsCopy`, y `engine/automation/roles.js` escribe en
`.agents/skills/<cargo>/` el `SKILL.md` del catálogo y sus `references/` en vez del puntero. También lo hace para la
carpeta que otro runner instalado comparte con uno que la declara, así Codex instalado después no la vuelve a punteros.
Los cargos propios siguen como puntero a la instancia. `doctor` compara contra lo que se instalaría: la copia entera o el
puntero.

Línea de base: las cinco sondas del caso con Gemini CLI 0.63.0, todas «Path not in workspace» salvo el control.

Contra el caso:

- **Fix A, copiar el contrato al skill sólo para Gemini:** se hizo, por capacidad del manifiesto. Lo que se copia es el
  `SKILL.md` y `references/`: 106 archivos y 1,1 MB para los 53 cargos, no los 318 y 6,1 MB del caso, que contaban
  también `agents/` y `learning/`, que el contrato no cita.
- **Fix B, un espejo para todos:** se decidió que no, por la opción tomada.
- **Tradeoff, una segunda copia que se pudre:** se atendió. `install` la rehace entera —también retira la referencia que
  el catálogo ya no trae— y `doctor` la marca desactualizada si falta o sobra una referencia. Se hizo distinto de lo que
  el caso decía: no se registra en el manifiesto archivo por archivo, se reconoce por contenido, como los punteros.
- **Tradeoff, Codex y Gemini en la misma carpeta:** medido en los dos órdenes. Con los dos, copia; desinstalado Gemini,
  Codex vuelve a punteros al reinstalarse, sin referencias huérfanas.
- **Tradeoff, correr un cargo de verdad en Gemini:** hecho (ver «Qué se corrió»).

Lo que el caso no preveía:
- `doctor` marcaba las 53 copias como desactualizadas (lo vio la primera prueba real);
- desinstalar Gemini antes que Codex dejaba carpetas `references/` huérfanas (primera revisión);
- una referencia retirada entre versiones dejaba la copia pareciendo editada para siempre (primera revisión);
- una `references/` enlazada llevaba el borrado de lo que sobra a donde apunta (segunda revisión).

Queda anotado, sin arreglar: si el chequeo de enlace frena a mitad de un `install`, los cargos ya escritos quedan y el
manifiesto no se escribe, igual que el chequeo por cargo que ya había.

### Lista de cierre

1. hecho: las cinco sondas del caso con Gemini 0.63.0, en el proyecto `gemini` de la prueba de punta a punta.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: «van copiados» en `test/wiring/shared-skills.test.js`, en rojo sin la copia y en verde con ella.
4. hecho: mutaciones en rojo en una copia: sin la capacidad en el manifiesto, sin `writeCopy`, sin la carpeta compartida,
   sin reconocer la copia al desinstalar, con el `&&` de `copied` cambiado, sin retirar lo que sobra, sin limpiar al
   volver a puntero, sin contar referencias en `doctor` y sin el chequeo de enlace.
5. hecho: lo que se quita es el puntero en la carpeta de Gemini. La prueba afirma que la copia no menciona `node_modules`,
   y la sesión real de antes y la de después están en «Qué se corrió».
6. hecho: Gemini real con el motor de la rama, dos veces: con la primera versión y con el código final.
7. hecho: lo que depende del runner corrió en Gemini CLI 0.63.0.
8. hecho: corrieron Gemini solo, Codex y Gemini en los dos órdenes, un cargo propio y uno del catálogo. No corrió Codex
   real ni Antigravity.
9. hecho: dos runners en la misma carpeta, en los dos órdenes de instalar y desinstalar.
10. hecho: `doctor`, `uninstallRoleSkills`, `retireRoleSkills` y las pruebas de la carpeta compartida (caso 371).
11. hecho: tres pasadas independientes. La primera halló el orden de desinstalar y las referencias retiradas; la segunda,
    el enlace en `references/`; la tercera, nada que impidiera entregar, y moví el chequeo antes de escribir.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1806 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba y en «Qué se corrió».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

### Qué se corrió

Gemini CLI 0.63.0, `GEMINI_CLI_TRUST_WORKSPACE=true gemini --yolo -o json`, pidiéndole al cargo `backend-engineer` leer
su contrato y su referencia con `read_file`:

```
antes   Path not in workspace: Attempted path ".../ops/node_modules/@ingeniomaps/cauce/agents/roles/system/backend-engineer/SKILL.md" …
después # Backend Engineer
        # Modelo operativo de Backend Engineering
        .../gemini/.agents/skills/backend-engineer/SKILL.md
        .../gemini/.agents/skills/backend-engineer/references/operating-model.md
```

`automation doctor ops gemini`: antes del arreglo de `doctor`, «53 cargo(s) desactualizados»; después, «0 advertencia(s)».

**Sin probar:** Codex real leyendo la copia, y Antigravity, que no usa esta carpeta.
