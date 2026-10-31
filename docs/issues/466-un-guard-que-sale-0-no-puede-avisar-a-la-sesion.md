---
caso: 466
titulo: Un guard del proyecto que sale 0 no puede avisarle a la sesión, y el motor le dice que avise así
estado: abierto
prioridad: media
version-detectada: 0.117.2
---

# 466 — Un guard que sale 0 no puede avisarle a la sesión

**🔴 abierto** · detectado en 0.117.2 · prioridad **media**: un guard en modo aviso no avisa a nadie, y es la salida que el propio
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
