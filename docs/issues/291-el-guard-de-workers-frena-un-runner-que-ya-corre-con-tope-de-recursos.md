---
caso: 291
titulo: el guard de workers frena un runner que ya corre con tope de recursos
estado: resuelto
resuelto-en: 0.103.2
prioridad: baja
version-detectada: 0.103.1
---

# 291 — Un `jest` lanzado dentro del contenedor del proyecto se frena igual que uno en el host

**🟢 resuelto en 0.103.2** · detectado en 0.103.1 · prioridad **baja**.

**Prioridad baja**: cuesta un reintento por corrida de pruebas y no rompe nada.

## Resumen

El guard de workers frena un `jest` o un `vitest` sin cota porque dos a la vez tiran la máquina. Un proyecto
que corre sus pruebas con un script propio, dentro de un contenedor con memoria y CPU acotadas, ya no tiene
ese riesgo, y el guard no lo sabe.

## Reproducción

Corrida real de `autobuild` con 0.103.1. En Build y en Review:

```bash
acme-run.sh -C api sh -c 'pnpm exec jest src/decisions; …'
```

## Síntoma

```
BLOQUEADO: 'jest' sin cota de workers lanza tantos procesos como núcleos, y dos a la vez tiran la máquina.
```

Dos veces en la corrida, resueltas en 0,1 segundos cada una; el agente agregó la cota y reintentó. El
contenedor tenía tope de 4 GB y 4 CPU.

## Causa raíz

`engine/hooks/workers.js`: mira el runner y sus banderas, no con qué se lo lanzó.

## Fix propuesto

Que el proyecto declare los comandos que ya corren con tope de recursos, y que el guard no opine sobre lo que
lanzan.

## Tradeoffs

- Es una lista que declara el proyecto: el guard le cree. Un comando declarado que no acote nada deja pasar
  lo que el guard cuidaba.
- Sin declararlo sigue como antes, que es un reintento y no un bloqueo sin salida.

## Contexto de descubrimiento

La primera corrida de una instancia real con 0.103.1, donde además el guard propio del proyecto ya frena el
runner en el host.

## Relacionados

- 232 — el origen del guard de workers.
- 286 — el patrón de un `grep` tomado por una corrida.
- 225 — `deployCommands`, la otra lista que declara el proyecto.

## Cierre

**Resuelto en 0.103.2.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, con `boundedCommands` en `ops.config.json`. Vale para lo que ese comando lanza y no para
  lo que va después de un separador en el mismo renglón. El programa se compara por su nombre, así que no
  importa con qué ruta se lo llame; con más de una palabra —`docker compose exec`— tienen que coincidir todas.
- **Tradeoffs — se pagan los dos.** El mensaje del bloqueo ahora nombra la salida, y dice que la declara una
  persona.

### Qué se corrió

- **La forma del comando real, antes y después**, contra el guard: sin declarar frena; con el script
  declarado pasa, llamado con ruta relativa, absoluta y con una variable de entorno delante.
- **Lo que tiene que seguir frenando**: `npx jest` solo, otro script no declarado, y un `jest` que va después
  de un `;` o un `&&` del comando acotado. Esto último falló en la primera versión —tomaba por acotado lo que
  seguía al separador— y lo encontró su propia prueba.
- **Siete mutaciones en rojo**, en una copia. La de «las comillas no protegen el separador» sobrevivió la
  primera vez, hasta agregar el segundo comando real: el runner después de un `;`, pero adentro de las
  comillas del `sh -c`.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una sesión real en la instancia que lo reportó, con su script declarado.
