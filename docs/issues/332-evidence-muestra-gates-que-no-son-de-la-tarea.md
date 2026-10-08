---
caso: 332
titulo: evidence muestra gates que no son de la tarea
estado: resuelto
resuelto-en: 0.104.1
prioridad: baja
version-detectada: 0.104.0
---

# 332 — `ops evidence` lista bajo una tarea gates que corrieron una semana antes, y dice que son los de su commit

**🟢 resuelto en 0.104.1** · detectado en 0.104.0 · prioridad **baja**.

**Prioridad baja**: es texto que se lee de más. Nada decide con ese registro, y lo lee un solo comando.

## Resumen

`ops evidence` imprime las últimas corridas del guard `verify` debajo de la tarea que se le pide, y cierra
diciendo que el contraste muestra «qué gates corrieron al commitear». El registro no sabe de tareas: guarda
las últimas veinte corridas de la instancia, de cualquiera de sus repositorios. Si `verify` está apagado, o la tarea se
commiteó en otro lado, las líneas son de otro trabajo y nada lo dice.

## Reproducción

En un banco desechable (`ops bench suelto`), con un registro de dos gates del 1 de octubre y una tarea
cerrada el 8:

```
TAREA  tarea-de-hoy
TESTS  (la entrada no rastrea ningún criterio)
GATES  2026-10-01T14:29:40.631Z  test (exit 0)
GATES  2026-10-01T14:29:53.314Z  lint (exit 1)
Este contraste dice si el artefacto existe y qué gates corrieron al commitear. No dice que la prueba
nombrada haya corrido: eso depende del runner, y varios no la nombran al pasar.
```

Sale en 0. Así se vio en una instancia real que reemplazó `verify` por su propia puerta —con
`OPS_SKIP_VERIFY=1` en la configuración de su runner—: veinte líneas de una semana atrás bajo cada tarea
nueva.

## Causa raíz

- `engine/core/evidence.js`, `record`: cada línea guarda `at`, `gate`, `status` y `ms`. No guarda
  repositorio, commit ni tarea, y el archivo es rodante, de veinte líneas.
- `engine/cli/planning.js`, `evidence`: imprime todas las líneas bajo la tarea y afirma que son las de su
  commit.
- Al registro sólo escribe el guard (`engine/hooks/verify.js`, `verifyGates`). Es su único
  llamador: lo que corra cualquier otra puerta —la propia de una empresa, por ejemplo— no queda anotado.

## Fix propuesto

Sólo el texto, sin cruzar el registro con la tarea más de lo que el registro permite:

1. Encabezar las líneas con lo que son: las últimas corridas de `verify` en esta instancia.
2. Avisar cuando todas son anteriores al cierre de la tarea. Se compara con dos días de margen: `fecha:` es
   local y sin hora, y el registro guarda instantes en UTC.
3. La frase final deja de decir «qué gates corrieron al commitear» y dice que el registro no ata un gate a
   una tarea ni a un repositorio.
4. `--json` no cambia.

## Lo que se descarta, y por qué

- **Un comando para que una puerta propia anote su gate.** El registro es lo único de este contraste que el
  motor vio ejecutarse; con ese comando pasaría a ser lo que un script declaró, y se leería igual. Tendría
  sentido sólo si algo decidiera con el registro, y hoy nada lo hace.
- **Detectar `OPS_SKIP_VERIFY`.** Quien corre `ops evidence` en su terminal no tiene la variable que el
  runner sí tiene, así que el aviso faltaría justo donde se lee.
- **Guardar el repositorio o el commit en cada línea.** Cambia el formato de un archivo que ya existe en
  cada instancia, para un dato que sólo se imprime.

## Por qué hacerlo

El propio comando dice, en su última línea, que un contraste que no avisa qué no puede ver se lee como si lo
hubiera visto todo. Con los gates no lo cumple.

## Riesgos y regresiones

1. **Alguien lee el texto con un script.** La forma estable es `--json`, que no se toca. La línea por gate
   conserva su forma.
2. **Un aviso falso por zona horaria.** Un gate de ayer puede caer dos días UTC antes de la fecha. Por eso
   el margen de dos días: el aviso sale sólo cuando la corrida más reciente es de tres días antes o más. El
   costo es callar con un gate de anteayer.
3. **Prometer de más al revés.** El aviso dice de cuándo es la última corrida, no que la tarea no tuvo gate:
   pudo tenerlo en otra puerta o en otra máquina.

## Qué habría que probar

- La reproducción muestra el aviso, con la fecha de la última corrida.
- Con una corrida del mismo día, de los dos anteriores o posterior, el aviso no aparece.
- Sin registro, el mensaje de hoy no cambia.
- `--json` devuelve lo mismo que antes.
- Mutación: quitar la comparación de fechas pone roja la prueba del aviso.

## Recomendación

**Hacerlo, sin versión propia**: viaja con lo próximo que salga.

## Cierre

**Resuelto en 0.104.1.**

### El recorrido de lo que este caso enumeró

- **Encabezar las líneas con lo que son — se hizo**: «las últimas N corridas de `verify` en esta instancia».
- **Avisar cuando son anteriores — se hizo distinto.** El plan decía un día de margen y «ninguna es de esta
  tarea». Quedó en dos días y en «todas son anteriores al cierre de esta tarea»; el porqué, abajo.
- **La frase final — se hizo**: ya no dice «qué gates corrieron al commitear».
- **`--json` no cambia — se comprobó**: byte a byte igual a la versión anterior en 24 casos.
- **Riesgo 1, alguien lee el texto — sin cambio**: la línea por gate conserva su forma.
- **Riesgo 2, aviso falso por zona horaria — se cumplía**, abajo.
- **Riesgo 3, prometer de más al revés — se cumplía**, abajo.
- **Sin registro, el mensaje de antes — se probó**: no cambia.

### Qué se corrió

La reproducción de arriba, en el mismo banco, después del cambio:

```
GATES  las últimas 2 corridas de `verify` en esta instancia:
GATES  2026-10-01T14:29:40.631Z  test (exit 0)
GATES  2026-10-01T14:29:53.314Z  lint (exit 1)
GATES  todas son anteriores al cierre de esta tarea: la más reciente es del 2026-10-01 y la tarea se
       cerró el 2026-10-08. Si la puerta de su commit no fue `verify`, acá no figura.
```

Ocho mutaciones en una copia —el margen en uno y en tres días, la comparación apagada y forzada, la primera
corrida por la última, un instante que no es texto, la frase vieja, el singular—: las ocho en rojo.

### Lo que encontró y el enunciado no preveía

- **Un día de margen no alcanzaba.** La revisión independiente recorrió las zonas de UTC-12 a UTC+14: al este
  de UTC, un gate de ayer a la madrugada salía como anterior. Con dos días no ocurre en ninguna zona.
- **«Ninguna es de esta tarea» afirmaba de más.** `fecha:` es el día del cierre, no el del commit: una tarea
  commiteada el viernes y cerrada el lunes tiene su gate entre los listados. El aviso dice ahora lo que el
  registro sostiene, que todas son anteriores al cierre.
- **El registro es de la instancia, no de la máquina**: vive en su `planning/`. El texto lo decía mal.
- **Una corrida con el instante como número** pasaba por la más reciente. Ahora sólo cuenta el texto.

### Lo que no cubre

- **Calla con un gate de anteayer**, que es el costo del margen.
- **Una línea del registro sin instante se imprime como `undefined`**, igual que antes de este caso.

## Relacionados

- 316, 330 y 331, que arreglaron la otra mitad de este contraste.
