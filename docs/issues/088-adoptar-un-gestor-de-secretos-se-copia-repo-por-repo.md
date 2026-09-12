---
caso: 088
titulo: Adoptar un gestor de secretos se copia repo por repo, y las copias ya divergen
estado: resuelto
resuelto-en: 0.80.0
prioridad: media
version-detectada: 0.79.0
---

# 088 — Cauce no tiene dónde declarar un contrato operativo que la empresa comparte entre sus repos

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **media** — no rompe nada hoy; cada adopción nueva lo
agranda, y lo que se pierde en el camino son arreglos de seguridad que no llegan a todas las copias.
Sube a **alta** si un segundo proyecto adopta el modelo antes de que haya dónde declararlo

## Resumen

Una empresa que adopta un gestor de secretos —el caso medido es Infisical— termina con el mismo modelo
copiado en cada repositorio de servicio:

- `.env.infisical` y su `.example`: la identidad de máquina con la que se lee el gestor.
- `scripts/ensure-env.sh`: baja el entorno local desde el gestor.
- `scripts/infisical/check-schema.py`: compara el gestor contra el contrato y crea lo que puede crear.
- `.github/workflows/env-check-pr.yml` y `env-check-deploy.yml`: avisan en el PR y frenan el deploy.
- `.env.schema`: el contrato de qué variable existe, de qué tipo y en qué ambiente.

Nada dice qué repositorio usa qué cuenta, qué proyecto ni qué identidad; nada detecta que una copia se
quedó atrás, y en cada sesión alguien vuelve a instruir al agente: «hacé un `.env.infisical` y
mantenelo».

**Cauce no debería integrar Infisical.** Es la base: liviana, agnóstica y eficiente. Lo que le falta es
el **cómo**: un lugar en la instancia donde la empresa declare ese contrato compartido, un chequeo sin
red que lo haga cumplir, y un punto de extensión donde la empresa mantenga el adaptador de su
herramienta.

**Este caso no se cierra con un diff.** Agregar un sustantivo a la base cambia lo que recibe cada
empresa en su próximo `upgrade`, así que se decide con un ADR del sistema, como `OPS-003`. Lo que sigue
es el insumo de ese ADR, y el caso se cierra cuando el ADR se decide —en cualquier sentido—. Dos piezas
que estaban adentro se separaron porque se arreglan sin decidir esto: el punto de extensión de
adaptadores (**091**) y el alcance del guard de secretos (**092**).

## Reproducción

Lo que falta del lado de Cauce, desde un checkout:

```bash
node -e "console.log(require('./engine/config/validate').validateOpsConfig({ project: 'x', mode: 'sidecar',
  workspaceRoots: [{ name: 'app', path: '.' }], runner: {}, secrets: { adapter: 'infisical' } }))"
node -e "try { require('./engine/integrations/registry').adapter('infisical') } catch (e) { console.log(e.message) }"
```

La evidencia del lado de la empresa —las copias que divergen— está en «Contexto de descubrimiento»: son
repositorios privados y no se reproducen desde un directorio vacío.

## Síntoma

La salida de los dos comandos está en la sección «Qué se corrió», al final. Lo que muestran: la
configuración de la instancia no admite una clave nueva, y el motor no carga un adaptador que no traiga.
No hay dónde declarar el contrato ni desde dónde ejecutarlo.

**Del lado de la empresa, nada falla, que es por qué no se ve.** Cada copia funciona en su repositorio.
Lo que no ocurre es la propagación: el arreglo que alguien hizo en un servicio no llega a los demás, y
quien crea el siguiente copia del que tenga más a mano, que no es necesariamente el más nuevo.

Y la identidad se copia igual. Si varios servicios comparten una identidad de máquina, sus credenciales
viven en N archivos `.env.infisical`, uno por repositorio. Rotarla es editar N archivos, y el que se
olvida sigue funcionando hasta que la vieja se revoca.

Un detalle que choca con el pedido de «mantener el `.env.infisical`»: ese archivo lo frena por nombre el
guard `secrets` (`engine/hooks/files.js:55`), así que el agente al que se le pide mantenerlo no puede
escribirlo. Es la conducta correcta del guard, y dice que el flujo documentado tiene que separar lo que
escribe el agente —el `.example`, la declaración— de lo que carga una persona.

