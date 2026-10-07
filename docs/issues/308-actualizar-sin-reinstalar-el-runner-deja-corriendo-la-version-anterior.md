---
caso: 308
titulo: actualizar sin reinstalar el runner deja corriendo la version anterior
estado: resuelto
resuelto-en: 0.103.5
prioridad: media
version-detectada: 0.103.4
---

# 308 — Después de `upgrade`, el recorrido y sus agentes siguen siendo los viejos hasta reinstalar, y nada frena

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **media**.

**Prioridad media**: quien actualiza cree tener el arreglo y no lo tiene. No rompe nada, que es el problema.

## Resumen

`upgrade` reemplaza el motor y las reglas. El recorrido, los agentes y el wiring de un runner viven fuera de
la instancia y los copia `automation install`. Hasta que alguien lo corre, lo que una sesión ejecuta es la
copia de la versión anterior.

## Reproducción

Banco con 0.103.4 de npm, y encima un paquete armado desde la rama de 0.103.5:

```
npm install <paquete> && node tools/ops.js upgrade . && node tools/ops.js automation doctor . claude
```

## Síntoma

```
⚠ claude: .claude/workflows/autobuild.js: hay una versión más nueva en Cauce; reinstalá el adaptador
⚠ claude: .claude/agents/cauce-scribe.md: hay una versión más nueva en Cauce; reinstalá el adaptador
✓ claude: adaptador operativo (3 advertencia(s))
```

«Adaptador operativo». `upgrade` lo pide en una línea al final de su salida, y `/autobuild` corre igual: con
el agente de escritura de 0.103.4, que es justo el defecto que la versión nueva arregla.

## Causa raíz

`engine/automation/index.js`: una copia instalada más vieja que la que Cauce trae es una advertencia, a
propósito —el comentario de al lado dice por qué no es un error de `doctor`—. Nada más la mira.

## Fix propuesto

- Que el recorrido no corra con un adaptador que quedó atrás, y diga el comando que lo arregla.
- No convertirlo en error de `doctor` ni de `check`: frenaría cada cierre de turno, y hay una razón escrita
  para que no lo sea.

## Tradeoffs

- El aviso lo da el propio recorrido, que es una de las copias que quedan viejas. Llega con la versión
  siguiente a la que lo trae: una copia anterior a ésta no sabe preguntar.
- Una parada más antes de empezar. Cuesta un agente de oficina, que ya corría.

## Contexto de descubrimiento

Probando el camino de actualización de 0.103.4 a 0.103.5 antes de publicar.

## Relacionados

- 295 — el primer agente que llega con el runner.
- 301 y 302 — lo que seguía corriendo sin reinstalar.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **La parada — se hizo.** `ops contract` devuelve en `staleAdapter` lo instalado que quedó atrás. El
  recorrido lo lee en Triage, donde ya leía el contrato, y si hay algo del adaptador de Claude para con
  `adapter-stale`, nombrando los archivos y el comando.
- **`doctor` y `check` — no se tocaron**, por lo dicho.
- **Tradeoffs — se pagan los dos.**

### Qué se corrió

- **El contrato, sobre una instancia instalada**: recién instalada devuelve `[]`; con el recorrido instalado
  en una copia anterior devuelve `['.claude/workflows/autobuild.js']`; y con esa copia editada a mano
  devuelve `[]`, porque una copia que la empresa tocó no es vieja, es suya.
- **La parada, en el arnés**: con dos archivos de Claude atrás, la corrida para antes de leer la cola; con
  uno de otro runner, no.
- **La corrida real.** Banco instalado, con el recorrido dejado como una copia de una entrega anterior.
  `doctor` dice «adaptador operativo (1 advertencia)»; `/autobuild` paró en Triage, con un agente y 5.282
  tokens:

  ```
  stopped: true, reason: adapter-stale
  El motor se actualizó y el adaptador de Claude quedó en la versión anterior: .claude/workflows/autobuild.js.
  Reinstalalo con "node tools/ops.js automation install . claude" …
  ```

  La sesión leyó el mensaje, reinstaló y volvió a lanzar por su cuenta.
- **Cuatro mutaciones en rojo, en una copia**: el contrato sin lo que quedó atrás, una copia editada contada
  como vieja, la corrida sin parar, y parando por el adaptador de otro runner.
- **La puerta entera**, `npm run ci`.
