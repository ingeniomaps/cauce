---
caso: 303
titulo: la fecha de hoy sale en utc
estado: resuelto
resuelto-en: 0.103.5
prioridad: baja
version-detectada: 0.103.4
---

# 303 — Después de las siete de la tarde, una entrada de `done/` lleva la fecha de mañana

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **baja**.

**Prioridad baja**: un día de diferencia en un campo que nadie compara con un reloj. Importa donde la fecha
decide algo: un vencimiento, o qué cae en qué mes.

## Resumen

El motor calcula «hoy» en UTC. En una máquina al oeste de Greenwich, lo que se cierra a la noche queda
fechado al día siguiente.

## Reproducción

```
TZ=America/Bogota node -e "
const d = new Date('2026-10-07T02:10:00Z')
console.log('UTC   ', d.toISOString().slice(0, 10))
console.log('local ', d.toLocaleDateString('sv-SE'))"
```

## Síntoma

```
UTC    2026-10-07
local  2026-10-06
```

Una instancia real cerró una tarea el 6 de octubre a las 21:10 de su hora, y la entrada dice
`fecha: 2026-10-07`. `ops check` no lo marca.

## Causa raíz

`engine/cli/io.js:39`: `const TODAY = () => new Date().toISOString().slice(0, 10)`. `toISOString` es UTC
siempre. Es el único lugar donde se calcula, que es lo que su comentario promete; el huso no está en esa
promesa.

## Fix propuesto

- Decidir qué día es «hoy»: el de la máquina que corre, o UTC dicho con todas las letras.
- Si es el local, calcularlo con el huso de la máquina en ese mismo lugar.
- Mirar quién más corta fechas con `toISOString`: `engine/agents/learning-files.js:98` y
  `engine/planning/recurring.js:37` lo hacen por su cuenta.

## Tradeoffs

- **UTC es estable entre máquinas.** Dos personas del mismo equipo en husos distintos fechan igual, y un CI
  en la nube también. Con fecha local, el mismo instante da dos días según quién corra.
- **El ciclo de aprendizaje corta por mes** con su propia fecha, y corre en GitHub Actions, que es UTC.
  Cambiar una y no la otra deja dos calendarios.

## Contexto de descubrimiento

El reporte de una instancia real sobre 0.103.4. No es de esa versión: la línea es anterior.

## Relacionados

- 301 — el reporte donde apareció.

## Cierre

**Resuelto en 0.103.5.** La decisión: el día es el del huso que el proyecto declara, y UTC si no declara.

### El recorrido de lo que este caso enumeró

- **Qué día es «hoy» — se decidió.** El del proyecto, no el de la máquina: `timeZone` en `ops.config.json`,
  en forma IANA. Así dos personas del mismo equipo y el CI fechan igual, que era el tradeoff de usar la hora
  local. Sin declararlo nada cambia.
- **Calcularlo en el mismo lugar — se hizo.** `TODAY` sigue siendo el único sitio. El CLI le anota la raíz
  antes de despachar y el archivo se lee recién cuando un comando pregunta la fecha.
- **Quién más corta fechas con `toISOString` — se miró, y no se tocó.** `learning-files.js` fecha el ciclo de
  aprendizaje, que corre en GitHub Actions y corta por mes: cambiarlo dejaría dos calendarios, que era el
  segundo tradeoff. `recurring.js:37` no pregunta la fecha: formatea una que le dan.
- **Lo que sigue en UTC, dicho**: el ciclo de aprendizaje entero —informes, sellos, fecha de firma— y la
  fecha con que se prepara una propuesta. No pasan por `TODAY`.
- **Tradeoffs — resueltos los dos**, por lo de arriba.

### Lo que este caso encontró y no preveía

El primer argumento de un comando no siempre es una raíz —`evaluate <cargo>`, `agents fork`—. Subir desde
ahí encontraba la configuración de quien estuviera parado en esa carpeta. Lo mostró una revisión independiente
del diff. Ahora un argumento que no es una carpeta no cuenta, y se usa la raíz que exportó el shim. Y un
`ops.config.json` roto no manda a leer el de la carpeta de arriba.

Un huso mal escrito no puede caer a UTC en silencio: la fecha saldría corrida justo en la instancia que lo
declaró para que no pasara. `check` lo rechaza.

### Qué se corrió

- **El CLI instalado, en un banco**, cambiando sólo `timeZone`, el 2026-10-07 a las 14 UTC:

  ```
  Pacific/Pago_Pago 2026-10-07 · sin declarar 2026-10-07 · Pacific/Kiritimati 2026-10-08
  ✗ ops.config.json: timeZone debe ser un huso IANA, como "America/Bogota" o "Europe/Madrid"
  ```

- **La hora del reporte**, en la prueba: a las 02:10 UTC del 7 de octubre, con `America/Bogota` da el 6 y sin
  declarar da el 7. También leyendo desde la carpeta de planning, que es lo que recibe casi todo comando.
- **Seis mutaciones en rojo, en una copia**: ignorando el huso, sin subir desde la carpeta de planning, el
  CLI sin anotar la raíz, `check` sin rechazar un huso inválido, subiendo desde un argumento que no es una
  carpeta, y un archivo roto mandando a leer el de arriba.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real con su huso declarado.
