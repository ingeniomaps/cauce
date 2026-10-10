---
caso: 363
titulo: en una línea embebida, los recorridos commiteados siguen apuntando a la carpeta original
estado: resuelto
resuelto-en: 0.106.0
prioridad: alta
version-detectada: 0.105.0
---

# 363 — En una instancia embebida con la configuración del runner commiteada, `ops line` no logra reinstalar el runner en la línea: los recorridos que quedan ahí llevan escrita la carpeta original, y la línea se arma igual

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **alta**.

**Prioridad alta**: un recorrido lanzado desde la línea dicta sus comandos contra la carpeta original. Es la
otra sesión —su planning, su checkout— la que recibe el trabajo de ésta. Y `ops line` contesta `✓`.

## Resumen

Desde 0.89.0 los recorridos llevan escrita la raíz absoluta de la instancia, porque dictan comandos a agentes
cuyo directorio nadie promete (caso 139). El motor dice el costo: el archivo se rompe si el proyecto cambia
de carpeta, y se repara reinstalando el runner.

Una línea de una instancia embebida es el repositorio entero en otra carpeta. Si `.claude/` está en git
—nada del molde lo ignora—, la línea nace con los recorridos de la carpeta original. `ops line` reinstala el
runner para eso, pero la instalación compara cada archivo con lo que instaló antes, ve la ruta distinta, los
toma por editados a mano y se niega. La línea queda armada con los recorridos viejos.

## Reproducción

```bash
ops init . --mode embedded          # sobre un repositorio con código
node tools/ops.js automation install . claude
git add .claude CLAUDE.md …  &&  git commit
node tools/ops.js line . auth
grep '^const ROOT' ../<repo>-auth/.claude/workflows/autobuild.js
```

## Síntoma

Corrido el 2026-10-09 sobre un banco armado así:

```
$ node tools/ops.js line . auth
9 archivo(s) que mantiene Cauce fueron editados y se perderían:
- .claude/workflows/autobuild.js
- .claude/workflows/flow.js
- …
Son del toolkit: en vez de editarlos, agregá lo tuyo al lado y registralo en la
configuración de tu runner. Si el cambio ya no te sirve, repetí con --force.

$ grep '^const ROOT' ../prod-auth/.claude/workflows/autobuild.js
const ROOT = '…/emb/prod'…           # la carpeta original, no la de la línea
```

La línea quedó creada. Nadie editó esos archivos: los escribió `automation install` un paso antes. Con
`automation install . claude --force` desde la línea, la raíz pasa a ser la de la línea y el recorrido
corre bien —la corrida real que siguió fue de Triage al checkpoint—, pero los nueve archivos quedan
modificados en git para siempre en esa línea.

Lo que **no** se corrió: un recorrido lanzado desde la línea sin el `--force`. Que trabajaría sobre la
carpeta original se deduce de la raíz que lleva escrita, no se midió.

## Causa raíz

- `engine/automation/runners.js`, `render` — `{{OPS_ROOT}}` se reemplaza por la raíz absoluta al instalar.
- `engine/cli/lines.js`, `line` — llama a `install` en la línea con la salida silenciada, y no mira si
  instaló.
- La comprobación de «editado a mano» de `install` compara contra lo que registró el manifiesto, que viaja
  por git con la ruta de la otra carpeta.

## Fix propuesto

Dos partes, y la segunda es una decisión:

1. Que `ops line` no dé por armada una línea cuyo runner no pudo instalar: que lo diga y salga distinto de
   cero, o que instale sabiendo que la diferencia es la raíz y no una edición.
2. Decidir qué se hace con un archivo generado que lleva una ruta de máquina y vive en un repositorio que se
   commitea: ignorarlo en el molde, o dejar de escribir la ruta en él.

## Valor

Alto para quien use líneas con una instancia embebida: hoy la línea puede terminar trabajando sobre la
carpeta de otra sesión sin que nada lo diga.

## Qué podría salir mal

1. **Pisar una edición de verdad.** La comprobación existe para no perder lo que una persona cambió. Hay que
   distinguir «difiere sólo en la raíz» de «alguien lo tocó».
2. **Ignorar `.claude/workflows` en el molde** cambia lo que un equipo comparte por git: cada persona tendría
   que instalar el runner. Hoy ya tiene que hacerlo, porque la ruta es de cada máquina.
3. **Sidecar no se toca**: ahí la configuración del runner vive en la carpeta de sesión, fuera del
   repositorio, y `ops line` la instala en la de la línea.

## Cierre

**Resuelto en 0.106.0**, y más general de lo que el caso pedía: no era sólo de las líneas.

### El recorrido de lo que este caso enumeró

