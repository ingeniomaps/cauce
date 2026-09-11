---
caso: 092
titulo: El guard de secretos sólo mira escrituras, y decide por el nombre del archivo
estado: resuelto
resuelto-en: 0.80.0
prioridad: media
version-detectada: 0.79.0
---

# 092 — Ningún runner le pasa una lectura a un guard, así que una credencial en disco se lee sin freno

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **media** — subió de baja con el 088: las identidades de
máquina de una empresa ya viven en archivos que Cauce conoce por declaración, y hoy ni su escritura se frena

## Resumen

El guard `secrets` se declara como *«Bloquea escribir secretos, claves privadas y credenciales en texto
plano»* (`engine/hooks/run.js:95`), y eso hace: frena Write y Edit sobre archivos cuyo **nombre** parece
de credenciales. Dos huecos:

1. **Ningún runner le pasa una lectura a un guard.** Un `.env` con la identidad de máquina de una empresa
   entra al contexto del agente con la herramienta de lectura o con un `cat`, y desde ahí a los
   transcripts.
2. **Decide por nombre, y los nombres que declara el 088 no los conoce.** `local-dev.env`, el nombre que
   `organization/secrets.json` usa para una identidad, pasa el guard incluso al escribirse.

## Reproducción

Desde un checkout de Cauce:

```bash
grep -rn '"matcher"' automatization/runners/*/settings.json automatization/runners/*/hooks.json
node -e "console.log(require('./engine/hooks/run').hookGroups)"
env -u CLAUDE_PROJECT_DIR node -e "
const {execute}=require('./engine/hooks/run')
for (const f of ['.env','.env.infisical','.env.infisical.example','local-dev.env','identidad-ci.json','id_ed25519']) {
  try { execute('secrets',{cwd:'/tmp',tool_input:{file_path:'/tmp/x/'+f,content:'A=1'}}); console.log('PASA ',f) }
  catch(e){ console.log('FRENA',f) } }"
```

## Síntoma

Salida real, 2026-09-11, sobre `main` = `e710d620`. Los matchers de archivo de los cuatro runners son sólo
de escritura:

| runner | shell | archivos |
|---|---|---|
| Claude | `Bash` | `Edit\|Write` |
| Codex | `Bash` | `apply_patch\|Edit\|Write` |
| Gemini | `run_shell_command` | `replace\|write_file` |
| Antigravity | `run_command` | `write_to_file\|replace_file_content\|multi_replace_file_content` |

Y el guard, por nombre:

```
FRENA .env
FRENA .env.infisical
PASA  .env.infisical.example
PASA  local-dev.env
PASA  identidad-ci.json
FRENA id_ed25519
```

## Causa raíz

- **Alcance:** `secrets` está en el grupo `pre-files` (`run.js:56`), que los runners sólo invocan en
  escrituras. Y engancharle una lectura a ese grupo no sirve: ahí corren también `workspace-boundary` y
  `plan-first`, que frenarían leer fuera de raíces o leer código con el WIP vacío.
- **Heurística:** decide por `basename` (`engine/hooks/files.js:53-70`), y el propio comentario lo dice:
  *«La forma de decidir sigue siendo el nombre del archivo, así que otro formato pasa igual»*.

## Qué puede ver cada runner, comprobado

Consultado el 2026-09-11 en la documentación pública de cada herramienta:

- **Claude Code** tiene una herramienta `Read` (*«Reads the contents of files»*, code.claude.com/docs/en/tools-reference),
  que recibe `file_path` —el mismo esquema de la herramienta en esta sesión—. Y tiene **reglas nativas de
  denegación**: `"deny": ["Read(./.env)", "Read(./.env.*)"]` es el ejemplo literal para *«stop it reading
  `.env` files»* (code.claude.com/docs/en/settings). Su alcance, textual (code.claude.com/docs/en/permissions):
  *«Read and Edit deny rules apply to Claude's built-in file tools, to file commands Claude Code recognizes
  in Bash, such as `cat`, `head`, `tail`, and `sed`, and to the targets of Bash redirections […]. They don't
  apply to a command that reads files without naming them, such as `grep -r pattern .` […], or to arbitrary
  subprocesses that read or write files indirectly»*. A `Grep` y `Glob` los aplica *«best-effort»*.
