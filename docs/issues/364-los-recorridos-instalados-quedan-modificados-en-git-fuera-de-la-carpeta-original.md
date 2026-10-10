---
caso: 364
titulo: los recorridos instalados quedan modificados en git fuera de la carpeta original
estado: abierto
prioridad: baja
version-detectada: 0.105.0
---

# 364 — En una instancia embebida con el runner en git, instalarlo en cualquier carpeta que no sea la original deja nueve archivos modificados para siempre: llevan escrita una ruta de esa máquina

**🔴 abierto** · detectado en 0.105.0 · prioridad **baja**.

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

## Contexto de descubrimiento

Quedó a la vista al cerrar el caso 363: con la instalación ya andando en la línea, los archivos seguían
modificados.

## Relacionados

- **363** — de donde sale: la instalación que se negaba por esa misma ruta.
- **139** — por qué la ruta viaja escrita.
- **275** — lo mismo, resuelto para el manifiesto.
