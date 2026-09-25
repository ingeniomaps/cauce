---
caso: 202
titulo: La forma durable de autorizar una lectura de secreto existe, pero ningún bloqueo la ofrece y confirmar no alcanzaba para que el agente la escriba
estado: resuelto
resuelto-en: 0.99.1
prioridad: alta
version-detectada: 0.99.0
---

# 202 — El guard de secretos pregunta cada sesión por lo que ya está escrito como la forma correcta

**🟢 resuelto en 0.99.1** · detectado en 0.99.0 · prioridad **alta**.

**prioridad alta** por el costo acumulado, no por el riesgo: no rompe nada, pero cobra una interrupción
por sesión sobre un procedimiento que el proyecto ya declaró obligatorio, y esa interrupción cae sobre
la persona.

## Validación — 2026-09-25, antes de arreglar

**La premisa del título no se sostiene: la forma durable existe y anda.** Lo que sí queda es que nada la
ofrece como tal, y que `check` la trata como un olvido para siempre.

Corrido sobre un banco `suelto` con el motor de `main` y el comando de P6 apuntando a un `.env` de prueba
fuera del árbol (`secrets-shell` por `run-hook.sh`, sin transcript):

```
--- sin aprobación                      → BLOQUEADO … exit=2
--- con la ruta en .ops-approval, sesión A → exit=0
--- con la ruta en .ops-approval, sesión B → exit=0
```

Y sobre la instancia real, Cauce 0.99.0, grupo `pre-shell` entero con el comando literal de P6 y un
`session_id` nuevo: **exit=0**. Pasa porque `gouduet-ops/planning/.ops-approval` ya existe —lo escribió
Manuel a las 12:08 con la ruta y el comentario «Autorización permanente»—, así que el «no existe» de la
causa raíz era cierto al escribirse y hoy no. El archivo está sin trackear (`?? planning/.ops-approval`).

Por qué dura: `approval.js` coteja el conjunto frenado contra las líneas del archivo, y una lectura frena
siempre el mismo conjunto de una ruta. «Dejan de valer en cuanto cambie» nunca se cumple para ella.

### Lo que sí es defecto

1. **El bloqueo no dice que para una lectura la aprobación por archivo es permanente**, y la vía que ofrece
   primero —el «dale»— dura la sesión sin decirlo. `HOW` (`engine/hooks/approval.js`) escribe «valen para
   ese conjunto y dejan de valer en cuanto cambie», que es la redacción de los gates de commit. Leído desde
   `secrets-shell`, promete lo contrario de lo que pasa. Es lo que el dueño pidió («solo una vez y ya») y
   nadie le dijo que ya existía.
2. **`check` avisa para siempre sobre una aprobación puesta a propósito**:
   `⚠ planning/.ops-approval: 1 ruta(s) aprobadas y sin borrar; el archivo sigue autorizándolas`
   (`AP.warnings`, llamado desde `engine/cli/validate.js:136`). Está bien para lo olvidado, que es para lo
   que nació en el 117. Para lo deliberado es ruido perpetuo, y un aviso que siempre está enseña a no
   leer los demás.

3. **La persona no puede mandar al agente a dejarlo aprobado, salvo con una frase exacta.** Sonda sobre
   el motor de `main` (`workspace-boundary` con `chatSession` del harness): después del bloqueo de lectura,
   la persona contesta, la lectura pasa, y el agente intenta escribir la ruta en `.ops-approval`:

   ```
   «dale»                                              → FRENA (aprobarse solo)
   «pon esa línea»                                     → FRENA
   «acepto que leas»                                   → FRENA
   «dale, dejalo aprobado para siempre en .ops-approval» → FRENA
   «dejá el .env aprobado en .ops-approval»            → FRENA
   «agregá el .env a .ops-approval»                    → PASA
   … y en todos los que frenan, un segundo «dale»      → FRENA
   ```

   Dos causas. `self-approval.js` sólo deja escribir si el mensaje **nombra el archivo con un verbo de
   `ASKS`** (`chat.js:77`), y ni «pon» ni «dejá» están. Y el bloqueo `SELF` no llama a `CHAT.hold`, así que
   la salida que él mismo ofrece —«confirmando el bloqueo»— no aprueba nada: el «dale» que sigue vuelve a
   frenar igual. `UNASKED` sí anota lo frenado; `SELF` no.

   La vía sigue siendo de la persona, y tiene que serlo: el agente escribe sólo lo que ella confirmó. Pero
   hoy confirmar no alcanza, y la única frase que anda no la ofrece ningún mensaje.

### Lo que el fix propuesto no aguanta

`readableSecrets` en `ops.config.json`, **tal como está escrito, lo puede escribir el agente**:
`ops-config.js` protege sólo `runner.allowPush` y `runner.pushToLiveBranches` (`PROTECTED`, línea 22), y
el archivo no está en el patrón de `governance` (`engine/hooks/shell.js:442`). Además ese guard mira sólo
commits, y `secrets-shell` leería la clave del árbol de trabajo: la excepción regiría antes de cualquier
commit. La mitigación de «Tradeoffs» es falsa, y el fix reabre la autoescritura que la «alternativa
descartada» rechaza. Si se adopta, la clave va a `PROTECTED` — y ahí es lo mismo que `.ops-approval`
con razón obligatoria y en el repositorio, que es lo que agrega de verdad.