- **Gemini CLI** tiene `read_file` —parámetro `file_path`—, `glob` y `grep_search`
  (github.com/google-gemini/gemini-cli, `docs/tools/file-system.md`). Sus hooks `BeforeTool` filtran por
  nombre de herramienta, como ya hace el adaptador con `write_file`.
- **Codex y Antigravity**: sus README en este repositorio nombran sólo herramientas de shell y de edición, y
  sus manifiestos no citan una fuente. Que lean por shell es **hipótesis**; no se comprobó.

## Fix propuesto

Lo decidió el operador el 2026-09-11, antes de construir:

- **Claude: regla nativa + guard.** `automation install` agrega a `.claude/settings.json` reglas
  `permissions.deny` `Read(...)` por los nombres de credencial conocidos —nombres exactos, sin `.env.*`—.
  Cubren `Read`, `cat`, `head`, `tail`, `sed` y redirecciones. Además, un matcher `Read` corre un guard
  `secrets-read`, que conoce lo que la regla estática no puede: las identidades declaradas.
- **Gemini: el mismo guard** enganchado a `read_file`.
- **Codex y Antigravity: hueco declarado**, en sus README y en el de los guards.
- **Los nombres**: la heurística de hoy más las rutas de identidades `source: file` de
  `organization/secrets.json`, para escribir y para leer. Una sola función decide qué es credencial, y la
  usan los dos guards.
- **`secrets-read` va en un grupo propio**, `pre-read`, para que una lectura no pase por los guards de
  escritura. Con un solo guard no lleva wrapper de grupo: el runner registra `guard-secrets-read.sh`.

## Tradeoffs

- **Frenar lecturas corta trabajo legítimo**: diagnosticar una variable mal cargada empieza por mirarla. La
  salida es la de siempre, aprobar la ruta.
- **Nombres exactos en la regla nativa**: `.env.example` sigue legible —las reglas no admiten excepciones y
  `Read(.env.*)` lo habría frenado—, a cambio de que `cat .env.infisical` pase la regla. La herramienta `Read`
  lo frena igual, por el guard, que sí distingue `.example`.
- **Una regla que retiremos en una versión futura no se va sola**: la fusión de `settings.json` sabe quitar
  los hooks que entregamos y no las entradas de `permissions`. Queda en la configuración de la empresa hasta
  que alguien la saque.
- **No es un límite de seguridad**, y hay que decirlo donde se lee: `grep -r` y cualquier subproceso leen sin
  que ninguna de las dos piezas lo vea. Para eso, la documentación de Claude manda al sandbox.
- **Cargar la declaración en cada hook** cuesta tiempo; se lee sólo si `organization/secrets.json` existe.

## Qué tiene que probar el cierre

- `local-dev.env` declarado como identidad se frena al escribirse, que es el síntoma de hoy.
- `secrets-read` frena leer `.env`, una clave SSH y una identidad declarada, y deja leer `.env.example` y un
  archivo cualquiera.
- El `settings.json` de Claude trae el matcher `Read` y las reglas `deny`, sin `Read(.env.*)`; el de Gemini,
  el matcher `read_file`.
- `automation install` suma las reglas a las `deny` que la empresa ya tenga, sin pisarlas.
- Cada guard sigue en un solo grupo, y la instalación exige el script del guard nuevo.

## Contexto de descubrimiento

2026-09-10, al revisar el 088, que proponía que el guard leyera de la declaración de secretos las rutas
de credenciales y frenara su lectura, «además de la escritura». Se separó porque se decide sin el 088.

2026-09-11, al mejorarlo antes de arreglarlo: la regla nativa de Claude, que el caso daba por hipótesis,
está documentada y cubre más que un guard —`cat` incluido—; y engancharle una lectura al grupo `pre-files`
habría corrido también los guards de escritura.

## Relacionados

