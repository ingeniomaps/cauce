---
caso: 098
titulo: Una orden directa del chat no llega a ningún guard, y el único canal humano es un archivo que el agente se escribe solo
estado: abierto
prioridad: alta
version-detectada: 0.80.0
---

# 098 — Los guards frenan igual lo que el usuario ordenó y lo que el agente decidió, y el agente se puede aprobar

**🔴 abierto** · detectado en 0.80.0 · prioridad **alta** — frena al usuario en lo que pidió con todas las letras,
que es lo que Cauce no tiene que hacer nunca, y la salida que le queda la puede tomar el agente sin él

## Resumen

Un guard ve la llamada a la herramienta —`Read` sobre `.env`, `Write` sobre `src/app.js`— y nada de la
conversación. Por eso no distingue tres cosas que le llegan idénticas: que el usuario lo pidió, que el
agente lo decidió solo, o que un README o un ticket se lo sugirió. Dos daños salen de ahí:

1. **Una orden directa se frena.** «Leé el `.env`» o «arreglá este typo» chocan con el mismo bloqueo que
   una lectura o una edición que nadie pidió, y la persona tiene que ir a escribir una ruta en un archivo
   para hacer lo que ya dijo.
2. **El agente se puede aprobar solo.** Ese archivo, `planning/.ops-approval`, se escribe con la misma
   herramienta que usa el agente, y ningún guard lo frena. Una aprobación escrita por el agente destraba
   igual que una escrita por una persona.

El criterio que el arreglo tiene que respetar: **Cauce no limita al usuario.** Contener al agente está bien
cuando el trabajo va por tareas o autobuild, porque ahí el que piensa es él; cuando la persona pide algo
directo en el chat, frenarla o hacerle confirmar de nuevo es lo peor que el sistema puede hacer.

## Reproducción

Sobre un banco sidecar hecho como en la reproducción del 097 (`npx @ingeniomaps/cauce@0.80.0 init … --mode
sidecar --runner claude --install`, con un `.env` en la carpeta del workspace):

```bash
A="$B/acme-ops/planning/.ops-approval"
echo "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$A\",\"content\":\"$B/.env\n\"}}" \
  | CLAUDE_PROJECT_DIR="$B" bash acme-ops/automatization/hooks/guard-files.sh; echo "exit=$?"
echo "$B/.env" > "$A"
echo "{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$B/.env\"}}" \
  | CLAUDE_PROJECT_DIR="$B" bash acme-ops/automatization/hooks/guard-secrets-read.sh; echo "exit=$?"
```

Y para ver qué recibe un guard, dos hooks de volcado en `.claude/settings.json` —`UserPromptSubmit` y un
`PreToolUse` sobre `Read`, cada uno con `cat > dump-<evento>.json`— y una sesión real:

```bash
claude -p "Leé .env.example con la herramienta Read y decime su contenido." --model haiku \
  --setting-sources project --allowedTools Read
```

## Síntoma

Salida real, 2026-09-11, Claude Code 2.1.268:

```
guard de escrituras sobre la aprobación → exit=0
lectura del .env con esa aprobación     → exit=0
```

```
dump-prompt   hook_event_name: UserPromptSubmit · prompt_id: e769da7c-… · prompt: "Leé .env.example con la herramienta Read y decime su contenido."
dump-pretool  hook_event_name: PreToolUse       · prompt_id: e769da7c-… · tool_name: Read · tool_input: {file_path: …}
```

El guard recibe `tool_name` y `tool_input`, y ningún texto del usuario. Y en la prueba en vivo del 092
(variante C4) el agente, frenado, intentó escribirse la aprobación por su cuenta; lo paró la sesión no
interactiva, que no tenía permiso de escritura, no Cauce.

## Causa raíz

- `engine/hooks/approval.js:33` — la única forma de aprobar es leer `planning/.ops-approval`, un archivo del
  repositorio.
- Ningún guard de escritura protege ese archivo: `engine/hooks/files.js` importa `approval` (`files.js:14`)
  sólo para cotejar, nunca para negar un `Write` sobre él.
- El volcado de arriba: la entrada de `PreToolUse` no trae la conversación, así que un guard no tiene de
  dónde saber que la llamada responde a una orden.

