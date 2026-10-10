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
- **Qué podría salir mal 1, un clon nuevo sin recorridos hasta instalar — se acepta.** Es lo que ya pasa en
  sidecar, y es un fallo que se ve: el recorrido no existe, en vez de existir apuntando a otra carpeta.
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

## Contexto de descubrimiento

Quedó a la vista al cerrar el caso 363: con la instalación ya andando en la línea, los archivos seguían
modificados.

## Relacionados

- **363** — de donde sale: la instalación que se negaba por esa misma ruta.
- **139** — por qué la ruta viaja escrita.
- **275** — lo mismo, resuelto para el manifiesto.
