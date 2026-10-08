---
caso: 342
titulo: secrets-shell no ve dos formas que el README nombra, rg -g y una identidad con ~
estado: resuelto
resuelto-en: 0.105.0
prioridad: baja
version-detectada: 0.104.1
---

# 342 — `secrets-shell` no ve dos formas que la documentación nombra como cubiertas: `rg -g '.env*' KEY` y una identidad declarada escrita con `~`

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **baja**.

**Prioridad baja**: dos formas de texto entre las infinitas que el README ya dice que se esquivan. Se abre
porque las dos son las que la propia documentación da como ejemplo de lo que sí se frena, y una promesa
escrita que no se cumple vale más que el hueco. La segunda pesa más que la primera: es la forma con la
que el README de `organization/` enseña a declarar una identidad.

## Resumen

1. `automatization/hooks/README.md`, «Leer una credencial»: «Un comodín que la nombra —`rg -g '.env*'`,
   `--include='*.env'`— cuenta igual». Con payload real, `grep -r --include='*.env' KEY .` frena y
   `rg -n KEY -g '.env*'` frena; `rg -g '.env*' KEY`, con el comodín antes del patrón, pasa.
2. El mismo README dice que los guards frenan «las identidades que declara `organization/secrets.json`», y
   el ejemplo de `template/organization/README.md` declara la identidad como
   `"file": "~/.config/acme/local-dev.env"`. Con esa declaración, `cat $HOME/.config/acme-e2e/local-dev.env`
   frena y `cat ~/.config/acme-e2e/local-dev.env` pasa, igual que `cat $HOME/…`. La forma con `~` es la que
   una persona o un agente escribe.

## Reproducción

```bash
cd <repo con ops/ y guards instalados>
for c in "rg -g '.env*' KEY" "rg -n KEY -g '.env*'"; do
  printf '%s' "{\"session_id\":\"s\",\"cwd\":\"$PWD\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$c\"}}" \
    | CLAUDE_PROJECT_DIR=$PWD ops/automatization/hooks/guard-shell.sh; echo "$c → exit=$?"
done
# identidad declarada con ~, como en el ejemplo del README de organization/
mkdir -p ~/.config/acme-e2e && printf 'TOKEN=abc\n' > ~/.config/acme-e2e/local-dev.env
cat > ops/organization/secrets.json <<'EOF'
{ "schemaVersion": 1, "accounts": { "principal": { "url": "https://app.infisical.com" } }, "projects": { "acme": { "account": "principal" } },
  "identities": { "local-dev": { "account": "principal", "source": "file", "file": "~/.config/acme-e2e/local-dev.env" } }, "shared": {}, "services": {} }
EOF
for c in "cat ~/.config/acme-e2e/local-dev.env" "cat $HOME/.config/acme-e2e/local-dev.env"; do  # mismo payload que arriba
  echo "$c"; done
```

## Síntoma

```
rg -g '.env*' KEY → exit=0
rg -n KEY -g '.env*' → exit=2     BLOQUEADO: el comando lee …/*.env, que es una credencial …
cat ~/.config/acme-e2e/local-dev.env → exit=0
cat $HOME/.config/acme-e2e/local-dev.env → exit=2   BLOQUEADO: el comando lee …/local-dev.env, que es una credencial …
```

`ops secrets check .` con esa declaración da «✓ contrato de secretos: 0 servicio(s) al día», así que la
declaración es válida para el motor y el guard igual no la ve con `~`.

## Causa raíz

1. `engine/hooks/secrets-shell.js`, `withoutPattern`: para `rg` y `grep` la regla `SEARCH` declara como
banderas con valor sólo `-e`/`--regexp` (patrón) y `-f`/`--file` (archivo). `-g` no está en ninguna
lista, así que se conserva como bandera suelta y la palabra siguiente, `'.env*'`, se toma como el patrón
posicional y se descarta: el comodín nunca llega a `credential`. Con el patrón primero, `'.env*'` ya no es
posicional y sí se mira. La prueba de `chat-effects.test.js` ejercita sólo la segunda forma.
2. `engine/hooks/files.js`, `credential`, línea ~54: la identidad se compara con
   `path.resolve(cwdOf(input), raw)`, que no expande `~`: el token queda como `<cwd>/~/.config/…` y no
   coincide con la ruta que `resolvePath` de `config/paths.js` sí expande al leer la declaración. Se ve en
   el propio mensaje de otro bloqueo de la misma corrida: «el comando lee …/acme/~/.ssh/id_rsa», que frenó
   sólo porque `id_rsa` cae en la lista de nombres conocidos. `$HOME` queda sin resolver, que es el trato
   documentado para una variable.