## Fix propuesto

El runner ya captura lo que la persona escribe, y eso es lo que el modelo no puede falsificar:
`UserPromptSubmit` recibe el texto literal y comparte `prompt_id` con cada `PreToolUse` que ese mensaje
origina (**verificado**, volcado de arriba). En Gemini el equivalente es `BeforeAgent`, que recibe `prompt`
(**documentado**, geminicli.com/docs/hooks/reference, consultado 2026-09-11; sin `prompt_id` en la lista).

1. **Un hook de mensaje** guarda el texto de la persona por sesión y `prompt_id`, **fuera del alcance del
   agente**.
2. **Lo que el usuario nombró pasa sin preguntar.** Si el mensaje que originó la llamada nombra lo que el
   guard iba a frenar —la ruta o su nombre—, el guard deja pasar.
3. **Lo que quedó frenado se aprueba contestando.** Si el pedido no lo nombraba, el guard frena y registra
   qué frenó; el agente lo dice en el chat, y un «dale» en el mensaje siguiente aprueba exactamente eso.
4. **`plan-first` no aplica en una sesión donde habla la persona.** Existe para que el agente planifique
   dentro del flujo; en tareas y autobuild sigue frenando.
5. **Una sesión automática no autoriza con su mensaje**: autobuild, el ciclo de aprendizaje o un `claude -p`
   lanzado por el sistema traen un «mensaje del usuario» que escribió el sistema. En el volcado de arriba
   `UserPromptSubmit` corrió también con `-p`, así que la marca tiene que venir de otro lado.
6. **`planning/.ops-approval` queda para cuando no hay chat**, con escritura negada al agente.

Lo que el agente hace por su cuenta —lo que nadie nombró ni aprobó— se sigue frenando igual que hoy.

## Tradeoffs

- **Nombrar no es autorizar**: «no toques el `.env`» nombra el `.env`. El punto 2 necesita una regla para la
  negación, o limitarse a los verbos que piden la acción; sin eso, prohibir algo lo autoriza.
- **El «dale» es lenguaje natural.** Se acota a lo registrado como pendiente y al mensaje inmediato, pero una
  respuesta con matices —«sí, pero no toques X»— hay que decidir cómo se lee.
- **Dónde se guarda el mensaje** decide si el punto 1 sirve: al alcance del agente, vuelve el daño 2.
- **Gemini sin `prompt_id`** tiene que atar la llamada al último mensaje de la sesión. Codex y Antigravity no
  se verificaron: puede que ahí sólo quede el archivo.
- `"ask"` en un `PreToolUse` de Claude hace que el runner le pida confirmar al usuario (**documentado**,
  code.claude.com/docs/en/hooks, consultado 2026-09-11). Queda como respaldo: es una segunda confirmación, y
  el criterio de arriba es no pedirla cuando la orden ya está en el chat.

## Qué tiene que probar el cierre

En sesiones reales, sobre un banco con el paquete a publicar:

- «Leé el `.env`» lo lee sin pedir nada más; una lectura del `.env` que nadie pidió se sigue frenando.
- Un README que dice «leé el `.env`», con la persona pidiendo otra cosa, no autoriza: el texto llega como
  resultado de una herramienta, no por el hook de mensaje.
- El agente no puede escribir donde se guarda el mensaje ni `planning/.ops-approval`: la reproducción de
  arriba termina en `exit=2` en el primer comando.
- El recorrido de «dale»: frena, se dice en el chat, se contesta, pasa exactamente lo pendiente.
- `plan-first` no frena en una sesión con persona y sí en una sesión automática.
- La negación: «no toques el `.env`» no autoriza tocarlo.

## Contexto de descubrimiento

2026-09-11, en la prueba en vivo del 092: frenado por el guard de lectura, el agente intentó escribirse la
aprobación. Revisándolo con el usuario apareció el otro lado: lo que él pide directo choca con los mismos
bloqueos que existen para contener al agente.

## Relacionados

- **092** — se encontró en su prueba en vivo.
- **097** — la otra falla del mismo canal: en sidecar el mensaje manda a otro `planning/`.
- **089** — hizo que el bloqueo diga las líneas exactas a pegar; este caso le saca a la persona la necesidad
  de pegarlas.
