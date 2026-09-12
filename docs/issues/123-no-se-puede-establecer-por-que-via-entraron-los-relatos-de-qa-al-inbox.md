---
caso: 123
titulo: No se puede establecer por qué vía entraron al INBOX las ~550 líneas de relatos de QA
estado: descartado
prioridad: baja
version-detectada: 0.82.0
---

# 123 — Los relatos de QA del INBOX no tienen procedencia establecida

**⚪ descartado** · detectado en 0.82.0, medido en 0.85.0 · prioridad **baja** — se midió y no hay defecto
del motor: el grueso del INBOX entró en el commit que migró el sistema de planificación **anterior a
Cauce**, y en esa instancia ningún recorrido escribió nunca

## Resumen

El INBOX de la instancia que originó el caso 101 tenía **~550 líneas de relatos de QA que no están en
ningún `done/`**. El 101 arregló las dos vías por las que un recorrido podía escribirlos —`detail` llega
recortado a una línea, y el molde ya no pide evidencia dentro de una propuesta— pero **nunca se estableció
si esas 550 líneas vinieron por ahí**.

Mientras eso no se sepa, no se puede afirmar que el 101 haya cerrado el caso: si vinieron de otra vía, la
vía sigue abierta y el INBOX va a volver a llenarse.

## Reproducción

No se puede desde este repositorio, y eso es la mitad del caso. Hace falta la instancia:

```bash
# En la instancia, no acá:
git log -p --follow planning/INBOX.md | grep -c 'QA'
git log --format='%h %ad %s' --date=short -- planning/INBOX.md | head -20
```

Lo que hay que contestar con esa salida: si los bloques de relatos aparecieron en commits que también
tocan `planning/done/` —entonces los escribió un recorrido y el 101 los cierra— o en commits sueltos
—entonces entraron por otra vía y falta encontrarla—.

## Síntoma

Del inventario que hizo el 101 sobre el INBOX de esa instancia:

```
~550 líneas de relatos de QA que no están en ningún done/
 15 grupos de duplicados (el mismo hallazgo, anotado por dos revisiones distintas)
249 entradas de una sola semana, la de una corrida con muchas tareas
```

## Causa raíz

Sin establecer. Las dos hipótesis, y ninguna está comprobada:

- **Un recorrido las escribió** por las vías que el 101 cerró (`detail` sin recortar, molde pidiendo
  evidencia). Si es ésta, el caso se cierra sin tocar código.
- **Entraron fuera de los workflows** —a mano, o por una vía que nadie miró—. Si es ésta, hay un defecto
  que sigue abierto y no sabemos dónde.

## Fix propuesto

Primero medir, y recién después decidir si hay algo que arreglar. El disparador que el propio 101 fijó
para abrir trabajo es: «vinieron de fuera de los workflows **y** el punto 4 no alcanza». Las dos mitades
se evalúan con el `git log` de arriba.

Si resulta que entraron por un recorrido, este caso se cierra como «no hay defecto» **con el número de la
medición**, que es lo que hoy falta.

## Tradeoffs

- Medir cuesta poco pero **no se puede hacer desde acá**: depende de que quien tenga la instancia corra el
  comando. Es la única dimensión de esta tanda que no está en manos de este repositorio.
- Dejarlo abierto tiene un costo propio: un caso abierto sin dueño se lee como trabajo pendiente del
  motor, y puede no serlo.

## Prioridad

**Baja**, y con una condición de escalada clara: **sube a alta si el INBOX de esa instancia vuelve a pasar
el umbral de 300 líneas después de 0.82.0**. Eso probaría que la vía sigue abierta sin necesidad del
`git log`.

## Contexto de descubrimiento

El caso 101 fijó el candado con todas las letras: «*Si fue fuera de los workflows y el punto 4 no alcanza,
sale como caso propio **antes de cerrar***». El 101 se cerró igual, con una razón honesta —la historia del
INBOX no viaja con el caso— pero sin abrir el caso que él mismo había condicionado, y dejándolo en «*Lo
puede cerrar quien tenga la instancia*».

Lo encontró la auditoría de 0.79→0.83 del 2026-09-12. Es el hueco más defendible de los diecisiete que
salieron, porque el caso escribió la precondición y el cierre la pasó por encima: nadie iba a pedir después
lo que nada indicaba que faltaba.

## Relacionados

- **101** — de donde salió, con el inventario completo del INBOX.
- **106** — las ~600 líneas de entradas ya resueltas o promovidas, que sí eran suyas.
- **121** y **122** — los otros dos ítems del mismo contraste.

## Cierre

**⚪ descartado** · medido el 2026-09-12 sobre `gouduet-ops` · no hay defecto del motor

### Contra lo que el caso enumeró

