---
caso: 283
titulo: check se cuelga dentro del sandbox de Codex
estado: resuelto
resuelto-en: 0.103.0
prioridad: alta
version-detectada: 0.101.0
---

# 283 — Con Codex, `ops check` no termina nunca en cuanto `done/` cita un commit

**🟢 resuelto en 0.103.0** · detectado en 0.101.0 · prioridad **alta**.

**Prioridad alta**: `check` es el último paso de cerrar una tarea, y con Codex deja de responder desde la
primera tarea cerrada. Está publicado desde 0.100.0.

## Resumen

`check` comprueba que cada commit citado en `done/` exista, y le pasaba los hashes a `git cat-file
--batch-check` por la entrada estándar. Dentro del sandbox de Codex, un proceso hijo de Node que recibe datos
por stdin no termina.

## Reproducción

Instancia sidecar con el runner de Codex instalado y una tarea ya cerrada. Desde la carpeta de la sesión:

```bash
codex sandbox -- bash -c 'timeout 25 node ops/tools/ops.js check ops/planning; echo "exit:$?"'
```

## Síntoma

```
exit:124
```

Sin una línea de salida. Fuera del sandbox el mismo comando contesta en menos de un segundo. En la sesión
real que lo encontró, Codex lo intentó tres veces, lo cortó y cerró la tarea con `check` «no concluyente».

## Causa raíz

`engine/core/repos.js`, `commitStatus`: `spawnSync('git', [..., 'cat-file', '--batch-check=…'], { input })`.
El cuelgue no es de git. Medido dentro del sandbox, con codex-cli 0.152.1 y Node v24.18.0:

- `echo <sha> | git cat-file --batch-check` contesta `commit`, exit 0.
- `spawnSync('git', […], { input })` desde Node: no termina.
- `spawnSync('cat', [], { input: 'hola\n' })` desde Node: tampoco.
- `spawnSync` sin `input`, capturando la salida: termina.

Por qué el sandbox hace eso no se estableció; alcanza con no depender de ello.

## Fix propuesto

Pasar los hashes como argumentos: una llamada a `rev-list` con todos, y sólo si alguno no es un commit,
preguntar de a uno.

Vale la pena mirar si el motor le pasa `input` a algún otro hijo.

## Tradeoffs

- Con un hash falso en `done/`, `check` hace una llamada a git por cada hash de ese repositorio en vez de una.
- `rev-list` pela una etiqueta anotada hasta su commit: el hash de una etiqueta citado como commit pasa a
  contar como encontrado. Antes no.

## Contexto de descubrimiento

La primera corrida real de `$autobuild` con Codex, probando la 0.101.0 en los otros runners.

## Relacionados

- 243 — `check` avisa cuando `done/` cita un commit que no está.

## Cierre

**Resuelto en 0.103.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**
- **«Vale la pena mirar si el motor le pasa `input` a algún otro hijo» — se miró: hay uno más.** `automation
  doctor` prueba el puente de Antigravity así (`engine/automation/index.js`). No se tocó: no se corrió dentro
  de ningún sandbox y no hay un síntoma que registrar.
- **Tradeoff de las llamadas — se paga.** **El de la etiqueta — se acepta**: el hash existe y apunta a un commit.

### Qué se corrió

- **La reproducción, antes y después**, dentro del sandbox de Codex sobre el mismo banco: de `exit:124` a los
  25 segundos a `✓ planning válido … exit:0` en menos de uno.
- **La prueba nueva vista en rojo** al devolverle el `input` a la llamada, y tres mutaciones más en rojo, en
  una copia: todo cuenta como commit, sin preguntar de a uno, y un blob cuenta.
- **La puerta entera**, `npm run ci`.
