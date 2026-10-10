---
caso: 364
titulo: los recorridos instalados quedan modificados en git fuera de la carpeta original
estado: resuelto
resuelto-en: 0.106.1
prioridad: baja
version-detectada: 0.105.0
---

# 364 — En una instancia embebida con el runner en git, instalarlo en cualquier carpeta que no sea la original deja nueve archivos modificados para siempre: llevan escrita una ruta de esa máquina

**🟢 resuelto en 0.106.1** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: no rompe nada. Es ruido permanente en `git status` de cada clon y de cada línea, y una
invitación a commitear una ruta de máquina. Pide una decisión del dueño, no un arreglo.

## Resumen

Los recorridos de un runner llevan escrita la raíz absoluta de la instancia (caso 139). En una instancia
embebida esos archivos viven en el repositorio, y el molde no los ignora. Quien los commitea, commitea su
ruta. Cada otra carpeta —el clon de un compañero, una línea de trabajo— los reinstala con la suya y queda
con los nueve modificados.

El manifiesto ya no cambia por esto (caso 275) y la instalación ya no se niega (caso 363). Lo que queda es
el archivo.

## Reproducción

Instancia embebida, `automation install . claude`, commitear `.claude/`, y `ops line . auth` o un clon en
otra ruta con su `automation install`.

## Síntoma

Medido el 2026-10-09 en una línea de una instancia embebida:

```
$ git status --short
 M .claude/workflows/agent-eval.js
 M .claude/workflows/autobuild.js
 M .claude/workflows/flow.js
 …                                  # nueve
```

El único cambio en cada uno es la línea `const ROOT = '…'`.

## Causa raíz

Un archivo generado, con un dato de la máquina adentro, en un lugar que se versiona.

## Fix propuesto

Es una de dos, y elegir es del dueño:

1. **Que el molde ignore esos archivos** en una instancia embebida. Cada persona instala su runner, que es
   lo que ya tiene que hacer hoy porque la ruta es de su máquina.
2. **Que el archivo no lleve la ruta**: que el recorrido la reciba al correr. Es lo que el caso 139 descartó
   porque el runtime de workflows no expone de dónde se lo lanzó.

### Recomendación, a la espera de la decisión

La primera, acotada: que el molde ignore **sólo** `.claude/workflows/`, no `.claude/` entero. Medido en una
línea embebida, lo único que queda modificado son esos nueve archivos, once líneas en total, y en cada uno
la línea de la ruta; `settings.json`, los agentes y los punteros a cargos no llevan ninguna ruta y conviene
compartirlos. En sidecar ya es así: la configuración del runner vive fuera del repositorio y cada persona la
instala. Y la segunda salida es la que el caso 139 descartó midiendo.

Lo que pide además: que `check` avise, con el comando exacto, a quien ya tiene esos archivos en git. Y queda
a medias para Codex y Antigravity, donde la ruta va en una configuración que se mezcla con la del usuario y
no se puede ignorar entera.

No se hizo junto con el 363 porque cambia lo que un equipo comparte por git, y no está medido sobre una
instancia embebida con más de una persona.

## Valor

Bajo: saca nueve archivos modificados de cada clon y cada línea de una instancia embebida.

## Qué podría salir mal

1. **Ignorarlos cambia lo que un equipo comparte por git**: un clon nuevo no tiene recorridos hasta instalar.
2. **Quien ya los tiene commiteados** los sigue teniendo hasta sacarlos del índice a mano.

## Cierre

**Resuelto en 0.106.1**, con la primera de las dos salidas, que es la que el dueño eligió el 2026-10-10: el
molde ignora lo que lleva la ruta, y sólo eso.

### El recorrido de lo que este caso enumeró

- **Fix 1, que el molde ignore esos archivos — se hizo.** `gitignore` trae `.claude/workflows/` y el puente
  de Antigravity. Lo demás del runner —`settings.json`, agentes, punteros a cargos— sigue viajando.
- **Fix 2, que el archivo no lleve la ruta — se decidió que no**, por lo que el caso 139 midió.
- **Qué podría salir mal 1, un clon nuevo sin recorridos hasta instalar — se acepta, y `check` lo dice.** Es
  lo que ya pasa en sidecar. La primera versión lo daba por «un fallo que se ve» y no se veía en `check`: está
  en la revisión, más abajo.