### Decisión abierta antes de construir

- **A (mínimo)**: arreglar el mensaje —para una lectura, decir que pegar la ruta es permanente y que el
  «dale» vale esta sesión— y que `check` no avise por una línea que traiga su razón en un comentario
  (o que avise distinto). Sin clave nueva.
- **B (el del caso, corregido)**: `readableSecrets` con `razon` obligatoria, protegida en `ops-config.js`
  igual que las llaves de push, validada en `engine/config/validate.js` y el schema. Visible en el diff y
  sin aviso perpetuo. Igual necesita el mensaje de A.

## Resumen

`guard-shell.sh` frena cualquier comando que lea un archivo de credenciales, y ofrece tres salidas:
confirmarlo en el chat, escribir la ruta en `planning/.ops-approval`, o `OPS_SECRETS_READ_OVERRIDE=1`.
Ninguna de las tres sirve para el caso que más aparece: **una lectura recurrente, acotada y necesaria
que la propia regla del proyecto documenta como el camino correcto.**

- La confirmación de chat es de la sesión. Mañana vuelve a preguntar.
- `.ops-approval` sí sería durable para una lectura —el conjunto es una sola ruta, así que sigue
  coincidiendo—, pero **la escribe la persona**: el agente tiene prohibido escribírsela, y con razón.
  Eso convierte la autorización durable en una tarea manual que hay que recordar hacer.
- La variable apaga el guard **entero** y para toda la sesión, que es lo contrario de acotar.

Falta el equivalente de lectura de `writableOutsideRoots`: una clave en `ops.config.json` donde el
proyecto declare qué credencial concreta se puede leer y por qué. Hoy `writableOutsideRoots` existe para
escribir fuera de las raíces y no tiene contraparte.

## Reproducción

En `gouduet` (sidecar, Cauce 0.99.0), 2026-09-25:

1. `gouduet-ops/planning/rules/github-identity.md` (regla propia P6) declara que `gh` **nunca** va sin
   `GH_TOKEN`, y escribe el comando exacto: leer `GITHUB_PAT_GOUDUET_ORG` de
   `~/Code/gouduet/.env` y pasarlo en la misma línea.
2. El usuario pide abrir un PR.
3. El agente corre ese comando, tal como la regla lo escribe.

## Síntoma

```
BLOQUEADO: el comando lee ~/Code/gouduet/.env, que es una credencial: leerla la deja en el
contexto de la sesión. Si hace falta un valor, pedíselo a una persona.
```

El agente para y pide confirmación. El usuario la da. En la sesión siguiente vuelve a pasar lo mismo.
Textual del dueño del proyecto, tras darla otra vez: *«esa regla con el arreglo de cauce deberia haber
quedado solo una vez y ya si te doy permiso siempre puedas hacerlo y veo que sigues una y otra vez
pidiendolo eso ya es un defecto grave que esta costando y molestando demasiado»*.

## Causa raíz

El guard clasifica por **qué es el archivo** (una credencial) y no por **qué se hace con el valor**. En
el comando de P6 el token va a una variable de shell y nunca se imprime, así que la premisa del mensaje
—«leerla la deja en el contexto de la sesión»— no se cumple; pero el guard no puede distinguir eso de un
`cat`, y frenar es lo correcto por defecto.

Lo que falta no es discernimiento del guard: es un lugar donde el **proyecto** declare la excepción una
vez, junto a las demás decisiones de su configuración, revisable en el diff y sobreviviendo a la sesión.
Es exactamente la forma que R27 pide —cerrado por defecto, cada excepción declarada de a una con su
razón y en el mismo lugar—, y hoy el guard cumple la primera mitad y no ofrece la segunda.

Verificado en esta corrida, 2026-09-25: `planning/.ops-approval` no existe en la instancia, y
`ops.config.json` no tiene ninguna clave de lectura —sus claves son `workspaceRoots`,
`writableOutsideRoots`, `runner` y `cauceVersion`—.

## Fix propuesto

Una clave hermana de `writableOutsideRoots`, con razón obligatoria para que la excepción no se escriba
sola:

```diff
  "writableOutsideRoots": [
    "~/.claude/projects/-home-manuel-Code-gouduet/memory"
  ],
+ "readableSecrets": [
+   {
+     "path": "~/Code/gouduet/.env",
+     "razon": "P6: gh autentica con GITHUB_PAT_GOUDUET_ORG; sin el token resuelve a otra cuenta"
+   }
+ ],
```

`guard-shell.sh` consulta esa lista antes de frenar. Sigue frenando todo lo demás, incluido cualquier
otro archivo de credenciales del mismo workspace.

## Tradeoffs

- **A favor**: la excepción queda en el repositorio, con su razón, la ve quien revise el diff, y el
  agente deja de interrumpir por algo ya decidido. No amplía nada más que la ruta nombrada.
