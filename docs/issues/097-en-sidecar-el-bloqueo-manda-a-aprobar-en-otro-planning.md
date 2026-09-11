---
caso: 097
titulo: En sidecar, el bloqueo manda a aprobar en `planning/.ops-approval`, y desde la sesión ése es otro planning
estado: abierto
prioridad: media
version-detectada: 0.80.0
---

# 097 — En sidecar, pegar la aprobación donde el bloqueo dice no destraba nada

**🔴 abierto** · detectado en 0.80.0 · prioridad **media** — cada bloqueo con salida angosta, en toda instancia
sidecar, manda a un archivo que el guard no lee; quien pegue ahí sigue bloqueado y lo que le queda a mano es
la variable que apaga el guard para toda la sesión, que es lo que el 089 vino a evitar

## Resumen

Todos los bloqueos que aceptan aprobación terminan con *«Aprobalo pegando tal cual en planning/.ops-approval
estas líneas»*. En sidecar la sesión se abre en la carpeta del workspace y la instancia vive en una
subcarpeta —`acme-ops/`—, así que `planning/` leído desde donde está la sesión es `<workspace>/planning/`,
que no existe. El guard lee `<workspace>/acme-ops/planning/.ops-approval`. Pegar donde el mensaje dice no
destraba, y no hay nada que avise por qué.

## Reproducción

Desde un directorio vacío, con el paquete publicado:

```bash
B=$(mktemp -d); cd "$B"
npx -y @ingeniomaps/cauce@0.80.0 init "$B/acme-ops" --name Acme --mode sidecar --runner claude --install
printf 'API_KEY=x\n' > .env
G=acme-ops/automatization/hooks/guard-secrets-read.sh
IN="{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$B/.env\"}}"
echo "$IN" | CLAUDE_PROJECT_DIR="$B" bash "$G"; echo "exit=$?"
mkdir -p planning && echo "$B/.env" > planning/.ops-approval          # donde el mensaje dice, visto desde la sesión
echo "$IN" | CLAUDE_PROJECT_DIR="$B" bash "$G" >/dev/null 2>&1; echo "exit=$?"
rm -r planning; echo "$B/.env" > acme-ops/planning/.ops-approval       # donde el guard lee
echo "$IN" | CLAUDE_PROJECT_DIR="$B" bash "$G" >/dev/null 2>&1; echo "exit=$?"
```

## Síntoma

Salida real, 2026-09-11, con 0.80.0 recién publicado:

```
BLOQUEADO: <banco>/.env es una credencial: leerla la deja en el contexto de la sesión. Si hace falta un valor, pedíselo a una persona.
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  <banco>/.env
…
sin aprobación → exit=2
aprobación en <banco>/planning (donde el mensaje dice, visto desde la sesión) → exit=2
aprobación en <banco>/acme-ops/planning (la instancia) → exit=0
```

Y no es sólo lectura humana: en una sesión real de Claude Code sobre ese banco (la prueba en vivo del 092),
el agente leyó el bloqueo e intentó escribir exactamente `<banco>/planning/.ops-approval`, el que no sirve.

## Causa raíz

- `engine/hooks/approval.js:49` — `HOW` imprime la ruta fija `planning/${APPROVAL}`, sin raíz.
- `engine/hooks/approval.js:33` — `read(root)` lee `path.join(root, 'planning', APPROVAL)`, con la raíz de ops.
- `automatization/hooks/run-hook.sh:10` exporta `OPS_ROOT` con la carpeta de la instancia, y
  `engine/hooks/run.js:17` la usa antes que `CLAUDE_PROJECT_DIR`: en sidecar la raíz del guard y la carpeta de
  la sesión son distintas, y el mensaje sólo es correcto cuando coinciden.

Lo llaman once bloqueos: `engine/hooks/files.js:96`, `:150`, `:230`, `:304`, `:314` y
`engine/hooks/shell.js:207`, `:212`, `:352`, `:495`, `:499`, `:598`. El 089 ya registró que en sidecar el
archivo se lee de la raíz de ops; lo que no registró es que el mensaje no lo dice.

## Fix propuesto

Que `HOW` reciba la raíz y nombre el archivo que el guard va a leer, no uno relativo. La forma más corta es
la ruta absoluta —`<banco>/acme-ops/planning/.ops-approval`—, que ya es la forma de las líneas que imprime
debajo. La alternativa es relativa a la carpeta de la sesión cuando la instancia cuelga de ella
(`acme-ops/planning/.ops-approval`), y absoluta si no.

## Tradeoffs

- En modo embebido, donde hoy el mensaje es correcto, la ruta absoluta es más larga que `planning/.ops-approval`
  sin decir nada nuevo. La relativa a la sesión lo evita a cambio de una rama más.
- `HOW` cambia de firma y tiene once llamadores; ninguno se puede quedar con la forma vieja sin que el mensaje
  vuelva a mentir en sidecar.

## Qué tiene que probar el cierre

- En un banco sidecar, pegar las líneas exactamente en el archivo que el mensaje nombra destraba: la
  reproducción de arriba termina en `exit=0` en el segundo intento.
- Una mutación que devuelve la ruta fija `planning/.ops-approval` tiene que ponerlo en rojo.
- En modo embebido el mensaje sigue nombrando un archivo que existe y destraba.

## Contexto de descubrimiento

2026-09-11, en la prueba en vivo del 092 con Claude Code 2.1.268: en la variante con sólo el guard, el
bloqueo le dio al agente la línea a pegar y el agente intentó escribirla en el `planning/` de la carpeta de
la sesión. No llegó a escribirla porque la sesión no interactiva no tenía permiso de escritura.

## Relacionados

- **089** — agregó las líneas exactas al mensaje y registró que en sidecar el archivo se lee de la raíz de ops.
- **092** — se encontró probándolo.