Los tres escenarios que el operador anticipa lo empeoran: proyectos que comparten cuenta y
credenciales, proyectos en la misma cuenta con credenciales distintas, y proyectos en cuentas distintas.

## Causa raíz

Cauce no tiene un sustantivo para esto. Los dos lugares que se le parecen no sirven:

- **`integrations/`** es para contenido de trabajo que baja a planning: sólo lectura, staging tipado,
  reconciliación y promoción (`OPS-003`). Nada de ese ciclo se aplica a secretos, y el propio README lo
  excluye: *«Nunca guardar secretos aquí»* (`template/integrations/README.md:9`).
- **`ops.config.json`** rechaza toda clave fuera de su lista (`engine/config/validate.js:21-27`), y eso
  es correcto: es la configuración del motor, no un lugar donde la empresa declare contratos propios.

Y el adaptador tampoco tiene dónde vivir: `adapter()` sólo conoce `jira` (`registry.js:40`). Eso es el
**091**, y este caso depende de él.

## Fix propuesto

Tres capas, y cada una con un dueño:

| capa | dueño | qué contiene | depende de la herramienta |
|---|---|---|---|
| **base** | Cauce | forma de la declaración, chequeo sin red, punto de extensión, flujo documentado | no |
| **adaptador** | la empresa | cliente del gestor, plantillas de CI, `check-schema` | sí |
| **servicio** | cada repositorio | `.env.schema` y lo que el adaptador genere o referencie | sólo por el adaptador |

### 1. La declaración (base)

Un archivo del proyecto —`organization/secrets.json` o `integrations/secrets/config.json`, a decidir en
el ADR— con cuatro niveles, que son los que separan los escenarios del operador:

```jsonc
{
  "schemaVersion": 1,
  "adapter": "infisical",                        // nombre del adaptador de la empresa (ver 091)
  "accounts":   { "principal": { "url": "https://app.infisical.com" } },
  "projects":   { "venotal": { "account": "principal", "id": "<project-id>",
                               "environments": ["dev", "prod"] } },
  "identities": {                                // una por nivel de acceso, nunca por repositorio
    "local-dev": { "account": "principal", "source": "file",
                   "file": "~/.config/cauce/secrets/local-dev.env", "reads": ["dev"] },
    "ci":        { "account": "principal", "source": "ci-secret", "reads": ["dev", "prod"],
                   "writes": ["dev", "prod"] }
  },
  "services": {
    "dashboard": { "root": "dashboard", "project": "venotal", "folder": "/dashboard",
                   "identity": "local-dev", "schema": ".env.schema", "branches": { "main": "prod" },
                   "delivery": "copy" }          // ver «Decisión abierta» abajo
  }
}
```

- **Compartir credenciales es apuntar al mismo alias.** Dos servicios con `identity: local-dev` leen
  el mismo archivo; rotar es editar uno. Cuentas distintas son dos entradas en `accounts`.
- **`source` separa lo que está en disco de lo que no.** Una identidad `file` tiene una ruta que el
  chequeo puede comprobar; una `ci-secret` vive en el CI y el chequeo sólo puede nombrarla. Mezclar las
  dos en un mismo campo `file` dejaba al chequeo sin poder aplicar su regla a la mitad de los casos.
- **Las credenciales no están acá, ni en ningún repositorio.** `file` es una ruta fuera de todo
  repositorio. La validación puede reusar `sensitivePath()` (`registry.js:45`): una clave con forma de
  secreto en la declaración es un error, igual que en `integrations/`.

### 2. El chequeo (base, sin red)

`ops secrets check` —o una sección de `ops check`— que no se conecta a nada:

- cada servicio declarado existe en un `workspaceRoot` y tiene su `.env.schema`;
- ningún archivo de identidad `source: file` está dentro de un repositorio, ni trackeado, ni sin
  ignorar;
- lo que el adaptador generó en cada servicio coincide con la versión del adaptador que la instancia
  tiene hoy (hash), y lista qué repositorios hay que actualizar;
