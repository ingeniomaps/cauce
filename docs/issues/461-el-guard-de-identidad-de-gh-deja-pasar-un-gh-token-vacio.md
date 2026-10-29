---
caso: 461
titulo: El guard de identidad de gh deja pasar un GH_TOKEN vacío, y gh cae a la cuenta del keyring sin que nada lo frene
estado: resuelto
resuelto-en: 0.117.2
prioridad: media
version-detectada: 0.117.1
---

# 461 — El guard de identidad de `gh` deja pasar un `GH_TOKEN` vacío

**🟢 resuelto en 0.117.2** · detectado en 0.117.1 · prioridad **media**: no viaja en el paquete —es herramienta de este
repositorio—, pero deja pasar justo el error que el guard existe para frenar. Las lecturas salen con la identidad
equivocada sin avisar, y la escritura falla recién en GitHub.

## Resumen

`.claude/hooks/gh-identity.js` exige que un `gh` lleve `GH_TOKEN` o `GITHUB_TOKEN` en la misma invocación, pero mira
que la asignación **esté escrita**, no que tenga valor. `GH_TOKEN="$GITHUB_PAT_CAUCE" gh …` pasa aunque esa variable
no esté en el entorno, que es lo que ocurre cuando falta el `set -a; . ./.env; set +a` delante: el estado del shell no
sobrevive entre llamadas. `GH_TOKEN` llega vacío, `gh` cae al keyring y opera como otra cuenta. `GH_TOKEN= gh …` pasa
también.

## Reproducción

Desde la raíz del repo, con la variable fuera del entorno (2026-10-28, `main` en `fe889ed3`):

```bash
for c in 'GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr create --repo ingeniomaps/cauce' \
         'GH_TOKEN= gh pr list' \
         'set -a; . ./.env; set +a; GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr create' \
         'gh pr list'; do
  printf '%s' "{\"tool_input\":{\"command\":$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$c")}}" \
    | env -u GITHUB_PAT_CAUCE node .claude/hooks/gh-identity.js >/dev/null 2>&1
  echo "exit=$? :: $c"
done
```

## Síntoma

```
exit=0 :: GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr create --repo ingeniomaps/cauce
exit=0 :: GH_TOKEN= gh pr list
exit=0 :: set -a; . ./.env; set +a; GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr create
exit=2 :: gh pr list
```

Las dos primeras tendrían que frenar. Con la primera, el PR del caso 459 falló el 2026-10-28 con `GraphQL: must be a
collaborator (createPullRequest)`. `gh api user` con esa misma forma devolvía la cuenta del keyring, y con el `.env` cargado
en la misma llamada devolvía `ingeniomaps`.

Antes, en la misma sesión, un `gh pr list` con la misma forma había «andado»: devolvió `[]` como cualquier lectura, y
se tomó como prueba de que la credencial estaba cargada. Es el modo de fallo que el encabezado del guard nombra
—«las lecturas devuelven resultados igual»—, y el guard no lo cubre en esta forma.

## Causa raíz

- `.claude/hooks/gh-identity.js:81`: `CARRIES_TOKEN = /\b(?:GH_TOKEN|GITHUB_TOKEN)\s*=/`. Alcanza con que aparezca el
  `=`. No mira si el valor es vacío ni si es una referencia a una variable que nadie cargó.
- `:104`: es la única condición que decide. El mensaje de bloqueo (`:107-108`) enseña la forma completa, con el
  `source` del `.env`, pero sólo lo muestra cuando ya bloqueó, y esta forma no bloquea.

El hook no puede saber qué variables tendrá el shell de la herramienta Bash: corre en otro proceso. Lo que sí puede
comprobar sin interpretar nada es la forma de la invocación.

## Fix propuesto

Cerrado por defecto (R27): el token pasa sólo si el valor llega vivo **en la misma invocación**.

1. **Valor vacío**: `GH_TOKEN=` o `GH_TOKEN=""` sin nada → se bloquea.
2. **Referencia a variable** (`GH_TOKEN="$X"` o `${X}`): pasa sólo si la misma invocación carga el `.env` antes del
   `gh`, con `. ./.env`, `. .env` o `source .env`, con o sin `set -a`. Si no, se bloquea con el mismo mensaje de hoy,
   que ya enseña la forma completa. Lo que se mira es la ruta del `.env`, no una lista de palabras: es lo que el
   `AGENTS.md` admite que decida un guard.
3. Un literal no se toca. Escribir el PAT en el comando es otro problema, y lo cuida el guard de secretos.

Aceptación y mutación (R29):

- **Bloquea** los dos primeros comandos de la reproducción, y **deja pasar** el tercero y los nueve casos que hoy
  pasan en `test/repo/gh-identity.test.js`.
- **Mutación**: volver `CARRIES_TOKEN` a la regex de hoy; los dos casos nuevos se ponen rojos.
- **Prueba real**: un `gh pr list` en esta sesión sin el `source` → bloqueado. Con el `source` → pasa, y
  `gh api user` dice `ingeniomaps`.

