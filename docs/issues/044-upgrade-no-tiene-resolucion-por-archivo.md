---
caso: 044
titulo: `upgrade` no tiene resolución por archivo y un proyecto adoptante queda entre no actualizar nunca y descartarlo todo
estado: resuelto
resuelto-en: 0.67.0
prioridad: media
version-detectada: 0.66.0
---

# 044 — `upgrade` es todo o nada, y el consejo que da no cubre `PROTOCOL`, `METHODOLOGY` ni el `Makefile`

**🟢 resuelto en 0.67.0** · detectado en 0.66.0 · prioridad **media** — no hay pérdida silenciosa; hay un camino de actualización que se cierra

## Resumen

`upgrade` aborta si **algún** archivo mantenido por el toolkit fue editado, y el único flag que lo
destraba descarta **todos** los cambios locales de una. No hay resolución por archivo: ni un `--keep`,
ni un modo que actualice lo intacto y deje lo editado, ni un informe de qué perdería cada uno.

La protección en sí está bien y es deliberada —es lo que arregló el [001](001-upgrade-pisa-lo-que-init-force-conservo.md)—.
Lo que falta es la salida. Un proyecto que adopta Cauce sobre un sistema propio queda con dos opciones y
las dos son malas: no actualizar nunca, o perder su corpus.

Y el consejo que imprime `adviceFor` no alcanza para el caso que más lo necesita. Para `system/` manda
escribir la regla propia al lado con el mismo ID, y eso **existe y funciona**. Para los docs dice que
«no llevan una línea de la empresa» y que lo propio va a una ADR, una regla o `planning/delivery/project.md`.
Pero `PROTOCOL.md`, `METHODOLOGY.md`, `FLOW.md` y el `Makefile` no tienen contraparte propia a la que
mudarse: no hay un `PROTOCOL` del proyecto que le gane al del toolkit como sí lo hay en `rules/`.

## Reproducción

No hace falta un banco: se llega adoptando Cauce sobre un repositorio que ya tenía su proceso escrito,
que es el camino que documenta el README.

```bash
BANCO=~/.cache/sonda-044 && rm -rf "$BANCO" && mkdir -p "$BANCO/planning" && cd "$BANCO"
# Un proyecto que ya tenía su protocolo, anterior a Cauce.
printf '# Protocolo propio\n\nLas 13 fases de este equipo.\n' > planning/PROTOCOL.md
npx @ingeniomaps/cauce@0.66.0 init . --mode embedded --force --install
cauce upgrade . --check
```

*Verificado* el 2026-09-07 sobre 0.66.0, sobre una instancia real con 19 archivos en esta situación.

## Síntoma

`upgrade --check` lista los archivos y no ofrece ninguna salida intermedia:

```
  editado localmente: automatization/hooks/guard-verify.sh
  editado localmente: planning/PROTOCOL.md
  editado localmente: planning/METHODOLOGY.md
  editado localmente: AGENTS.md
  editado localmente: Makefile
  …
= 0.66.0: la instancia está al día con el motor instalado
```

Y el `upgrade` de verdad corta con el mensaje de `:299`: «N archivo(s) que mantiene Cauce fueron editados
y se perderían… Si el cambio ya no te sirve, repetí con `--force` para descartarlo».

En la instancia real son 19: 6 guards con nombre del toolkit e implementación propia, y 13 docs. La
distancia contra la plantilla, en líneas en común, dice que no son retoques:

| archivo | propio | plantilla | líneas en común |
|---|---|---|---|
| `planning/METHODOLOGY.md` | 361 | 43 | 1 |
| `planning/PROTOCOL.md` | 164 | 92 | 5 |
| `AGENTS.md` | 199 | 190 | 1 |
| `Makefile` | 65 | 108 | 1 |

`--force` sobre eso no es «descartar un cambio que ya no sirve»: es reemplazar el proceso del proyecto
por el molde.

## Causa raíz

`engine/cli/instance.js:296` — la decisión es por corrida, no por archivo:

```js
if (changed.length && !force) {
  for (const file of changed) console.error(`✗ ${file}`)
  fail(
    `\n${changed.length} archivo(s) que mantiene Cauce fueron editados y se perderían.\n\n` +
    `${adviceFor(changed)}\n\nSi el cambio ya no te sirve, repetí con --force para descartarlo.`,
  )
}
```

