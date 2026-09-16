---
caso: 161
titulo: El aviso de override nombra lo que deja de regir sólo en `planning/rules`, y en las otras dos colecciones del sistema calla
estado: resuelto
resuelto-en: 0.94.0
prioridad: media
version-detectada: 0.94.0
---

# 161 — El aviso de override calla en dos de las tres colecciones

**🟢 resuelto en 0.94.0** · detectado en 0.94.0 · prioridad **media** — reproducirlo mostró que no hay
defecto: en esas dos colecciones el archivo es la unidad, así que no queda nada retirado que nombrar

## Resumen

El [007](007-el-override-por-nombre-retira-reglas-en-silencio.md) cerró que un override retire cosas en
silencio: desde 0.57.0 `check` nombra lo que deja de regir. Pero lo nombra **sólo para las reglas**.

`SYSTEM_COLLECTIONS` declara tres colecciones mixtas —el toolkit posee su `system/`, el proyecto el
resto— y el aviso sólo calcula lo retirado en una:

```js
// engine/cli/validate.js:165-167
const retired = override.collection === 'planning/rules'
  ? SR.retiredByOverride(root, override.project)
  : []
```

```js
// engine/core/ownership.js:61-65
const SYSTEM_COLLECTIONS = [
  'planning/adr',
  'planning/business-rules',
  'planning/rules',
]
```

Sobrescribir un ADR o una business rule del sistema produce el aviso genérico —`X sobrescribe Y (override
explícito)`— sin nombrar ni contar nada. Es exactamente el defecto que el 007 cerró, en las otras dos.

## Reproducción

Pendiente de correr. La lectura del fuente está contrastada —las dos citas de arriba se abrieron en el
archivo— pero **el caso no se reprodujo todavía**, y eso es lo primero que hay que hacer antes de
arreglarlo: comprobar sobre un banco qué imprime hoy `check` al sobrescribir un ADR del sistema, y si
`retiredByOverride` sirve tal cual para esas dos colecciones o necesita otro lector de ids.

## Causa raíz

`retiredByOverride` compara los ids que define el archivo del sistema contra los que redefine el propio,
y los ids los saca `ruleIds()`, que busca encabezados `## Rn`. Un ADR y una business rule se numeran de
otra forma, así que la función no se les puede aplicar sin mirar primero cómo se identifican.

O sea que el ternario de `validate.js:165` no es un olvido: es un límite real que nadie volvió a mirar.
Lo que está mal es que no lo diga.

## Tradeoffs

Puede que para ADR y business rules no exista un «id que deja de regir» equivalente, y entonces lo
correcto no sea calcularlo sino **decir en el aviso que no se calcula** — un aviso que en una colección
nombra lo retirado y en otra calla enseña a leerlo como si no hubiera nada retirado.

## Prioridad

Media. No pierde nada por sí solo: el override es una decisión del proyecto y el aviso genérico sale
igual. Lo que se pierde es la mitad que el 007 agregó, en dos de tres lugares.

## Contexto de descubrimiento

2026-09-16, y no salió de buscarlo. Salió de una tanda de medición sobre las reglas nuevas: uno de los
agentes del brazo que llevaba R24 —«una premisa sobre el propio código se abre antes de usarla»— no se
conformó con leer el fuente y **reprodujo** el caso en un banco desechable, y ahí encontró que el hueco
real era de alcance y no el que el enunciado decía.

Que el hallazgo venga de ahí no lo valida: la lectura se contrastó aparte, abriendo las dos citas. Se
dice porque es de dónde vino.

## Relacionados

- **007** — el override retira en silencio; cerró el aviso para `planning/rules`, y éste es el resto.
- **160** — el override se lleva puesto lo que nadie reemplazó; el mismo mecanismo, otra arista.

## Cierre

**Resuelto en 0.94.0, y al revés: no había defecto.** Reproducirlo era el primer paso del recorrido y es
lo que lo dio vuelta.

- **La reproducción — hecha, y contesta el caso.** Sobre un banco `suelto`, copiando
  `business-rules/system/BR-OPS-001-una-sola-tarea-activa.md` a la carpeta del proyecto, `check` dice:

  ```
  planning/business-rules/BR-OPS-001-una-sola-tarea-activa.md sobrescribe
  BR-OPS-001-una-sola-tarea-activa.md (override explícito)
  ```

  No nombra nada retirado, y es correcto: **no se retira nada**.

- **La premisa del caso era falsa, y es una diferencia de forma entre las colecciones.** En
  `planning/rules/` un archivo define **muchos** ids —`## R1`, `## R2`…—, así que reemplazarlo retira los
  que el propio no redefine, y por eso `retiredByOverride` existe. En `adr/` y `business-rules/` **el
  archivo es la unidad**: el id vive en el nombre —`BR-OPS-001-…md`, `ADR-NNN-…md`— y adentro no hay un
  segundo id escondido. Tu archivo reemplaza exactamente esa regla, que sigue definida por el tuyo.

- **O sea que el ternario de `validate.js:165` no es un olvido ni un límite sin mirar: es correcto.** El
  caso lo leyó como alcance faltante porque comparó dos colecciones que no tienen la misma forma.

- **El tradeoff que el caso planteaba —«decir en el aviso que no se calcula»— se decide que no**, y con
  la razón que la reproducción da: no hay nada que no se esté calculando. Agregar esa aclaración sería
  explicar una ausencia que no existe, y un aviso que habla de más se lee peor que uno que calla.

### Qué se corrió

- La reproducción de arriba, sobre un banco recreado con `--force`, con la salida real pegada.
- El contraste de la forma de cada colección: `ruleIds` (`structure.js:87`) busca `^##\s+([A-Z]\d+)`, que
  es lo que sólo existe en `rules/`; los ids de las otras dos están en el nombre del archivo, comprobado
  en `business-rules/README.md:29-30` y en el molde de ADR.
- `npm run ci` exit 0.

**Lo que el caso deja como saldo** es el recordatorio de por qué el recorrido empieza reproduciendo: se
escribió con las dos citas del fuente abiertas y contrastadas, y aun así la conclusión era incorrecta.
Leer bien dos líneas no dice qué hace el sistema.