## Tradeoffs

- **Más fricción si alguien exporta `GITHUB_PAT_CAUCE` en su perfil**: el `source` pasa a ser obligatorio igual. Es lo
  que la regla ya pide, y una sola forma es más fácil de cumplir que dos.
- **Sigue siendo regex, no un parser de shell.** Un `.env` cargado dentro de un `bash -c "…"` o por una función queda
  fuera, y frena de más: es la dirección barata de equivocarse.
- **Endurecer la regla escrita no alcanza.** Estaba completa, en `AGENTS.md`, en la memoria de la sesión y en el
  mensaje del propio guard, y se salteó igual. Por eso el arreglo va en el mecanismo y no en la prosa.

## Contexto de descubrimiento

Al abrir el PR del caso 459, el 2026-10-28. El push había entrado porque el helper de git lee el `.env` por su cuenta,
y esa asimetría hizo que pareciera que la credencial estaba cargada.

## Relacionados

Ninguno con la misma causa: `grep -l gh-identity docs/issues/*.md` sólo encuentra este caso. El otro camino con la
identidad equivocada, el push por SSH, lo frena este mismo guard (`:97-102`). Salió del push de la rama del caso 425,
pero ese caso trata de otra cosa.

## Cierre

**Resuelto en 0.117.2.** No viaja en el paquete (`.claude/` no está en `files`), así que no lleva entrada de CHANGELOG.
Se mergeó antes de que saliera 0.117.2, que era la versión abierta (la del caso 459), y por eso queda en ella.

- **1. Valor vacío.** Se hizo: `carriesToken` (`.claude/hooks/gh-identity.js`) rechaza `GH_TOKEN=` y `GH_TOKEN=""`.
- **2. Referencia sin el `.env` cargado antes.** Se hizo: `"$X"` o `${X}` pasan sólo si un `. ./.env`, `. .env` o
  `source .env` aparece **antes** de la asignación, en la misma invocación. Cargarlo después del `gh` se bloquea.
  También se bloquea `'$X'`: entre comillas simples no expande.
- **3. Literal.** Se hizo como se propuso: `GH_TOKEN=x` pasa.
- **Encontrado y no previsto: `GITHUB_TOKEN` no llega nunca a `gh` en esta máquina.** El guard lo aceptaba como
  credencial, pero el wrapper `~/.local/bin/gh` se lo saca a cada invocación. Medido con el `.env` cargado:
  `GITHUB_TOKEN="$GITHUB_PAT_CAUCE" gh api user` → otra cuenta, la del keyring; `GH_TOKEN=…` → `ingeniomaps`. El guard ahora
  acepta sólo `GH_TOKEN`, que es lo único que nombra la regla escrita. La prueba que lo daba por bueno
  (`GITHUB_TOKEN=x gh run list`) pasó a la lista de bloqueados.
- **Lo que dependía de la regla vieja.** Hay tres lugares que la afirmaban, y se corrigieron los tres:
  - la descripción en `.claude/settings.json` decía «GH_TOKEN o GITHUB_TOKEN»;
  - el mensaje de `gh auth` enseñaba la forma sin el `source`;
  - dos pruebas daban por buena la forma sin `.env`: `'GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr list'` y la que deja pasar
    `gh api user` después de bloquear `gh auth`.
- **Endurecer la regla escrita.** Se decidió que no, por lo que dice Tradeoffs: estaba completa y se salteó igual.
- **Tradeoff del perfil exportado y del `bash -c`.** Se aceptan como están escritos: frenan de más, no de menos.

Pruebas, en `test/repo/gh-identity.test.js`:

- La prueba nueva tiene nueve formas que tienen que bloquearse, y las que pasan suman tres formas con `.env`.
- **Rojo previo**: con el guard de `main`, `debería bloquear: GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr create …`.
- **Mutaciones**, corridas sobre una copia del hook y de su prueba en el scratchpad, porque el hook vivo está
  registrado en la sesión que lo prueba. La copia sin mutar da 14 de 14, y cada mutación da 13 de 14:
  - volver a la regex de `main` → rojo en `GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr create …`;
  - dejar de exigir el `.env` → rojo en la misma;
  - aceptar `GITHUB_TOKEN` otra vez → rojo en `GITHUB_TOKEN=x gh run list`;
  - dar por bueno el valor vacío → rojo en `GH_TOKEN= gh pr list`;
  - expandir las comillas simples → rojo en `…GH_TOKEN='$GITHUB_PAT_CAUCE' gh pr list`.

Prueba real, con el hook registrado en la sesión de Claude Code que lo arregló:

- `GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr view 913 …`, que es la forma que antes llegó a GitHub y falló con «must be a
  collaborator» → `PreToolUse:Bash hook error … BLOQUEADO: gh sin credencial explícita…`.
- `set -a; . ./.env; set +a; GH_TOKEN="$GITHUB_PAT_CAUCE" gh api user` → `ingeniomaps`, y `gh pr view 913` →
  `913 OPEN`.
