---
caso: 466
titulo: Un guard del proyecto que sale 0 no puede avisarle a la sesión, y el motor le dice que avise así
estado: resuelto
resuelto-en: 0.118.0
prioridad: media
version-detectada: 0.117.2
---

# 466 — Un guard que sale 0 no puede avisarle a la sesión

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **media**: un guard en modo aviso no avisa a nadie, y es la salida que el propio
motor le recomienda a quien pide confirmación. No apaga una defensa que frene: se pierde lo que se quiso decir sin frenar.

## Resumen

Un guard declarado en `guards` que sale 0 pierde todo lo que dijo: su stderr, y también el `additionalContext` y el
`systemMessage` si los manda en JSON. La sesión no ve nada en ningún runner.

## Reproducción

```bash
G=$(node engine/cli/ops.js bench suelto --force); cd "$G"; G=$PWD; mkdir -p automatization/guards
cat > automatization/guards/a.sh <<'E'
#!/bin/sh
cat >/dev/null; echo AVISO-STDERR >&2; exit 0
E
cat > automatization/guards/b.sh <<'E'
#!/bin/sh
cat >/dev/null
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"AVISO-JSON"},"systemMessage":"AVISO-SYS"}'
E
chmod +x automatization/guards/*.sh
# en ops.config.json: "guards": {"pre-shell": ["automatization/guards/a.sh", "automatization/guards/b.sh"]}
printf '%s' "{\"cwd\":\"$G\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"}}" \
  | CLAUDE_PROJECT_DIR=$G bash automatization/hooks/guard-shell.sh >o.txt 2>e.txt
echo "exit $? stdout=[$(cat o.txt)] stderr=[$(cat e.txt)]"
```

## Síntoma

Salida real, 0.117.2, 2026-10-31:

```
exit 0 stdout=[] stderr=[]
```

En una instancia, un guard en modo aviso dejó dos avisos sólo en su propio registro, y la tarea se commiteó sin el sello que
pedían (2026-10-31). El programador corría en `agy` y no los vio.

## Causa raíz

Líneas de la versión detectada.

- `judge` (`engine/hooks/project-guards.js:70-75`): con un 0, `said` no se usa y `decisionOf` sólo busca lo que frena.
- `executeAll` (`engine/hooks/run.js`) no devuelve nada, y los dos que lo llaman responden sin mensaje: `run.js` no escribe y el
  puente devuelve `{ decision: 'allow' }` (`automatization/runners/antigravity/hook.js`, `evaluate`).
- `engine/hooks/project-guards.js:95` le dice a quien pidió `ask`: «Si alcanza con avisar, que salga en 0 sin JSON». **Esa salida es
  la que no llega.** El caso no lo decía, y es lo que hace que esto sea un defecto del motor y no un hueco del guard.

## Fix propuesto

Que el motor junte lo que dice un guard que deja pasar y lo entregue por el canal de cada runner. Los canales, según la
documentación pública consultada el 2026-10-31. **Ninguno se corrió** y ninguna página declara versión:

| Runner | Fuente | A la sesión, sin frenar | A la persona |
|---|---|---|---|
| Claude Code | `code.claude.com/docs/en/hooks` | `hookSpecificOutput.additionalContext` | `systemMessage`; no se confirmó en `PreToolUse` |
| Codex | `learn.chatgpt.com/docs/hooks` | `hookSpecificOutput.additionalContext` | `systemMessage` |
| Antigravity | `antigravity.google/docs/hooks` | `reason` junto con `allow` | el mismo |
| Gemini CLI | `geminicli.com/docs/hooks/reference/` | **ninguno documentado en `BeforeTool`** | `systemMessage` |

O sea que Gemini sólo se lo puede decir a la persona, y eso hay que escribirlo en el contrato de `guards`.

Tres cosas para construirlo:

- **Decidido el 2026-10-31:** el guard avisa por **stderr**, que es lo que los guards reales ya escriben. Claude Code dice «Claude never sees stderr from a hook
  that exits 0», así que esto es el motor dando más que el runner, y el contrato de `project-guards.js` lo tiene que decir.
- El aviso y el `ask` de `askOutput` (`engine/hooks/run.js`) salen por el mismo stdout: tienen que ir en un solo JSON.
- Se prueba con sesiones reales en `claude` y `agy`, las dos instaladas acá. Codex queda documentado: no se corre en mediciones.

## Tradeoffs

- Un guard ruidoso gasta contexto en cada llamada. Claude Code corta `additionalContext` en 10.000 caracteres; los demás no se
  midieron. El motor tiene que poner su tope.
- Un guard que hoy escribe logs de depuración por stderr empieza a hablarle a la sesión. Baja a las instancias que lo tengan, así
  que va en el CHANGELOG.
- Avisar no frena: la tarea de la instancia se habría commiteado igual si el agente no le hacía caso. Quien necesite frenar sale con 2.

## Contexto de descubrimiento

Una instancia con un guard propio en modo aviso, que encontró el aviso sólo en su registro al revisar una tarea.

## Relacionados

Caso 428 (los guards del proyecto en el motor), caso 315 (el aviso de reglas a la sesión, que sale por `UserPromptSubmit` y sólo
en Claude: `automatization/runners/claude/settings.json:33`).