`force` es un booleano global que después gobierna todas las escrituras. No hay un estado intermedio
entre «ninguno» y «todos».

El hueco del consejo está en `engine/cli/upgrade-report.js:40`, en la rama `docs`: da por sentado que un
archivo de esa lista no lleva contenido de la empresa. Para `adr/000-template.md` es cierto; para
`PROTOCOL.md` de un proyecto que llegó con el suyo, no.

## Fix propuesto

Dos piezas, y la primera sola ya destraba el caso:

1. **Resolución por archivo.** Actualizar lo intacto y saltear lo editado, nombrándolo:

```diff
-if (changed.length && !force) { … fail(…) }
+// Un proyecto que adoptó Cauce sobre lo suyo tiene archivos que nunca va a querer del molde y otros
+// que sí. Cortar por la corrida entera lo obliga a elegir entre no actualizar nunca y perder todo.
+const skip = force ? [] : changed
+for (const file of skip) console.log(`= conservado ${file} (editado localmente; no se actualiza)`)
```

   Con eso `upgrade` deja de ser un portón y pasa a ser lo que su mensaje ya insinúa. El proyecto recibe
   `rules/system/` y `adr/system/` frescos —que es donde vive lo que de verdad cambia entre versiones— y
   conserva su corpus.

2. **Un `--keep <ruta>` explícito, o su inverso `--replace <ruta>`**, para el que quiera decidir de a uno
   sin depender del default.

Y aparte, un renglón en el consejo para los docs que no tienen contraparte propia: decir qué hacer con
un `PROTOCOL.md` o un `Makefile` propios. Hoy no lo dice, y no hay mecanismo para mudarlos.

## Tradeoffs

Saltear en silencio lo editado tiene un costo real: una instancia puede quedar con la mitad del molde
viejo y no enterarse, que es justo lo que el 001 vino a impedir. Por eso el `= conservado` de cada
archivo tiene que salir en cada corrida, no sólo la primera, y `check` debería contarlos —un «N archivo(s)
del molde congelados» al pie— para que la deuda no desaparezca de la vista.

El otro riesgo es una instancia incoherente: un `PROTOCOL.md` viejo describiendo contratos que el motor
nuevo ya no acepta. Pero eso pasa igual hoy, sólo que con el `upgrade` entero trabado; la diferencia es
que así al menos el resto se actualiza.

## Prioridad

**Media.** No hay pérdida silenciosa y no bloquea el uso diario: el motor sube por `npm` sin pasar por
`upgrade` —nada exige que la instancia y el motor coincidan, no hay chequeo de `cauceVersion`—, así que
lo que se congela es el molde materializado, no el comportamiento. Lo que se pierde es el camino de
actualización de `rules/system/` y `adr/system/`, que es donde viven las reglas que los agentes leen.

Sube a alta el día que alguien, para destrabarlo, corra `--force` sin leer la lista.

## Contexto de descubrimiento

Migrando `roax-ops` a Cauce 0.66.0 el 2026-09-07. Es un sistema de planning hecho a mano y anterior a
Cauce, con su propio `PROTOCOL.md` de 13 fases, su `METHODOLOGY.md` y 8 guards. Tras `init --force` la
instancia quedó funcionando y con `check` en verde, pero `upgrade` nació trabado y la decisión que quedó
sobre la mesa fue exactamente ésta: no actualizar nunca, o reescribir el proceso del equipo. Se eligió lo
primero, y adoptar el `PROTOCOL` de Cauce quedó como trabajo propio para más adelante — se puede, porque
resultó ser la misma máquina de fases, pero es un proyecto, no un flag.

## Cierre

**Resuelto en 0.67.0.** El recorrido de lo que enumeró, ítem por ítem:

- **Resolución por archivo — hecha, y es lo que destraba el caso.** `upgrade` deja de abortar: conserva
  cada archivo editado, actualiza todo lo demás y nombra lo que congeló. Un proyecto que adoptó Cauce
  sobre su propio proceso recibe `rules/system/` y `adr/system/` frescos —donde viven las reglas que los
  agentes leen— y conserva su corpus.