- **2, quien ya los tiene commiteados — cubierto con un aviso.** El `.gitignore` es de la empresa y `upgrade`
  no lo toca, así que la instancia que nació antes no recibe la línea. `check` le dice cuáles agregar y, si
  ya están en git, con qué comando sacarlos sin borrarlos del disco.
- **La recomendación pedía que `check` avisara con el comando exacto — se hizo.**
- **«Queda a medias para Codex» — sigue así, y se dice.** Ahí la ruta va en `.codex/hooks.json`, donde
  conviven las entradas del usuario: no se manda a ignorar un archivo suyo.

### Lo que este caso encontró y no preveía

- **No eran sólo los nueve recorridos de Claude.** Con los cuatro runners instalados en una instancia
  embebida, la ruta queda también en el puente de Antigravity. Qué archivos son no se enumera en el motor:
  sale de las plantillas de cada runner instalado, las que traen el marcador de la raíz.
- **El manifiesto de Cauce también lleva una ruta de máquina cuando está Codex**: anota los comandos de
  hooks que entregó, con la raíz absoluta, y ese archivo viaja por git. No se tocó: la configuración de
  Codex viaja con esa misma ruta, y las dos se leen juntas para saber qué entradas son nuestras. Cambiar una
  sola las dejaría sin coincidir.
- **Una condición del aviso era redundante.** Se había escrito «lo que git ya tiene, o lo que no ignora», y
  la mutación que quitaba la primera mitad no ponía nada en rojo: git nunca da por ignorado lo que ya tiene
  en el índice. Se quitó, y queda dicho por qué alcanza con la segunda.

### Qué se corrió

- **Sobre una instancia embebida de verdad, creada antes del cambio, con los cuatro runners instalados**:

  ```
  $ node tools/ops.js check planning
  ⚠ 10 archivo(s) del runner llevan escrita la ruta de esta carpeta y git no los ignora
    (.claude/workflows/, .agents/plugins/cauce/hook.js): en git, cada clon y cada línea de trabajo los ve
    modificados. Son generados, los rehace automation install; agregá esa(s) línea(s) a tu .gitignore.
  ```

  Con las dos líneas agregadas, cero avisos.
- **La línea de una instancia nueva nace limpia**: `git status` vacío después de `ops line`, con los
  recorridos de la línea apuntando a ella. Es la medición del síntoma, al revés.
- Rojo previo: la prueba nueva de `test/wiring/lines.test.js`.
- Cinco mutaciones en rojo: sin la línea en el molde, sin el aviso, sin decir cómo sacarlos de git, avisando
  también de lo que git ignora, y avisando de todo archivo del runner lleve ruta o no.

### Lo que encontró la revisión (2026-10-10)

Una revisión independiente del diff, antes del PR. Cuatro hallazgos, reproducidos en un banco, y los cuatro
se arreglaron:

- **Con un acento en la ruta de la carpeta el aviso no se apagaba nunca.** A git se le preguntaba qué
  ignora sin `-z`, y sin eso escribe entre comillas y con escapes toda ruta que no sea ASCII:
  `"…/jos\303\251/.claude/workflows/autobuild.js"`. No coincidía con la nuestra, así que la línea ya puesta
  en el `.gitignore` no contaba. Ahora las rutas van y vuelven separadas por un byte nulo.
- **Por un enlace a la instancia dictaba una línea que no sirve**, `../via-link/.claude/workflows/`, y no
  decía que los archivos ya estaban en git. Git contesta con rutas reales y las nuestras eran las escritas.
  La raíz se resuelve antes de preguntar.
- **Un recorrido propio que lleva la ruta quedaba fuera.** Los de `workflows/` de la empresa se generan en
  la misma carpeta y pueden traer la raíz. No se contaban, y además impedían dictar la carpeta: salían
  nueve líneas sueltas, y siguiéndolas al pie el propio quedaba en git. Ahora entra el que lleva la ruta, y
  la carpeta se dicta entera cuando todo lo que tiene es generado. Un archivo escrito a mano ahí sí lo
  impide, porque ignorar la carpeta lo sacaría de git a él.
- **El clon no se enteraba de que le faltaban los recorridos.** `check` salía en verde y sin avisos, y sólo
  `automation doctor` lo mostraba. Ahora `check` avisa: «a claude le faltan 9 archivo(s) que se generan en
  cada carpeta y no viajan por git … Rehacelos con node tools/ops.js automation install . claude». Qué
  runner se instaló lo dice el manifiesto de Cauce, que sí viaja. Por eso una `.claude/settings.json` de
  la persona, con un runner que Cauce no instaló, no hace avisar.

