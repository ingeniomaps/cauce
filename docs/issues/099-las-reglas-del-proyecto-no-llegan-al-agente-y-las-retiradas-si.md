---
caso: 099
titulo: Las instrucciones del runner importan las reglas del sistema fijas, aunque el proyecto las haya retirado, y ninguna del proyecto
estado: abierto
prioridad: alta
version-detectada: 0.80.0
---

# 099 — La sesión carga las reglas que la empresa retiró y no las que escribió

**🔴 abierto** · detectado en 0.80.0 · prioridad **alta** — la empresa escribe sus reglas en
`planning/rules/`, `check` confirma que sobrescriben las del sistema, y la sesión del agente no las carga:
importa las de Cauce, incluidas las que la empresa dio de baja

## Resumen

Una instancia manda sobre el toolkit: sus reglas en `planning/rules/*.md` sobrescriben por nombre las de
`planning/rules/system/`, y donde las dos hablan de lo mismo rige la de la empresa. Cauce ya lo modela —el
override existe y `check` nombra lo que retira—, pero las instrucciones que instala el runner no lo reflejan.
Dos daños:

1. **La sesión carga las reglas retiradas.** El `CLAUDE.md` que instala el runner importa con `@` los cuatro
   archivos de `system/` fijos, aunque el proyecto haya sobrescrito alguno. Con `code-shape.md` propio, la
   sesión lee `system/code-shape.md` —el que `check` dice que dejó de regir— y no el que lo reemplaza. Gemini
   importa la misma lista; Antigravity y Codex mandan a leer `system/` en prosa.
2. **La sesión no carga ninguna regla propia.** Un archivo nuevo del proyecto (`security.md`) no aparece en
   ningún import ni en ninguna instrucción.

`AGENTS.md` del molde afirma que las reglas de `planning/rules/` «rigen cada tarea y se leen antes de
empezar». Nada de lo que instala el runner hace que se lean las del proyecto.

El caso original traía un tercer daño —el contrato de `autobuild` tampoco las trae—. Es otro canal, con otro
arreglo y otra decisión, y salió como **105**.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: instancia embedded con runner Claude, una regla
que sobrescribe una del sistema y una propia nueva, y los tres runners que importan o nombran reglas.

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js; A=$BANCO/acme
node $OPS init $A --mode embedded --runner claude --install >/dev/null
printf '# Forma del cambio (propia)\n\n## P1 — Archivos de hasta 400 líneas\n\nRegla de la empresa.\n' \
  > $A/planning/rules/code-shape.md
printf '# Seguridad (propia)\n\n## P2 — Autenticación cerrada por defecto\n\nRegla de la empresa.\n' \
  > $A/planning/rules/security.md
for r in claude gemini antigravity; do node $OPS automation install $A $r | grep -E '✗'; done
grep '^@' $A/CLAUDE.md; echo
grep -c '^@.*rules/system/' $A/GEMINI.md; echo
grep -o 'planning/rules/[a-z/.]*' $A/.agents/plugins/cauce/rules/cauce.md; echo
node $OPS check $A/planning | grep -i sobrescribe
```

## Síntoma

Salida real, 2026-09-11, desde el checkout en 0.81.0 (ningún `✗` en las tres instalaciones):

```
@AGENTS.md
@planning/PROTOCOL.md
@planning/rules/system/process.md
@planning/rules/system/code-shape.md
@planning/rules/system/commits.md
@planning/rules/system/conduct.md

4

planning/rules/system/