- **El aviso en cada corrida y no sólo la primera — hecho**, y tiene su prueba: dos `upgrade` seguidos y
  el segundo vuelve a decir qué conservó.
- **`check` cuenta los congelados — hecho.** Sale como advertencia en cada corrida, no sólo el día que
  alguien actualiza, que es lo que evita que la deuda desaparezca de la vista.
- **El renglón del consejo para los docs sin contraparte propia — hecho.** `PROTOCOL.md`,
  `METHODOLOGY.md`, `FLOW.md` y el `Makefile` no tienen adónde mudarse, y el consejo genérico —«lo tuyo
  va a una ADR, una regla o `delivery/project.md`»— les mentía. Ahora se los nombra y se dice qué pasa:
  quedan congelados con la versión del proyecto, el resto se actualiza igual, y adoptar el del toolkit es
  trabajo propio, no un flag.
- **`--keep` / `--replace` por ruta — no se implementa, y es una decisión.** Con la resolución por
  archivo, conservar ya es el default y reemplazar todo sigue siendo `--force`. Lo único que queda sin
  cubrir es «reemplazá sólo este archivo», que hoy no lo pidió nadie: agregar dos flags para un caso
  hipotético es infraestructura especulativa. Lo que lo activaría: alguien con una instancia donde una
  parte de lo editado sí quiere devolverla al molde y otra no.

- **«El otro riesgo es una instancia incoherente» — sigue en pie tal como el caso lo dejó.** Un
  `PROTOCOL.md` viejo puede describir contratos que el motor nuevo ya no acepta, y conservarlo no lo
  arregla. El propio caso lo resolvía: eso pasa igual hoy, sólo que con el `upgrade` entero trabado, y
  ahora al menos el resto se actualiza. Lo que cambia es que la incoherencia deja de ser invisible: el
  conteo de `check` la nombra en cada corrida, así que quien la tenga la ve antes de tropezarse con ella.
- **La condición de escalada que declaraba «Prioridad» —«sube a alta el día que alguien, para
  destrabarlo, corra `--force` sin leer la lista»— deja de existir.** Ya no hay que destrabar nada:
  `--force` pasa de ser la única salida a ser una decisión deliberada de tomar la versión del molde. El
  camino que empujaba a usarlo sin leer es el que se cerró.

**Lo que el caso no preveía y era lo que podía arruinarlo todo**: el registro. Después de conservar un
archivo, el paso que regraba el manifiesto lo digiere **desde disco**, así que el archivo conservado
habría quedado idéntico a «lo entregado», habría dejado de detectarse como editado, y la corrida
siguiente lo habría pisado sin decir nada — el 001 de vuelta por la puerta de atrás. No se ve mirando el
archivo: se ve dos `upgrade` después. Se arregla conservando el digest previo de cada archivo congelado,
y hay una prueba que falla si se quita.

**El contrato cambia para quien ya lo usa, y hay que decirlo**: `upgrade` ya no aborta ni devuelve
código distinto de cero por una edición local. Tres pruebas que afirmaban lo contrario se reescribieron
—no para acomodarlas al código nuevo, sino porque afirmaban el mecanismo y no la garantía—: lo que el
001 protege es que la edición no se pierda, y conservarla lo cumple mejor que abortar. Las aserciones
que comprueban que el contenido local sobrevive quedaron intactas en las tres.

## Relacionados

- [001](001-upgrade-pisa-lo-que-init-force-conservo.md) — la protección que este caso quiere destrabar
  sin romperla. Ahí `upgrade` pisaba lo conservado; el arreglo fue frenarlo, y lo que faltó fue la salida.
- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) y
  [009](009-el-bloque-del-runner-marca-agents-md-como-editado.md) — el mismo choque visto desde
  `AGENTS.md`: un archivo del molde que el proyecto tiene motivos para editar.
- [010](010-upgrade-no-crea-los-archivos-propios-nuevos-del-molde.md) — la otra mitad de lo que `upgrade`
  hace con lo que es del proyecto.
- [007](007-el-override-por-nombre-retira-reglas-en-silencio.md) — el mecanismo de override que sí existe
  para `rules/` y que a los docs les falta.
