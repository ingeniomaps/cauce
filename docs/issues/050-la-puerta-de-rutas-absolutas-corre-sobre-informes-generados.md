---
caso: 050
titulo: La puerta de rutas absolutas corre sobre informes generados, y una ruta citada bloquea el PR
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.70.0
---

# 050 — Un informe que cita una ruta rompe su propio PR

**🟢 resuelto en 0.71.0** · detectado en 0.70.0 · prioridad **media** — bloquea el merge y el arreglo es editar evidencia

## Resumen

La prueba «ningún archivo del repositorio nombra la ruta absoluta de una máquina» recorre todo
`git ls-files`. Eso incluye los informes semanales que escriben los cargos, que son prosa generada por un
agente y no código del proyecto.

Un cargo que necesite citar una ruta para explicar su hallazgo rompe la puerta, y con ella el PR de su
propio informe. No es hipotético: el `security-engineer` del 2026-09-07 describía los tres objetivos que
cubre el guard `destructive` y, al escribirlos pegados entre comillas invertidas, la yuxtaposición
compuso literalmente la secuencia que la puerta busca. No era la carpeta de nadie — era la enumeración
de lo que la regla bloquea.

Lo incómodo no es el falso positivo sino el arreglo: **se termina editando la evidencia para que pase
una puerta**. El hallazgo del informe no cambia, pero la prosa que lo sostiene se reescribe por una
razón que no tiene nada que ver con lo que el cargo investigó.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce
npm ci

# Un informe cualquiera cita una ruta al explicar un hallazgo.
informe=agents/roles/system/qa-engineer/learning/reports/2026-08-22.md
printf '\n- El guard cubre `/home/` entre sus objetivos.\n' >> "$informe"

node --test test/repo/repo.test.js 2>&1 | grep -A 3 'ruta absoluta'

