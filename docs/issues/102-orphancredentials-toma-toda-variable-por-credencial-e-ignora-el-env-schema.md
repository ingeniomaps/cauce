---
caso: 102
titulo: `orphanCredentials` toma toda variable de un `.env.example` por credencial
estado: resuelto
resuelto-en: 0.82.0
prioridad: media
version-detectada: 0.80.0
---

# 102 — El aviso de credenciales sin dueño cuenta cualquier variable como credencial

**🟢 resuelto en 0.82.0** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **media** — no frena nada; convierte
un aviso que tendría que ser raro y urgente en una lista de cien nombres que se deja de leer

## Resumen

`ops check` avisa cuando el proyecto «declara» una variable que no aparece en `workspace.md`, `AGENTS.md` ni
`HUMAN_ACTIONS.md`: «nadie las carga». La intención es buena —una credencial sin dueño rompe el día del
despliegue—, pero el aviso **llama credencial a cualquier variable**. Toma todos los nombres de
`.env.example`, `.env.sample`, `.env.template` y `.env.dist`: `IMAGE_NAME`, `DOCKERFILE`, `PORT` cuentan igual
que `DB_PASSWORD`. Y como el resumen corta en cuatro nombres, la credencial puede quedar escondida detrás de
«y 1 más» mientras se listan las variables de build.

En la instancia donde se vio, el aviso listaba **108 variables**, casi todas de configuración de build.

La otra mitad del reporte original —que el aviso ignora el `.env.schema` que declara `sensitive` por
variable— salió como **107**: no es un filtro que falte sino una decisión sobre quién define ese formato, y
choca con lo que dejó escrito el 088.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: un servicio con cuatro variables de configuración y
una credencial, en una instancia embebida y en una sidecar. Cada una lleva una épica para que no cuente como
recién creada, porque recién creada el aviso no corre (`onboarding.js:101`).

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js
servicio() {   # un servicio con cuatro variables de configuración y una credencial
  mkdir -p "$1"
  printf '{"name":"api","scripts":{"test":"node --test"}}\n' > "$1/package.json"
  printf 'IMAGE_NAME=api\nDOCKERFILE=Dockerfile\nPORT=3000\nLOG_LEVEL=info\nDB_PASSWORD=\n' > "$1/.env.example"
}
epica() {      # una épica, para que la instancia no cuente como recién creada
  cp "$1/planning/roadmap/epic-000-template.md" "$1/planning/roadmap/epic-001-primera.md"
  sed -i 's/^status: template/status: open/; s/^epic: .*/epic: 001/' "$1/planning/roadmap/epic-001-primera.md"
}
A=$BANCO/embebido
node $OPS init $A --mode embedded --install >/dev/null; servicio $A/api; epica $A
echo '--- embebido'; node $OPS check $A/planning 2>&1 | grep 'nadie las carga'
W=$BANCO/workspace   # en sidecar el servicio es hermano de la instancia, no hijo
node $OPS init $W/acme-ops --mode sidecar --install >/dev/null; servicio $W/api; epica $W/acme-ops
echo '--- sidecar'; node $OPS check $W/acme-ops/planning 2>&1 | grep 'nadie las carga'
```

Dos correcciones sobre la primera versión de esta reproducción, las dos comprobadas corriéndola:

- **El aviso sale por stderr**, así que `node $OPS check … | grep` no lo ve: la línea aparece igual en la
  terminal —stderr no pasa por el pipe— y `grep` termina con código 1. Por eso el `2>&1`.
- **En sidecar el servicio tiene que ser hermano de la instancia.** Con `api/` dentro de `acme-ops/` el aviso
  no aparece: `workspaceRoots` apunta a `..` y el inventario saltea la raíz ops (`scan.js:200`), que es donde
  quedaba el servicio.

## Síntoma

Salida real, 2026-09-11, con el checkout en 0.81.0:

```
--- embebido
⚠ el proyecto declara IMAGE_NAME (api), DOCKERFILE (api), PORT (api), LOG_LEVEL (api) y 1 más y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
--- sidecar
⚠ el proyecto declara IMAGE_NAME (api), DOCKERFILE (api), PORT (api), LOG_LEVEL (api) y 1 más y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
```

La única credencial es `DB_PASSWORD`, y es justo la que el aviso no nombra: queda en «y 1 más».

## Causa raíz

- `engine/core/scan.js:108`: `ENV_EXAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.dist']`,
  y `expectedEnv(dir)` (`:113`, llamada por servicio en `:145`) devuelve todos sus nombres sin distinguir
  cuáles son secretos. Corta en `ENV_MAX = 40` por servicio (`:111`) y devuelve cuántos cortó en `truncated`.
