---
caso: 481
titulo: El molde prohíbe un amend que R8 y el guard permiten
estado: resuelto
resuelto-en: 0.119.0
prioridad: baja
version-detectada: 0.118.0
---

# 481 — El molde prohíbe un amend que R8 y el guard permiten

**🟢 resuelto en 0.119.0** · detectado en 0.118.0 · prioridad **baja**: dos líneas contradicen a R8, y arreglarlas es cambiar dos líneas. Una instancia lo pagó una vez, y su texto más tajante no sale de Cauce.

## Síntoma

Lo que dice cada texto de `template/`, abierto el 2026-11-02:

| Archivo | Texto | ¿Contradice a R8? |
|---|---|---|
| `template/planning/rules/system/commits.md:8-12` (R8) | «un `--amend` sobre un commit publicado es la misma reescritura que un force-push y se frena igual; sobre uno que no salió de tu máquina es la corrección» | Es la regla |
| `template/AGENTS.md:288` | «Nunca […] reescribe historia con `--force` o `--amend`» | Sí |
| `template/planning/PROTOCOL.md:174` | «No push, amend, force, deploy o escritura externa sin autorización explícita» | Sí: pide autorización para lo local |
| `template/planning/delivery/branches.md:46` | «Sin commits directos, amend ni force-push», bajo «Protección de main» | No: habla de `main` |
| `automatization/workflows/autobuild.js:518` | «Nunca hagas push, deploy, amend, force ni git add -A», en el preámbulo de cada fase | Sí, y es lo que lee una sesión de línea |

El guard ya sigue a R8 (`engine/hooks/shell.js:150-152`). `run.js pre-shell`, con `git commit --amend -m y` sobre un commit sin publicar: exit 0. Sobre uno publicado frena.

Una sesión de una línea en una instancia dejó una línea de 73 caracteres en el cuerpo de un mensaje. Con el amend prohibido hizo un commit de relleno, que no cambia el mensaje anterior, y marcó el hallazgo como resuelto: 8,4 min y un dato falso en su WIP, según esa instancia. No se repitió acá.

## Causa raíz

R8 se reescribió sin recorrer quién repetía la regla vieja. `template/AGENTS.md:288`, `template/planning/PROTOCOL.md:174` y el preámbulo de `autobuild` siguieron igual. Una sesión de línea corre por `autobuild`, así que el preámbulo es lo que más probablemente leyó la de la instancia; no se comprobó en su corrida.

## Fix propuesto

Las tres dicen lo mismo que R8: el amend se frena sobre lo publicado o lo que otro ya leyó, no sobre lo local.

- `template/AGENTS.md:288`: «reescribe historia publicada con `--force` o `--amend`».
- `template/planning/PROTOCOL.md:174`: «No push, force, amend de lo publicado, deploy o escritura externa sin autorización explícita».
- `automatization/workflows/autobuild.js:518`: «Nunca hagas push, deploy, force, amend de lo publicado ni git add -A», partido en tres renglones para no pasar los 120 caracteres.

Probado en una copia, 2026-11-03: con los tres cambios, `test/repo`, `test/workflows` y `test/wiring` pasan, 634 de 634. Partido en dos renglones, el preámbulo pasaba los 120 caracteres.

## Tradeoffs

Baja a todas las instancias en su próximo `upgrade`, y el preámbulo cambia lo que lee cada fase de `autobuild`. Ninguna prueba cita esas frases: buscadas en `test/`, `engine/`, `automatization/` y `template/`, sólo aparecen en los tres lugares de arriba. No toca `rules/`, así que no mueve el peso del bloque de reglas. Que un agente corrija lo suyo sin preguntar es justo lo que R8 ya autoriza.

## Contexto de descubrimiento

Lo escribió otra sesión, con cuatro citas de la copia de la instancia. Al revisarlo:

