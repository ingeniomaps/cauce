---
caso: 039
titulo: El guard de migraciones bloquea cualquier archivo cuyo contenido mencione SQL destructivo
estado: resuelto
resuelto-en: 0.65.0
prioridad: media
version-detectada: 0.64.0
---

# 039 — Una nota que menciona `DROP TABLE` se bloquea como si fuera una migración

**🟢 resuelto en 0.65.0** · detectado en 0.64.0 · prioridad **media** — el guard mira el contenido y no la ruta que ya tiene

## Resumen

`migrations` tiene dos chequeos. El segundo —reescribir una migración que ya existe— filtra por ruta:
sólo mira archivos bajo `migrations/` o `migrate/` con extensión `.sql`. El primero —SQL destructivo—
no filtra por nada: prueba el regex contra `contentOf(input)` y bloquea.

O sea que cualquier archivo que **mencione** `drop table`, `truncate` o `delete from …;` se frena, y el
mensaje afirma algo falso sobre él: «La migración contiene SQL destructivo». Un `.md` que documenta una
migración, un `.js` con un comentario que advierte justamente que eso no se hace, o este mismo caso.

## Reproducción

```bash
S=$(mktemp -d) && cd "$S" && git init -q .
cat > ops.config.json <<'EOF'
{"project":"d","mode":"embedded","workspaceRoots":[{"name":"m","path":"."}],
 "runner":{"maxTaskHours":4,"humanCheckpointBetweenMilestones":true,"commitPerTask":true,"allowPush":false}}
EOF

hook() { node <ruta-al-motor>/engine/hooks/run.js migrations; echo "exit=$?"; }

# A — una nota en markdown que sólo menciona el SQL
echo "{\"tool_name\":\"Write\",\"cwd\":\"$S\",\"tool_input\":{\"file_path\":\"$S/docs/notas.md\",\"content\":\"ejemplo: DROP TABLE pedidos;\"}}" | hook
#   BLOQUEADO: La migración contiene SQL destructivo…   exit=2

# B — un comentario de código que advierte que no se haga
echo "{\"tool_name\":\"Write\",\"cwd\":\"$S\",\"tool_input\":{\"file_path\":\"$S/src/repo.js\",\"content\":\"// nunca hacer DELETE FROM pedidos;\"}}" | hook
#   BLOQUEADO: La migración contiene SQL destructivo…   exit=2

# C — control negativo: la misma nota sin SQL destructivo
echo "{\"tool_name\":\"Write\",\"cwd\":\"$S\",\"tool_input\":{\"file_path\":\"$S/docs/notas.md\",\"content\":\"SELECT 1 FROM pedidos;\"}}" | hook
#   exit=0
```

*Verificado* el 2026-09-07 sobre 0.64.0. A y B bloquean, C pasa: lo que decide es el contenido, y la
ruta no participa.

## Causa raíz

`engine/hooks/files.js`, en `migrations`: el bloqueo por SQL destructivo corre antes del bucle que
recorre `filesOf(input)`, así que nunca ve la ruta. No es que no la tenga —la función la usa doce
líneas más abajo—: es que ese chequeo no la consulta.

El comentario que encabeza el regex explica con cuidado por qué cada rama termina donde termina —el
`\b` que se aplicaba a las tres, el `;` de `delete from`—, y no dice nada sobre el alcance. Se leyó
siempre como «qué SQL es destructivo», que es la pregunta que efectivamente resuelve; la que quedó sin
hacer es sobre qué archivos.

## Fix propuesto

Mover el chequeo adentro del bucle que ya filtra por ruta, para que las dos condiciones de `migrations`
compartan el mismo alcance:

```js
for (const raw of filesOf(input)) {
  const normalized = raw.replace(/\\/g, '/')
  if (!/(?:^|\/)(?:migrations?|migrate)\/.*\.sql$/i.test(normalized)) continue
  if (destructiveSql.test(contentOf(input))) block(`${raw} contiene SQL destructivo. …`)
  // …y el chequeo de reescritura que ya estaba
}
```

Dos cosas que el arreglo tiene que traer:

- **El mensaje nombra el archivo.** Hoy dice «La migración» sobre algo que puede no serlo; con la ruta
  a mano, decirla cuesta nada y es lo que permite darse cuenta de un falso positivo si vuelve a haberlo.
- **La prueba en rojo primero.** El caso que falta es el negativo: un `.md` con `DROP TABLE` adentro
  tiene que pasar. Escribirlo contra el código actual lo pone rojo, que es lo único que separa esta
  prueba de una que pasa haga lo que haga el código.

Y un borde que conviene decidir a propósito: una migración escrita **fuera** de `migrations/` deja de
frenarse. Es la contracara de acotar el alcance, y es la correcta —el segundo chequeo ya vivía con esa
misma convención desde siempre—, pero es un cambio de cobertura y no sólo una corrección de ruido.

## Tradeoffs

Acotar un guard siempre afloja algo. Acá lo que se pierde es el bloqueo de un `DROP TABLE` que alguien
escriba en un `.sql` suelto fuera de `migrations/`, y lo que se gana es que el guard deje de frenar
prosa. La alternativa —dejarlo como está y documentar el falso positivo— es peor: un guard que salta
donde no corresponde enseña a exportar `OPS_MIGRATIONS_OVERRIDE=1`, que es la salida ancha que el
[038](038-las-otras-cuatro-salidas-siguen-siendo-de-sesion.md) quiere angostar.

## Prioridad

**Media.** No desprotege: bloquea de más, no de menos. Pero es el motor de un falso positivo que se
resuelve apagando el guard entero, y ese es el camino que no queremos enseñar.

## Contexto de descubrimiento

Comprobando la causa raíz del [038](038-las-otras-cuatro-salidas-siguen-siendo-de-sesion.md), el
2026-09-07. Ese caso afirmaba que `migrations` trabaja con `filesOf(input)`; al verificarlo antes de
commitear apareció que su chequeo principal no, y de ahí salió esto. La afirmación quedó corregida allá.

## Cierre

**🟢 resuelto en 0.65.0.** Lo que este caso enumeró, ítem por ítem:

- **Mover el chequeo adentro del bucle que filtra por ruta** → hecho.
- **El mensaje nombra el archivo** → hecho, y aserciado por nombre y no sólo por motivo.
- **La prueba en rojo primero** → hecho: el caso negativo —un `.md` con `DROP TABLE` adentro— se escribió
  contra el código anterior y falló.
- **El borde que había que decidir a propósito**: una migración escrita fuera de un directorio
  `migrations/` deja de frenarse. Se aceptó, y la razón quedó en el código y no sólo en el commit.

## Relacionados

- [038](038-las-otras-cuatro-salidas-siguen-siendo-de-sesion.md) — lo precede: mientras el bloqueo no
  mire la ruta, no hay a qué atar una aprobación por operación en este guard.
- [028](028-una-comilla-de-cierre-desarma-la-regla-de-rm.md) — el mismo género en el otro sentido: el
  alcance real de una regla de guard no coincidía con el que se le atribuía. Allá frenaba de menos —el
  anclaje dejaba pasar `rm -rf /; echo`—; acá frena de más.
