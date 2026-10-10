---
caso: 371
titulo: con Codex y Gemini instalados, Gemini avisa un conflicto por cada cargo
estado: abierto
prioridad: baja
version-detectada: 0.106.0
---

# 371 — Con los runners de Codex y de Gemini instalados en la misma carpeta, Gemini imprime «Skill conflict detected» por cada cargo al abrir una sesión

**🔴 abierto** · detectado en 0.106.0 · prioridad **baja**.

**Prioridad baja**: es ruido. No cambia qué cargo se usa ni frena nada. Vale anotarlo porque son decenas de
líneas antes de la primera respuesta, en cada sesión, y tapan cualquier aviso que sí importe.

## Resumen

Cada runner instala un puntero por cargo en su propia carpeta. Gemini CLI lee la suya y además la de Codex,
encuentra cada cargo dos veces y lo avisa, uno por uno.

## Reproducción

En una instancia, instalar los dos runners y abrir una sesión de Gemini:

```bash
node tools/ops.js automation install . codex
node tools/ops.js automation install . gemini
gemini -p "hola"
```

## Síntoma

Con Gemini CLI 0.55.1, el 2026-10-10, una línea como ésta por cada cargo del catálogo:

```
Skill conflict detected: "growth-marketer" from "<carpeta>/.agents/skills/growth-marketer/SKILL.md" is
overriding the same skill from "<carpeta>/.gemini/skills/growth-marketer/SKILL.md".
```

## Causa raíz

- `automatization/runners/codex/manifest.json`, `roleSkills: ".agents/skills"`, y
  `automatization/runners/gemini/manifest.json`, `roleSkills: ".gemini/skills"` — los dos runners escriben el
  mismo conjunto de punteros en dos carpetas.
- Que Gemini CLI lee también `.agents/skills` sale de su propio aviso, que nombra las dos rutas. **Verificado**
  en esa versión por esa salida; qué otras carpetas lee, o desde qué versión, no se comprobó.

## Fix propuesto

Dos caminos, a mirar antes de elegir:

1. Que el runner de Gemini no instale sus punteros cuando ya están los de Codex en la carpeta que Gemini
   lee, o al revés.
2. Dejar las dos carpetas y que `automation doctor` lo diga, si no hay forma de callar el aviso sin que un
   runner dependa de lo que instaló el otro.

Vale mirar primero qué documenta Gemini CLI sobre el orden en que busca esas carpetas, y si el que gana —el
de `.agents/skills`, según el aviso— es idéntico al que pierde, que es lo que hace inocuo el conflicto.

## Valor

Saca decenas de líneas de ruido del arranque de cada sesión de quien usa los dos runners.

## Qué podría salir mal

1. **Que un runner quede sin sus cargos al desinstalar el otro**, si pasan a compartir carpeta.
2. **Que los dos punteros no sean idénticos** y sacar uno cambie lo que el cargo recibe.

## Revisión del 2026-10-10

Las dos cosas que el fix pedía mirar antes de elegir.

- **Los punteros son idénticos.** En una copia desechable de un banco, con los dos runners instalados: 53
  cargos en `.gemini/skills` y 58 entradas en `.agents/skills`; los 53 que están en las dos carpetas no
  difieren en un byte. Las cinco de más son las habilidades de Codex —`autobuild`, `flow`,
  `integration-promote`, `integration-sync`, `onboard`—. El conflicto es inocuo: gane el que gane, el cargo
  recibe lo mismo.
- **Es comportamiento documentado de Gemini CLI, no un accidente.** Su página de habilidades —«Agent
  Skills», leída el 2026-10-10, sin versión declarada— dice que `.agents/skills/` es un alias de
  `.gemini/skills/` en el mismo nivel y que **le gana**. No documenta el aviso ni una forma de apagar una
  carpeta. **Verificado** que el aviso sigue saliendo con la versión instalada hoy, 0.63.0: 53 líneas, una por
  cargo, antes de la respuesta.

Dos cosas que eso cambia:

- Con Codex instalado, lo que Gemini usa **son los punteros de Codex**; los suyos sobran. Y Gemini ve además
  las cinco habilidades de Codex, que no son suyas: `autobuild` le llega como habilidad de `.agents/skills`
  además de como su comando `/cauce:autobuild`. Si eso estorba no se midió.
- El primer camino del fix se vuelve concreto: que el runner de Gemini no instale sus punteros cuando los de
  Codex ya están, y los vuelva a instalar si Codex se desinstala. El riesgo 1 de arriba es exactamente ése.

**Lo que el primer camino toca además, visto al ordenar los casos:**

- `automation doctor` cuenta como faltante cada cargo que no está en la carpeta del runner —«N cargo(s) sin
  instalar en .gemini/skills: reinstalá el adaptador»—. Sin enseñarle la regla nueva, callar el aviso de
  Gemini prende ése, y reinstalar lo vuelve a apagar: un aviso por otro.
- Desinstalar Codex tiene que reponer los punteros de Gemini en el mismo acto, y eso hace que un runner
  escriba en la carpeta de otro, que hoy no pasa en ningún lado.
- El segundo camino —dejar las dos carpetas y decirlo— no arregla el ruido. Si el primero pide más de lo
  que el ruido cuesta, el caso se cierra como límite del runner, dicho.

## Contexto de descubrimiento

Al correr sesiones reales de Gemini sobre un banco con los dos runners instalados, para medir el caso 360.

## Relacionados

- [360](./360-en-una-linea-el-arbol-de-la-tarea-queda-fuera-de-las-raices-cuando-la-raiz-es-el-repositorio.md) —
  en cuyo cierre quedó anotado.
