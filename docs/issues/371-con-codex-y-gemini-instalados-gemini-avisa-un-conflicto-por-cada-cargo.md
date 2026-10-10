---
caso: 371
titulo: con Codex y Gemini instalados, Gemini avisa un conflicto por cada cargo
estado: resuelto
resuelto-en: 0.107.0
prioridad: baja
version-detectada: 0.106.0
---

# 371 — Con los runners de Codex y de Gemini instalados en la misma carpeta, Gemini imprime «Skill conflict detected» por cada cargo al abrir una sesión

**🟢 resuelto en 0.107.0** · detectado en 0.106.0 · prioridad **baja**.

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

## Cierre

Se tomó el primer camino, en su forma más chica: Gemini escribe sus punteros en `.agents/skills`, la misma
carpeta que Codex, porque Gemini CLI la lee como alias de la suya y con precedencia —documentado, y verificado
por el propio aviso, que decía qué copia ganaba—. Con los dos instalados el puntero es uno, idéntico, y nadie
depende de lo que instaló el otro: cada runner escribe el suyo, y escribir dos veces lo mismo no cambia nada.
Recorrido de lo que el caso enumeraba:

- **Fix 1, que un runner no instale lo que el otro ya puso**: hecho distinto. En vez de que Gemini mire si Codex
  está, los dos escriben el mismo archivo en el mismo lugar. Lo que sí hubo que cuidar es la desinstalación:
  `uninstallRoleSkills` conserva los punteros si otro adaptador instalado declara la misma carpeta, y lo dice.
- **Fix 2, dejar las dos carpetas y que `doctor` lo diga**: descartado; no arregla el ruido.
- **Lo que había que mirar antes**: hecho en la revisión —punteros idénticos, comportamiento documentado—.
- **Riesgo 1, un runner sin cargos al desinstalar el otro**: cubierto por la prueba, en los dos órdenes.
- **Riesgo 2, punteros distintos**: no lo son; los genera la misma función.
- **Lo visto al ordenar los casos**: `doctor` lee `runner.roleSkills`, así que para Gemini los cargos están
  donde los busca, sin regla nueva. Un runner no escribe en la carpeta de otro: escribe en la suya, que ahora
  es la misma. Una instalación anterior deja `.gemini/skills` con los punteros viejos, y ahí sí seguiría el
  aviso: `retiredRoleSkills` en el manifiesto hace que reinstalar quite de esa carpeta lo que generó Cauce y
  conserve lo editado, nombrándolo.
- **Lo que Gemini ve además** —las cinco habilidades de Codex en `.agents/skills`— no cambia con esto y no se
  midió si estorba; queda dicho como límite.

**Prueba corrida.** `test/wiring/shared-skills.test.js`, dos pruebas, en rojo antes y en verde después. Y la
sesión real: sobre un banco `suelto` con los dos runners, antes del cambio `gemini -p` imprimía **53** líneas
«Skill conflict detected»; reinstalado Gemini con el motor nuevo —«53 cargo(s) disponibles en .agents/skills ·
53 puntero(s) viejos quitados de .gemini/skills»— la misma sesión imprime **0** y contesta.

**Mutaciones**, en una copia fuera del árbol, tres, todas en rojo: desinstalar sin mirar quién comparte la
carpeta → «Gemini sigue con sus cargos»; retirar también lo editado → «el editado no es nuestro»; no retirar
la carpeta vieja → «el puntero viejo sobraba».

Lo que el enunciado no preveía: la desinstalación de los punteros salió de `index.js` a `roles.js`, que ya
tenía su instalación, porque `index.js` cruzó las 500 líneas con el chequeo nuevo.

## Revisión del conjunto

La revisión independiente del diff de la rama señaló dos cosas acá, y las dos entraron. El retiro y la
desinstalación repetían el mismo bucle: ahora es uno, `prunePointers`. Y los dos recorrían sólo el catálogo
actual, así que el puntero de un cargo borrado de `agents/roles/` quedaba para siempre en la carpeta vieja,
cargado por Gemini como un cargo vigente: ahora se recorre la carpeta y lo nuestro se reconoce por su propio
contenido —nombre, descripción y referencia, regenerados y comparados enteros—, así que el de un cargo que
ya no existe también se va. Las habilidades de Codex en la misma carpeta no son punteros y no se tocan ni se
nombran. Prueba y mutación —«retirar sólo lo que está en el catálogo» → «el del cargo borrado también»—.

Una segunda pasada sobre ese arreglo trajo dos más, con prueba y mutación: recorrer la carpeta entera seguía
un enlace simbólico puesto ahí y borraba el archivo de afuera antes de morir con `ENOTDIR` —ahora un enlace,
en la carpeta o en la entrada, no es un puntero y no se toca—; y leer los campos con el parser de frontmatter
no era un punto fijo —quita comillas de los bordes—, así que un puntero cuya descripción termina en comilla
dejaba de ser nuestro y se conservaba para siempre como editado; los campos se leen crudos de su línea.
Y la tercera pasada vio que mirar sólo la carpeta y la entrada dejaba afuera los tramos de arriba —un
`.gemini` que fuera un enlace—: ahora se comprueba el camino entero desde la raíz de instalación, con lo
mismo que usa `install` para escribir. Prueba: la carpeta vieja entera como enlace hacia afuera, y lo de
atrás queda.

## Contexto de descubrimiento

Al correr sesiones reales de Gemini sobre un banco con los dos runners instalados, para medir el caso 360.

## Relacionados

- [360](./360-en-una-linea-el-arbol-de-la-tarea-queda-fuera-de-las-raices-cuando-la-raiz-es-el-repositorio.md) —
  en cuyo cierre quedó anotado.
