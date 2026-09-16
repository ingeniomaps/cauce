# Casos

Un archivo por problema encontrado en Cauce, con su estado. Es la cola de trabajo local: lo que ya se
sabe que está mal, escrito con suficiente detalle para que alguien lo arregle sin volver a
investigarlo.

Los [issues de GitHub](https://github.com/ingeniomaps/cauce/issues) son la puerta de entrada de
terceros, que es lo que nombra `CONTRIBUTING.md`; esta carpeta es el registro del proyecto. **Son dos
cosas distintas y no se sincronizan**: un reporte externo llega como issue y, si se toma, nace su caso
acá. Un caso puede publicarse allá cuando convenga —para que alguien lo siga o lo tome—, y no hace
falta que lo haga.

Antes decía que un caso «puede publicarse allá tal cual», y eso pedía mantener dos lugares al día. No
se hizo nunca: al escribir esta línea había dieciocho casos y ningún issue abierto. Un contrato que
nadie cumple envejece peor que uno que no promete nada, y lo que la carpeta aporta no dependía de esa
promesa: que el detalle no se pierda entre encontrar el problema y arreglarlo, y que quede a la vista
de quien abra el repositorio con un agente.

No viaja en el paquete —`files` de `package.json` no la incluye—, así que no le cuesta nada a quien
instala Cauce.

## Cómo se nombra

`NNN-slug-corto.md`, correlativo. El próximo número es el siguiente al más alto que haya acá: los
casos resueltos **no se borran**, se marcan, así que `ls` alcanza y no hace falta un contador aparte.
Slug en español, como el resto de la documentación del repositorio.

El número **es** el identificador: lo citan los cierres, los mensajes de commit, los cuerpos de los PR y
el CHANGELOG. Por eso `issues.test.js` comprueba que no haya dos casos con el mismo, y que el número del
nombre y el del frontmatter digan lo mismo — igual que con el estado, el que se lee sin abrir el archivo
es el del nombre.

Y esa colisión ocurre: dos sesiones que trabajan a la vez ven árboles distintos, así que las dos leen el
mismo «más alto». Pasó el 2026-09-16 con el 164. Cuando la puerta la reporta, **el que se mueve es el que
todavía no se publicó**: si un número ya está citado en un CHANGELOG o en un PR mergeado, renumerarlo
rompe referencias que están afuera.

## Estado

El frontmatter lo declara y el cuerpo lo repite en la primera línea, para que se vea sin abrir el
archivo y sin parsearlo:

| `estado` | Encabezado | Qué significa |
|---|---|---|
| `abierto` | `**🔴 abierto**` | Reproducido y sin arreglar. |
| `resuelto` | `**🟢 resuelto en <versión>**` | Arreglado y publicado. `resuelto-en` dice en qué versión. |
| `descartado` | `**⚪ descartado**` | Se decidió no arreglarlo. El cuerpo dice por qué; no se borra. |

Son los tres que hay, y la columna del medio es parte del contrato y no una sugerencia de formato:
`test/repo/issues.test.js` la comprueba, y rechaza además un `estado` que no esté en esta tabla. Sin
eso, inventar uno dejaba al caso afuera de todas las comprobaciones —las demás preguntan por
`resuelto`— sin que nada avisara. El glifo de `descartado` nació en el 046 pidiendo que se declarara
acá; hasta 0.87.0 no estaba, y era convención de hecho.

Un caso se marca `resuelto` **cuando la versión que lo arregla está publicada**, no cuando el PR
mergea: mientras tanto sigue mordiendo a todo el que instale.

Y no se marca sin haberlo probado corriendo. El `## Cierre` nombra qué se corrió y qué devolvió —la
salida, la mutación vista en rojo, el número medido—; «la suite pasa» no cuenta, porque dice que nada de
lo que ya había se rompió y no que esto funcione. Vale igual si se decidió no arreglarlo: ahí se prueba
el dato que sostiene la decisión. El porqué vive en el `AGENTS.md` de la raíz.

## Qué lleva adentro

Las secciones del molde, en este orden. La que no aplique se saca; ninguna se deja vacía.

- **Resumen** — qué está mal, en dos o tres líneas.
- **Reproducción** — los comandos exactos, desde un directorio vacío. Sin esto el caso no está listo.
- **Síntoma** — la salida real, pegada. No narrada.
- **Causa raíz** — `archivo:línea` del motor. Si no se encontró, se dice.
- **Fix propuesto** — el diff, o la forma que tendría. Es una propuesta, no una decisión.
- **Tradeoffs** — qué se rompe o se vuelve más ruidoso al arreglarlo.
- **Contexto de descubrimiento** — dónde apareció y qué se estaba haciendo. Es lo que permite juzgar
  si el caso es un borde raro o el camino principal.
- **Relacionados** — otros casos que comparten causa.

## Contra qué se recorre el cierre

`AGENTS.md` dice por qué cerrar es un acto con su propio contraste; acá está contra qué. **El recorrido
es contra el caso entero, no contra su «Fix propuesto».** Esa sección se lee como la lista de cosas por
hacer, así que es la que uno tacha y da por completa, y lo que falta queda en las otras tres:

- **Tradeoffs** suele traer una predicción —«esto puede empezar a fallar», «no está medido»—, y una
  predicción sin comprobar es una dimensión abierta, no un comentario.
- **Prioridad** suele traer una condición de escalada —«sube a alta el día que…»—. Un arreglo que la
  vuelve imposible cerró algo, y decirlo es parte del cierre.
- **Resumen** suele enumerar más de un daño. Cerrar el primero y probar sólo ése deja los otros adentro.

No es una hipótesis: de los cuatro casos cerrados el 2026-09-07, los tres ítems que se dieron por
cerrados sin estarlo en el 045, y los dos del 044, vivían todos fuera de «Fix propuesto». Los dos casos
que se recorrieron por las cuatro secciones desde el principio salieron completos a la primera.

## Uno por archivo

Aunque dos bugs compartan área o causa raíz, van separados: se arreglan, se prueban y se cierran por
separado. La relación se declara en **Relacionados**.
