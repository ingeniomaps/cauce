---
caso: 321
titulo: el campo review de done lleva rutas absolutas de la máquina
estado: resuelto
resuelto-en: 0.103.6
prioridad: media
version-detectada: 0.103.5
---

# 321 — Cada entrada de `done/` guarda en `review:` la ruta de la carpeta personal de quien corrió

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **media**.

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

## Cierre

**Resuelto en 0.103.6**, más angosto que lo propuesto.

### El recorrido de lo que este caso enumeró

- **Pasar las rutas a relativas en el script, antes de armar el hecho — se hizo.** La raíz de cada servicio
  por su nombre, la de `planning` y la de la instancia.
- **El resto del campo sigue textual — se hizo, y es lo que obligó a angostarlo.** El cambio se aplica sólo a
  lo que el revisor declara haber abierto. Lo que escribió en prosa —reglas, superficie crítica, lo que
  corrigió, lo que constató— no se toca.
- **«Textual era una decisión» — se comprobó.** Sobre 921 elementos de corridas reales, el resultado es
  idéntico a sacar el prefijo a mano: no cambia nada más.
- **Una ruta fuera de las raíces queda como está — se cumplió.**
- **La misma tarea antes y después — se hizo distinto**, abajo.
- **Una revisión que consultó un archivo de fuera de las raíces — se hizo**: quedan como vinieron.

### Lo que este caso encontró y no preveía

**El riesgo no era «bajo».** La primera versión se aplicaba al campo entero, por subcadena, y la revisión
independiente mostró cuatro formas en que rompía algo:

- **Deshacía el caso 277.** En una línea, el árbol de la tarea puede colgar de la raíz. Sacarle el prefijo
  antes de asentarlo como el servicio dejaba en la entrada un árbol que al cerrar ya no existe. Ahora se
  asienta primero.
- **Tomaba por el servicio una carpeta que empieza igual**, si el nombre seguía con `ñ`, un espacio o `@`.
- **Corrompía una ruta que contenía a la raíz**: la de una copia, o una dirección web.
- **Cambiaba el sentido de un hallazgo.** «`grep` de la ruta absoluta devuelve 0» pasaba a decir otro comando.

Y una que salió al probarlo: **con la raíz relativa corrompía el campo**, porque «.» aparece en cualquier
texto. Sólo actúa con la raíz absoluta que escribe `automation install`.

**El arnés no podía probarlo**: compilaba el recorrido con raíz relativa. Ahora acepta una.

### Lo que queda como está, y dicho

- **Los demás campos de `done/` dependen de una consigna y no de un reemplazo.** `done`, `qa`, `tests` y
  `decisions` llevan rutas relativas porque el caso 301 se lo pide a quien escribe. En las corridas medidas
  llegan relativas; no es determinista.
- **La prosa del revisor conserva sus rutas absolutas**, en `review:` y también en lo que va al INBOX y a
  `HUMAN_ACTIONS.md`. Es deliberado: ahí la ruta puede ser de lo que se habla.
- **La raíz nombrada sola al final de una oración**, seguida de un punto, queda absoluta.

### Qué se corrió

- **Los hechos de revisión de las corridas reales de esta sesión, por el código final.** Son 41 hechos de 51
  bancos, cada uno con la raíz de su banco:

  | | Antes | Después |
  |---|---|---|
  | Rutas absolutas en lo que el revisor declaró abierto | 409 | 6 |

  Las 6 que quedan son copias temporales que el revisor armó para mutar, fuera de las raíces.
- **Una corrida real de `autobuild`**, con la primera versión del cambio: la entrada de `done/` trae el campo
  `review` igual al hecho que el recorrido le pasó a quien escribe. En esa corrida el revisor ya había
  escrito sus rutas relativas, así que no había nada que cambiar.
- **Lo que no se corrió: una corrida real con el código final.** Lo que cambió entre las dos versiones es el
  reemplazo, que es determinista y está medido arriba con datos reales; el paso que copia el hecho al disco
  no cambió.
- **23 mutaciones en rojo, en una copia.** Cinco sobrevivieron en algún momento y cada una tiene su
  escenario: la raíz que contiene a la instancia, el servicio con ruta absoluta, la raíz relativa, la raíz
  sin flecha y la que resuelve a la de la máquina.
- **Una revisión independiente del diff**, que además corrió todas las pruebas del recorrido con el arnés
  cambiado: ninguna cambia de resultado.
- **La puerta entera**, `npm run ci`.