- **Fix 1, que `ops line` no dé por armada una línea sin runner — se hizo.** Si la instalación falla, el
  comando sale distinto de cero, no imprime `✓`, y dice que el árbol se creó y la línea quedó sin su runner.
- **Fix 1, «o que instale sabiendo que la diferencia es la raíz» — se hizo, y es lo que resuelve el caso.**
  La instalación lee del propio archivo la raíz que lleva escrita y acepta lo anotado con ésa. No hace falta
  decirle de dónde viene el árbol.
- **Fix 2, qué hacer con un archivo generado que lleva una ruta de máquina — no se decidió acá.** Salió
  como el caso [364](./364-los-recorridos-instalados-quedan-modificados-en-git-fuera-de-la-carpeta-original.md).
- **Qué podría salir mal 1, pisar una edición de verdad — cubierto.** La raíz leída sólo se acepta si,
  vuelta marcador, da el hash anotado: un archivo editado a mano no lo da, venga de la carpeta que venga.
- **2, ignorar `.claude/workflows` en el molde — no se tocó**: es la decisión del 364.
- **3, sidecar no se toca — cierto**: ahí la línea no trae esos archivos por git.

### Lo que este caso encontró y no preveía

**No era de las líneas.** Un clon del repositorio en otra ruta —el de un compañero— se negaba a instalar el
runner por lo mismo, y con el motor de `main` también. La primera versión del arreglo le decía a la
instalación de qué carpeta venía la línea; reproducir el clon mostró que eso dejaba afuera la mitad del
problema, y se cambió por leer la raíz del archivo, que cubre los dos y un proyecto movido de carpeta.

### Qué se corrió

- **Sobre un banco embebido de verdad**, con el runner commiteado:

  ```
  $ node tools/ops.js line . auth
  ✓ …/prod-auth  (line/auth)
  prod:       const ROOT = '…/prod'
  prod-auth:  const ROOT = '…/prod-auth'

  $ git clone prod clon && cd clon && node tools/ops.js automation install . claude
  ✓ claude: adaptador operativo (0 advertencia(s))
  clon:       const ROOT = '…/clon'
  ```

  Y con un recorrido editado a mano y commiteado, `ops line` sale con código 1, nombra el archivo y dice que
  la línea quedó sin su runner.
- Rojo previo: las pruebas nuevas de `test/wiring/lines.test.js`, con el mensaje del síntoma.
- Tres mutaciones, cada una en rojo: sin mirar la raíz escrita, aceptando cualquier archivo que tenga una, y
  tragándose el error de la instalación.

Lo que no se corrió: un recorrido lanzado desde una línea armada con el motor anterior, sin reinstalar. Que
trabajaría sobre la carpeta original sigue siendo una deducción de la raíz que lleva escrita.

### Lo que encontró la revisión independiente

Cuatro hallazgos sobre este arreglo:

- **Con Codex la línea embebida seguía sin armarse** (reproducido), y el mensaje nuevo mandaba a un arreglo
  que no existía. Ahí lo que lleva la ruta es la configuración de hooks, y la frenaba otra defensa: la que
  no mueve los guards de una carpeta de sesión que otro árbol comparte. La carpeta de una línea es sólo
  suya, así que `ops line` lo declara y la instalación los mueve. Probado con una instancia embebida con
  Codex: los guards de la línea apuntan a la línea y los del original no se tocaron.
- **Lo que sigue al marcador puede aparecer adentro de la raíz** (leído): con `/a` después, una raíz como
  `/srv/alicia/…` se cortaba antes de tiempo. Ahora se prueba cada lugar donde la raíz podría terminar.
- **Un archivo de una plantilla anterior que además viajó de carpeta no se reconoce** (leído) — **queda
  como límite.** La raíz se ubica con el texto de la plantilla de hoy. Ese caso sigue pidiendo `--force`,
  que es lo que pasaba antes para todos.
- **Quien cambie a mano sólo la raíz escrita en un recorrido ya no frena la instalación** (reproducido), ni
  en una instancia que no se movió — **se decidió que no cambia.** Es indistinguible de un archivo que
  viajó, y esa línea es justo lo que la instalación administra: reinstalar deja la raíz correcta.

Y uno de costo que tampoco se cambia: la instalación arma la plantilla una segunda vez por cada archivo que
no está al día. Pasa en `install` y `doctor`, no en cada escritura.

Seis mutaciones en rojo entre las correcciones de este caso y las del 362.

## Contexto de descubrimiento

Al armar la línea para la corrida real de `/autobuild` en una instancia embebida, hecha para comprobar el
guard del caso 360 en esa disposición.

## Relacionados

- **139** — por qué los recorridos llevan la raíz absoluta.
- **218** — la carpeta de sesión de una línea y dónde se instala su runner.
- **275** — el otro archivo que la línea embebida dejaba sucio en git.