- `engine/core/onboarding.js:100-121`, `orphanCredentials`: cada nombre que no aparece en `workspace.md`,
  `AGENTS.md` o `HUMAN_ACTIONS.md` es una credencial huérfana. Recorre `names` (`:112`) y no mira
  `truncated`, así que lo que pasó del tope de 40 no entra al aviso ni se dice que faltó.
- Lo llama `engine/cli/planning.js:221`, dentro de `ops check`.

El criterio de qué nombre tiene forma de secreto **ya existe** en el motor, y en dos lugares:

- `sensitivePath` (`engine/integrations/registry.js:71`): `/(password|secret|token|authorization|cookie)$/i`,
  eximiendo lo que termina en `Env`. Lo usan el registro de integraciones (`:113`) y `secrets check`
  (`engine/secrets/index.js:165`), así que hoy es una sola regla para dos consumidores.
- `credential()` (`engine/hooks/files.js:52`): el mismo juicio, pero sobre nombres de archivo (`.pem`,
  `credentials*.json`, `.npmrc`), no de variables.

## Fix propuesto

1. **Filtrar por nombre reusando `sensitivePath`**, no con una tercera lista: sólo lo que tiene forma de
   secreto cuenta como credencial; el resto es configuración y no entra al aviso. La lista del primer
   borrador —`SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `CREDENTIAL`, `DSN`— **no coincide** con `sensitivePath`
   (medido, abajo): o se extiende `sensitivePath` para los dos consumidores, o el aviso pierde `API_KEY`.
   Extenderla es decisión de este caso, y cambia también lo que `secrets check` y el registro de
   integraciones rechazan.
2. **El texto del aviso** dice cuántas son y de qué servicios, y remite a dónde se declara el dueño
   (`organization/workspace.md` o una fila de `HUMAN_ACTIONS.md`).
3. **El tope de 40 se dice**: si un servicio tuvo `truncated > 0`, el aviso lo nombra en vez de callarlo.
   Con el filtro, lo cortado puede ser justo la credencial.

Qué reconoce hoy `sensitivePath` como secreto, medido en 0.81.0 con
`node -e "…sensitivePath({[n]:1})…"` sobre cada nombre:

| nombre | `sensitivePath` |
|---|---|
| `API_SECRET`, `DB_PASSWORD`, `GITHUB_TOKEN` | lo marca |
| `API_KEY`, `STRIPE_KEY`, `SENTRY_DSN`, `GCP_CREDENTIALS` | **no** lo marca |
| `IMAGE_NAME`, `TOKEN_TTL`, `SECRET_ENV` | no lo marca |

## Tradeoffs

- **Un filtro por nombre deja pasar un secreto mal nombrado** (`STRIPE=sk_live…`). Eso es lo que el
  `.env.schema` resolvería, y es el **107**; sin él, este caso lo acepta.
- **Extender `sensitivePath` con `key`, `dsn` o `credential` endurece también `secrets check` y el registro
  de integraciones.** Cuántas claves legítimas de esos archivos empezarían a rechazarse no está medido: se
  mide antes de extenderla, contra las integraciones del molde y la declaración del piloto del 088.
- **Leer YAML** deja de ser un costo de este caso: sin schema no hay nada que parsear. Lo que el primer
  borrador decía —que «`secrets check` ya lo resuelve y se puede reusar»— era falso: Cauce no parsea YAML ni
  lee `sensitive` en ningún lado (`secrets/index.js:115-118` sólo comprueba que el archivo exista).
- **Filtrar hace que el chequeo por subcadena pese más.** Ver el hallazgo de abajo: hoy esconde una
  variable de configuración; filtrado, lo único que quede para esconder serán credenciales.

## Lo que la reproducción encontró aparte

**`orphanCredentials` da por declarada una variable si su nombre aparece dentro de otra palabra.** El chequeo
es `contracts.includes(name)` (`onboarding.js:113`), por subcadena. Verificado en 0.81.0 sobre un banco
embebido con `IMAGE_NAME`, `DOCKERFILE` y `API_SECRET` en el `.env.example`:

```
⚠ el proyecto declara IMAGE_NAME (api), DOCKERFILE (api), API_SECRET (api) y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
```

y después de agregarle a `organization/workspace.md` la línea «La imagen sale de DOCKERFILE_PATH; ver
API_SECRET_ROTATION.»:

```
⚠ el proyecto declara IMAGE_NAME (api) y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
```

`API_SECRET` dejó de avisarse sin que nadie le haya asignado dueño. Es otro defecto —falso negativo, no
ruido— y **sale como caso propio**, el **111**, antes de arreglar éste.

## Qué tiene que probar el cierre

- La reproducción de arriba lista sólo `DB_PASSWORD`, en los dos modos. Vista en rojo con el aviso de hoy.
- Una mutación que devuelve el aviso sin filtro —todo nombre cuenta— lo pone en rojo; y otra que usa una
  lista propia en vez de `sensitivePath` hace fallar la prueba que afirma que el aviso y `secrets check`
  juzgan igual el mismo nombre.
- Un servicio con más de 40 variables y la credencial en el puesto 41 dice que cortó, en vez de callarla.
- Si se extiende `sensitivePath`: el número de claves que pasan a rechazarse en las integraciones del molde,
  medido y escrito en el cierre.

El criterio del primer borrador —«una variable declarada en `organization/secrets.json` no aparece en el
aviso»— **se retira porque no se puede cumplir**: `secrets.json` no declara variables. Sus propiedades son
`schemaVersion`, `accounts`, `projects`, `identities`, `shared` y `services` (`secrets/index.js:21`), y
cualquier otra es error (`:162`). Comprobado: con `{"schemaVersion":1,"variables":{"API_SECRET":{}}}`,
`check()` devuelve «propiedad desconocida variables».

## Cierre

Resuelto en 0.82.0 con la opción (a): el aviso filtra por nombre y reusa la regla que ya existía, sin una
tercera lista. Va en la misma rama que el **111**, que toca la misma función. La otra mitad del reporte, el
`.env.schema`, era el **107** y se descartó en la misma rama con la opción C.

Recorrido de lo que el caso enumeró:

- **Fix 1, filtrar reusando `sensitivePath`** — hecho. La regla pasó a `sensitiveKey()` en
  `engine/integrations/registry.js`: `sensitivePath` la usa para recorrer un objeto, y `orphanCredentials`
  para juzgar un nombre. Sigue siendo una sola regla, ahora con tres consumidores.
- **Extender `sensitivePath` o no: se extendió**, con `dsn`, `credentials?` y `key` sólo como palabra propia
  (`(?:^|_)key`). Todo se midió en solo lectura antes de decidir:
  - En los trece `.env.schema` reales de la empresa donde se vio (377 variables, 72 `sensitive: true`), la
    regla de antes reconoce 40 de las 72 y la nueva, 56. Con `key` suelta serían 57; sumando `_pat`, 58.
  - En las claves de configuración que la misma regla juzga hubo 161 claves: las del molde
    (`template/integrations/config.json` y `jira/config.json`), la `secrets.json` del piloto del 088 y el
    `integrations/jira/config.json` de dos instancias reales, aparatejo-ops y roax-ops. La regla nueva
    rechaza **0**. Con `key` suelta rechazaría una, `projectKey` de roax-ops, que es la clave del proyecto
    de Jira y no un secreto. Por eso cuenta sólo la palabra entera.
  - `_pat` no entra. Suma 2 de 72, el caso no la enumeraba, y cada palabra que se agrega cambia lo que
    rechazan los tres consumidores. Queda acá, con su número, para quien quiera sumarla.
- **Fix 2, el texto del aviso** — hecho. Dice cuántas son y en qué servicios, remite a
  `organization/workspace.md` o a una fila de `planning/HUMAN_ACTIONS.md` y termina diciendo que el
  criterio es el nombre, que era lo que pedía el 107 con C. Conserva «nadie las carga» a propósito: esa
  frase es la que buscan el `grep` de las reproducciones y los `doesNotMatch` de `planning.test.js`, y con
  otra esos `doesNotMatch` pasarían sin mirar nada.
- **Fix 3, el tope de 40 se dice** — hecho, en una línea aparte: «sin revisar por credenciales sin dueño,
  pasado el tope de variables por servicio: api (1 de 41)». Sale aunque no haya huérfanas, porque lo
  cortado puede ser justo la credencial.
- **Tradeoff «el filtro deja pasar un secreto mal nombrado»** — aceptado, y medido en el cierre del 107:
  16 de las 72 variables declaradas sensibles no tienen forma de secreto en el nombre.
- **Tradeoff «extender endurece `secrets check` y el registro de integraciones»** — se midió antes, como
  pedía el caso: 0 claves nuevas rechazadas de 161. Lo que no se pudo medir son los adaptadores propios de
  una empresa (091) que no están en esta máquina. Una clave de configuración que termine en `_key`, `dsn`
  o `credentials` ahora se rechaza, y el CHANGELOG lo dice.
- **Tradeoff «leer YAML»** — no aplica: sin schema no hay nada que parsear, y el 107 se descartó.
- **Tradeoff «filtrar hace pesar más la subcadena»** — resuelto en la misma rama: es el **111**.
- **Lo que la reproducción encontró aparte** — salió como el **111**, resuelto en 0.82.0.
- **«La reproducción lista sólo `DB_PASSWORD`, en los dos modos. Vista en rojo con el aviso de hoy»** —
  hecho. En rojo: la prueba nueva, sobre un `git archive HEAD` (`437170a8`), falla con `actual: '⚠ el
  proyecto declara IMAGE_NAME (api), DOCKERFILE (api), PORT (api), LOG_LEVEL (api) y 1 más y no aparecen
  en el mapa ni en HUMAN_ACTIONS: nadie las carga'`. En verde, la reproducción literal está en «Qué se
  corrió».
