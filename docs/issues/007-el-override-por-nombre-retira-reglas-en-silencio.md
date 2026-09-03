---
caso: 007
titulo: un override por nombre retira las reglas del sistema que no redefine, y check no dice cuáles
estado: resuelto
prioridad: alta
version-detectada: 0.56.0
resuelto-en: 0.57.0
---

# 007 — El override por nombre retira reglas del sistema en silencio

**🟢 resuelto en 0.57.0** · detectado en 0.56.0 · prioridad **alta** — deja al proyecto con reglas exigidas y no documentadas

## Resumen

Un archivo propio con el mismo nombre que uno de `system/` lo reemplaza entero. Eso está documentado y
es la función. Lo que no está dicho es la consecuencia: **las reglas que ese archivo del sistema definía
y el propio no redefine dejan de existir para el proyecto**. `check` lo reporta como una advertencia que
nombra el par de archivos y no dice qué se perdió.

El caso feo no es perder una regla: es perder una que `check` sigue haciendo cumplir. Queda exigida y no
documentada, y quien la vea fallar la va a buscar en `rules/` donde ya no está.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.56.0 init ops --mode sidecar --install
cd ops

# un override por nombre que sólo redefine una parte
printf '# Proceso\n\n## Regla 1 — Pensar antes de codear\n\nLo nuestro.\n' > planning/rules/process.md

node tools/ops.js check planning
# y después, una épica de 8 criterios, que es lo que dispara R17
```

## Síntoma

```text
reglas que definía system/process.md: R1 R2 R3 R4 R16 R17 R20 R21 R22
reglas que define el override:        (ninguna)

$ node tools/ops.js check planning
⚠ planning/rules/process.md sobrescribe process.md (override explícito)

$ # con una épica de 8 criterios:
✗ roadmap/epic-001-prueba.md: criterios: 8 (umbral 7 de R17). Revisá si son dos resultados con
  vidas distintas y partilo; si es uno solo, partirlo lo empeora — dejalo entero agregando
  "(sin partir: <razón>)"
```

Nueve reglas salieron de circulación y la advertencia no nombra ninguna. R17 se sigue exigiendo desde el
motor.

## Causa raíz

No hay bug de implementación: el override funciona como está documentado. El hueco está en lo que la
advertencia informa.

`engine/planning/planning.js:83`:

```js
warnings.push(`${override.collection}/${override.project} sobrescribe ${override.system} (override explícito)`)
```

Nombra el par de archivos. El dato que decide si el override es sano —**qué IDs deja de haber**— está a
mano: `ruleIds()` ya lee los dos archivos en `validateRules` (`engine/planning/contracts.js:175`).

## Fix propuesto

Que la advertencia nombre la diferencia:

```diff
-warnings.push(`${override.collection}/${override.project} sobrescribe ${override.system} (override explícito)`)
+// Un override sano redefine lo que reemplaza. El que deja IDs afuera los retira del proyecto sin
+// decirlo, y el motor los sigue exigiendo: nombrarlos es lo único que separa una decisión de un
+// descuido.
+const retiradas = systemIds.filter((id) => !projectIds.includes(id))
+warnings.push(`${override.collection}/${override.project} sobrescribe ${override.system} (override explícito)`
+  + (retiradas.length ? `; deja de regir ${retiradas.join(', ')}` : ''))
```

Complementario, en `rules/README.md` del molde: decir que un override reemplaza el archivo entero, no
las reglas que uno menciona, y que lo que se quiera conservar hay que redefinirlo o anexarlo aparte.

## Tradeoffs

Ninguno funcional: es una advertencia más informativa, no un error nuevo. Se puede discutir si un
override que retira una regla que el motor exige —hoy sólo R17— debería ser error en vez de
advertencia; la advertencia con los IDs adentro ya resuelve el caso que importa sin cerrarle la puerta a
nadie.

## Contexto de descubrimiento

Auditando la instalación de `venotal-ops` el 2026-09-03, después de adoptar Cauce. El repo traía de
antes un `rules/process.md` y un `rules/code-shape.md`, y al caer al lado de los homónimos de `system/`
quedaron como overrides por nombre sin que nadie lo decidiera. Consecuencias reales:

- Se retiraron R11, R16, R17, R18, R20, R21 y R22.
- Los números propios significaban **otra cosa** que los del toolkit: la «Regla 5» de Venotal eran las
  líneas de 120 caracteres, y la R5 de Cauce es la solución mínima completa. Un agente que citara R5
  decía una cosa distinta según qué archivo hubiera leído.
- `check` seguía exigiendo R17 —y de hecho hubo que escribir dos `(sin partir: …)` para satisfacerla—
  sobre una regla que el proyecto ya no tenía escrita en ningún lado.

Se resolvió retirando los dos overrides y dejando lo que era genuinamente del proyecto como anexo
`P8..P9`, que es lo que R7 y R4 delegan explícitamente. Las advertencias estuvieron a la vista desde el
primer día y se leyeron como benignas, que es exactamente lo que el texto actual invita a hacer.

## Resolución

**Resuelto en 0.57.0.** La advertencia nombra los IDs que el override deja de definir, que es el dato
que separa una decisión de un descuido:

```text
⚠ planning/rules/process.md sobrescribe process.md (override explícito); deja de regir R2, R3, R4,
  R16, R17, R20, R21, R22
```

Sale de `retiredByOverride` (`engine/planning/contracts.js`), que compara los IDs de los dos archivos
con el `ruleIds` que ya existía. Sigue siendo advertencia y no error, como proponía el caso.

Sólo aplica a `planning/rules`: un ADR o una regla de negocio se sobrescriben enteros y no definen
números que otro archivo siga exigiendo, así que decirle «deja de regir» a un ADR sería inventar una
pérdida. Hay una prueba para cada lado.

El complemento también entró: `template/planning/rules/README.md` ahora dice que el override reemplaza
el archivo entero y no las reglas que uno menciona, y que si lo tuyo era una regla nueva va al lado
como `P1..Pn` sin llevarse nada puesto.

Verificado el 2026-09-03 con el repro de arriba.

## Relacionados

- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) — el otro lugar donde el contrato le
  pide al proyecto que escriba sobre algo que el toolkit mantiene.
