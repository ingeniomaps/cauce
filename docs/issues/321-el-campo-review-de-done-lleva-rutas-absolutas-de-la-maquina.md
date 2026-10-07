---
caso: 321
titulo: el campo review de done lleva rutas absolutas de la máquina
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 321 — Cada entrada de `done/` guarda en `review:` la ruta de la carpeta personal de quien corrió

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: es información de una máquina dentro de un archivo que viaja por git, y en una instancia real son decenas por entrada.

## Resumen

La entrada de `done/` copia textual lo que la revisión leyó, para que se pueda auditar. Lo que la revisión
leyó viene con rutas absolutas. El caso 301 pasó a relativas los demás campos y dejó éste, que va textual a
propósito.

## Reproducción

- Instancia real con 0.103.5: 22 rutas absolutas en `review:` de una sola entrada, todas bajo la carpeta
  personal del usuario.
- Bancos: entre 8 y 11 por entrada, con cualquier versión.

## Causa raíz

`automatization/workflows/autobuild.js`: `reviewFact` se arma con lo que cada revisor declara haber
consultado, tal cual lo declara, y el prompt de `done` pide ese campo «textual, sin resumir ni recortar».

## Fix propuesto

- Pasar las rutas a relativas **en el script**, antes de armar el hecho: reemplazar la raíz de la instancia y
  la de cada servicio por su nombre. Es determinista y no le pide nada al agente.
- El resto del campo sigue textual.

## Por qué hacerlo

La entrada se commitea. Lleva el nombre de usuario y la estructura de carpetas de una máquina, y deja de
servir en cuanto otra persona clona el repositorio. Es lo que el caso 277 corrigió para el árbol de trabajo.

## Riesgos y regresiones

- **«Textual» era una decisión** (caso 211): un resumen elige qué perder. Cambiar un prefijo de ruta no
  resume nada, pero hay que comprobar que no se toque ninguna otra cosa del campo.
- **Una ruta fuera de las raíces conocidas** —el motor en `node_modules`, un temporal— no tiene a qué
  relativizarse y queda como está.
- **Regresión**: baja y fácil de ver: se compara el campo antes y después.

## Qué habría que probar

- La misma tarea antes y después: `review:` igual salvo los prefijos.
- Una revisión que consultó un archivo de fuera de las raíces.

## Recomendación

**Hacerlo.** Determinista, chico, y cierra lo que el 301 dejó a medias.

## Relacionados

- 277, 301 y 211.