De la otra mitad que se le pidió —lo que el 362 y el 363 corrigieron después de su propia revisión— no
encontró nada fuera de los límites ya escritos. Esa parte la leyó, no la corrió.

Rojo previo de las cuatro, cada una por lo suyo, en `test/wiring/machine-bound.test.js`. Siete mutaciones
en rojo: preguntar sin `-z`, no resolver la raíz, no contar los propios, no tomarlos por generados, no
avisar de lo que falta, avisarlo sin mirar el manifiesto, y dictar la carpeta siempre. La primera corrección
del acento también falló: `git check-ignore -z` contesta «-z solo tiene sentido con --stdin», y lo dijo la
prueba.

### Lo que encontró la segunda revisión (2026-10-10)

Acotada a lo que la primera había arreglado. Seis hallazgos, reproducidos, y los seis se atendieron:

- **Con la instancia en una subcarpeta del repositorio no decía lo que ya estaba en git.** `git ls-files`
  contesta relativo a la carpeta desde la que se pregunta y se leía como relativo a la raíz. Ahora se pide
  con `--full-name`, y el aviso dice desde dónde se leen las rutas cuando la instancia no es la raíz.
- **El clon no se enteraba si la configuración del runner tampoco viajaba.** El aviso de lo que falta
  exigía que `settings.json` estuviera. Alcanza con que el manifiesto diga que Cauce entregó el runner.
- **El aviso le atribuía recorridos a Antigravity**, que lo que pierde es el puente por el que corren sus
  guards. Ahora dice que sin esos archivos el runner no funciona entero, sin nombrar cuáles.
- **Un archivo borrado a mano se diagnosticaba como clon.** El aviso es el mismo y la salida también; el
  texto dejó de afirmar la causa: «un clon nace sin ellos», no «éste es un clon».
- **Un propio cuya fuente se borró dejaba de contar**, con la ruta todavía escrita adentro. Se juzga por lo
  que quedó escrito y no por su fuente, y vale también la ruta como se la nombró al instalar por un enlace.
- **Se rendían las plantillas de todo runner en cada `check`.** Ahora sólo las de un archivo que está o que
  se entregó. `check` sobre una instancia embebida con dos runners: 0,13 s.

Rojo previo de las cuatro que cambian una respuesta. Trece mutaciones en rojo: las siete de antes y, de
ésta, pedir sin `--full-name`, exigir la configuración, no decir desde dónde, decirlo siempre, juzgar al
propio por su fuente y aceptar sólo la ruta resuelta. Dos sobrevivieron la primera vez —decirlo siempre y
aceptar sólo la ruta resuelta— y cada una se llevó su caso de prueba.

### Con Antigravity, en una instancia embebida (2026-10-10)

Lo que el 363 y este caso habían corrido sólo con Claude. Instancia embebida con `antigravity` y `gemini`,
commiteada con un `git add` de todo:

```
original   git status vacío · el puente no está en git · check sin avisos
línea      git status vacío · el puente apunta a la línea, el del original a la original · check sin avisos
clon       ⚠ a antigravity le faltan 1 archivo(s) que se generan en cada carpeta y no viajan por git
           (en .agents/plugins/cauce/) … Rehacelos con node tools/ops.js automation install . antigravity
           después de instalar: sin avisos, git status vacío
```

### Sobre las instancias reales de la máquina (2026-10-10)

`check` con el motor instalado en cada una y con el de la rama, dentro de una jaula de sólo lectura, sobre
cinco instancias reales en versiones de 0.99.0 a 0.106.0. Ninguna recibe un aviso de este caso: son sidecar
y la configuración del runner vive fuera de su repositorio, que es justo donde el aviso no tiene nada que
decir. En la que ya está en 0.106.0 la salida es idéntica, 72 avisos contra 72; en las más viejas lo que
cambia son avisos de versiones anteriores a ésta.

## Contexto de descubrimiento

Quedó a la vista al cerrar el caso 363: con la instalación ya andando en la línea, los archivos seguían
modificados.

## Relacionados

- **363** — de donde sale: la instalación que se negaba por esa misma ruta.
- **139** — por qué la ruta viaja escrita.
- **275** — lo mismo, resuelto para el manifiesto.
