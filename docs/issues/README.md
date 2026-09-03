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

## Estado

El frontmatter lo declara y el cuerpo lo repite en la primera línea, para que se vea sin abrir el
archivo y sin parsearlo:

| `estado` | Qué significa |
|---|---|
| `abierto` | Reproducido y sin arreglar. |
| `resuelto` | Arreglado y publicado. `resuelto-en` dice en qué versión. |
| `descartado` | Se decidió no arreglarlo. El cuerpo dice por qué; no se borra. |

Un caso se marca `resuelto` **cuando la versión que lo arregla está publicada**, no cuando el PR
mergea: mientras tanto sigue mordiendo a todo el que instale.

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

## Uno por archivo

Aunque dos bugs compartan área o causa raíz, van separados: se arreglan, se prueban y se cierran por
separado. La relación se declara en **Relacionados**.
