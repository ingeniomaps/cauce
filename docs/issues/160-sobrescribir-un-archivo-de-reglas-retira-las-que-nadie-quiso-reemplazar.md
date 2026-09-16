---
caso: 160
titulo: Sobrescribir un archivo de reglas retira también las que el proyecto no quiso reemplazar, y lo que se escribe para conservarlas es prosa que el motor no lee
estado: resuelto
resuelto-en: 0.94.0
prioridad: alta
version-detectada: 0.92.0
---

# 160 — El override se lleva puestas las reglas que nadie reemplazó

**🟢 resuelto en 0.94.0** · detectado en 0.92.0 · prioridad **alta** — cinco reglas dejan de llegarle a
todo agente sin que nadie lo decida, y la única salida disponible era una tabla en prosa

## Resumen

El override de una regla es **por nombre de archivo**: escribir `planning/rules/process.md` reemplaza
`system/process.md` entero. Reemplazar «pensar antes de editar» por la versión de la empresa es lo
primero que hace cualquiera que adopta Cauce sobre su propio proceso — y con eso se lleva puestas las
otras ocho reglas del archivo.

El [007](007-el-override-por-nombre-retira-reglas-en-silencio.md) cerró la mitad que se veía: desde
0.57.0 `check` **nombra** las que dejan de regir. Lo que quedó abierto es que no hay nada que hacer con
ese aviso. Las reglas que uno quería conservar no tienen cómo conservarse: redefinirlas en el archivo
propio es copiar su texto, y una copia deja de recibir las mejoras del `upgrade`.

## Reproducción

Sobre un banco `suelto`, con el override más chico que existe:

```
$ printf '# Proceso\n\n## R1 — Pensar antes de editar\n\nLo nuestro.\n' > planning/rules/process.md
$ node tools/ops.js check planning --json
  planning/rules/process.md sobrescribe process.md (override explícito);
  deja de regir R2, R3, R4, R16, R17, R20, R21, R22
```

Y lo que de verdad carga un agente, que es la mitad que no se ve en el aviso:

```
$ node -e "console.log(require('.../engine/core/ownership').effectiveRules(root))"
  planning/rules/system/code-shape.md
  planning/rules/system/commits.md
  planning/rules/system/conduct.md
  planning/rules/process.md
```

`system/process.md` desapareció de la lista. Con él, **R16, R17, R20, R21 y R22**.

## Síntoma

Una instancia real —`roax-ops`, Cauce 0.81.0 → 0.92.0— escribió su propio `process.md` para reemplazar
cuatro reglas, y con eso perdió nueve. Lo que hizo al descubrirlo es lo que queda cuando el aviso nombra
un problema sin remedio: una tabla en prosa dentro de su propio archivo, declarando que cuatro de ellas
«se adoptan por referencia» y «rigen igual, aunque el motor las dé por apagadas», con esta razón —que es
correcta— para no copiarlas: «una copia deja de recibir las mejoras del `upgrade`».

Esa tabla no la lee nada. Por el registro de esa misma instancia, el 2026-09-09 dos de las cuatro no
estaban rigiendo: un cambio a los guards bloqueó la sesión y el agente reintentó el mismo comando ~20
veces esperando otro resultado —R20— en vez de establecer primero qué quedó hecho —R21—.

## Causa raíz

`engine/core/ownership.js:222-227`, en `effectiveRules`: las reglas vigentes son las propias más las del
sistema **filtrando por archivo** los que tienen override.

```js
const replaced = new Set(overrides(root).filter((one) => one.collection === 'planning/rules')
  .map((one) => one.system))
return [
  ...markdown('system').filter((name) => !replaced.has(name)).map(...),
  ...markdown('').map(...),
]
```

La unidad del override es el archivo y la unidad de una regla es su número, y no coinciden. No es un
defecto del filtro: es correcto que un archivo reemplazado no se cargue, porque si no el agente leería
dos textos distintos bajo el mismo `R1`.

Lo que está mal es **qué hay adentro de cada archivo**. `system/process.md` juntaba las cuatro reglas que
cualquier empresa reemplaza —planificar, ejecutar por objetivo, review, sincronizar estado— con cuatro
que nadie reemplaza y que son las más caras de perder: lo que cuesta una corrida, cuándo una medición
vale, cómo se retoma lo interrumpido y qué no se toca mientras se mide.

## Fix

Las cuatro salen a `system/runs.md`. No hay mecanismo nuevo: un archivo que nadie va a sobrescribir no
necesita forma de rescatarse.

- `system/process.md` — R1..R4, R17.
- `system/runs.md` — R16, R20..R22.

