---
caso: 355
titulo: doctor deja corriendo la copia registrada que no contesta
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.105.0
---

# 355 — `automation doctor` corta a los diez segundos la copia registrada que no contesta, y la deja corriendo: mata al intérprete que la lanzó y no a ella

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **media**.

**Prioridad media**: no rompe ninguna respuesta —`doctor` diagnostica bien— y el daño es acumulado y
silencioso: un proceso huérfano por cada vez que el comando se topa con una copia colgada, que no termina
nunca. En la máquina donde se vio eran 328, con 5 GB de memoria entre todos, y nadie los había lanzado a
propósito.

## Resumen

Con Antigravity, el runner no ejecuta el plugin del proyecto sino la copia que registra `agy plugin install`.
`doctor` —y `install`, que hace la misma comprobación— lanza cada comando de esa copia como lo lanza el
runner, con un tope de diez segundos: una copia vieja o rota que no contesta no puede colgar el comando.

El comando es texto, así que se lanza con `sh -c`. Al agotarse el tope se termina el proceso lanzado, que es
el `sh`. El `node hook.js` que ese `sh` había arrancado no recibe nada: queda vivo, sin padre, esperando
para siempre.

## Reproducción

```bash
# con un runner antigravity instalado y su copia registrada en ~/.gemini/config/plugins/cauce
echo 'setInterval(() => {}, 1000)' > ~/.gemini/config/plugins/cauce/hook.js
node tools/ops.js automation doctor . antigravity     # contesta «no respondió en 10 s»
pgrep -af "node hook.js"                              # la copia sigue ahí
```

La suite lo hacía sola en cada corrida: `test/wiring/registration.test.js` prueba justo ese caso, con una
copia que no contesta.

## Síntoma

En la máquina de trabajo, el 2026-10-09, antes de tocar nada:

```
hook.js pre-shell   328 procesos   5049 MB   el más viejo: 100,8 h
padre de los 328:   systemd --user
por día de arranque: 96 el 5, 48 el 6, 93 el 7, 51 el 8, 40 el 9
carpeta de trabajo: /tmp/cauce-test-…/cauce-registro-colgado-3/home/.gemini/config/plugins/cauce (deleted)
```

Uno por cada corrida de la suite durante cinco días. Terminarlos devolvió la memoria usada de 24.306 MB a
19.537 MB.

## Causa raíz

- `engine/automation/registration.js`, `launch` — `spawnSync('sh', ['-c', command], { timeout, killSignal:
  'SIGKILL' })`. El tope de `spawnSync` termina al proceso que lanzó, no a sus hijos.
- `engine/hooks/shell.js`, `run` — el otro lanzamiento con tope del motor ya lo resolvía: lanza al proceso
  como líder de su grupo y, al cortar, termina el grupo entero (caso 240). `launch` nació después y sin eso.

## Fix propuesto

Lo mismo que hace `run`: lanzar el comando como líder de su grupo de procesos y, cuando se agota el tope,
terminar el grupo.

## Valor

Evita una fuga de procesos que nadie ve hasta que la máquina se queda sin memoria. En una empresa pasa cada
vez que `doctor` o `install` encuentran una copia registrada colgada; acá pasaba en cada corrida de la suite.

## Qué podría salir mal

1. **Terminar un grupo que no es el del comando.** Si el proceso no llegara a ser líder de grupo, el
   identificador negativo no nombraría a ninguno, o nombraría a otro.
2. **Cambiar lo que `doctor` contesta** de una copia sana, que termina antes del tope.
3. **Plataformas sin grupos de procesos.** El intento de terminar el grupo falla y no hay que dejar que
   tumbe el diagnóstico.

## Cierre

**Resuelto en 0.106.0** con el fix propuesto.

### El recorrido de lo que este caso enumeró

- **Fix, líder de grupo y terminar el grupo — se hizo.**
- **Qué podría salir mal 1, un grupo ajeno — no pasa**: el identificador del grupo es el del proceso recién
  lanzado como líder. Sin esa bandera el intento no encuentra ningún grupo, y está probado que entonces la
  copia queda viva: es la mutación de abajo.
- **2, la respuesta sobre una copia sana — igual que antes**: sólo cambia el camino del tope. Las otras dos
  pruebas del registro, que lanzan copias que contestan, pasan sin cambios.
- **3, sin grupos de procesos — cubierto**: el intento va envuelto, igual que en `run`.
- **Se buscó el mismo patrón en el resto del motor y de los hooks**: los dos únicos lanzamientos con tope
  son éste y `run`, que ya estaba bien.

### Lo que este caso encontró y no preveía

Junto a los 328 había otros procesos viejos que no son de este defecto, y se terminaron también: tres
corridas de `node --test` al 99 % de procesador desde hacía dos días, de copias de mutación de una sesión
anterior que quedaron en un bucle, y un `ops check` colgado dentro del sandbox de Codex desde hacía cuatro,
que es el caso 283. Eran restos de sesiones, no algo que el motor siga produciendo.

### Qué se corrió

- **En la máquina**: se terminaron los 328 procesos, comprobando antes que su padre era `systemd` y que
  llevaban más de cinco minutos. Después de la corrida entera de la puerta con el arreglo, no queda ninguno.
- Rojo previo: la prueba de la copia que no contesta ahora le hace escribir su identificador y pregunta,
  cuando `doctor` terminó, si sigue viva. Antes del cambio: «la copia que no contestó quedó corriendo
  después de que doctor terminó».
- Dos mutaciones, cada una en rojo: sin lanzarla como líder de grupo, y sin terminar el grupo.

## Contexto de descubrimiento

El dueño avisó que había procesos de Cauce colgados consumiendo más de 5 GB. Estaban ahí desde hacía cinco
días y esta sesión les había sumado cuarenta, uno por cada corrida de la puerta.

## Relacionados

- [240](./240-verify-corre-sin-cota-y-escribe-en-el-arbol.md) — el mismo defecto en el lanzamiento
  de los gates, y de donde sale el arreglo.
- [201](./201-doctor-de-antigravity-sondea-la-copia-del-workspace-y-no-la-que-agy-ejecuta.md) — el sondeo de la copia
  registrada que este caso corrige.
- [283](./283-check-se-cuelga-dentro-del-sandbox-de-codex.md) — el otro proceso colgado que apareció al
  mirar.
