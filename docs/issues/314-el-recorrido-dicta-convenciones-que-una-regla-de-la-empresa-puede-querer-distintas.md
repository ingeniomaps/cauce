---
caso: 314
titulo: el recorrido dicta convenciones que una regla de la empresa puede querer distintas
estado: abierto
prioridad: alta
version-detectada: 0.103.5
---

# 314 — El mensaje del commit, su pie y el nombre de la rama los fija el prompt, no la regla de la empresa

**🔴 abierto** · detectado en 0.103.5 · prioridad **alta**.

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

## Recomendación

**Hacerlo**, y antes que los demás: es lo que el dueño pidió con todas las letras.

## Relacionados

- 302 — quien redacta carga las reglas.
- 105 — las reglas vigentes de una empresa.
