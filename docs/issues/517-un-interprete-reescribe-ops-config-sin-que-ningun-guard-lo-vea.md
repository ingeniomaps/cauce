---
caso: 517
titulo: Un intérprete reescribe ops.config.json y se da el permiso de push sin que ningún guard lo vea
estado: aplazado
reabrir-si: una sesión real se da el permiso de push escribiendo ops.config.json por una vía que el guard no ve, o aparece un caso donde eso pasa sin que nadie lo busque
prioridad: baja
version-detectada: 0.121.0
---

# 517 — Un intérprete reescribe ops.config.json y se da el permiso de push sin que ningún guard lo vea

**⏸ aplazado** · detectado en 0.121.0 · prioridad **baja**: es la llave que decide qué se publica, pero hace falta un
agente que la busque a propósito.

## Resumen

`ops-config-shell` frena toda escritura por la terminal a `ops.config.json`, porque ahí viven `runner.allowPush` y
`runner.pushToLiveBranches`. La escritura la reconoce `writeTargets` por la forma del comando —redirección, `sed -i`,
`cp`, `tee`…—, y un intérprete que abre el archivo no tiene esa forma: `python3 -c` o un heredoc a `python3 -` lo
reescriben y pasan. El mismo cambio con `sed -i` se frena.

## Reproducción

Desde la raíz de una instancia, pasando cada comando por la cadena de guards de Bash del runner Claude (`guard-shell.sh`
con su JSON de `PreToolUse`), sin ejecutarlo:

```bash
sed -i 's/"allowPush": false/"allowPush": true/' ops.config.json
python3 -c "import json;p='ops.config.json';c=json.load(open(p));c['runner']['allowPush']=True;json.dump(c,open(p,'w'))"
python3 - <<'EOF'
import json
p='ops.config.json'; c=json.load(open(p)); c['runner']['pushToLiveBranches']=['main']; json.dump(c,open(p,'w'))
EOF
```

## Síntoma

Medido el 2026-11-15 con el motor de `main` (0.122.0), con `execute('ops-config-shell', …)` sobre una instancia
desechable:

```
frena  sed -i 's/"allowPush": false/"allowPush": true/' ops.config.json
PASA   python3 -c "import json;p='ops.config.json';c=json.load(open(p));c['runner']['allowPush']=True;json.dump(c,open(p,'w'))"
PASA   python3 - <<'EOF'⏎import json⏎p='ops.config.json'; c=json.load(open(p)); c['runner']['pushToLiveBranches']=['main']; ...
PASA   node -e "const f=require('fs');const c=JSON.parse(f.readFileSync('ops.config.json'));c.runner.allowPush=true;…"
```

Y el permiso vale en el acto: el guard de push lee `runner` del archivo tal como está en disco
(`engine/hooks/push.js:170`, `configOf`) y con `allowPush: true` deja pasar (`:183`).

## Causa raíz

`engine/hooks/shell-writes.js:14-18` lo declara: `writeTargets` lee la forma habitual de una escritura, y «un
`python -c "open(...)"` o un script propio escriben igual y ningún patrón de acá los ve». `ops-config.js:186`
(`judgeCommand`) juzga sólo los destinos que `writeTargets` devuelve, así que el intérprete nunca llega a él.

## Fix propuesto

Para los dos archivos que cuidan llaves (`ops.config.json` y el local), cerrar por defecto en vez de leer la forma: un
comando que **nombra** el archivo y corre un intérprete (`python`, `node`, `ruby`, `perl`, `deno`, `bun`, también por
heredoc o `-c`/`-e`) se juzga como escritura, igual que un `sed -i`. Nombrarlo sólo para leer (`python3 -m json.tool
ops.config.json`) pasaría a pedir confirmación.

Otra forma de cerrarlo, que no lee comandos: que el guard de push compare las dos llaves de `ops.config.json` con
las de la versión commiteada o la del remoto, y frene si quedaron más anchas sin que una persona lo confirme. Cubre
cualquier escritor —intérprete, script propio— y no suma una lista de programas; no cubre `ops.config.local.json`,
que no tiene versión con qué comparar.

## Tradeoffs

Más confirmaciones para quien lee la configuración con un intérprete; se acota a esos dos archivos, que se leen poco
así. No cierra un script propio que abre el archivo sin nombrarlo en el comando; eso sigue siendo de la revisión.

## Contexto de descubrimiento

Auditoría de los guards en una instancia (2026-11-15), al volver a medir una entrada de su INBOX anotada el
2026-10-01 con 0.99.2→0.100.0: entre esas versiones y 0.121.0 el comportamiento no cambió.

## Revisión (2026-11-15)

- **Real:** reproducido arriba, también con `node -e`.
- **Pesa poco hoy:** hace falta una sesión que busque a propósito la forma de saltear el guard, y el propio
  `shell-writes.js` declara que ése es su límite. No hay un incidente ni un freno sufrido detrás.
- **Si se construye, mejor sin leer comandos:** la comparación en el push cierra la clase entera; la lista de
  intérpretes es una forma más que el siguiente escritor esquiva.

## Relacionados

114 (el guard de `ops.config.json`), 455 (lo de adentro de `eval` y `bash -c`), 498.

## Aplazamiento

**Aplazado el 2026-11-15 por decisión de la persona.** Lo que afirma está medido (arriba), y no hay un incidente ni un
freno sufrido detrás: pasar exige buscar a propósito una forma que el guard no lee, y `shell-writes.js` ya declara que
ése es su límite. Si se reabre, el arreglo que conviene es el del push —comparar las dos llaves con la versión
commiteada— y no la lista de intérpretes. Se reabre en las condiciones de `reabrir-si`.
