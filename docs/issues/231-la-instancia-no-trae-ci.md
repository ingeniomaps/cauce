---
caso: 231
titulo: la instancia no trae CI
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 231 — `init` no deja ningún CI en la instancia, y las dos relevadas lo escribieron a mano

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja** — `init` siembra un `ci.yml` propio de
la instancia, y `check` gana `--skip-roots` y la compilación de los workflows propios.

**Prioridad baja**: sin CI, un PR a la instancia puede romper un guard propio o el formato del planning sin que nada lo frene.

## Resumen

`init` no copia `.github/` a propósito, porque el `ci.yml` del toolkit corre `npm run ci`, que una instancia no tiene. roax-ops y conorbi-ops escribieron su propio `ci.yml`: `ops check`, las pruebas de sus guards propios, `bash -n` de los hooks y, en roax, compilar los workflows propios y escanear secretos.

## Reproducción

Verificado leyendo: `engine/cli/instance.js:104-106` dice por qué no se copia.

Y corriendo, el 2026-10-02: con un `git clone` de roax-ops y otro de conorbi-ops solos, como los clona un CI, `node
engine/cli/ops.js check <clon>/planning` da en roax `✗ ops.config.json: no existe la raíz dropi (../../dropi)` y
sale 1; en conorbi pasa, porque su única raíz es `..` y eso existe en cualquier clon. Por eso roax se escribió
un `check.js` propio con `--sin-workspace`.

## Síntoma

Cada instancia rearma lo mismo, o se queda sin CI.

## Causa raíz

`engine/cli/instance.js:104-106`.

## Fix propuesto

Un `ci.yml` de molde propio de la instancia —distinto del del toolkit— con `ops check planning` y la sintaxis de hooks y workflows propios, y un modo de `check` que tolere raíces de trabajo ausentes en CI diciendo cuántas saltó.

## Tradeoffs

- Un workflow de molde es una cosa más que mantener por versión.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 223 — los hooks y workflows propios que ese CI probaría.

## Cierre

Resuelto el 2026-10-02 con las dos decisiones que tomó Manuel: el CI lo siembra `init` y desde ahí es de la
instancia, y las raíces ausentes se saltean con una bandera explícita, no detectando el ambiente (R27).

**Lo que se corrió.**

- **Los pasos del `ci.yml` en un clon aislado.** `init` creó una instancia sidecar en el scratchpad, con el motor
  de esta rama enlazado, un guard propio con su prueba y un workflow propio con `{{INCLUDE:…}}`. Se committeó y
  se clonó a otra carpeta, y se ejecutaron los `run:` del `ci.yml` del clon, menos `npm ci`, que necesitaría la
  0.100.0 publicada. Los tres pasos salen 0. Después se rompió una cosa por paso —`if then` en un hook, un
  paréntesis sin cerrar en el workflow, una prueba que tira— y los tres salen 1. El de los hooks salía 0 en la
  primera versión: un `for` devuelve el estado de la última vuelta. Por eso el paso lleva `|| exit 1`.
- **`--skip-roots` sobre los clones reales.** En el clon de roax, `check --skip-roots` pasa: `⚠ --skip-roots: 1
  raíz(ces) ausente(s) sin comprobar (dropi)` y `✓ planning válido: 57 épica(s)`. Sin la bandera sigue saliendo
  el error de arriba. En conorbi, con y sin la bandera, `✓ planning válido`.
- **Mutaciones, en una copia.** Cada una puso en rojo la prueba que la cuida:
  - sin la compilación, `check nombra el workflow propio que no compila`;
  - con la bandera ignorada, `una raíz ausente es error, y con --skip-roots es un aviso`;
  - sin saltear `.github` en embedded, `una instancia embedded no recibe CI`;
  - sin la llamada desde `check`, `check frena un workflow propio que no compila`.
- **Dos supuestos medidos antes de escribirlos.**
  - `npm pack --dry-run` (npm 11.16.0) incluye un `template/.github/workflows/ci.yml` anidado, así que el
    molde lo lleva con su nombre, sin el renombre que necesita `gitignore`.
  - `node --test automatization/tests/` con un directorio corre 1 prueba y pasa 0 en Node 24.18.0, así que el
    paso usa el glob.
  - Y una afirmación que iba a escribir resultó falsa: `node --check` **no** rechaza un workflow con `await` o
    `return` de primer nivel (sale 0 en los dos). El comentario de `ownWorkflowErrors` dice la razón real para
    compilar ahí: hay que renderizar antes, porque un `{{INCLUDE:…}}` sin resolver no es JavaScript.

**Recorrido de lo que el caso enumeraba:**

- **Un `ci.yml` de molde propio de la instancia** — se hizo: `template/.github/workflows/ci.yml`, sembrado por
  `init` (`TEMPLATE_OWN` lo marca `init`, así que `upgrade` no lo pisa) y salteado en embedded.
- **Con `ops check planning`** — se hizo, con `--skip-roots`.
- **Con la sintaxis de hooks** — se hizo: `bash -n` sobre `automatization/hooks/*.sh`.
- **Con la sintaxis de workflows propios** — se hizo distinto: no es un paso del `ci.yml` sino parte de
  `check`. Así lo ve también quien corre `check` en su máquina, y el `ci.yml` no tiene que saber renderizar.
- **Un modo de `check` que tolere raíces ausentes diciendo cuántas saltó** — se hizo: `--skip-roots` las nombra
  y las cuenta.
- **Tradeoff: un workflow de molde es una cosa más que mantener por versión** — acotado: como es de la
  instancia, una versión nueva no lo reescribe. Lo que cambie en el molde sólo llega a las instancias nuevas, y
  el CHANGELOG dice de dónde copiarlo.

**Lo que el caso no preveía.** Las pruebas de los guards propios entraron al `ci.yml` aunque el caso no las
pedía: las dos instancias relevadas las corren, y `organization/workspace.md` ya dice que viven en
`automatization/tests/`. El escáner de secretos de roax no entra: es una acción de terceros, y elegirla es de
cada empresa.
