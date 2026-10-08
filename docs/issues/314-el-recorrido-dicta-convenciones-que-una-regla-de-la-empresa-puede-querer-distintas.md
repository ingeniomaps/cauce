---
caso: 314
titulo: el recorrido dicta convenciones que una regla de la empresa puede querer distintas
estado: descartado
prioridad: alta
version-detectada: 0.103.5
---

# 314 — El mensaje del commit, su pie y el nombre de la rama los fija el prompt, no la regla de la empresa

**⚪ descartado** · detectado en 0.103.5 · prioridad **alta**.

**Prioridad alta**: es el principio que el dueño fijó —lo de la empresa gana siempre— y hoy se cumple a medias.

## Resumen

Desde 0.103.5 todo agente que redacta o juzga carga las instrucciones y las reglas de la empresa. Pero varios
prompts del recorrido traen una convención escrita como texto exacto. Cuando la regla de la empresa pide otra
cosa, el agente tiene dos órdenes y cumple la del prompt en lo que es literal.

## Reproducción

Instancia real con 0.103.5, cuya regla de commits pide asunto en español y un cuerpo que explique el porqué:

```
chore(planning): cerrar api-accion-por-token
chore(planning): bloquear bff-accion-por-token
```

El idioma siguió la regla. El cuerpo no: los dos salieron de una línea, que es lo que el prompt dicta.

## Lo que el recorrido dicta hoy

Leído en `automatization/workflows/autobuild.js`:

| Qué | Dónde | Texto |
|---|---|---|
| Mensaje del commit de planning | 4 prompts | `creá un solo commit "chore(planning): close <tarea>"` |
| Forma del commit del producto | 1 prompt | `un solo Conventional Commit con el footer "Task: <tarea>"` |
| Nombre de la rama de la tarea | `BRANCHED` | `git switch -c <tipo>/<tarea>` |
| Nombre de la rama de planning | `PLANNING_BRANCH` | `work/planning` |

Nada en el motor lee el asunto de un commit de planning ni el pie `Task:`: se buscó y no aparece.

## Causa raíz

Los prompts se escribieron cuando la única convención era la del sistema. La sobrescritura por empresa llegó
después (caso 105), a las reglas y no a estos textos.

## Fix propuesto

- Que cada uno de esos textos sea **el valor por defecto**, dicho así: «si las reglas del proyecto fijan otra
  forma, vale la suya; si no dicen nada, ésta».
- Que el recorrido conserve sólo lo que necesita para funcionar: el identificador de la tarea en el commit y
  que el estado de planning no se commitee en la rama viva.

## Por qué hacerlo

Sin esto, «la empresa gana» depende de que el agente adivine que un texto entre comillas era negociable. En
la instancia adivinó la mitad.

## Riesgos y regresiones

- **La empresa sin reglas propias no puede notar ningún cambio.** Es la regresión a cuidar: con las reglas
  del sistema, los commits y las ramas tienen que salir idénticos a hoy.
- **Un valor por defecto se lee como opcional.** Un agente puede apartarse sin que ninguna regla se lo pida.
  Hay que decir que sólo una regla escrita lo cambia.
- **La rama de planning tiene consumidores humanos**: el PR que acumula. Cambiarle el nombre por una regla
  mal leída parte ese PR en dos.

## Qué habría que probar

- La misma tarea con las reglas del sistema, antes y después: commits y ramas iguales, carácter por carácter.
- Una empresa con regla propia —cuerpo obligatorio, otro prefijo de rama—: se cumple entera.
- Las dos, comparando salidas lado a lado. Es un cambio de quién decide, o sea una quita.

## Plan, escrito antes de tocar código

1. **Línea de base, con el motor de hoy.** Dos corridas reales de la misma tarea: una con las reglas del
   sistema y otra con una regla de commits propia que pida más que el idioma —un cuerpo, un pie y otro prefijo
   de rama—. Se guardan los commits y las ramas de las dos.
2. **El cambio.** Cada texto dictado pasa a decir que es la forma por defecto, y que una regla del proyecto
   sobre lo mismo vale entera. Lo que el recorrido necesita para funcionar queda como exigencia y se nombra.
3. **Pruebas del arnés**, con sus mutaciones en una copia.
4. **Las mismas dos corridas, con el motor nuevo**, y comparación lado a lado con la línea de base.
5. **Revisión independiente del diff**, antes de cerrar.

## Qué podría salir mal

1. **Una empresa sin reglas propias nota un cambio**: otro mensaje, otra rama.
2. **Un agente toma «por defecto» como «opcional»** y se aparta sin que ninguna regla se lo pida.
3. **Una regla de la empresa rompe algo que el recorrido necesita**: el commit sin el identificador de la
   tarea, o el estado de planning commiteado en la rama viva.
4. **La entrada de `done/` deja de encontrar el commit o la rama**, porque esperaba la forma de antes.
5. **La rama de planning cambia de nombre** con un PR ya abierto, y el estado se parte en dos ramas.
6. **El aviso de no apilar tareas en una rama (caso 307)** deja de funcionar con un prefijo propio.

## Cierre

**Descartado: el defecto no se reproduce.** La línea de base, tomada antes de tocar código, mostró que con
el motor de 0.103.5 la regla de la empresa ya gana entera.

### Qué se corrió

Tres corridas reales de `autobuild` sobre la misma tarea, con el motor sin modificar. La regla propia pedía
asunto en español, un cuerpo, el pie `Equipo: ACME` y ramas con prefijo `acme/`:

| | Commit del producto | Commits de planning | Ramas |
|---|---|---|---|
| Reglas del sistema | `feat: add subtraction of two numbers`, con `Task:` | `chore(planning): close …`, de una línea | `feat/resta-dos-numeros`, `work/planning` |
| Regla propia, runner reinstalado | En español, con cuerpo, `Task:` y `Equipo: ACME` | En español, con cuerpo y `Equipo: ACME` | `acme/feat/resta-dos-numeros`, `acme/planning` |
| Regla propia, **sin** reinstalar | Igual que el anterior | Asunto en español, cuerpo y `Equipo: ACME` | Las mismas, con prefijo |

Los textos que el recorrido dicta —el mensaje exacto, el pie, el nombre de la rama— cedieron ante la regla
en las tres cosas que la regla pedía, y el recorrido conservó lo que necesita: el identificador de la tarea.
La entrada de `done/` nombró la rama con prefijo y `check` pasó.

### El recorrido de lo que este caso enumeró

- **Convertir los textos en valores por defecto — se decidió que no.** No hay nada que arreglar, y tocar esos
  prompts era la regresión que el propio caso señalaba: que una empresa sin reglas propias note un cambio.
- **Las seis cosas que podían salir mal** quedan sin ocurrir porque no se cambió nada.

### Lo que este caso encontró y no preveía

**La premisa venía de un reporte mal leído.** La sesión de la instancia dijo que a los commits de planning
«les falta el cuerpo que el skill de commits pide». Ese skill no lo exige: admite un commit sin cuerpo. La
regla se estaba cumpliendo, y el caso se escribió sobre esa frase sin contrastarla.

**El hueco real estaba en otro lado**, y lo mostró la misma medición: dentro de `autobuild` la regla de la
empresa rige esté o no reinstalado el runner, porque a cada agente se le nombran las reglas vigentes. En una
sesión de chat, no. Sigue en el caso 315.

## Relacionados

- 302 — quien redacta carga las reglas.
- 105 — las reglas vigentes de una empresa.
