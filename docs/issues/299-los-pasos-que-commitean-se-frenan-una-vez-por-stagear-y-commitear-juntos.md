---
caso: 299
titulo: los pasos que commitean se frenan una vez por stagear y commitear juntos
estado: resuelto
resuelto-en: 0.103.4
prioridad: baja
version-detectada: 0.103.3
---

# 299 — Cada commit de una corrida arranca con un freno que el prompt podía evitar

**🟢 resuelto en 0.103.4** · detectado en 0.103.3 · prioridad **baja**.

**Prioridad baja**: el agente se recupera solo y el commit sale bien. Es un freno en cada corrida, sobre una
conducta que el guard cuida a propósito y que el recorrido nunca le avisó a su agente.

## Resumen

El guard que revisa un commit lee el índice antes de que el comando corra. Un `git add … && git commit` en
una sola línea lo deja sin nada que mirar, así que lo frena siempre. Los cuatro prompts del recorrido que
piden un commit dicen «stageá por nombre… y creá un solo commit», y no dicen que van en comandos separados.

## Reproducción

Cualquier corrida real de `autobuild` con `commitPerTask`. Se miró en cinco, todas sobre 0.103.3 o sobre el
motor de esta rama antes de este cambio.

## Síntoma

En cuatro de esas cinco corridas, al menos un agente que commiteaba corrió algo como:

```
cd <ops> && git add planning/BACKLOG.md planning/done/<tarea>.md && git status --short && git commit -m …
BLOQUEADO: El comando stagea y commitea a la vez, así que este guard lee el índice de antes de stagear y no
puede ver qué se commitea.
```

Después lo repitió en dos comandos y pasó. Cinco frenos en total: tres en `planning-commit`, uno en
`planning-block` y uno en `commit`. En la quinta corrida no hubo ninguno, sin que nada fuera distinto.

## Causa raíz

`automatization/workflows/autobuild.js`: los prompts de `commit`, `planning-commit`, `planning-block` y
`human-checkpoint`. Ninguno nombra la restricción, y la forma natural de cumplir «stageá y commiteá» es una
línea.

## Fix propuesto

- Los cuatro prompts avisan que stagear y commitear van en comandos separados, y por qué.
- Una prueba que recorra los pasos que commitean, para que uno nuevo no nazca sin el aviso.

## Tradeoffs

- Una frase más en cuatro prompts.
- El guard no cambia: sigue frenando la línea combinada, que es lo que tiene que hacer.

## Contexto de descubrimiento

Revisando los frenos de las corridas reales de 0.103.3, incluida la de una instancia real que otra sesión
reportó: era el único freno que se repetía.

## Relacionados

- 031 — un guard que no puede verificar no autoriza.
- 295 — lo que cuesta cada agente de un recorrido.

## Cierre

**Resuelto en 0.103.4.**

### El recorrido de lo que este caso enumeró

- **El aviso en los cuatro prompts — se hizo.** Una sola constante, `TWO_COMMANDS`, con la razón adentro.
- **La prueba — se hizo, en los dos sentidos.** Los cuatro pasos que commitean llevan el aviso, y ningún otro
  paso de la corrida lo lleva. Un paso nuevo que commitee no lo trae solo: la prueba nombra los cuatro, así
  que agregarlo ahí es parte de agregar el paso.
- **Tradeoffs — se pagan los dos.**

### Qué se corrió

- **Una corrida real con el aviso.** Banco sidecar con el motor de esta rama, `/autobuild --max 1 sin push ni
  PR`. Cerró la tarea con sus dos commits y **ningún freno de ningún guard** en 17 agentes. Los dos agentes
  que commitean corrieron `git add` y `git commit` en llamadas separadas desde el primer intento.
- **Lo que esa corrida no mostró: un ahorro.** Los dos agentes hicieron seis llamadas cada uno. En la corrida
  anterior sobre el mismo banco, `planning-commit` hizo seis con el freno adentro y `commit` cinco sin freno.
  El freno se fue; que la corrida gaste menos no quedó medido, y con una sola corrida no se puede afirmar.
- **Cinco mutaciones en rojo, en una copia**: el aviso quitado de cada uno de los cuatro prompts, y el aviso
  puesto en Build, que no commitea.
- **La puerta entera**, `npm run ci`.