- **«Una mutación sin filtro se pone roja; otra con lista propia hace fallar la prueba que afirma que el
  aviso y `secrets check` juzgan igual»** — hecho, en una copia desechable, y las dos quedaron en rojo; la
  segunda, justo en esa prueba. Esa prueba no compara el aviso contra la función: lo compara, nombre por
  nombre sobre doce nombres, contra el error que devuelve `secrets check`.
- **«Un servicio con más de 40 variables y la credencial en el puesto 41 dice que cortó»** — hecho, por el
  CLI y en la prueba. Con HEAD, el mismo banco listaba cuarenta variables de configuración y callaba
  `DB_PASSWORD`.
- **«Si se extiende `sensitivePath`: cuántas claves pasan a rechazarse en las integraciones del molde»** —
  0 de las del molde, y 0 de 161 contando el piloto y las dos instancias reales.
- **El criterio de `secrets.json` que el caso retiró** — sigue retirado.

Lo que el caso encontró y su enunciado no preveía:

- **La exención de `Env` de `sensitivePath` no tenía efecto.** La mutación que la quitaba sobrevivía, y la
  razón es de construcción: la expresión exige que la clave termine en `password`, `secret`, `token`,
  `authorization` o `cookie`, y nada que termine así termina en `Env`. Se quitó. Por la misma razón, la
  conducta no cambia, y las pruebas de secretos e integraciones siguen verdes (26 de 26, junto con las
  del aviso).
