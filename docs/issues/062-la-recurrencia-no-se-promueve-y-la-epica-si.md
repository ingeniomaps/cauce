---
caso: 062
titulo: Una recurrencia vencida no la promueve el runner y una épica aprobada sí, y el texto sólo prohíbe
estado: abierto
prioridad: media
version-detectada: 0.71.0
---

# 062 — Dos casos análogos resueltos al revés, y la regla escrita cubre uno solo

**🔴 abierto** · detectado en 0.71.0 · prioridad **media** — quien lea la regla y quien mire el recorrido sacan conclusiones opuestas

## Resumen

`template/AGENTS.md` dice que el runner *«nunca amplía el alcance, promueve sus propias ideas…»* y a
continuación trata el caso que más se le parece a una excepción:

> Una recurrencia vencida tampoco la promueve, y ésta es la que más se parece a una excepción: la
> aceptación ya está escrita, la fecha la calculó el CLI y `context` la nombra sola. Nada de eso es la
> aprobación que pide BR-OPS-002 — `context` la nombra para que la vea una persona, y quien la pega en
> `BACKLOG.md` es esa persona.

Y `autobuild` **sí** expande una épica aprobada del roadmap a un hito nuevo del BACKLOG, solo, sin que
ninguna persona la pegue.

Los dos casos son análogos —trabajo ya escrito y ya aprobado, que sólo falta materializar en la cola— y
están resueltos al revés. El texto explica por qué la recurrencia no cuenta como excepción y no dice
nada de la épica, así que quien lo lea concluye que el recorrido viola su propia regla, y quien mire el
recorrido concluye que la regla es decorativa.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

# Lo que la regla dice del caso análogo:
sed -n '/Una recurrencia vencida tampoco la promueve/,+4p' template/AGENTS.md

# Y lo que el recorrido hace con la épica:
grep -n "Expandí sólo la próxima épica" -B 2 automatization/workflows/autobuild.js
```

## Síntoma

No hay salida rota: las dos cosas funcionan como están escritas. Lo que falla es que no se pueden leer
juntas sin concluir que una de las dos está mal.

## Causa raíz

`template/AGENTS.md`, sección de autonomía. La regla enumera lo que el runner **nunca** hace y aclara un
caso límite; la expansión de épicas no aparece en ninguno de los dos lados. No es que la regla la
prohíba: es que no la nombra, y el único caso límite que sí nombra se resuelve al revés.

## Fix propuesto

Ninguno, y por eso es un caso y no una línea de otro. Son dos salidas opuestas y elegir es de política:

- **Que el texto admita la expansión** y diga por qué no es promover una idea propia: la épica ya está
  aprobada en el roadmap y lo expandido queda firmado en el BACKLOG desde 0.71.0. Entonces hay que decir
  qué la distingue de la recurrencia, que también está aprobada y también queda escrita.
- **Que `autobuild` deje de expandir** y nombre la épica para que la pegue una persona, igual que
  `context` hace con la recurrencia. Es coherente con la regla vigente y le quita al recorrido el
  encadenado dentro de una corrida.

La primera es más barata y deja una asimetría que hay que justificar. La segunda es más coherente y
cuesta una capacidad que hoy se usa.

## Tradeoffs

- **Toca `template/`**: cualquiera de las dos baja a todos los consumidores en su próximo `upgrade`.
- Elegir la segunda invalida parte de lo que 0.71.0 acaba de construir —la marca del 057 y el arreglo del
  061 dejarían de tener sujeto—, así que conviene decidirlo antes de seguir invirtiendo ahí.
- **No medido**: nadie reportó haberse confundido leyendo las dos cosas. Es un defecto encontrado
  mirando, no uno que haya costado algo todavía.

## Contexto de descubrimiento

Implementando el 057. Ese caso pedía que el texto «dijera dónde está la línea» de la autonomía, y al ir a
escribirlo apareció que la línea ya está escrita para el caso análogo — y trazada del otro lado.

## Relacionados

- [057](057-la-expansion-de-una-epica-no-dice-quien-la-escribio.md) — de donde sale. Allá se firmó lo que
  el runner expande; acá queda si debería expandirlo.
- [061](061-autobuild-expande-el-hito-siguiente-y-corta-sin-usarlo.md) — redujo cuándo ocurre la
  expansión, sin tocar si corresponde.
