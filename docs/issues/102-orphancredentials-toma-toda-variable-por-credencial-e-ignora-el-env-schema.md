---
caso: 102
titulo: `orphanCredentials` toma toda variable de un `.env.example` por credencial
estado: abierto
prioridad: media
version-detectada: 0.80.0
---

# 102 — El aviso de credenciales sin dueño cuenta cualquier variable como credencial

**🔴 abierto** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **media** — no frena nada; convierte
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