## Cierre

**Resuelto en 0.118.0.** Antigravity, donde nació el caso, no se resolvió con el canal que el caso proponía.

- **Que un 0 pueda avisar sin frenar.** Se hizo. `judge` devuelve lo que el guard dijo por stderr, recortado a 2000 caracteres, y `executeAll` lo devuelve.
- **El canal de cada runner.** Se hizo distinto en Antigravity:
  - **Claude y Codex**: `hookSpecificOutput.additionalContext` y `systemMessage`.
  - **Gemini**: el mismo JSON, donde sólo `systemMessage` está documentado en `BeforeTool`.
  - **Antigravity**: `injectSteps` con `ephemeralMessage` en un hook nuevo de `PreInvocation`. La tabla de arriba decía `reason` junto con `allow`, y se midió que no llega.
- **Decisión, stderr.** Se hizo. Lo que un guard mande en JSON como `additionalContext` sigue sin llegar: el contrato es stderr, y `template/AGENTS.md` y el encabezado de `project-guards.js` lo dicen.
- **El mensaje de `project-guards.js`.** Se corrigió: dice «que salga en 0 y lo diga por stderr».
- **El aviso y el `ask` en un solo JSON.** Se hizo en `askOutput`.
- **Sesiones reales en `claude` y `agy`.** Se hicieron, abajo.
- **Tradeoff, un guard ruidoso.** Se hizo el tope, con prueba.
- **Tradeoff, logs por stderr.** Va en el CHANGELOG.
- **Tradeoff, avisar no frena.** Sigue así: un guard que frena gana sobre el aviso de otro, con prueba.

Medido. Antes, por el shim: `exit 0 stdout=[] stderr=[]`. Después, con una pregunta que no nombra el aviso:

- **Claude Code 2.1.316**: el modelo citó «[guards/avisa.sh] CLAVE-AZUL-7: falta el sello de la tarea».
- **`agy` 1.4.12**, por canal:
  - `reason` junto con `allow`: NINGUNO, tres de tres.
  - `injectSteps` con `systemMessage` en `PreInvocation`: NINGUNO, cuatro de cuatro, con el hook corriendo y el aviso entregado.
  - `userMessage`: una de una, descartado porque se presenta como si lo dijera la persona.
  - `ephemeralMessage`, el elegido: lo citó en todas, también con el motor final.
- **Gemini CLI 0.63.0**, sesión real con `--allowed-tools`: la persona ve `Hook system message: [guards/avisa.sh] CLAVE-AZUL-7: …`, y el
  modelo contesta NINGUNO. Es lo que dice su documentación: en `BeforeTool` no hay canal hacia el agente.
- **`agy` con `PreInvocation` lento**, 15 s contra un tope de 10: la sesión sigue y contesta NINGUNO. Se pierde ese aviso y nada se niega.

Encontrado y no previsto:

- **Mandar `reason` en un `allow` rompía `automation install`**: `probeBridge` lo lee como falla. Se quitó, además de no servir.
- **El aviso espera a `PreInvocation` en un archivo temporal por conversación.** Sin `conversationId` no se guarda, para no entregárselo a otra sesión, y una entrada rota en ese evento no niega el turno.
- **`agy` corre sin `--dangerously-skip-permissions`.** El modo de esta sesión la frenó. Sin esa bandera y sin `--mode auto`, que no está disponible en esta máquina, el comando corrió igual.

### Lista de cierre

1. hecho: `exit 0 stdout=[] stderr=[]` antes de tocar el código, y el aviso perdido en `agy` medido tres de tres.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/project-guards.test.js`, vista en rojo.
4. hecho: mutaciones en una copia, cada una en rojo: perder el aviso, sin recorte, no escribirlo, sin `systemMessage`, perderlo con `ask`, otro campo inyectado, no borrar el aviso, sin conversación, entrada rota que niega.
5. hecho: antes y después sobre el mismo guard. Un guard callado no agrega salida, con prueba.
6. hecho: sesiones reales en Claude y en `agy`.
7. hecho: lo que el caso pedía, `claude` y `agy`, se corrió. Gemini y Codex no los pedía.
8. hecho: repetidas con el motor de `31a5e77a`, también Gemini; esos archivos no cambiaron después. Sin correr: Codex, por decisión.
9. hecho: el aviso se entrega por conversación; la prueba cubre dos y que el aviso de una no le llegue a la otra.
10. hecho: quien lee la salida del hook y `probeBridge`, que se corrigió para `pre-invocation`.
11. hecho: dos pasadas sobre el puente. Hallaron el `deny` con entrada rota y el archivo compartido sin conversación, ya arreglados; la última no halló nada que impida.
12. hecho: pasada uno por uno; se quitó de la prueba la razón que ya está en `hook.js`.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión. No se entrega, y queda dicho: en Gemini al agente; en `stop`, y con un `ask` en Antigravity.
`probeBridge` sólo comprueba que `pre-invocation` conteste un JSON sin `decision`: un puente que rompa sólo `pendingNotices`
no lo ve. `upgrade` solo no agrega el hook nuevo: `automation doctor` lo avisa y reinstalar lo deja.