R17 se queda con el proceso a propósito: cómo se parte una unidad de trabajo **sí** es algo que una
empresa reemplaza —la instancia que originó el caso lo hizo, con una versión que sólo cuenta condiciones—
y sacarlo de ahí mentiría sobre lo que el corte separa.

## Tradeoffs

El bloque de reglas pasa de cuatro archivos a cinco. Se midió: **39,1 KB**, el mismo peso de antes,
porque el texto no cambió de tamaño sino de archivo. Lo que sube es el conteo, y `check` lo dice.

Un corte por archivo sigue siendo un corte grueso: una empresa que quiera reemplazar R16 y conservar R20
vuelve a estar donde estaba. No se resuelve acá porque no se conoce ningún caso — la instancia que trajo
esto quería conservar las cuatro juntas — y un mecanismo de adopción por regla es infraestructura para un
caso hipotético. Lo que lo activaría: alguien que reemplace una de `runs.md` y pierda las otras tres.

## Prioridad

Alta. No rompe nada visible y por eso costó descubrirlo: la instancia pasó semanas con cinco reglas del
sistema sin regir, creyendo que regían porque lo había escrito.

## Contexto de descubrimiento

2026-09-16, revisando las reglas propias de `roax-ops` para ver cuáles merecían subir al toolkit. El
hallazgo no fue ninguna de sus reglas: fue la tabla con la que cerraban su `process.md`.

Dos afirmaciones de esa instancia sobre nuestro motor se comprobaron y **no** eran ciertas, y quedan
dichas porque quien lea su archivo se las va a encontrar:

- «Sin que nada lo avisara» — falso. `check` lo avisa desde 0.57.0 y las nombra una por una. Medido en un
  banco: `deja de regir R2, R3, R4, R16, R17, R20, R21, R22`.
- «`runner.allowPush` es todo o nada» — vencido. Dejó de serlo en 0.81.0, con `runner.pushToLiveBranches`
  y la orden por chat.

## Relacionados

- **007** — el override retira reglas en silencio; cerró el aviso, éste cierra el remedio.
- **141** — las reglas se inyectan enteras en cada agente: es lo que vuelve caro perder una sin notarlo.

## Cierre

**Resuelto en 0.94.0.** El recorrido de lo que el caso enumeró:

- **El corte — hecho.** `system/runs.md` con R16, R20, R21 y R22; `system/process.md` queda con R1..R4 y
  R17. `planning/rules` ya es una colección del sistema, así que el archivo nuevo llega solo en el
  próximo `upgrade` de toda instancia: no hubo que tocar ninguna lista.
- **R17 se queda en `process.md` — decidido, con la razón escrita arriba.** No es un olvido del corte.
- **El aviso baja solo, sin tocarlo.** Sobre el mismo banco: antes `deja de regir R2, R3, R4, R16, R17,
  R20, R21, R22`; ahora `deja de regir R2, R3, R4, R17`. Y `effectiveRules` devuelve `system/runs.md`
  junto a la propia.
- **El README de reglas — actualizado, y lo obligó la puerta.** `los rangos que declara el README de
  reglas son los que hay` falló nombrando `R16` de más en `process.md`. Es la puerta haciendo su trabajo:
  el rango es contrato.
- **El tradeoff del peso — medido y no estimado.** 4 archivos → 5, y de 38-39 KB a **39,1 KB**. Las dos
  pruebas que fijan ese número fallaron y se actualizaron **después** de medir, no antes.
- **«Una empresa que quiera reemplazar R16 y conservar R20» — declarado y no resuelto**, con qué lo
  activaría. No se construye un mecanismo por regla para un caso que nadie tuvo.
- **Las dos afirmaciones de la instancia sobre nuestro motor — comprobadas, y las dos son falsas.** Están
  arriba. Ninguna abrió caso: una ya la cerró el 007 y la otra la cerró 0.81.0.

### Qué se corrió

- **Rojo previo.** La prueba nueva contra el árbol sin el corte falla con
  `se perdió runs.md: …, planning/rules/process.md` — o sea, con las cuatro reglas ausentes de lo que el
  agente carga. 4 de 10 en rojo en esa suite.
- **Una mutación**, en un worktree desechable que arrancó en verde 10/10: que `effectiveRules` deje de
  excluir lo sobrescrito —el arreglo ingenuo, que le daría al agente dos textos bajo el mismo número—
  deja **6 de 10 en rojo**. La prueba fija las dos mitades: que el override rija y que `runs.md`
  sobreviva.
- **Corrida real sobre un banco**, la reproducción del caso con el arreglo puesto: el aviso baja de ocho
  reglas retiradas a cuatro, y `effectiveRules` devuelve cinco archivos en vez de cuatro.
- **`npm run ci` exit 0**, 876 pruebas, 0 fallos, 73 archivos en su piso de cobertura.
