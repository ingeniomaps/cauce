---
caso: 111
titulo: Una variable huérfana deja de avisarse si el mapa nombra otra que la contiene
estado: resuelto
resuelto-en: 0.82.0
prioridad: baja
version-detectada: 0.81.0
---

# 111 — `orphanCredentials` busca el nombre como subcadena, y `API_SECRET_ROTATION` tapa a `API_SECRET`

**🟢 resuelto en 0.82.0** · detectado en 0.81.0 · prioridad **baja** — calla un aviso que debía salir, sin exponer nada; sube
a **media** si el caso 102 filtra el aviso a sólo credenciales, porque entonces lo que se calla es justo lo que
importa

## Resumen

`check` avisa las variables que un servicio declara y que nadie carga —ni el mapa del proyecto ni
`HUMAN_ACTIONS.md` las nombra—. Decide si una variable está nombrada buscándola como subcadena del texto de
esos archivos, así que basta que aparezca otro nombre que la contenga para darla por cargada. Es un falso
negativo: el aviso que tenía que salir no sale, y nada lo dice.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: una instancia embebida con una épica —recién creada el
aviso no corre—, un servicio que declara `API_SECRET`, y una línea del mapa que nombra otra variable.

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js; A=$BANCO/embebido
node $OPS init $A --mode embedded --runner ninguno --no-install >/dev/null
mkdir -p $A/api
printf '{"name":"api","scripts":{"test":"node --test"}}\n' > $A/api/package.json
printf 'IMAGE_NAME=api\nAPI_SECRET=\n' > $A/api/.env.example
cp $A/planning/roadmap/epic-000-template.md $A/planning/roadmap/epic-001-primera.md
sed -i 's/^status: template/status: open/; s/^epic: .*/epic: 001/' $A/planning/roadmap/epic-001-primera.md
node $OPS check $A/planning 2>&1 | grep 'nadie las carga'
printf '\nLa imagen sale de DOCKERFILE_PATH; ver API_SECRET_ROTATION.\n' >> $A/organization/workspace.md
node $OPS check $A/planning 2>&1 | grep 'nadie las carga'
```

## Síntoma

Salida real, 2026-09-11, sobre `main` = `1930a1ca` (0.81.0):

```
⚠ el proyecto declara IMAGE_NAME (api), API_SECRET (api) y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
⚠ el proyecto declara IMAGE_NAME (api) y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga
```

`API_SECRET` desaparece del aviso sin que nadie le haya asignado dueño: lo que el mapa nombra es
`API_SECRET_ROTATION`, otra variable.

## Causa raíz

`engine/core/onboarding.js:105-108` junta el texto de `organization/workspace.md`, `AGENTS.md` y
`planning/HUMAN_ACTIONS.md` en una sola cadena, y `onboarding.js:113` decide con
`contracts.includes(name)`: una búsqueda de subcadena, sin límite de palabra.

## Fix propuesto

Comparar el nombre entero: una aparición cuenta si lo que va antes y después no puede ser parte de un nombre
de variable —`[A-Za-z0-9_]`—. Una expresión con esos límites, armada por nombre, alcanza.

## Tradeoffs

- Una variable escrita pegada a otra palabra, como `API_SECRETx`, deja de contar como nombrada; es la conducta
  correcta, y no hay un caso real de lo contrario.
- Un nombre escrito con otro formato en el mapa —`api_secret`, en minúsculas— sigue sin contar, igual que hoy.

## Qué tiene que probar el cierre

- La reproducción de arriba sigue listando `API_SECRET` en la segunda corrida, vista en rojo con el código
  de hoy.
- Una variable nombrada entera en el mapa sigue sin avisarse.
- Una mutación que vuelve a la búsqueda de subcadena se pone roja.

## Cierre

Resuelto en 0.82.0, en la misma rama que el **102**: los dos tocan `orphanCredentials`, y el filtro del 102
era la condición con la que este caso subía a prioridad media. Con el filtro puesto, lo único que la
subcadena podía esconder era una credencial, así que se arreglaron juntos y la subida no llegó a regir.

Recorrido de lo que el caso enumeró:

- **Fix propuesto** — hecho como estaba escrito. `named()` en `engine/core/onboarding.js` busca el nombre
  con un límite a cada lado: ni antes ni después puede haber un `[A-Za-z0-9_]` (lookbehind y lookahead). No
  hace falta escapar nada, porque el escaneo sólo deja pasar identificadores (`^[A-Za-z_][A-Za-z0-9_]*$`,
  en `expectedEnv` de `scan.js`).
- **Tradeoff «pegada a otra palabra»** — aceptado tal como estaba escrito: `API_SECRETx` deja de contar
  como nombrada. La prueba mira los dos lados por separado: `API_SECRET_ROTATION` contiene el nombre al
  principio y `LEGACY_API_SECRET` al final, y ninguno de los dos la da por cargada.
- **Tradeoff «otro formato en el mapa»** — sin cambio, como el caso anticipaba: `api_secret` en
  minúsculas sigue sin contar. Nadie pidió admitirlo, y no se decidió.
- **«La reproducción sigue listando `API_SECRET` en la segunda corrida, vista en rojo con el código de
  hoy»** — hecho. En rojo: la prueba nueva, corrida sobre un `git archive HEAD` (`437170a8`), falla con
  `actual: '⚠ el proyecto declara IMAGE_NAME (api) y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie
  las carga'` contra `expected: /API_SECRET \(api\)/`. En verde, la reproducción del caso contra el
  arreglo; ver «Qué se corrió».
