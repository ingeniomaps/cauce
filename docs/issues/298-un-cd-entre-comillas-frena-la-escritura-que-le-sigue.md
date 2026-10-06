---
caso: 298
titulo: un cd entre comillas frena la escritura que le sigue
estado: resuelto
resuelto-en: 0.103.4
prioridad: baja
version-detectada: 0.103.3
---

# 298 — `cd "/ruta/escrita/entera" && sed -i … archivo` se frena por «destino que no se puede resolver»

**🟢 resuelto en 0.103.4** · detectado en 0.103.3 · prioridad **baja**.

**Prioridad baja**: el agente lo esquiva en una llamada, reescribiendo el comando con rutas absolutas. Es un
freno de más sobre la forma más cuidadosa de escribir un `cd`, y cada uno cuesta una vuelta.

## Resumen

El guard de límites resuelve cada escritura relativa contra el `cd` del propio comando. Si el destino del
`cd` no se sabe —una variable, un `cd -`—, frena, porque no puede verificar. Un destino entre comillas caía
en ese mismo caso aunque fuera una ruta literal: las comillas se vacían antes de leer el comando.

## Reproducción

Corrida real de una tarea `full` con 0.103.3. El agente de `verify` preparó una copia en el scratchpad de su
sesión y corrió ahí sus mutaciones:

```
cd "/tmp/…/scratchpad/mut" || exit 9
cp orig.js src/config.js; sed -i 's/return 5000/return 6000/' src/config.js
```

## Síntoma

```
BLOQUEADO: el comando hace `cd` a un destino que no se puede resolver acá, así que no hay contra qué
resolver src/config.js. Escribí la ruta absoluta, o hacé el `cd` en un comando aparte.
```

El destino estaba escrito entero y era el temporal, que el guard no juzga. El agente repitió el comando con
la ruta absoluta en cada escritura y pasó.

## Causa raíz

`engine/hooks/shell.js`, `writesWithBase`: los tramos salen de `unquoted(…)`, que reemplaza todo lo
entrecomillado por una marca. `cd "/ruta"` queda como `cd` seguido de la marca, y `cdTarget` devuelve `null`
para un argumento que la contiene. Con base `null`, toda escritura relativa posterior se frena.

Sin comillas el mismo `cd` se resolvía bien. Las pruebas del `cd` usaban siempre rutas sin comillas.

## Fix propuesto

- Leer el destino de un `cd` entrecomillado antes de vaciar las comillas, cuando es un literal.
- Dejar como desconocido lo que sin comillas se leería distinto.
- Mirar si los otros guards que leen un `cd` tienen el mismo defecto.

## Tradeoffs

- Un destino con espacios sigue sin resolverse y frena. Resolverlo pediría un lector de comillas de verdad, y
  hoy el tramo se parte con una expresión regular.

## Contexto de descubrimiento

La prueba real de una tarea `full` sobre 0.103.3, revisando cada freno de la corrida. Fueron tres frenos en 24
agentes: dos por stagear y commitear en el mismo comando, que es lo que ese guard cuida, y éste.

## Relacionados

- 031 — un guard que no puede verificar no autoriza.
- 164 — `writesWithBase` es la fuente de los tres guards de escritura.

## Cierre

**Resuelto en 0.103.4.**

### El recorrido de lo que este caso enumeró

- **Leer el destino entrecomillado — se hizo.** Con comillas simples o dobles.
- **Lo que queda desconocido — se hizo, y es más corto que lo propuesto.** Quedan afuera un espacio, los
  separadores de comando y de redirección, y `~`, que entre comillas es un nombre. Una variable o una
  sustitución no hizo falta excluirlas acá: `cdTarget` ya las devuelve como desconocidas. Se vio con una
  mutación que sobrevivió, y esa exclusión se sacó.
- **Los otros guards que leen un `cd` — se miró, y no lo tienen.** Con el guard instalado y el `cd`
  entrecomillado: `git rm test/suma.test.js` se frena por borrar una prueba, con el mismo mensaje que sin
  comillas; `git add -A` dentro del proyecto se frena, y hacia una carpeta ajena pasa, también igual que sin
  comillas. Los dos leen el `cd` por su cuenta y no pasan por `writesWithBase`.
- **Tradeoff — se paga.** `cd "/ruta con espacio"` sigue frenando lo relativo que le siga.

### Qué se corrió

- **El guard instalado, con el comando de la corrida real.** Dos bancos sidecar, uno con 0.103.3 de npm y
  otro con este arreglo, y el mismo comando entregado a `guard-shell.sh` como lo entrega el runner:

  ```
  0.103.3    BLOQUEADO: el comando hace `cd` a un destino que no se puede resolver acá …   exit=2
  arreglado  (sin salida)                                                                    exit=0
  ```

- **La otra dirección, que es la que importa en un guard.** El mismo comando con el `cd` entrecomillado hacia
  una carpeta fuera de las raíces. Antes frenaba por no saber; ahora frena por saber:

  ```
  arreglado  BLOQUEADO: el comando escribe en <afuera>/src/config.js, fuera de las raíces declaradas
  ```

- **La prueba, vista en rojo sin el arreglo**: `shell-boundary resuelve las rutas contra el cd del propio
  comando` falla con el `shell.js` anterior.
- **Cinco mutaciones en rojo, en una copia**: sin leer el destino entrecomillado, sólo comillas dobles, y sin
  excluir el espacio, el `;` o la `~`. Una sexta sobrevivió —admitir una variable adentro— y es la que mostró
  que esa exclusión no decidía nada.
- **Lo que no se corrió**: una corrida entera con el arreglo. El cambio es de lectura del comando y se probó
  con el guard instalado y el comando real.
