---
caso: 107
titulo: El aviso de credenciales sin dueño no lee el `.env.schema`, y leerlo choca con que su formato es del adaptador
estado: abierto
prioridad: baja
version-detectada: 0.80.0
---

# 107 — El `.env.schema` dice qué variable es sensible, y Cauce decidió no saber leerlo

**🔴 abierto** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **baja** — pide una decisión antes que
un arreglo; con el 102 cerrado, lo que queda es el secreto con nombre de configuración, y cuántos hay no está
medido

## Resumen

Separado del **102**. Los servicios de la instancia donde se vio tienen un `.env.schema` que declara, por
variable, si es `sensitive`. El aviso de credenciales sin dueño de `ops check` no lo mira: una variable
declarada `sensitive: false` se lista como credencial huérfana, y una declarada `sensitive: true` con un
nombre que no parece secreto —`STRIPE`— es justo la que el filtro por nombre que propone el 102 va a dejar
pasar.

El borrador original lo daba por fácil porque suponía que Cauce ya lee ese archivo. **No lo lee**: sólo
comprueba que exista, y el 088 dejó escrito a propósito que su formato es del adaptador de la empresa, no de
la base. Respetar el schema es por eso una decisión de producto, no un filtro que falta.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: un servicio cuyo `.env.schema` declara no sensible a
`IMAGE_NAME` y sensible a `STRIPE`.

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js; A=$BANCO/acme
node $OPS init $A --mode embedded --install >/dev/null
mkdir -p $A/api
printf '{"name":"api","scripts":{"test":"node --test"}}\n' > $A/api/package.json
printf 'IMAGE_NAME=api\nSTRIPE=\n' > $A/api/.env.example
printf 'service: api\nvariables:\n  IMAGE_NAME:\n    sensitive: false\n  STRIPE:\n    sensitive: true\n' > $A/api/.env.schema
cp $A/planning/roadmap/epic-000-template.md $A/planning/roadmap/epic-001-primera.md
sed -i 's/^status: template/status: open/; s/^epic: .*/epic: 001/' $A/planning/roadmap/epic-001-primera.md
node $OPS check $A/planning 2>&1 | grep 'nadie las carga'
node -e "const {sensitivePath}=require('./engine/integrations/registry');for(const n of ['IMAGE_NAME','STRIPE'])console.log(n, JSON.stringify(sensitivePath({[n]:1})))"
grep -rln 'sensitive' engine --include=*.js
grep -rn "\.env\.schema" engine --include=*.js
```

## Síntoma

Salida real, 2026-09-11, con el checkout en 0.81.0:

```
⚠ el proyecto declara IMAGE_NAME (api), STRIPE (api) y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
IMAGE_NAME ""
STRIPE ""
engine/integrations/registry.js
engine/secrets/index.js
engine/secrets/index.js:115:    const schema = service.schema || '.env.schema'
```

Tres cosas se leen ahí:

- Hoy el aviso lista las dos, aunque el schema diga que `IMAGE_NAME` no es sensible.
- `sensitivePath`, el criterio que el 102 propone reusar, no reconoce a ninguna de las dos: con el 102
  cerrado, `IMAGE_NAME` sale del aviso —bien— y `STRIPE` también —mal—.
- La palabra `sensitive` sólo aparece en el motor como parte del nombre `sensitivePath` (definido en
  `registry.js`, importado en `secrets/index.js`), y `.env.schema` sólo en una línea, la que arma la ruta
  para comprobar que el archivo exista.

## Causa raíz

- `engine/core/onboarding.js:100-121`, `orphanCredentials`: lee los nombres de los `.env.example` que
  inventaría `scan.js` y nada más.
- `engine/secrets/index.js:115-118`: lo único que Cauce hace con un `.env.schema` es comprobar que exista.
  No hay parser de YAML en el motor, y el repositorio no admite dependencias (`AGENTS.md`, «Cero
  dependencias»): leer el schema es escribir un parser, aunque sea de un subconjunto.
- `docs/issues/088-…md:229` —«`.env.schema` queda definido por el adaptador, no por la base. La base sólo
  lee lo mínimo para su chequeo (que exista y que declare nombres). Fijar el formato en Cauce resolvería el
  tercer dialecto de la evidencia, pero ataría la base a una convención de un stack»— y su cierre en `:371`:
  «la base sólo comprueba que exista. El formato sigue siendo de la empresa». El «tercer dialecto» es el
  `.env.schema` propio que ya tenía la instancia piloto (`:294`).
- El adaptador de secretos que ese texto supone **no existe**: el cierre del 088 decidió no construirlo
  (Fix 3). El **091**, resuelto en 0.80.0, sí dejó un contrato de adaptador propio con versión
  (`contract: 1`, cargado desde `integrations/<nombre>/`), pero es de `integrations/`, no de secretos.

## Decisión pendiente del usuario

**Decisión pendiente del usuario:** quién sabe qué variable de un servicio es sensible.

- **A) Cauce fija un formato mínimo y lo lee.** Un subconjunto cerrado —`variables.<NOMBRE>.sensitive`— con
  un parser propio de ese subconjunto. **Revierte lo que el 088 dejó escrito** hace un día, y ata la base al
  dialecto de un stack: el piloto ya traía otro.
- **B) El adaptador de la empresa expone qué es sensible y `check` le pregunta.** Respeta el 088, pero
  necesita un adaptador de secretos que hoy no existe: reabre el Fix 3 del 088, que decidió no tenerlo, y
  pide un contrato como el que el **091** dejó para `integrations/`.
- **C) Sólo el filtro por nombre del 102; el schema queda fuera de Cauce.** No revierte nada ni depende de
  un caso abierto. El costo es el secreto con nombre de configuración, que el aviso deja de ver; la empresa
  que lo quiera cubrir ya tiene dónde, porque en la instancia donde se vio el `.env.schema` con `sensitive`
  lo exige su propia regla de configuración.

**Recomendación: C.** Es la única que no deshace una decisión recién tomada ni se apoya en una que no está
tomada, y el daño que acepta —el secreto mal nombrado— no está medido: si al medirlo resulta grande, eso es
lo que justificaría A o B, con el número en la mano en vez de la suposición.

## Fix propuesto

Depende de la decisión:

- **A**: `orphanCredentials` busca un `.env.schema` junto a cada `.env.example`; si lo hay, sólo las
  variables `sensitive: true` pueden ser huérfanas, y el schema manda sobre el nombre. El formato se
  documenta en `template/organization/README.md` y el 088 se reabre en su tradeoff.
- **B**: un adaptador de secretos con contrato versionado, a la manera del que dejó el 091, responde «qué
  variables de este servicio son sensibles»; `check` lo usa cuando hay adaptador y cae al filtro del 102
  cuando no.
- **C**: no hay código. El texto del aviso que deja el 102 dice que el filtro es por nombre, para que quien
  lo lea sepa qué no cubre, y este caso se cierra como `descartado` con la medición que lo sostiene.

## Tradeoffs

- **A** agrega un parser al camino de `ops check`, que hoy corre donde los repositorios de producto pueden
  no estar —la razón por la que el 088 dejó `secrets check` como comando aparte—. Un schema que el parser no
  entiende tiene que avisarse, no tratarse como «sin schema», o el aviso vuelve a mentir en silencio.
- **B** hace que el aviso diga cosas distintas con y sin adaptador para el mismo servicio.
- **C** deja escrito un límite del aviso que hoy nadie ve, y lo deja para siempre si nadie lo mide.

## Qué tiene que probar el cierre

Vale para las tres formas, y lo de la opción elegida además:

- **La medición que decide**: con el 102 aplicado, sobre la instancia real donde se vio —en solo lectura,
  desde una instancia desechable, como el piloto del 088—, cuántas variables declaradas `sensitive: true` no
  reconoce el filtro por nombre, y cuántas `sensitive: false` sí. Ese número va en el cierre y es el dato
  que sostiene C, o el que la desmiente.
- **A o B**: la reproducción de arriba lista sólo `STRIPE`, vista en rojo con el aviso de hoy; y un schema
  que el parser o el adaptador no entienden produce un aviso propio, no el silencio.
- **C**: el caso se cierra `descartado`; la reproducción, con el 102 aplicado, no lista nada, y el texto del
  aviso dice que el criterio es el nombre.

## Contexto de descubrimiento

Instancia real (sidecar, 0.80.0), 2026-09-11, dentro del reporte del 102: `ops check` listaba 108 variables
y los servicios tenían `.env.schema` con `sensitive` por variable, porque la regla de configuración de esa
empresa lo exige. Al mejorar el 102 se vio que el arreglo que proponía para esta mitad —«si hay schema,
manda el schema»— se apoyaba en un lector de schema que Cauce no tiene y que el 088 decidió no tener.

## Relacionados

- **102** — la otra mitad: el filtro por nombre, que se puede cerrar sin esta decisión y del que depende la
  medición de arriba.
- **088** — decidió que el formato del `.env.schema` es del adaptador (`:229`, `:371`) y que no hubiera
  adaptador (Fix 3). A lo revierte; B reabre su Fix 3.
- **091** — resuelto en 0.80.0: el contrato de adaptador propio de `integrations/`. B tomaría esa forma
  para secretos; no la trae hecha.
- **OPS-007** (contrato de secretos compartido): «la base declara y compara; no se conecta, no genera y no
  conoce ningún gestor». El `.env.schema` es el punto donde ese contrato toca el formato de cada empresa.