- la identidad `source: file` que un servicio usa localmente existe en disco (el archivo, sin leerlo).

Lo que requiere red —comparar el `.env.schema` contra el gestor— es del adaptador, y el chequeo lo
invoca sólo si el adaptador lo declara.

### 3. El adaptador (depende del 091)

Un adaptador de la empresa, cargado por el mismo punto de extensión que decida el 091 o por uno hermano.
Una interfaz chica y sincrónica:

- `validate(config)`: errores de la declaración que sólo el adaptador entiende.
- `render(service)`: qué archivos genera en el servicio y con qué contenido (el hash sale de acá).
- `verify(service, environment)`, opcional y con red: el `.env.schema` contra el gestor.

Cauce no trae ningún adaptador. Puede traer uno de referencia en la documentación, marcado como
ejemplo, pero no en `system/`: el día que viva ahí, la empresa depende de Cauce para arreglar su CI.

### 4. El flujo, documentado en la base

Lo que hoy se le repite al agente en cada sesión, escrito una vez, y separando qué hace el agente y qué
hace una persona:

- **Adoptar un servicio:** declararlo y generar con el adaptador (agente); cargar el ambiente de
  desarrollo en el gestor, los secretos del CI y el destino de deploy (persona).
- **Mantener:** el adaptador cambia → `check` lista los servicios desactualizados → un commit por
  repositorio (o un cambio de versión, según `delivery`).
- **Rotar:** una identidad, un archivo, y `check` confirma que ningún servicio apunta a otra.
- **Dar de baja:** sacar el servicio de la declaración, y que `check` avise si quedaron archivos
  generados.

### Lo que la propuesta todavía no cubre: la copia entre instancias

**Es la pregunta que el ADR tiene que contestar primero, porque sin ella el fix no cierra su propia
evidencia.** La divergencia que motivó el caso es entre el esqueleto y un servicio **de otro proyecto**.
El chequeo de arriba compara los servicios declarados en *una* instancia contra el adaptador de *esa*
instancia. El esqueleto no es un servicio declarado, y el otro proyecto tiene —o va a tener— su propia
instancia sidecar. Con un adaptador por instancia, el de Infisical se copia una vez por proyecto: la
divergencia sube un nivel en vez de desaparecer, y el escenario de «proyectos en cuentas distintas» es
exactamente el de varias instancias.

Tres salidas, a decidir en el ADR:

| salida | qué cambia | costo |
|---|---|---|
| **Una instancia para varios proyectos** | una sidecar puede declarar `workspaceRoots` de varios proyectos, y el adaptador vive una vez | el `planning/` también pasa a ser uno; puede no ser lo que la empresa quiere |
| **El adaptador como paquete de la empresa**, versionado, que cada instancia instala | el hash se compara contra la versión publicada, no contra la copia local | un paquete más que publicar; necesita dónde (registro, git con tag) |
| **El esqueleto como consumidor declarado** | el esqueleto se genera con el adaptador igual que un servicio | sólo cubre el caso del esqueleto, no el de dos instancias |

### Decisión abierta: dónde vive lo ejecutable de cada servicio

Es la pregunta que el operador pidió dejar marcada, y la declaración la registra por servicio en
`delivery`. Tres opciones:

| opción | a favor | en contra |
|---|---|---|
| **A. Copia generada** en cada servicio, con detección de desvío por hash | no depende de GitHub ni de accesos entre repositorios; corre en cualquier CI y sin red | N copias: un arreglo son N commits (`check` al menos los lista) |
| **B. Workflow reutilizable en el repositorio de la instancia** (`<org>/<empresa>-ops/.github/workflows/env-check.yml@vN`) | una sola copia; actualizar es cambiar un tag | sólo GitHub; mezcla CI con planning en un repositorio que es sidecar; si se rompe, se rompe el CI de todos los servicios |
| **C. Repositorio de CI compartido de la empresa** (`<org>/ci-shared`) | lo mismo que B sin atar el CI a planning; se versiona aparte | un repositorio más que mantener; mismos límites de acceso que B |

