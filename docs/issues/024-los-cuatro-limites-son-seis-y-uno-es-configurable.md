---
caso: 024
titulo: AGENTS.md llama "los cuatro límites" a una lista de seis, y uno de ellos lo configura el motor
estado: resuelto
prioridad: media
version-detectada: 0.60.1
resuelto-en: 0.61.0
---

# 024 — El párrafo que dice qué no se puede ampliar no deja saber cuáles son

**🟢 resuelto en 0.61.0** · detectado en 0.60.1 · prioridad **media** — un proyecto no puede saber si su configuración es legítima

## Resumen

`AGENTS.md` enumera seis prohibiciones del runner y, dos párrafos después, se refiere a ellas como **«los
cuatro límites del párrafo anterior»**, que son los que no se pueden ampliar en
`organization/workspace.md`.

Dos problemas encadenados. El primero es aritmético: son seis, así que no hay forma de saber a cuáles se
refiere. El segundo es peor: una de las seis es **push**, y el motor la hace configurable por diseño con
`runner.allowPush` — el propio código lo dice, citando a R10. Un proyecto que lea esto literalmente
concluye que su `allowPush: true` es ilegítimo, o que puede ampliar cualquiera de las seis y elegir mal.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.60.1 init ops --mode sidecar --install

sed -n '124,128p' ops/AGENTS.md          # seis prohibiciones, luego "los cuatro límites"
grep -n -A3 'function pushAllowed' ops/node_modules/@ingeniomaps/cauce/engine/hooks/input.js
```

## Síntoma

`ops/AGENTS.md:124-128`:

```
Nunca amplía el alcance, promueve sus propias ideas, reescribe el proceso durante una tarea, usa
`git add .`/`git add -A`, hace push/force/amend, ni afirma éxito sin evidencia real.

Eso rige sin que nadie escriba nada. Lo que este proyecto amplíe o restrinja va en
`organization/workspace.md`, con su razón; los cuatro límites del párrafo anterior no se amplían ahí.
```

Contra `engine/hooks/input.js:103-110`:

```js
// R10 pide «la autorización configurada para el proyecto» y `runner.allowPush` es esa configuración:
// sin esto era un interruptor que nadie leía, y un cargo que lo leyó dio por imposible un push que el
// guard bloqueaba igual. Sin raíz legible no hay permiso que verificar, así que no se autoriza.
function pushAllowed(input) { ... runner.allowPush === true }
```

## Causa raíz

`template/AGENTS.md:124-128`. La lista creció —o el conteo quedó de una versión con cuatro— y la frase
que la referencia no acompañó. El desacuerdo con `allowPush` es distinto: no es un conteo, es que la
lista mezcla dos clases de límite. Escribir sin evidencia o ampliar el alcance no se configuran nunca;
publicar sí, y R10 dice explícitamente que la autorización la fija el proyecto.

## Fix propuesto

Sacar el conteo y decir qué es configurable. Pero **la separación no es la que este caso proponía
primero**, y la diferencia importa: lo que se midió no coincide con lo que la prosa promete.

Corriendo el grupo `pre-shell` contra una raíz mínima, con `allowPush` en cada valor:

| comando | `allowPush: false` | `allowPush: true` |
|---|---|---|
| `git push origin main` | bloqueado (2) | pasa (0) |
| `git push --force origin main` | bloqueado (2) | **pasa (0)** |
| `git commit --amend -m x` | **pasa (0)** | pasa (0) |
| `gh pr create` / `gh pr merge` / `git tag -a` | **pasa (0)** | pasa (0) |

O sea que de los tres verbos que la línea junta —«push/force/amend»— **no hay tres límites: hay uno**.
`--force` no se distingue de `push`: `destructive` matchea `\bgit\s+push\b` y `pushAllowed` decide por
los dos, así que habilitar la publicación habilita el force-push. Y `amend` no lo mira nadie:
`grep -rn "amend" engine/hooks/` no devuelve una sola línea, con `allowPush` prendido o apagado.

Por eso la versión anterior de este fix estaba mal: escribía «fuerza ni reescribe historia publicada»
como absoluto, y ese absoluto lo levanta `allowPush: true` sin decir nada. Y nombraba «push y PR» como
lo configurable, cuando el PR no está gobernado por ninguna llave — pasa siempre.

```diff
-Nunca amplía el alcance, promueve sus propias ideas, reescribe el proceso durante una tarea, usa
-`git add .`/`git add -A`, hace push/force/amend, ni afirma éxito sin evidencia real.
+Nunca amplía el alcance, promueve sus propias ideas, reescribe el proceso durante una tarea, usa
+`git add .`/`git add -A`, ni afirma éxito sin evidencia real. Publicar es lo único de esta lista que
+el proyecto puede habilitar: `runner.allowPush` en `ops.config.json` es la autorización que R10 pide,
+y habilitarla habilita también el `push --force`, porque el guard no los distingue.

 Eso rige sin que nadie escriba nada. Lo que este proyecto amplíe o restrinja va en
-`organization/workspace.md`, con su razón; los cuatro límites del párrafo anterior no se amplían ahí.
+`organization/workspace.md`, con su razón; lo que el párrafo anterior prohíbe no se amplía ahí.
```

Que el guard no distinga `--force` de `push` es un defecto aparte, con su propio arreglo y su propia
prueba: [025](025-r10-enumera-seis-actos-de-publicacion-y-el-guard-gobierna-uno.md). Este caso arregla
lo que el documento dice; aquél, lo que el motor hace. Mientras el motor siga así, el documento tiene
que decirlo — prometer un límite que no existe es peor que no prometerlo.

## Tradeoffs

Nombrar `allowPush` en `AGENTS.md` ata ese texto a una llave de configuración: si la llave se renombra,
hay dos lugares que actualizar. La alternativa —dejar la lista sin contar y no mencionar la llave—
arregla el conteo pero deja al proyecto sin saber que publicar es configurable, que es la mitad cara del
defecto.

Decir que `allowPush` también habilita el force-push es incómodo y es lo honesto hoy. Si se arregla el
025, esta frase se retira: queda una promesa que el guard sí sostiene. Retirarla antes deja el documento
prometiendo lo que nadie comprueba.

## Contexto de descubrimiento

`gouduet` habilitó `allowPush: true` para que su loop pueda dejar el PR abierto al cerrar un hito —el
corte que ese proyecto eligió no es publicar sí o no, sino qué dispara un deploy: un push a rama no
despliega, uno a `main` sí—. Al auditar si esa configuración era legítima frente a las reglas
(2026-09-06), el párrafo no permitió responderlo: la llave existe y el motor la lee, pero el documento
que gobierna la autonomía la lista entre lo que no se amplía y después cuenta mal.

## Relacionados

- [023](023-r12-manda-las-excepciones-a-un-archivo-que-no-las-lee.md) — el otro desacuerdo entre la prosa
  del toolkit y su propio diseño, encontrado en la misma auditoría.
- [025](025-r10-enumera-seis-actos-de-publicacion-y-el-guard-gobierna-uno.md) — la otra mitad: acá se
  arregla lo que el documento dice, allá lo que el motor comprueba. Salió de medir este caso.