- **Una prueba existente iba a quedar vacía.** «check avisa por las credenciales que nadie se llevó» usaba
  `DATABASE_URL` como la variable que sí tiene dueño. Con el filtro ya no es credencial, y su
  `doesNotMatch` habría pasado por eso y no por el dueño. Ahora usa `DB_PASSWORD`, y la mutación que deja
  la regla sin extender la pone en rojo, por `SENTRY_DSN`.
- **Sobre los repositorios reales, el aviso bajó de 306 variables a 21 credenciales**; la salida está
  abajo. Esa corrida mostró además otro defecto: dos servicios salen con el mismo nombre —`keycloak (21 de
  61)` y `keycloak (16 de 56)`—, porque el nombre es la ruta relativa a su raíz y tanto `gouduet/keycloak`
  como `hypixo/keycloak` quedan en `keycloak`. Viene de antes (el aviso viejo usaba la misma ruta) y no es
  de este caso. **Salió como caso propio, el 113**, con una reproducción que lo muestra desde un checkout:
  el choque sale sólo cuando la última carpeta de dos raíces coincide.

### Qué se corrió

La reproducción del caso, literal, contra el worktree:

```
--- embebido
⚠ credenciales por nombre sin dueño (1, en api): DB_PASSWORD (api) — no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga. El dueño se escribe en organization/workspace.md o en una fila de planning/HUMAN_ACTIONS.md; el criterio es el nombre, así que una credencial con nombre de configuración no aparece acá
--- sidecar
⚠ credenciales por nombre sin dueño (1, en api): DB_PASSWORD (api) — no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga. El dueño se escribe en organization/workspace.md o en una fila de planning/HUMAN_ACTIONS.md; el criterio es el nombre, así que una credencial con nombre de configuración no aparece acá
```

