---
caso: 150
titulo: Siete suites necesitan un `.git` para correr, así que la copia que R23 manda usar no puede ejecutar la suite y sus fallos hablan de otra cosa
estado: abierto
prioridad: media
version-detectada: 0.90.0
---

# 150 — La regla manda probar en una copia y la copia no puede correr las pruebas

**🔴 abierto** · detectado en 0.90.0 · prioridad **media** — el choque no avisa: la copia falla con
mensajes que hablan del repositorio, no del entorno, y se leen como defectos reales

## Resumen

`conduct.md` —R23— es explícito:

> Un cambio que puede hacer fallar la herramienta que las pruebas invocan se ejercita en una copia, nunca
> en el árbol que contiene el trabajo. Y una mutación que apaga una defensa se corre en una copia
> **siempre**.

La forma barata de hacer esa copia es `git ls-files | tar` o `git archive`, y ninguna de las dos trae
`.git`. **Siete suites lo necesitan** para correr:

    test/agents/evaluations.test.js
    test/instance/delivery.test.js
    test/repo/suite.test.js
    test/repo/repo.test.js
    test/repo/coverage-floors.test.js
    test/repo/ci-schedule.test.js
    test/wiring/hooks.test.js

## Reproducción

```bash
S=$(mktemp -d)
git archive HEAD | (cd "$S" && tar xf -)
cd "$S" && node --test "test/**/*.test.js"
```

## Síntoma

Cinco fallos, y ninguno menciona git:

```
✖ todo lo que documenta el upgrade preserva la versión exacta
✖ cada archivo propio del molde declara cómo llega a una instancia que ya existe
✖ ningún comentario cita algo que dejó de existir
✖ ningún archivo del repositorio nombra la ruta absoluta de una máquina
✖ la suite no encoge sin que se vea
    AssertionError: la suite declara 0 pruebas y el piso es 505: se perdieron 505.
    Si es a propósito, bajá SUITE_FLOOR en el mismo commit y decí por qué; si no, algo pisó un archivo.
```

El mismo árbol clonado con `.git` da **824 pruebas y 0 fallos**.

## Causa raíz

No hay un archivo culpable: es la suma de dos cosas correctas por separado. Las siete suites usan
`git ls-files` porque **lo trackeado es lo que define al repositorio** —contar archivos del disco
mediría los temporales de otras pruebas—, y eso está bien. Y R23 manda copiar. Lo que falta es que
alguna de las dos diga que no se combinan.

## Lo que ya costó

- **Dos arneses de esta sesión** nacieron rotos por esto y hubo que rediseñarlos: el primero asumía que
  «la copia intacta pasa», que es falso.
- **Un falso hallazgo grave, a punto de reportarse.** Barriendo las cinco últimas versiones publicadas con
  `git archive`, las cinco daban 5 fallos. Clonadas de verdad dan **0**. La conclusión que estuvo a un
  paso de escribirse era «se publicaron cinco versiones con la suite en rojo».

## Fix propuesto

No está decidido.

1. **Que las siete se salteen con su razón cuando no hay `.git`**, como hacen con `process.platform ===
   'win32'`. Barato y honesto: la suite no miente sobre el entorno. Deja la copia sin esa cobertura, que
   es lo que ya pasa hoy, pero dicho.
2. **Un helper compartido que copie con `.git`** —`git clone --no-hardlinks` en vez de `tar`— y que R23
   nombre esa forma. Más caro por copia y hace que la copia sí corra la suite entera.
3. **Documentarlo en `AGENTS.md`** sin tocar código, en la sección de cómo se prueba acá.

La 1 y la 3 se complementan; la 2 las hace innecesarias y cuesta más.

## Tradeoffs

- La 1 deja siete suites sin correr en una copia, y un salto que nadie mira se vuelve invisible con el
  tiempo.
- La 2 clona el repositorio entero en cada arnés que hoy hace un `tar`; hay que medir cuánto tarda.
- La 3 sola no impide que el próximo arnés nazca roto: sólo explica el cadáver después.

## Prioridad

**Media.** No hay un defecto de producto detrás: el toolkit funciona. Lo que está roto es la forma de
medirlo, y eso ya produjo un falso positivo grave en esta misma sesión.

## Contexto de descubrimiento

Salió de construir el arreglo del caso 148, el 2026-09-14, cuando dos arneses distintos fallaron por la
misma razón y el barrido de versiones publicadas devolvió cinco falsos rojos.

## Relacionados

- **148** — el caso en cuyo arreglo apareció, tres veces.
- **147** — su cierre también usó copias para mutar, y se salvó por usar `git ls-files` desde el repo real.