- **«Una variable nombrada entera sigue sin avisarse»** — hecho. En la reproducción, después de agregar
  `- API_SECRET: la carga el equipo de infra.` a `organization/workspace.md` el aviso no sale (`grep`
  termina en 1); en la prueba, `assert.equal(orphanLine(ops), '')`.
- **«Una mutación que vuelve a la búsqueda de subcadena se pone roja»** — hecho, en una copia desechable
  del worktree: volver a `contracts.includes(name)` pone roja «una variable cuenta como nombrada sólo si
  aparece entera», y también la ponen roja quitar sólo el límite de antes y quitar sólo el de después.

Lo que el enunciado no preveía: la reproducción del caso ya no muestra `IMAGE_NAME`, porque con el 102
aplicado una variable de configuración no entra al aviso. La segunda corrida sigue probando lo que el caso
pedía: `API_SECRET` no desaparece al nombrar `API_SECRET_ROTATION`.

### Qué se corrió

La reproducción de arriba, literal, contra el worktree, más una tercera corrida con la variable nombrada
entera:

```
⚠ credenciales por nombre sin dueño (1, en api): API_SECRET (api) — no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga. El dueño se escribe en organization/workspace.md o en una fila de planning/HUMAN_ACTIONS.md; el criterio es el nombre, así que una credencial con nombre de configuración no aparece acá
⚠ credenciales por nombre sin dueño (1, en api): API_SECRET (api) — no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga. El dueño se escribe en organization/workspace.md o en una fila de planning/HUMAN_ACTIONS.md; el criterio es el nombre, así que una credencial con nombre de configuración no aparece acá
grep tras nombrarla entera: 1
```

- `node --test test/planning/orphan-credentials.test.js` sobre `git archive HEAD`: 5 de 5 en rojo. Sobre
  el worktree, las 5 más `planning.test.js`: 19 de 19 en verde.
- Mutaciones en la copia desechable, cada una comprobada aplicada antes de correr: volver a la subcadena,
  quitar el límite de antes y quitar el de después. Las tres en rojo.

## Contexto de descubrimiento

2026-09-11, mejorando el caso 102 antes de arreglarlo: al probar que una variable nombrada en el mapa deja de
avisarse, una que no estaba nombrada también se calló.

## Relacionados

- **102** — el mismo aviso: aquel es ruido —avisa lo que no es credencial—; éste es silencio.
