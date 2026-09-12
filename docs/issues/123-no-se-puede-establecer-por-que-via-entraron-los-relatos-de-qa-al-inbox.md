---
caso: 123
titulo: No se puede establecer por qué vía entraron al INBOX las ~550 líneas de relatos de QA
estado: abierto
prioridad: baja
version-detectada: 0.82.0
---

# 123 — Los relatos de QA del INBOX no tienen procedencia establecida

**🔴 abierto**

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