git checkout -- "$informe"   # revertir
```

## Síntoma

```
✖ ningún archivo del repositorio nombra la ruta absoluta de una máquina
  AssertionError [ERR_ASSERTION]: rutas absolutas:
    agents/roles/system/security-engineer/learning/reports/2026-09-07.md:165: - `destructive`: tres reglas (`rm -rf` sobre `/`/home/`..`, `git checkout -- .`/
```

En la corrida real el PR quedó `BLOCKED` con los dos checks en `FAILURE`, y los otros diecinueve de la
misma tanda en `CLEAN`.

Y el caso se muerde la cola: **este archivo dispara la misma puerta** por pegar el síntoma de arriba, así
que hubo que declararlo en `DECLARED` para poder escribirlo. Eso es un dato más a favor de eximir la
prosa en vez de perdonarla archivo por archivo — la lista crece con cada documento que hable del tema.

## Causa raíz

`test/repo/repo.test.js:454-489`. El corpus es `git ls-files` entero, sin distinguir código del
proyecto de prosa producida por el ciclo:

```js
const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n')
```

La lista `DECLARED` existe para excepciones, pero está pensada para archivos concretos que se declaran de
a uno —hoy tiene `test/workflows/workflows.test.js`— y no para un directorio que crece solo cada semana.

Vale la pena notar contra qué **no** choca: `sourceFiles()` (`repo.test.js:17-28`), el corpus de la
prueba de razones repetidas, se limita a `.js` y `.sh` bajo `engine`, `automatization`, `test` y
`template`. Los informes quedan fuera por extensión y por directorio, así que esa puerta no los mira.

## Fix propuesto

Sacar del corpus la prosa que el ciclo genera, dejando la puerta donde importa —el código y las
plantillas que sí escribe una persona—:

```diff
   const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n')
+  // Los informes del ciclo son prosa que escribe un cargo, no fuente del proyecto: uno que cite una
+  // ruta para explicar su hallazgo rompía el PR de su propio informe, y el arreglo era editar la
+  // evidencia. Lo que la puerta cuida —que nadie committee la carpeta de su máquina— sigue cubierto,
+  // porque nada de eso se escribe acá.
+  const GENERADO = /^agents\/roles\/system\/[^/]+\/learning\/reports\//
   const names = (text) => ABSOLUTE.some((pattern) => pattern.test(text))
   for (const file of tracked) {
     if (DECLARED.has(file)) continue
+    if (GENERADO.test(file)) continue
```

## Tradeoffs

- Se abre un hueco real: si algún día un informe trae la ruta de la máquina de alguien, la puerta ya no
  lo va a decir. El riesgo es bajo —el ciclo corre en un runner efímero y el informe se escribe sobre
  fuentes públicas— pero deja de estar cubierto, y eso es lo que se está comprando.
- La alternativa de no eximir nada obliga a editar cada informe que cite una ruta, o sea a tocar
  evidencia por una razón ajena a la investigación. Es peor.
- **No medido**: no sé con qué frecuencia un cargo necesita citar rutas. Un caso en dos tandas es un
  punto, no una tasa.

## Contexto de descubrimiento

Aprobando la CI de los veinte PR de la tanda del 2026-09-07. Diecinueve pasaron y el de
`security-engineer` falló; el log señalaba la línea exacta del informe.

## Relacionados

- [049](049-nada-valida-el-status-del-informe-y-puede-autoexcluirse.md) — el otro cruce entre una
  validación del repositorio y un artefacto que escribe el ciclo.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró, contra las cuatro secciones que enumeran algo:

- **El fix propuesto se hizo tal cual.** Los informes de `learning/reports/` salen del corpus por
  directorio. Se exime el directorio y no cada archivo porque crece solo, una vez por semana y por cargo,
  y una lista que hay que mantener a mano deja de mantenerse.
- **Tradeoff «se abre un hueco real» — se paga, y queda acotado.** Si un informe trajera la ruta de la
  máquina de alguien, la puerta ya no lo diría. Lo que sostiene que el riesgo sea bajo es dónde corre el
  ciclo: un runner efímero, sin la carpeta de nadie. Lo que lo reabriría es que los informes empiecen a
  escribirse desde una máquina personal.
- **Tradeoff «la alternativa —editar cada informe que cite una ruta— es peor» — se confirma.** Es lo que
  hubo que hacer con el de `security-engineer` el 2026-09-07, y significó tocar la prosa que sostiene un
  hallazgo por una razón ajena a lo que ese cargo investigó.
- **Tradeoff «no medido: no sé con qué frecuencia un cargo necesita citar rutas» — sigue sin medirse.**
  Hoy es un caso en tres tandas, que es un punto y no una tasa. No cambia la decisión: el costo del
  arreglo es una línea y el de no tenerlo es un PR bloqueado cada vez.
- **La nota del propio caso —«un dato más a favor de eximir la prosa en vez de perdonarla archivo por
  archivo»— se siguió sólo hasta donde alcanza el argumento.** Se eximieron los informes; **no** los casos
  de `docs/issues/`, y este archivo sigue en `DECLARED`. La diferencia es quién escribe: un informe lo
  produce el ciclo sin que nadie lo revise antes de publicarlo, y un caso lo escribe alguien que elige qué
  pegar — y ahí pegar un log con la ruta de su máquina es un error de verdad, no una cita.
- **La exención se comprueba contra el árbol, no contra sí misma.** Un patrón que dejara de coincidir con
  dónde viven los informes se vería igual que uno que funciona: los dos terminan sin eximir nada. La
  aserción falla si el patrón queda huérfano, y esa mutación está verificada.

Lo que el caso no preveía: el arreglo empujó a `repo.test.js` sobre las 500 líneas, y la revisión que ese
umbral dispara encontró que el archivo mezcla dos sujetos —la forma del código y qué se le exige a un
comentario—. La partición quedó anotada en `PENDING_SPLIT` con su forma exacta, en vez de hacerse a medias
como cola de este cambio: se intentó, tres constantes y dos imports viajaron mal, y se revirtió.
