---
caso: 260
titulo: plan-first frena el Build de una sesión sidecar que no declaró su id
estado: resuelto
resuelto-en: 0.101.0
prioridad: alta
version-detectada: 0.100.0
---

# 260 — En sidecar, `plan-first` no reconoce el plan que el propio recorrido acaba de escribir y frena la primera edición de Build

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **alta**.

**Prioridad alta**: es el camino que la instalación indica —abrir la sesión en la carpeta que contiene a la
instancia y correr `/autobuild`—, y se frena después de haber pagado Triage, Plan, Crítica y WIP.

## Resumen

Un recorrido corre `ops` desde la instancia, así que su WIP queda bajo el id del repositorio de la
instancia. El guard corre donde esté parada la sesión, que en sidecar es la carpeta de afuera o el
repositorio del producto, y sin `CAUCE_RUNNER` deduce otro id. Lee «hay plan escrito, pero bajo otro id»
y bloquea la primera edición. El plan estaba aprobado, escrito y era de esa misma sesión.

## Reproducción

Corrida real, 2026-10-05: banco sidecar copiado fuera del árbol —instancia `acme-ops` y producto `app`
hermanos, cada uno con su git—, `automation install . claude`, y una sesión de Claude Code abierta en la
carpeta que los contiene:

```bash
claude -p "/autobuild Los mensajes de error del producto van en inglés." --permission-mode bypassPermissions
```

Y aislado, con el guard instalado y la entrada de una edición sobre `app/test/alta.test.js`, desde tres
carpetas:

```bash
printf '%s' "$ENTRADA" | CLAUDE_PROJECT_DIR="$SESION" acme-ops/automatization/hooks/guard-files.sh
```

## Síntoma

La corrida, once agentes y unos 815 mil tokens después:

```
contract-digest → planning-context → claim → classify → planning-context → ready → estimate → plan → critique → wip → build
La corrida paró en Build con `blocked-on-human` y no construyó nada
El guard `plan-first` bloqueó la primera edición del Build (`app/test/alta.test.js`) con «hay plan escrito, pero bajo otro id».
```

El guard solo:

```
desde la carpeta de la sesión: BLOQUEADO
desde acme-ops:                pasa
desde app:                     BLOQUEADO
```

## Causa raíz

`engine/planning/claims.js:53-57`: sin `CAUCE_RUNNER`, `runner()` es el toplevel de git del directorio del
proceso, o ese directorio. `engine/hooks/files.js`, en `planFirst`, lee el WIP con ese id. Nada le pasa
la variable al proceso del guard: ni el recorrido ni la instalación la escriben, y un agente no puede
exportarla hacia un hook.

El 152 lo conocía —«condicionado a que `CAUCE_RUNNER` no llegue al proceso del hook»— y lo resolvió
mejorando el mensaje, con la salida en `ops worktree`. Esa salida es un árbol por tarea, que no es el
camino por defecto.

## Fix propuesto

Que `plan-first`, cuando nadie declaró un id, acepte también el plan escrito con el id de la instancia.
Con `CAUCE_RUNNER` el id es explícito y se respeta tal cual.

## Tradeoffs

- Dos sesiones sin id declarado sobre la misma instancia comparten ese plan ante el guard. Ya lo
  compartían ante `ops`, que les da el mismo id a las dos; `claim` es quien les niega la segunda tarea.
- El alcance de lo concedido por chat (`scopeAlive`, `engine/hooks/chat.js`) resuelve el id igual y no se
  toca acá: ahí equivocarse vence un permiso, que es la dirección barata.

## Contexto de descubrimiento

La primera corrida real de `autobuild` de la tanda 248-259, pedida por el dueño para probar los casos
nuevos y que no hubiera sobrebloqueo.

## Relacionados

- 152 — los guards resuelven el runner por invocación y `plan-first` frena según el directorio.
- 137 — unificar el id, diferido.
- 253 — se trabaja en la carpeta de la instancia; un árbol aparte es para dos sesiones.

## Cierre

**Resuelto en 0.101.0.** Sin `CAUCE_RUNNER`, `plan-first` acepta también el plan escrito con el id de la
instancia.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**
- **Tradeoff de las dos sesiones sin id — sigue en pie**, y es el que ya tenía `ops`.
- **Tradeoff de `scopeAlive` — no se tocó**, por lo que el caso dice.
- **Lo que el 152 decidió** —que el plan de un runner no le sirva a otro— **sigue fijado**: sus dos pruebas
  están en verde sin tocarlas, y la nueva comprueba que con un id declarado el plan de la instancia no
  alcanza.

### Qué se corrió

- **El guard instalado del banco, antes y después**, con la misma entrada desde las tres carpetas. Antes:
  bloquea desde la carpeta de la sesión y desde `app`. Después: pasa desde las tres, y con
  `CAUCE_RUNNER=/w/otro` vuelve a decir «bajo otro id».
- **La corrida real, retomada.** Con el arreglo en el motor del banco, la misma sesión relanzada siguió
  desde el WIP —`contract-digest → planning-context → build → …`, sin volver a planificar ni a criticar— y
  terminó: quince agentes, la tarea cerrada, `awaiting-review` en el checkpoint del hito.
- **La prueba nueva vista en rojo** sin el cambio.
- **La puerta entera**, `npm run ci`.
- **Costo de encontrarlo**: USD 5,66 la corrida que paró y USD 7,84 la que terminó.

### Desde una instalación limpia, el 2026-10-05

La corrida que cerró este caso era la misma sesión retomada. Se repitió entera en un banco sidecar recién instalado fuera del árbol, con el motor de este cambio y sin
`CAUCE_RUNNER`: `plan → critique → wip → build → … → commit → done`, diecinueve agentes, sin ningún bloqueo
de `plan-first`. En toda la corrida hubo **un** bloqueo, «stagea y commitea a la vez», que es la regla
funcionando. La sesión sin interfaz se cortó a los diez minutos, durante el cierre de la tarea; ese paso
se repitió solo, con su prompt literal.
