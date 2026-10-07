---
caso: 315
titulo: una regla nueva de la empresa no se carga hasta reinstalar el runner
estado: abierto
prioridad: alta
version-detectada: 0.103.5
---

# 315 — La empresa escribe su regla de commits y las sesiones siguen cargando la del sistema

**🔴 abierto** · detectado en 0.103.5 · prioridad **alta**.

**Prioridad alta**: es la otra mitad de «lo de la empresa gana»: una regla que no se cargó no se cumple, y sólo lo dice una advertencia.

## Resumen

Las reglas llegan a cada sesión por el bloque que `automation install` escribe en `CLAUDE.md`. Cuando una
empresa agrega o reemplaza una regla, ese bloque queda viejo hasta que alguien reinstala el runner. Mientras
tanto la sesión carga la regla anterior.

## Reproducción

Banco con una regla de commits propia recién escrita, sin reinstalar:

```
⚠ planning/rules/commits.md sobrescribe commits.md (override explícito); deja de regir R9, R10
⚠ claude: CLAUDE.md no carga planning/rules/commits.md y carga planning/rules/system/commits.md, que ya no
  rige; reinstalá el adaptador (make install-claude)
✓ planning válido
```

`check` pasa y `/autobuild` corre.

## Qué lo atenúa hoy

Dentro de `autobuild`, cada agente recibe en su preámbulo la lista de reglas vigentes, que el motor calcula al
momento, con «leé las que toquen tu fase; donde una propia contradice a una del sistema, rige la propia». O
sea que el agente tiene cargada la regla vieja y además le nombran la nueva. Una sesión de chat, fuera de
`autobuild`, no recibe ese preámbulo.

## Causa raíz

`engine/automation/rules.js`, `drift`: detecta el desfase y lo reporta como advertencia. El caso 308 hizo que
`autobuild` se niegue a correr con el recorrido o los agentes viejos, pero mira esos archivos y no el bloque
de reglas.

## Fix propuesto

- Que la parada del 308 cuente también el bloque de reglas: con una regla vigente sin cargar, `autobuild`
  para al arrancar y dice el comando.
- Para la sesión de chat no hay parada posible desde el recorrido. Queda el guard de planning al cerrar el
  turno, que ya corre `check`: que ese aviso suba de advertencia a algo que no se pueda saltear.

## Por qué hacerlo

Una empresa que escribe una regla espera que rija desde que la escribe. Hoy rige a medias dentro de
`autobuild` y nada en el chat, y lo único que lo dice es una línea amarilla entre otras.

## Riesgos y regresiones

- **Frena después de cada edición de reglas** hasta reinstalar. Es un comando, pero es un freno nuevo en el
  camino de todos los días de quien está ajustando sus reglas.
- **Reinstalar exige abrir una sesión nueva** para que el bloque se relea. La parada tiene que decirlo, o la
  persona reinstala, relanza y vuelve a frenar.
- **Regresión**: el toolkit mismo (`mode: toolkit`) no instala nada y no puede frenarse por esto.

## Qué habría que probar

- Banco con regla propia sin reinstalar: para con el comando. Reinstalado y en sesión nueva: corre.
- Banco sin reglas propias: no cambia nada.
- El repositorio de Cauce: no se frena.

## Recomendación

**Hacerlo para `autobuild`**, que es angosto y sigue al 308. Lo del chat, **decidirlo aparte**: subir una
advertencia de `check` a error le cambia el día a todas las instancias.

## Relacionados

- 308 — el adaptador que quedó atrás.
- 105 y 160 — reglas vigentes y reglas que no estaban rigiendo.