Lo que decide entre B/C y A es el acceso, y está documentado, no verificado: para usar desde otro
repositorio un workflow de un repositorio **privado**, el privado tiene que habilitar *«Accessible from
repositories in the 'ORGANIZATION-NAME' organization»* ([docs de GitHub](https://docs.github.com/en/actions/how-tos/reuse-automations/share-with-your-organization),
consultado el 2026-09-10). La página habla de **organizaciones**; si los repositorios viven en una cuenta
personal no lo dice, y ahí B y C pueden no estar disponibles. La misma página advierte que los
colaboradores externos de un repositorio que llama al workflow pueden ver, por los logs, contenido del
privado. Los secretos se pasan con `secrets: inherit` sólo dentro de la misma organización o empresa;
entre organizaciones van explícitos ([docs de GitHub](https://docs.github.com/en/actions/sharing-automations/reusing-workflows),
misma fecha).

**Propuesta:** A como default de Cauce, porque es la única que no supone GitHub ni organización, y lo
agnóstico es el trabajo de la base. Dicho sin rodeos: **A no elimina las copias, las detecta**, y sólo
dentro de una instancia; es el mismo modelo que el caso denuncia más un chequeo. Lo que la vuelve
aceptable es la salida que se elija en la sección anterior. B y C quedan a elección de cada empresa en
su adaptador y se registran en `delivery`.

## Tradeoffs

- **Cauce gana un sustantivo, y eso pesa.** Se contiene con tres límites: la base no tiene código de
  red, no trae adaptadores y lo único que ejecuta es un chequeo sobre archivos locales. Si el piloto
  muestra que la base necesita saber de Infisical para funcionar, la propuesta está mal cortada.
- **El motor carga código de la empresa.** Los términos son los del 091: contención de ruta, no de
  capacidad, y una interfaz con versión.
- **Generar archivos dentro de los repositorios de producto** es un alcance que Cauce hoy no tiene:
  escribe planning, hooks y la configuración del runner. Por eso los genera el adaptador de la empresa,
  y lo generado lo trata cada repositorio como propio, con el hash sólo para detectar desvíos.
- **`.env.schema` queda definido por el adaptador, no por la base.** La base sólo lee lo mínimo para
  su chequeo (que exista y que declare nombres). Fijar el formato en Cauce resolvería el tercer dialecto
  de la evidencia, pero ataría la base a una convención de un stack.

## Piloto

Con el adaptador escrito como lo escribiría cualquier empresa: fuera de `system/`, contra la interfaz
propuesta, y sin tocar Cauce más allá de un cargador desechable.

**Un servicio no alcanza.** Con una instancia y un servicio, «el adaptador de la instancia» y «el del
servicio» son el mismo, y la divergencia que motivó el caso no puede aparecer. El piloto necesita al
menos **dos servicios de dos proyectos**, con el esqueleto entre ellos.

1. Pasar el `.env.schema` de cada servicio al formato del adaptador, sin cambiar lo que su gate de
   arranque frena.
2. Escribir la declaración y el adaptador de Infisical, en el lugar que proponga la salida elegida para
   la copia entre instancias.
3. Bajar el entorno local de cada servicio a partir del alias de la identidad.
4. Agregar el chequeo del CI por copia generada (opción A) en los dos.
5. Reintroducir a mano en el esqueleto uno de los arreglos que le faltan, y ver si el chequeo lo marca.

**Qué refutaría la propuesta (R20):**

- que para completar el piloto la base necesite algo más que la declaración y el chequeo sin red —un
  cliente del gestor, una plantilla de CI, un formato de `.env.schema`—: eso es de la base, y la capa de
  adaptador sobra o el corte está en otro lado;
- que el paso 5 no lo detecte ningún chequeo: la propuesta no resuelve el caso que la originó, por bien
  cortada que esté.

## Contexto de descubrimiento

Instancia real (sidecar, 0.79.0), 2026-09-10, al preparar el primer servicio para un host gestionado.
El operador anunció que varios proyectos van a usar Infisical —algunos con la misma cuenta y las mismas
credenciales, otros con proyectos distintos, otros en cuentas distintas— y pidió que adoptarlo no
exija repetirle a un agente, proyecto por proyecto, el mismo modelo.

La divergencia apareció al tomar el modelo como referencia: había dos candidatos y el más a mano, el
esqueleto, era el que no tenía los arreglos. Observado el 2026-09-10 sobre dos proyectos del mismo
operador, un esqueleto de servicios y un servicio derivado de él en otro proyecto:

```
$ diff <esqueleto>/web/scripts/infisical/check-schema.py <derivado>/scripts/infisical/check-schema.py
< DEFAULT_ENVS = ["local", "dev", "staging", "production"]
> DEFAULT_ENVS = ["local", "dev", "staging", "prod"]
> def ensure_folder(base_url, token, project_id, env_slug, path):
>     """Crea el folder del servicio (ej. /landing) si no existe. El create de secrets
>     exige que el folder ya exista (da 404 si no). …"""
<         base_url, "POST", "/api/v3/secrets/raw",
>         base_url, "POST", f"/api/v3/secrets/raw/{key}",
```

Tres divergencias en un solo archivo, y ninguna es cosmética:

1. **Un arreglo funcional que no llegó.** El derivado crea la carpeta antes de escribir el secreto
   (`check-schema.py:125`, llamado en `:147`); el esqueleto no, y según el comentario del propio arreglo
   la API responde 404. Todo servicio nuevo que salga del esqueleto nace con el defecto.
2. **Un nombre de ambiente distinto** (`production` / `prod`): el mismo secreto se busca en dos lugares
   según de qué copia venga el repositorio.
3. **Un arreglo de seguridad que no llegó.** El `env-check-pr.yml` del esqueleto interpola
   `${{ inputs.base_branch }}` dentro de `run:` (`env-check-pr.yml:35-36`), que es el vector de
   inyección de shell que el derivado corrigió pasándolo por `env:`.

**El punto 3 no espera a este caso.** Es un defecto vivo en un repositorio de la empresa, no en Cauce, y
se arregla en el esqueleto ahora, con el mismo cambio que ya tiene el derivado.

Y un tercer dialecto del mismo contrato: la instancia piloto ya tenía su propio `.env.schema` en otro
formato —`CLAVE=requerida|opcional`, con el lector de cada variable citado—, del que dependen un gate de
arranque y una prueba de contrato.

## Qué se corrió

Sobre 0.79.0, 2026-09-10, los dos comandos de la reproducción:

```
[
  'ops.config.json: propiedad desconocida secrets',
  'ops.config.json: runner.maxTaskHours debe ser mayor que cero',
  'ops.config.json: runner.humanCheckpointBetweenMilestones debe ser boolean',
  'ops.config.json: runner.commitPerTask debe ser boolean',
  'ops.config.json: runner.allowPush debe ser boolean'
]
No existe adaptador para infisical
```

Las cuatro líneas de `runner` salen de la configuración mínima del comando y no tienen que ver con el
caso; la que importa es la primera.

## Relacionados

- **091** — el punto de extensión de adaptadores; este caso depende de él o de uno hermano.
- **092** — el alcance del guard de secretos; la declaración de acá le daría nombres en vez de patrones.
- **`OPS-003`** — fija el límite de las integraciones de contenido de trabajo. Este caso no lo cambia;
  propone una clase distinta junto a él, y su ADR sería el hermano de aquél.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/secrets/index.js`, `engine/cli/wiring.js`, `test/wiring/secrets.test.js`,
`template/organization/README.md`, `template/planning/adr/system/OPS-007-contrato-de-secretos-compartido.md`

Las tres preguntas que el caso dejaba abiertas las contestó el operador el 2026-09-10, antes de
construir: una instancia para varios proyectos, copias canónicas comparadas por hash sin adaptador, y la
declaración en `organization/secrets.json`.

### Contra lo que el caso enumeró

- **Resolverlo con un ADR del sistema** — hecho: `OPS-007`, aceptado, con las cuatro alternativas
  descartadas y su razón.
- **Fix 1, la declaración** — hecha distinto. Vive en `organization/secrets.json` con `accounts`,
  `projects`, `identities`, `shared` y `services`. No lleva `adapter` ni `delivery`: sin adaptador no hay
  qué nombrar, y la única entrega que la base implementa es la copia. Los campos propios de la empresa
  —id de proyecto, ambientes, carpeta— se admiten dentro de cada entrada y el chequeo no los lee.
  `source` separa `file` de `ci-secret`, como proponía la segunda redacción del caso.
- **Fix 1, ningún valor en la declaración** — hecho: reusa `sensitivePath` del registro de
  integraciones, que ahora se exporta, así que la regla de qué clave tiene forma de secreto es una sola.
- **Fix 2, el chequeo sin red** — hecho como `ops secrets check <ops-root>` y no como sección de
  `ops check`: `check` valida planning y corre donde los repositorios de producto pueden no estar, y éste
  los lee. Punto por punto:
  - que cada servicio esté en una raíz y tenga su `.env.schema` — hecho;
  - que ninguna credencial viva en un repositorio — hecho, y más estricto que el enunciado («ni
    trackeado, ni sin ignorar»): dentro de la instancia, de una raíz o de cualquier árbol de git es error
    aunque esté ignorada, porque es la copia por repositorio que el caso denuncia;
  - que cada copia coincida con la canónica — hecho por hash, con el `cp` que la pone al día;
  - que la identidad esté en disco — hecho distinto: advertencia y no error, porque en el CI una
    identidad `file` no está y no tiene por qué;
  - lo que necesita red, el `.env.schema` contra el gestor — se decidió que no: queda en los scripts de
    la empresa, que la base no invoca.
- **Fix 3, el adaptador** — se decidió que no: las copias canónicas detectan el desvío sin cargar código
  de la empresa. El **091** queda abierto y deja de ser requisito de éste.
- **Fix 4, el flujo documentado** — hecho en `template/organization/README.md`: adoptar, mantener, rotar
  y dar de baja, separando lo que hace el agente de lo que carga una persona. Que el guard `secrets`
  frena la escritura de `.env.infisical` se comprobó corriéndolo en el 092.
- **La copia entre instancias** — decidido: una instancia, varios proyectos. `validateOpsConfig` sobre la
  configuración del piloto, con 16 raíces en cuatro árboles distintos, no devolvió ningún error de raíz
  (el único fue `runner` ausente, que el piloto no declara).
- **Delivery A, B o C** — A es lo implementado. B y C quedan a cada empresa sin campo en la declaración,
  porque la base no haría nada distinto con él.
- **Tradeoff «Cauce gana un sustantivo»** — contenido como el caso pedía: `engine/secrets/index.js` no
  tiene código de red (buscar `http`, `fetch` y `node:net` en el archivo no devuelve nada), no trae
  adaptadores y sólo lee archivos locales.
- **Tradeoff «el motor carga código de la instancia»** — no aplica: no carga nada.
- **Tradeoff «generar archivos en los repositorios de producto»** — no se genera: el chequeo imprime el
  `cp`, y copiar lo hace quien mantiene el repositorio.
- **Tradeoff «`.env.schema` lo define el adaptador»** — la base sólo comprueba que exista. El formato
  sigue siendo de la empresa, y el tercer dialecto de la evidencia no se resuelve acá.
- **Piloto** — corrido sobre repositorios reales, en solo lectura, desde una instancia desechable. Paso
  por paso: pasar cada `.env.schema` al formato de un adaptador (1) dejó de aplicar sin adaptador; la
  declaración (2) y el chequeo (4) se hicieron; bajar el entorno local (3) es del gestor y la base no lo
  ejerce; reintroducir un arreglo faltante en el esqueleto (5) no hizo falta, porque el esqueleto ya
  estaba atrás y el chequeo lo marcó. El piloto tuvo dieciséis servicios de cuatro proyectos, no uno.
- **Las dos refutaciones (R20)** — ninguna se cumplió: el piloto se completó con la declaración y el
  chequeo, sin cliente del gestor ni plantilla de CI; y la divergencia del esqueleto la marcó el chequeo.
- **La inyección de shell en el `env-check-pr.yml` del esqueleto** — le toca a la empresa, no a Cauce.
  Sigue ahí al cerrar (releído el 2026-09-10, líneas 35-36) y se le reportó al operador.
- **Relacionados** — el 091 y el 092 siguen abiertos, cada uno con su propia pregunta.

### Lo que el caso no preveía

- **Hay tres variantes, no dos.** De dieciséis copias, doce coinciden entre sí —el esqueleto entre
  ellas—, tres de otro proyecto comparten una segunda variante, y sólo una tiene el arreglo de la carpeta.
  El esqueleto ya no difiere del resto como decía la evidencia: difiere de la única copia arreglada. El
  chequeo no necesita saber cuál es la buena; la elige la instancia al guardar la canónica.
- **La identidad por repositorio existe tal cual.** El derivado tiene su `.env.infisical`, ignorado por
  git y no trackeado, y el chequeo lo marca como error.

### Qué se corrió

- `node --test test/wiring/secrets.test.js`: siete pruebas en verde, que recorren los dos lados de cada
  regla —la copia al día no se reporta, la credencial ausente avisa sin fallar—.
- **Once mutaciones del módulo, en una copia desechable del repositorio (R23)**, cada una comprobada
  aplicada antes de contar, todas en rojo:

  ```
  M1 no compara hashes                           fail 1 → ROJA
  M2 no mira si la credencial cae en una raíz    fail 1 → ROJA
  M3 no le pregunta a git                        fail 1 → ROJA
  M4 no busca claves con forma de secreto        fail 1 → ROJA
  M5 toda ruta queda adentro                     fail 4 → ROJA
  M6 las referencias no se cotejan               fail 1 → ROJA
  M7 la copia ausente no se reporta              fail 1 → ROJA
  M8 la identidad ausente no avisa               fail 1 → ROJA
  M9 cuenta al día a todos                       fail 1 → ROJA
  M10 una ci-secret con file pasa                fail 1 → ROJA
  M11 una clave desconocida pasa                 fail 1 → ROJA
  ```

  Quitar `GIT_DIR` del entorno de `inRepository` no tenía mutación al cerrar. La revisión de huecos antes
  del merge le agregó una prueba —el chequeo da lo mismo con y sin un `GIT_DIR` heredado que apunta a otro
  repositorio— y la mutación que deja de quitarlo la pone en rojo (`fail 1`).
- **Piloto real**: una instancia con los dieciséis repositorios como raíces y la copia arreglada como
  canónica. `node engine/cli/ops.js secrets check <piloto>` salió con código 1 y esto, recortado el `cp`
  de cada línea:

  ```
  ⚠ identities.local-dev: ~/.config/cauce-piloto/local-dev.env no está en esta máquina; …
  ✗ identities.copiada: ~/Code/<derivado>/.env.infisical está dentro de ~/Code/<derivado>; …
  ✗ services.<proyecto>-account: scripts/infisical/check-schema.py no coincide con organization/secrets/check-schema.py
  … (quince servicios en total, el esqueleto entre ellos; el derivado no aparece)
  16 error(es) en el contrato de secretos
  ```
  Las once se volvieron a correr después de cambiar el fixture de la prueba —la identidad pasó a no
  existir en disco, para que el resultado no dependa de si el temporal cae dentro de un repositorio— y
  dieron lo mismo: once en rojo, y la prueba sin mutar siete de siete.
- `npm run ci` sobre el árbol final de la rama: código 0, 679 pruebas y 679 en verde, cobertura de 58
  archivos en su piso o por encima. `engine/secrets/index.js` quedó en 94.71 de líneas, 80.72 de ramas y
  100 de funciones; su piso se registró a mano en 93/80/100, porque `coverage:update` reescribe el
  registro entero y habría movido pisos de archivos que este cambio no toca.

### Recorrido de la auditoría (2026-09-12)

- **La condición de escalada del encabezado** —«sube a **alta** si un segundo proyecto adopta el modelo
  antes de que haya dónde declararlo»— **quedó imposible con este mismo cambio**: el lugar donde declararlo
  es `organization/secrets.json`, que salió acá, y el piloto corrió con cuatro proyectos usándolo. No puede
  volver a darse la situación que la disparaba. La auditoría lo marcó como el único ítem que este cierre
  había dejado sin recorrer.