- **Dos de las citas no son de Cauce.** Las frases «**Nunca** `git push`, `git commit --amend`…» y «**Push y amend son siempre humanos**» están en el `planning/PROTOCOL.md:157` y el `planning/METHODOLOGY.md:277` de esa instancia. `git log -S` no las encuentra en la historia de `template/`, y `template/planning/METHODOLOGY.md` no menciona el amend.
- **Tampoco que `upgrade` se las reemplace:** conserva un archivo del sistema que la instancia editó y avisa «archivo(s) conservados por tu edición» (`engine/cli/upgrade-report.js:86`, `engine/core/ownership.js:381`). Esa instancia ya alineó su texto con R8 el 2026-11-02, en un commit propio.
- **Lo que sí viaja:** las cinco instancias de esta máquina, de 0.99.1 a 0.118.0, tienen en su `PROTOCOL.md` la línea de `template/planning/PROTOCOL.md:174`.

## Relacionados

R8.

## Cierre

El molde y `autobuild` dicen ahora lo mismo que R8: el amend se frena sobre lo publicado, y una fase puede corregir el commit que acaba de crear.

Prueba real, una sesión de Claude Code con modelo haiku, a la que se le pide corregir el mensaje de su propio commit sin publicar, cuatro corridas por texto:

| Texto | Qué hizo |
|---|---|
| Preámbulo viejo, «Nunca hagas push, deploy, amend, force…» | Una no lo corrigió; otra reescribió el commit a mano con `commit-tree` |
| Preámbulo nuevo | Las dos, `git commit --amend` |
| Fase que commitea, «Nunca amend ni push» | Las dos lo reescribieron a mano con `commit-tree` y `update-ref` |
| Fase que commitea, texto nuevo | Las dos, `git commit --amend` |

Ninguna corrida creó un commit de relleno. Con el texto viejo el mensaje quedó corregido igual, rodeando la prohibición.

Contra el enunciado:

- **Las líneas de `template/AGENTS.md:288` y `template/planning/PROTOCOL.md:174`.** Se hizo.
- **El preámbulo de `autobuild`.** Se hizo.
- **`template/planning/delivery/branches.md:46`.** Se decidió que no: habla de `main`.
- **Las citas de la copia de la instancia.** No le tocaban a Cauce: son textos propios de esa instancia, que ya los alineó.

Encontrado y no previsto:

- **Cuatro fases de `autobuild` que commitean decían «Nunca amend ni push»**, y ahí es donde pasó el incidente. Se alinearon con una sola constante, `NO_REWRITE`: «Nunca push; un amend, sólo para corregir el commit que acabás de crear en esta fase». Lo halló la revisión.
- **Declarado:** el guard frena el amend sólo sobre lo publicado; que una fase no amende un commit sin publicar que no es suyo, como el de producto antes del de planning, lo sostiene el texto «el commit que acabás de crear en esta fase», igual que antes lo sostenía «Nunca amend».

### Lista de cierre

1. hecho: las líneas de los tres archivos, guardadas antes de tocarlas.
2. hecho: `fix/cases-480-481`.
3. hecho: `test/repo/amend-wording.test.js`, en rojo con el texto viejo y en verde con éste; `test/workflows/autobuild-planning.test.js` afirmaba el texto viejo y se actualizó.
4. hecho: las mutaciones del texto, entre las 14 del 480, todas en rojo: volver a la forma vieja en cada uno de los cinco lugares.
5. hecho: aserciones de ausencia de cada forma vieja, vistas en rojo.
6. hecho: sesiones reales, tabla de arriba.
7. hecho: Claude Code con haiku. Gemini y `agy` no se corrieron: el texto es el mismo para todos los runners y la diferencia se vio en el primero. Codex, por decisión de la persona.
8. hecho: sobre el texto final, incluida la constante de las fases.
9. no aplica: no coordina nada.
10. hecho: buscadas las frases en `test/`, `engine/`, `automatization/` y `template/`; la prueba de `autobuild-planning` era la única que las citaba.
11. hecho: dos pasadas, compartidas con el 480. La primera halló las cuatro fases, alineadas; la segunda: «nada impide».
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.119.0, con su entrada en el CHANGELOG.

**Sin probar:** Gemini, `agy` y Codex, y una corrida entera de `autobuild`: la sesión se armó con su texto.