⚠ planning/rules/code-shape.md sobrescribe code-shape.md (override explícito); deja de regir R5, R6, R7, R11, R18
```

El motor sabe que `system/code-shape.md` dejó de regir, y es el archivo que la sesión importa. Ni
`planning/rules/code-shape.md` ni `planning/rules/security.md` aparecen en ningún runner. El autor original
obtuvo los mismos imports y el mismo aviso con el paquete publicado 0.80.0.

Con Codex en esta misma instancia embedded, `install` dice «sus instrucciones quedaron dentro de AGENTS.md», y
la línea que dejó ahí es prosa: «`planning/rules/system/` son las reglas que rigen cada tarea».

## Causa raíz

- `automatization/runners/claude/CLAUDE.md:3-8` y `automatization/runners/gemini/GEMINI.md:3-8`: los imports
  son una lista estática que siempre apunta a `system/`. Ningún paso la resuelve contra los overrides del
  proyecto.
- `automatization/runners/antigravity/rules/cauce.md:3` y `automatization/runners/codex/AGENTS.md:3-5`: no
  importan, dicen en prosa que se lea `planning/rules/system/`. El arreglo ahí es otro texto, no un render de
  imports.
- `engine/core/ownership.js:163`, `overrides(root)`: sabe qué archivo del proyecto reemplaza a cuál del
  sistema. Lo usa `check` para avisar (`engine/cli/planning.js:205-215`) y nadie para entregar.
- `template/AGENTS.md:4-5`: dice que las reglas de `planning/rules/` rigen cada tarea, y en la frase siguiente
  que «los tres los mantiene Cauce». No dice en ningún lado que la regla del proyecto gana.

## Fix propuesto

**Un conjunto efectivo de reglas, resuelto por el motor y entregado a cada runner.**

1. `effectiveRules(root)` en el motor: todo `planning/rules/*.md` del proyecto, más cada
   `planning/rules/system/*.md` sin homónimo propio. Un override excluye su par del sistema; un archivo
   nuevo del proyecto entra solo. Se apoya en `overrides()` y en `entries()`, que ya descartan `README.md` y
   los archivos ocultos (`ownership.js:157`).

   El autor original proponía poner primero `planning/rules/README.md` como índice. **No sirve así**: ese
   archivo es del toolkit (`ownership.js:22`, en `SYSTEM_FILES`), `entries()` lo filtra, y si la empresa lo
   edita, `upgrade` lo deja «congelado por tu edición» (`engine/cli/instance.js:307-311`) y deja de recibir
   las mejoras. Si hace falta un índice, lo arma el motor con los encabezados `## R`/`## P` del conjunto
   efectivo; no es un archivo que la empresa escriba.
2. **Claude y Gemini**: el bloque de imports se renderiza con ese conjunto en `automation install`, no con la
   lista fija. `check` avisa cuando los imports instalados difieren del conjunto efectivo actual (se agregó
   una regla y nadie reinstaló).
3. **Antigravity y Codex**: su prosa nombra el conjunto efectivo, renderizado igual, o dice que rige
   `planning/rules/` entero con la precedencia del punto 5. La lista fija de `system/` no puede quedar.
4. **`upgrade`**: hoy no reinstala el runner. `instance.js:338-341` sólo explica que el bloque se recupera
   reinstalando, y el recordatorio lo pide. Renderizar las reglas «en `upgrade`», como proponía el original, es
   comportamiento nuevo: o se hace a propósito, o alcanza con que el aviso de `check` del punto 2 salte después
   de un `upgrade` que trajo una regla nueva del sistema.
5. **`AGENTS.md` del molde**: decir la precedencia con todas las letras: donde una regla del proyecto
   sobrescribe, contradice o restringe una del sistema, rige la del proyecto.

**Decisión pendiente del usuario:** ¿cada sesión carga el conjunto efectivo completo o sólo un índice más
lectura por tema?

- **Completo**: importar todo lo que resuelve `effectiveRules`. Es lo seguro. Cuando el proyecto no tiene
  reglas propias cuesta lo mismo que hoy: las cuatro de `system/` suman 39 074 bytes
  (`wc -c template/planning/rules/system/*.md`). Pero crece con cada regla propia: la instancia donde se
  descubrió esto informó 15 archivos y ~122 KB de reglas efectivas, un número suyo que acá no se volvió a medir.
- **Índice**: importar sólo el índice generado y dejar cada archivo como lectura obligatoria por tema. Es
  barato, pero depende de que el agente decida leer, que es la falla que este caso registra.

**Recomendación, como propuesta:** completo. El índice reproduce el defecto en otra forma, y el costo sólo
sube en proyectos que escribieron reglas, que son los que más necesitan que se carguen. Si el número real
molesta, se mide con la instancia de 122 KB antes de volver al índice.

**Decisión pendiente del usuario:** `template/AGENTS.md:5` dice que `planning/rules/` «lo mantiene Cauce», y
eso choca con que las reglas propias de la empresa vivan ahí y ganen. ¿Se reescribe?

- **Sí**: que diga que Cauce mantiene `planning/rules/system/` y el proyecto lo suyo, con la precedencia del
  punto 5. Editar `template/AGENTS.md` baja a toda instancia en su próximo `upgrade`, porque es un archivo del
  toolkit que se reemplaza entero.
- **No**: queda la contradicción, y la precedencia se dice sólo en `planning/rules/README.md`, que la sesión no
  importa.

**Recomendación, como propuesta:** reescribirla, en el mismo cambio que el punto 5. Es la frase que hoy lee
cada sesión, y es la que niega la precedencia.

## Tradeoffs

- **Contexto.** Es la primera decisión de arriba: importar todo es lo seguro y lo caro; el índice, lo barato
  que depende de una lectura voluntaria.
- **Un `CLAUDE.md` con cambios propios** hoy se conserva entero y no recibe el bloque (`install` dice
  «conservado»). Si el bloque pasa a ser dinámico, conviene que viva delimitado dentro del archivo, como ya
  se hace con `mergeInstruction` (`engine/automation/config.js:183`), para no depender de que el archivo esté
  intacto.
- **Una regla propia que contradice sin sobrescribir** (otro nombre de archivo, mismo tema) sigue sin
  resolverse por máquina: la precedencia escrita en `AGENTS.md` es lo que la cubre.
- **El bloque de Codex en embedded vive dentro de `AGENTS.md`**, que `upgrade` reemplaza entero
  (`instance.js:338-341`). Un render dinámico ahí se pierde en cada `upgrade` igual que hoy, hasta reinstalar.

## Qué tiene que probar el cierre

- La reproducción de arriba importa `planning/rules/code-shape.md` y `planning/rules/security.md`, y **no**
  importa `system/code-shape.md`. Aserción de ausencia, vista en rojo con el renderizado de hoy.
- Lo mismo en `GEMINI.md`, en `cauce.md` de Antigravity y en la prosa de Codex: ninguno puede seguir
  nombrando sólo `system/`.
- Una regla agregada después de instalar hace que `check` avise hasta que se reinstala; una mutación que
  apague el aviso se pone en rojo.
- Después de un `upgrade`, lo que se haya decidido en el punto 4 se comprueba corriéndolo: el render
  actualizado, o el aviso de `check`.
- Un `CLAUDE.md` con cambios propios recibe el bloque actualizado sin perder lo suyo.
- `template/AGENTS.md` dice la precedencia, y lo que responda la segunda decisión queda escrito.
- Una sesión real sobre el banco: preguntada por la regla de tamaño de archivo, contesta P1 y no R7.

## Contexto de descubrimiento

Instancia real (sidecar, 0.80.0), 2026-09-11. La empresa acababa de escribir 50 reglas propias: dos
archivos que sobrescriben `system/process.md` y `system/code-shape.md`, y once de temas nuevos, entre ellos
seguridad. Revisando si el recorrido las aplicaba, apareció que ni la sesión ni el `autobuild` las
cargaban (lo segundo es el 105). Hasta el 2026-09-10 la instancia usaba un workflow propio que sí inyectaba
sus reglas; al retirarlo a favor del de Cauce, dejaron de llegar sin que nada fallara: `check` verde y las
reglas escritas.

La instancia lo parcheó de su lado con lo único que viaja a cada subagente: una línea en «Excepciones de
autonomía» de `workspace.md` y otra en «Contratos» de `PROTOCOL.md` que obligan a leer
`planning/rules/README.md`. Depende de que el resumen del contrato la conserve. Y apunta a un archivo del
toolkit (`ownership.js:22`): si la empresa lo usa de índice, queda congelado en cada `upgrade`.

## Relacionados

- **105** — la otra mitad, separada de este caso: el contrato de `autobuild` tampoco trae las reglas, y sus
  prompts citan R17 aunque el proyecto la haya retirado. Consume el mismo `effectiveRules`.
- **007** — hizo que `check` nombre lo que un override retira. Este caso es la otra mitad: saberlo y no
  entregarlo.
- **023** — la misma familia: una regla que manda a un archivo que el agente no lee.