- **088** — la declaración que le da al guard nombres en vez de patrones.
- **R10** — decir qué comprueba un guard y qué no es parte del guard.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/hooks/files.js`, `engine/hooks/run.js`, `engine/secrets/index.js`,
`automatization/hooks/guard-secrets-read.sh`, `automatization/runners/{claude,gemini}/settings.json`

### Contra lo que el caso enumeró

- **Claude, regla nativa + guard** — hecho: el `settings.json` del adaptador trae 19 reglas
  `permissions.deny` `Read(...)` por nombre exacto —`.env`, `.env.local`, `.env.*.local`, las claves y los
  archivos de credenciales que `secrets` ya conocía— y un matcher `Read` hacia `guard-secrets-read.sh`.
- **Gemini** — hecho: matcher `read_file` hacia el mismo script.
- **Codex y Antigravity** — hueco declarado en el README de los guards, sección «Leer una credencial». Que
  lean por shell sigue siendo hipótesis: no se afirma, se dice que sus adaptadores sólo enganchan shell y
  edición.
- **Los nombres** — hecho: `credential()` en `files.js` decide para los dos guards —la heurística de siempre
  más las rutas de `identityFiles()` de `engine/secrets`, resueltas como las resuelve el chequeo del 088—.
- **Grupo propio** — hecho: `pre-read` con `secrets-read`, sin wrapper de grupo.
- **Tradeoff «frenar lecturas corta trabajo legítimo»** — la salida angosta existe: `secrets-read` acepta la
  aprobación por ruta e imprime la línea a pegar, y tiene su variable, `OPS_SECRETS_READ_OVERRIDE`, sumada a
  la tabla del `AGENTS.md` del molde.
- **Tradeoff «nombres exactos»** — se cumple: ninguna regla nativa niega `.env.*`, y la prueba lo afirma por
  ausencia.
- **Tradeoff «una regla retirada no se va sola»** — se cumple y queda dicho en el README del adaptador de
  Claude.
- **Tradeoff «no es un límite de seguridad»** — dicho en el README de los guards, con el alcance textual de
  la documentación de Claude.
- **Tradeoff «cargar la declaración en cada hook»** — `credential()` sólo carga `engine/secrets` si
  `organization/secrets.json` existe.
- **Cada ítem de «Qué tiene que probar el cierre»** — hechos los cinco: la prueba de los dos guards en
  `hooks.test.js`, los matchers y la ausencia de `.env.*` en `runners.test.js`, la suma de reglas en la prueba
  de instalación de `wiring.test.js`, y la prueba de grupos y `expectedHooks`, que ya existían y siguen en
  verde con el guard nuevo.

### Lo que el caso no preveía

- **La tabla de grupos del README de los guards estaba desactualizada**: a `pre-shell` le faltaba
  `shell-boundary` y a `pre-files` `plan-first`. Se corrigió en el mismo cambio que le suma `pre-read`.
- **`init` crea la instancia antes de validar `--runner`.** Armando el banco de la prueba real, un valor mal
  escrito (`none` en vez de `ninguno`) dejó la instancia creada y el comando salió con 2. No es de este caso:
  sale como el **096**.

### Qué se corrió

- **El rojo previo**: con las tres pruebas nuevas escritas y el motor sin tocar —cero menciones de
  `secrets-read` en `run.js`—, 0 de 3.
- **Las suites afectadas**: `hooks.test.js`, `runners.test.js` y `wiring.test.js`, 91 de 91.
- **Ocho mutaciones, en una copia desechable del repositorio (R23)**, comprobadas aplicadas antes de
  contar, contra una base en verde:

  ```
  M1 sin mirar la declaración          fail 1 → ROJA
  M2 secrets-read no frena             fail 1 → ROJA
  M3 secrets-read frena todo           fail 1 → ROJA
  M4 Claude sin matcher Read           fail 1 → ROJA
  M5 Gemini sin matcher read_file      fail 1 → ROJA
  M6 Claude niega .env.* entero        fail 1 → ROJA
  M7 Claude sin Read(.env)             fail 2 → ROJA
  M8 la fusión reemplaza las listas    fail 1 → ROJA
  ```
- **La prueba real**, en un banco: una instancia sidecar, `automation install` de Claude y de Gemini, y el
  guard invocado por su script con el JSON que manda el runner.

  ```
  .claude/settings.json → deny: 19 reglas; Read(.env): true · Read(.env.*): false
                          matchers: Bash · Edit|Write · Read
  .gemini/settings.json → matchers: run_shell_command · replace|write_file · read_file
  guard-secrets-read.sh → .env: exit 2 · .env.example: exit 0 · src/app.js: exit 0
  automation doctor     → claude y gemini: adaptador operativo (0 advertencia(s))
  ```

  Lo que no se ejerció: una sesión real de Claude Code o de Gemini negando la lectura. La regla nativa la
  aplica el runner, y su alcance sale de su documentación, no de una corrida acá.
- `npm run ci`: código 0, 683 de 683, cobertura de 58 archivos en su piso o por encima.