**«Correr los dos `git log` en la instancia»** — hecho, sobre la instancia `gouduet-ops`. Los comandos y lo
que devolvieron están abajo, en «Qué se corrió».

**«Si los bloques aparecieron en commits que también tocan `planning/done/` → los escribió un recorrido»** —
**la pregunta estaba mal planteada, y medirla es lo que lo mostró.** Sí hay un commit que toca los dos, y no
es un recorrido: es `289f15d`, `docs(planning): migrate the pre-cauce planning system`, que el 2026-09-03
creó `planning/INBOX.md` entero —887 líneas— junto con `BACKLOG.md`, `DONE.md` y `HUMAN_ACTIONS.md`. Toca
`done/` porque la migración creó el directorio, no porque se hubiera cerrado una tarea. Contestar la
pregunta del caso al pie habría dado «lo escribió un recorrido», que es falso.

**«O en commits sueltos → entraron por otra vía y falta encontrarla»** — tampoco, y la vía tiene nombre. Los
19 commits que tocaron el INBOX los firma una sola identidad, `Manuel Pinzon <malpisa1@gmail.com>`: ninguno
es de un bot ni de un recorrido. Y `planning/done/` está **vacío**, así que en esa instancia ningún
recorrido escribió nunca una entrada de DONE. Lo que llenó el INBOX fue la migración de un sistema de
planificación **anterior a Cauce**.

**«Si entraron por un recorrido, se cierra como "no hay defecto" con el número de la medición»** — se cierra
sin defecto, por una razón más fuerte que la prevista: no entraron por un recorrido **ni** por ninguna vía
del motor. El contenido es anterior a que esa instancia tuviera Cauce.

**Tradeoff «no se puede medir desde acá; depende de que quien tenga la instancia corra el comando»** —
resultó falso: la instancia está en esta misma máquina. Se midió sin pedirle nada a nadie, y el caso llevaba
abierto por una imposibilidad que no existía.

**Tradeoff «un caso abierto sin dueño se lee como trabajo pendiente del motor»** — es exactamente lo que
pasó durante una versión entera, y es lo que este cierre corrige.

**Condición de escalada «sube a alta si el INBOX vuelve a pasar 300 líneas después de 0.82.0»** — **no se
dispara, y hay que decirlo porque a simple vista parece que sí.** El INBOX tiene hoy 767 líneas, muy por
encima de 300. Pero esa instancia corre Cauce **0.66.0** y su último commit sobre el INBOX es del
2026-09-06, mientras que 0.82.0 salió el 2026-09-11: nunca recibió la versión contra la que la condición
mide. Un umbral cruzado por contenido anterior no prueba que la vía siga abierta.

### Lo que apareció y el caso no preveía

**El criterio que el propio caso fijó da un falso positivo.** «Un commit que toca `done/` ⇒ lo escribió un
recorrido» falla contra el commit de migración, que toca todo `planning/` de una vez. Un cierre que aplicara
el criterio al pie habría culpado al motor y mandado a buscar un defecto que no existe.

**La cifra «~550 líneas de relatos de QA» no se reprodujo como tal.** Tanto en el INBOX de `289f15d` como en
el de hoy hay **5** líneas que dicen «QA»; las ~550 del 101 contaban bloques de relato, no líneas con esa
palabra. Lo que este cierre establece es la **procedencia** del grueso del archivo, que es lo que el caso
pedía; no re-verifica el inventario del 101, y decirlo es parte de no presentar el cierre como más ancho de
lo que es.

### Qué se corrió

Todo en la instancia `gouduet-ops`, sólo lectura:

- `git log --format='%h|%ad|%an|%s' --date=short -- planning/INBOX.md` → **19 commits**, del 2026-09-03 al
  2026-09-06.
- `git log --format='%an <%ae>' -- planning/INBOX.md | sort -u` → **una sola línea**,
  `Manuel Pinzon <malpisa1@gmail.com>`.
- Por cada uno de los 19, `git show --name-only` filtrado por `^planning/done/` → **un solo commit**,
  `289f15d`.
- `git show --stat 289f15d` → `docs(planning): migrate the pre-cauce planning system`, 2026-09-03, con
  `planning/INBOX.md | 887 ++++…` entre los archivos que crea.
- `git show 289f15d:planning/INBOX.md | wc -l` → **887**, y `| grep -ci qa` → **5**.
- `ls planning/done/ | wc -l` → **0**.
- `wc -l planning/INBOX.md` → **767**, y `grep -ci qa` → **5**.
- `grep '@ingeniomaps/cauce' package.json` → **0.66.0**.

No hay nada que arreglar en el motor, así que este cierre no trae diff ni prueba nueva: lo que lo sostiene
es la medición, que es la forma que el propio caso pedía para esta salida.
