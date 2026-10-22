---
caso: 435
titulo: Codex paró antes del commit de una tarea full pidiendo una confirmación que ningún texto de Cauce pide
estado: descartado
prioridad: baja
version-detectada: 0.114.0
---

# 435 — Codex pide confirmación antes de commitear una tarea `full`, y no sale de ningún texto instalado

**⚪ descartado** · detectado en 0.114.0 · prioridad **baja**. Salió del caso 433. Se aplazó hasta que Codex tuviera
cuota, y cuando la tuvo no se reprodujo.

## Resumen

En la medición del 433, Codex corrió una tarea `full` hasta Review y paró antes del commit: «el protocolo exige tu
confirmación en este gate». Ningún texto de Cauce pide eso. En una corrida desatendida, la tarea queda construida y sin
commitear, y nadie está mirando para confirmar.

## Reproducción

1. Una instancia fuera del árbol con `automation install ops codex`, identidad de git en cada repositorio, y una tarea
   `full` en la cola (la del 433: `dividir(a, b)` con un `RangeError` en el divisor cero).
2. `codex exec --dangerously-bypass-hook-trust "/autobuild"` en la carpeta de sesión (el bypass es por el caso 434).
3. Leer la salida y buscar la parada antes del commit.

## Síntoma

Medido el 2026-10-21 con Codex 0.162.1, una sola corrida: la salida termina pidiendo confirmación para commitear. La
corrida de 2026-10-22, con el paso 6 ya partido, criticó el plan y se cortó antes del commit por el límite de uso
(«usage limit… try again at Nov 19th»), así que no dice nada sobre esta parada.

## Causa raíz

No encontrada en Cauce. Se buscó «confirm» junto a «commit» en el `AGENTS.md`, el `PROTOCOL.md` y el skill de
`autobuild` instalados en esa instancia, y no hay ningún resultado. Con una sola corrida, tampoco se sabe si se repite.

## Fix propuesto

Ninguno antes de medir. Si se repite, lo primero es encontrar qué texto la dispara. Que una frase del skill diga «no
pidas confirmación para commitear» sería otra instrucción, y el 433 mostró qué tan lejos llega una.

## Contexto de descubrimiento

Medición del caso 433, 2026-10-21.

## Relacionados

- 433 (la medición de la que salió). 434 (el bypass que la corrida necesita).

## Cierre

**Descartado** el 2026-10-22: no se reprodujo, y lo que lo había disparado no está en Cauce.

- **Reproducción.** Codex volvió a tener cuota el mismo día. Se corrió la tarea `full` de la medición del 433 en una
  instancia nueva fuera del árbol, con el molde de 0.114.0 tal cual. El comando fue `codex exec -m gpt-5.6-terra -s
  danger-full-access --dangerously-bypass-hook-trust '$autobuild'`, con Codex 0.163.0. Llegó al commit sin pedir
  nada: `de460be feat: add division helper` en `app`, la tarea cerrada en `done/dividir.md` y el planning commiteado.
  Las líneas con «confirm» de su salida son documentación que leyó, no una parada.
- **Causa raíz, «no encontrada en Cauce».** Sigue igual: no hay texto instalado que pida esa confirmación.
- **Lo que no se puede separar.** Entre la corrida que paró y ésta cambiaron dos cosas: el texto, con el paso 6 de
  `PROTOCOL.md` partido por el 433, y la versión de Codex, de 0.162.1 a 0.163.0. Con una corrida de cada lado no se sabe
  cuál de las dos lo cambió, ni si fue varianza. Por eso es `descartado` y no `resuelto`: no hubo arreglo que probar.
- **Fix propuesto, «ninguno antes de medir».** Se midió y no hace falta ninguno.

**Prueba.** La corrida de arriba: su `done/dividir.md` trae `commit: de460be … (app@feat/dividir)`, y `check` sobre la
instancia no dio errores.