- **En contra**: una lista de rutas legibles es un objetivo atractivo para quien quiera ampliarla de a
  poco. Se mitiga con lo mismo que el resto de la configuración —es gobernanza, así que tocarla pasa por
  el guard de gobernanza— y exigiendo la razón por entrada.
- **Alternativa descartada**: que el agente pueda escribir `.ops-approval`. Rompe la propiedad que hace
  que ese archivo signifique algo, que es que lo escribió una persona.

## Contexto de descubrimiento

Sesión de `gouduet` del 2026-09-25, cerrando `settlement-negative-payout-measure` y abriendo el PR #25
de `gouduet-org/api`. El bloqueo cayó en el último paso, después de que la rama ya estuviera empujada.

## Relacionados

- P6 de gouduet (`gouduet-ops/planning/rules/github-identity.md`), que es la regla cuyo cumplimiento el
  guard interrumpe.
- R27 del sistema: cerrado por defecto y cada excepción declarada sola. El guard cumple la primera mitad.
- Casos 185 y 188, sobre el mecanismo de confirmación por chat: aquéllos eran sobre si la confirmación se
  registraba; éste es sobre que, aun registrándose bien, no dura más que la sesión.

## Cierre

**Resuelto en 0.99.1, por la opción A y no por el fix propuesto.** La validación mostró que la forma
durable ya existía; lo que faltaba era que se ofreciera y que confirmar alcanzara para usarla. Recorriendo
lo que el caso enumeró:

- **Las tres salidas del Resumen → quedan dos y una cambió.** La confirmación de chat sigue durando la
  sesión, y ahora el bloqueo de lectura pregunta además si dejarlo permanente (`KEEP`,
  `engine/hooks/approval.js`). `.ops-approval` ya no es sólo tarea manual: con la confirmación de la
  persona, el agente escribe la línea. La variable no se tocó.
- **«Falta el equivalente de lectura de `writableOutsideRoots`» → se decidió que no.** Tal como estaba
  escrito, el agente podía escribírsela (`ops-config.js` protege sólo las dos llaves de push y
  `governance` no mira `ops.config.json`), y protegida era lo mismo que `.ops-approval` con otro nombre.
  Decisión de Manuel, 2026-09-25: opción A.
- **Tradeoff «tocarla pasa por el guard de gobernanza» → era falso**, y la validación lo dice con las líneas.
- **Alternativa descartada «que el agente pueda escribir `.ops-approval`» → se hizo, acotada.** Lo que la
  descartaba era aprobarse solo, y eso sigue frenado: escribe sólo líneas que la persona confirmó en el
  mensaje en curso, y `self-approval` las compara una por una. La intención la juzga el agente, como el
  «dale» desde el 184; no hay frase fija, por pedido explícito de Manuel («la intención no la palabra»).
- **Defecto 1, el mensaje no decía que la línea es permanente → se hizo.** «Cada línea vale hasta que
  alguien la borre, y lo que no esté ahí vuelve a frenar.» Vale para todos los guards, no sólo lectura: la
  frase vieja era falsa para todos, porque `left` coteja por ruta y no por conjunto.
- **Defecto 2, `check` avisaba como olvido → se hizo distinto.** No se silenció: `writableOutsideRoots` y los
  overrides también avisan en cada corrida a propósito (117). La credencial se nombra aparte, como exención
  declarada.
- **Defecto 3, confirmar no alcanzaba → se hizo.** El bloqueo `SELF` ahora anota el archivo y las líneas
  (`unnamed`, `engine/hooks/self-approval.js`), así que el «sí» siguiente aprueba lo que mostró. `ASKS` no se
  tocó: sumar verbos era la camisa de fuerza.
- **P6 de gouduet → ya destrabado**: la línea que Manuel escribió a mano hace pasar el grupo `pre-shell`
  con el comando literal de P6 (exit=0, en la validación).

Lo que el enunciado no preveía: `template/AGENTS.md` decía a cada empresa que el agente nunca puede escribir
la aprobación, y dos comentarios (`approval.js`, `files.js`) repetían el «deja de valer en cuanto cambie».
Los tres se corrigieron.

### Prueba

Hooks reales por `run-hook.sh` con el JSON del runner, en el banco `suelto` con el motor enlazado:

```
== lectura, sesión 1                → BLOQUEADO … Preguntale también si quiere dejarlo aprobado para
                                       siempre … exit=2
«pon esa línea» → lectura            → exit=0
               → escribir la línea   → exit=0
== sesión 2, nueva                  → exit=0
check → ⚠ planning/.ops-approval: 1 credencial(es) aprobadas hasta que se borre su línea: …/.env
```

Las pruebas nuevas de `test/hooks/chat-effects.test.js` y `test/planning/planning.test.js`, corridas contra
el motor de `main`: 4 en rojo. Con el arreglo, dos mutaciones: sin el `hold` de `KEEP` falla «confirmar la
lectura de una credencial deja al agente escribir esa línea» (`Got unwanted exception: dale`); sin el de
`unnamed` falla «un sí al bloqueo de la aprobación aprueba las líneas que mostró». `npm run ci`: 1002
pruebas, exit 0.