## Fix propuesto

1. Agregar `-g` y `--glob` a `data` de la regla de `rg` con una palabra de valor, y `--include`/`--exclude`
   a la de `grep`, de modo que su valor se conserve como nombre a juzgar y no se consuma como patrón. Una
   prueba por forma: comodín antes y después del patrón.
2. En `credential`, expandir `~` y `~/` con `os.homedir()` antes de resolver, con la misma función que ya
   usa `shell-boundary`, que sí frenó `echo x > ~/otro.txt` en la misma matriz. Una prueba con la identidad
   declarada con `~` y el comando escrito con `~`.

## Tradeoffs

- `-g` con un comodín que no nombra credencial —`rg -g '*.js' KEY`— sigue pasando, porque `credential`
  decide por el nombre, igual que hoy.

## Por qué hacerlo

Los dos README lo prometen con esos ejemplos. Lo que no se cumpla ahí, o se cumple o se deja de decir. Y el
segundo es el camino principal del caso 088: una empresa que adopta `secrets.json` declara sus identidades
con `~` porque así lo enseña el molde, y el guard que esa declaración existe para alimentar no las ve.

## Riesgos y regresiones

Ninguno visible: el valor de `-g` hoy se descarta; pasar a mirarlo sólo puede frenar más, y sólo cuando
nombra una credencial.

## Contexto de descubrimiento

Campaña del 2026-10-08: matriz de guards con payload real, y la matriz de interruptores de configuración
del mismo día, donde la identidad declarada se probó con tres formas de escribir la ruta. Confirmado
leyendo `withoutPattern` y `credential`.

## Relacionados

- 104, el caso que llevó el comodín al guard de lectura.
- 088 y 092, el contrato de secretos y la identidad que ningún nombre delata.

## Cierre

Recorrido contra el caso entero:

- **`-g` y `--glob` como banderas con valor de `rg`** — hecho, en la regla `SEARCH` de `secrets-shell.js`, junto
  con `--include`. Se hizo distinto en un detalle: el caso proponía ponerlas en `data`, y `data` descarta el
  valor; van en `file`, que es la lista que lo conserva como nombre a juzgar. `--exclude` queda afuera a
  propósito: excluir no es leer.
- **Expandir `~` en `credential`** — hecho, en `files.js`, y además en el nombre que `secrets-shell` imprime
  al frenar, que mostraba `<cwd>/~/…`. `$HOME` sin expandir sigue pasando, que es el trato documentado para
  una variable; `$HOME` ya expandido por la persona frena, porque es la ruta entera.
- **Una prueba por forma** — hecho: tres formas de `rg`/`grep` con el comodín antes del patrón en
  `chat-effects.test.js`, y la identidad declarada con `~` nombrada con `~` y entera en `files.test.js`, sin
  escribir nada bajo el home.
- **Tradeoff «`rg -g '*.js' KEY` sigue pasando»** — comprobado por construcción: `credential` decide por el
  nombre, igual que antes.

Cómo se supo que funciona:

- Rojo previo: las dos pruebas fallaron antes de cada arreglo y pasan después; `test/hooks/` en 243 de 243.
  La primera versión de la prueba de identidad esperaba el motivo «identidad declarada» y encontró que
  `secrets-shell` no lo transmite: imprime el nombre resuelto, que era `<cwd>/~/…`, y de ahí salió el segundo
  arreglo.
- Mutaciones: quitar `-g`/`--glob` de la regla pone `chat-effects.test.js` en rojo; volver `named = raw`
  pone `files.test.js` en rojo; restauradas, verde.
- Corrida real sobre el banco de la campaña con el motor del fuente y la identidad declarada como
  `~/.config/acme-e2e/local-dev.env`: `rg -g '.env*' KEY` → «el comando lee …/.env*, que es una credencial»;
  `cat ~/.config/acme-e2e/local-dev.env` → «el comando lee $HOME/.config/acme-e2e/local-dev.env, que es una credencial»; y
  `cat ~/.config/acme-e2e/otro.env` pasa. Antes del arreglo los dos primeros daban exit 0.

