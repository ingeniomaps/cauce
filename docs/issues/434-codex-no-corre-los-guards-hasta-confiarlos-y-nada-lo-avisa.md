---
caso: 434
titulo: Codex no corre ningún guard de Cauce hasta que alguien confía sus hooks, y ni la tabla de runners ni doctor lo dicen
estado: resuelto
resuelto-en: 0.114.0
prioridad: alta
version-detectada: 0.114.0
---

# 434 — En Codex los guards no corren hasta confiarlos, y lo único que lo dice es el README del adaptador

**🟢 resuelto en 0.114.0** · detectado en 0.114.0 · prioridad **alta**. Un `codex exec` en una instancia recién instalada corre
sin ningún guard —ni los de Cauce ni los del proyecto— y `automation doctor` da el adaptador por operativo.

## Resumen

Codex corre un hook del proyecto sólo si alguien lo marcó como confiable. Guarda la confianza en `~/.codex/config.toml`,
una entrada por hook: `[hooks.state."<ruta>/.codex/hooks.json:pre_tool_use:0:0"]` con su `trusted_hash`. Un hook sin
esa entrada queda registrado y no corre, en silencio.

`automatization/runners/codex/README.md:13-16` lo dice («Instalar no alcanza… usá `/hooks` para revisarlos y
confiarlos»). Pero la tabla de `template/planning/delivery/teamwork.md`, «Qué runner puede tomar qué rol», pide para
Codex sólo `-s danger-full-access`. Y `automation doctor . codex` da «adaptador operativo (0 advertencia(s))» con los
hooks sin confiar. Quien arma un rol para Codex leyendo la tabla lo lanza sin guards.

## Reproducción

1. Una instancia sidecar fuera del árbol, con `automation install ops codex` y un guard del proyecto en
   `guards.pre-shell` que frena `npx` (el banco del 428).
2. `codex exec -m gpt-5.6-terra --skip-git-repo-check -s workspace-write "Corré exactamente este comando…: npx --version"`.
3. Lo mismo con `git add -A`.
4. Las dos otra vez con `--dangerously-bypass-hook-trust`.

## Síntoma

Medido el 2026-10-21 con `codex-cli 0.162.1`:

- Sin confianza, `npx --version` corrió y devolvió `11.16.0`, y el guard del proyecto no anotó ninguna llamada. `git
  add -A` tampoco lo frenó `git-add`: falló sólo por el sandbox, con `fatal: Unable to create '…/.git/index.lock':
  Read-only file system`.
- Con `--dangerously-bypass-hook-trust`, los dos frenaron: «BLOQUEADO: [guards/no-npx.sh] npx no corre en el host…» y
  «BLOQUEADO: 'git add -A/--all/.' está prohibido. Stagea rutas explícitas.».
- `~/.codex/config.toml` de esta máquina tiene entradas `hooks.state` para otras dos carpetas, y ninguna para la del
  banco.

## Causa raíz

No es un defecto de Codex: es su modelo de confianza, y está documentado en el README del adaptador. Lo que falla es
que el resto de Cauce no lo sabe:

- la fila de Codex en `teamwork.md` no lo pide;
- `engine/automation/index.js` (`doctor`) no lee `~/.codex/config.toml`.

## Fix propuesto

- La fila de Codex en `teamwork.md` pide confiar los hooks con `/hooks` después de cada `install` que cambie el
  wiring, con la misma frase del README.
- `doctor . codex` avisa cuando `~/.codex/config.toml` no tiene una entrada `hooks.state` para cada hook del
  `.codex/hooks.json` instalado. Que el `trusted_hash` coincida con el archivo de hoy no se puede comprobar sin saber
  cómo lo calcula Codex, y eso es **hipótesis**: se mide antes de prometerlo.

## Tradeoffs

- `doctor` pasaría a leer un archivo del home de la persona, fuera de la instancia. Es lectura y nada más, y sin el
  archivo el aviso es el mismo.
- La forma de `hooks.state` es de Codex y puede cambiar en una actualización, como `agy` (por eso el caso 410 dejó a
  `doctor` avisando la versión de Antigravity).

## Contexto de descubrimiento

Cierre del caso 428, 2026-10-21: la corrida real de Codex, que antes no corría por el modelo de la cuenta, corrió con
uno de su caché (`~/.codex/models_cache.json`), y el guard del proyecto no se invocó.

## Relacionados

- 428 (los guards del proyecto, que en Codex dependen de esto igual que los de Cauce).
- 433 (la medición de carriles en Codex usa `--dangerously-bypass-hook-trust` en el banco por esto).

## Cierre

**Resuelto en 0.114.0**, la versión abierta, el 2026-10-21, a pedido del dueño («arranca lo demás»).

El manifiesto de Codex declara dónde guarda la confianza —`hookTrust`: `config.toml` bajo `CODEX_HOME`, o
`~/.codex` sin la variable—, y `registrationProblems` (`engine/automation/registration.js`) arma la clave de cada hook
del `.codex/hooks.json` instalado. `doctor . codex` da **error** por los que no tienen entrada; justo después de
`install` es advertencia, como el resto de lo que registra. La fila de Codex en `teamwork.md` pide confiarlos con
`/hooks`.

El caso, sección por sección:

- **Resumen, la tabla.** La fila de Codex lo pide ahora, con la misma frase que el README del adaptador.
- **Resumen, `doctor`.** Lo dice, con cuántos hooks faltan y dónde los busca.
- **Fix propuesto, el `trusted_hash`.** Se decidió no compararlo: cómo lo calcula Codex no está medido, y afirmarlo
  daría por confiado un hook que no lo está. `doctor` mira que la entrada exista. Un hook que cambió después de
  confiarlo pasa este chequeo y Codex no lo corre; eso queda dicho en el comentario de `trustProblems`.
- **Tradeoffs, leer el home.** Es lectura, y sin el archivo cuenta como nada confiado. Y apareció algo que el caso no
  preveía: las pruebas que corren `doctor . codex` leían el `~/.codex` de quien corre la suite (R23). El soporte de
  pruebas apunta `CODEX_HOME` a un temporal vacío para toda la suite (`test/support/environment.js`).
- **Tradeoffs, la forma de `hooks.state`.** Puede cambiar en una actualización de Codex. La clave se armó igual que
  las que Codex escribió en esta máquina, y si cambia, `doctor` va a decir «sin confiar» de más: es la dirección que
  pregunta, no la que deja pasar.
- **Prioridad.** No traía condición de escalada.

**Lo que se corrió para saber que funciona.**

- `test/wiring/registration.test.js` («doctor da error con los hooks de Codex sin confiar…»), con `CODEX_HOME` en un
  temporal: recién instalado da «4 hook(s) … sin confiar»; con las cuatro entradas, calla; con tres, cuenta uno. Tres
  mutaciones en una copia lo ponen en rojo: no mirar la confianza, el evento sin `snake_case` y dar todo por confiado.
- **Contra Codex real, en esta máquina.** Sobre el banco del 428, `doctor . codex` da «✗ codex: 4 hook(s) de
  …/.codex/hooks.json sin confiar en ~/.codex/config.toml» (la ruta de esta máquina, escrita con `~`). Y el control positivo: aplicada a las dos
  carpetas cuyos hooks esta máquina tiene confiados (`tester/codex` y `tester/codex-hooks-check`), la misma función
  devuelve cero problemas. Es lo que prueba que la clave se arma igual que la arma Codex.