El tope, por el CLI, con cuarenta variables de configuración y `DB_PASSWORD` en el puesto 41:

```
--- HEAD 437170a8: 41 variables
⚠ el proyecto declara CONFIG_0 (api), CONFIG_1 (api), CONFIG_2 (api), CONFIG_3 (api) y 36 más y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
--- con el arreglo: 41 variables
⚠ sin revisar por credenciales sin dueño, pasado el tope de variables por servicio: api (1 de 41) — lo que quedó afuera puede incluir una credencial que nadie carga
```

Los dieciséis repositorios reales del piloto del 088, en solo lectura. Se usó una instancia sidecar
desechable con sus mismas raíces (las dieciséis existen en disco) y una épica para que el aviso corra:

```
--- HEAD 437170a8
⚠ el proyecto declara NODE_ENV (account), BFF_URL (account), POST_LOGIN_URL (account), ALLOWED_REDIRECT_ORIGINS (account) y 302 más y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
--- con el arreglo
⚠ credenciales por nombre sin dueño (21, en api, connector, identity, observability, topology/edge, keycloak, accounts, portal-app): DB_MAIN_PASSWORD (api), DB_AUDIT_PASSWORD (api), ANTHROPIC_API_KEY (connector), CONORBI_CONNECTOR_KEY (connector) y 17 más — no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga. El dueño se escribe en organization/workspace.md o en una fila de planning/HUMAN_ACTIONS.md; el criterio es el nombre, así que una credencial con nombre de configuración no aparece acá
⚠ sin revisar por credenciales sin dueño, pasado el tope de variables por servicio: keycloak (21 de 61), keycloak (16 de 56) — lo que quedó afuera puede incluir una credencial que nadie carga
```

- `node --test test/planning/orphan-credentials.test.js` sobre `git archive HEAD`: 5 de 5 en rojo. Sobre
  el worktree, las 5 más `planning.test.js`: 19 de 19 en verde.
- Mutaciones en una copia desechable del worktree, cada una comprobada aplicada antes de correr las
  pruebas del aviso. Todas en rojo:

| mutación | prueba que la atrapa |
|---|---|
| sin filtro: toda variable cuenta | la de los dos modos, la de nombre entero y la de juzgar igual |
| lista propia en vez de `sensitiveKey` | «el aviso y secrets check juzgan igual el mismo nombre» |
| la regla sin extender | la de juzgar igual, la de la clave como palabra propia y la de `planning.test.js` |
| `key` suelta en vez de palabra propia | «la clave cuenta como secreto sólo como palabra propia» |
| el tope se calla | «lo que pasa del tope del escaneo se dice en vez de callarlo» |
| sin la exención de `Env` (antes de quitarla) | ninguna: sobrevivió, y por eso se quitó |

- La medición sobre los `.env.schema`, con la regla del motor y no con una copia, está en el cierre del
  107.

## Contexto de descubrimiento

Instancia real (sidecar, 0.80.0), 2026-09-11. `ops check` repetía en cada corrida «el proyecto declara
ARTIFACT_REGISTRY_URL, IMAGE_NAME, DOCKERFILE, INFISICAL_ENV y 104 más … nadie las carga». Con el tope de 40
por servicio, 108 nombres son al menos tres servicios. El aviso terminaba ignorado entero.

## Relacionados

- **107** — la otra mitad del reporte original: respetar el `.env.schema`. Se separó porque pide una
  decisión que éste no necesita; este caso se puede cerrar sin ella.
- **088** — dejó escrito que el formato del `.env.schema` es del adaptador y no de la base, y exportó
  `sensitivePath` para que la regla de qué tiene forma de secreto fuera una sola. Este caso la reusa por lo
  mismo.
- **OPS-007** (contrato de secretos compartido): `secrets.json` declara dónde vive cada secreto, no qué
  variables existen; por eso no sirve como dueño de una variable en este aviso.
