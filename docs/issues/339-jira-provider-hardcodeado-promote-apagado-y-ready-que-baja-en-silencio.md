---
caso: 339
titulo: jira provider hardcodeado, promote apagado y ready que baja en silencio
estado: resuelto
resuelto-en: 0.105.0
prioridad: media
version-detectada: 0.104.1
---

# 339 — Integraciones: `provider: jira` hardcodeado en todo borrador, `promote` con el proveedor apagado, y un `ready` que baja a `pending` sin decirlo

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **media**.

**Prioridad media**: el recorrido completo funciona con fixtures y con un adaptador propio, pero tres de
sus bordes mienten en disco o callan donde el README promete ruido, y el contrato del adaptador propio deja
al que lo escribe adivinando la forma del ítem.

## Resumen

Tres hallazgos, reproducidos sobre una instancia nueva con fixtures y los dos primeros además leídos en el
fuente. Otros cuatro de la misma medición se descartan abajo, con su razón.

1. **`provider: jira` en el borrador de cualquier adaptador.** Con un adaptador propio `demo`, el
   `remote.json` dice `"provider": "demo"` y el `draft.md` de al lado dice `provider: jira`.
2. **`promote` no mira `enabled`.** Con `integrations/config.json` en `enabled: false`, `sync` se niega
   («jira está deshabilitado») y `promote` escribe el roadmap igual.
3. **Un draft curado y `ready` baja a `pending` cuando el remoto cambia**, el resumen del sync lo cuenta
   como «curado preservado» y `check` queda verde. El conflicto sólo aparece al volver a poner `ready`.

## Reproducción

Sobre una instancia con `enable . jira` y un fixture de tres issues:

```bash
cd ops
node tools/ops.js integration sync . jira --fixture v1.json
node tools/ops.js integration disable . jira
node tools/ops.js integration promote . jira DEMO-42       # 2: con el draft en ready
# 3: curar DEMO-44 (título) y ponerlo ready; después un fixture donde DEMO-44 cambió de summary
node tools/ops.js integration sync . jira --fixture v3.json; node tools/ops.js integration check . jira
grep -n "^state" integrations/jira/staging/stories/DEMO-44/draft.md
# 1: adaptador propio en integrations/demo/adapter.js registrado con "adapter": "./adapter.js"
node tools/ops.js integration sync . demo --fixture demo1.json
grep -n "provider" integrations/demo/staging/stories/DM-8/remote.json integrations/demo/staging/stories/DM-8/draft.md
```

## Síntoma

```
✓ jira:DEMO-42 promovido como story                       # 2, con jira deshabilitado
✓ jira: 3 items · 0 nuevos · 3 refrescados · 3 curados preservados
✓ integraciones válidas: jira                             # 3: y el draft dice…
state: pending
integrations/demo/staging/stories/DM-8/remote.json:  "provider": "demo"
integrations/demo/staging/stories/DM-8/draft.md:provider: jira     # 1
```

## Causa raíz

- 1: `engine/integrations/state.js`, `renderDraft`, línea ~138: la plantilla del frontmatter escribe el
  literal `provider: jira`.
- 2: `engine/integrations/registry.js`, `promote` llama a `validate(root, name)`, y `validate` con
  `onlyProvider` filtra `name === onlyProvider` sin mirar `entry.enabled`; `sync` sí lo exige (línea ~227).
- 3: `engine/integrations/state.js`, la fusión del sync: un draft con `draftChanged` cuyo remoto cambió
  conserva la curación y rebaja `state` sin anotar el motivo en el resumen.

## Fix propuesto

1. `provider: ${name}` en `renderDraft`, con el nombre del proveedor que ya recibe `remote.json`.
2. `promote` exige `entry.enabled` igual que `sync`, o lo dice: «jira está deshabilitado; habilitalo o
   promové con `--force`» si se decide que promover un staging viejo es legítimo.
3. El sync que rebaja un `ready` lo cuenta aparte —«1 ready bajó a pending por cambio remoto»— y `check`
   avisa sobre esos drafts mientras sigan con `draftChanged` y base movida.

## Lo que se descarta, y por qué

Medidos en la misma corrida y dejados afuera a propósito:

- **`reset` sobre un ítem que el remoto ya no tiene** devuelve ✓, pierde la curación y el sync siguiente lo
  borra. Es la secuencia `reset` → `sync` sobre un ítem ausente, dos actos explícitos sobre algo que Jira ya
  borró; se puede negar, pero nadie lo va a recorrer sin querer.
- **`check` no nombra el ítem curado que el remoto perdió**; el sync lo avisa una vez. Es un aviso que se
  repetiría en cada `check` sin que nadie pueda hacer nada desde la instancia.
- **`--fixture` y `--payload` juntos** gana `--payload` sin aviso: dos banderas de prueba a la vez, un
  error de uso que nadie comete dos veces.
- **El contrato del adaptador no dice la forma del ítem** y el motor acepta `{ key, summary }` escribiendo
  `type: undefined`. Es documentación que vale escribir el día que exista un segundo adaptador real; hoy el
  único es Jira y el ejemplo del README alcanza.

## Tradeoffs

- El punto 2 puede frenar a quien deshabilita un proveedor y quiere terminar de promover lo que ya bajó.
  Por eso la alternativa del mensaje: que se decida, no que pase.

## Por qué hacerlo

El staging es la parte del recorrido que una persona cura a mano; un estado que baja sin decirlo y un
`provider` que miente en el archivo que esa persona lee son lo que OPS-003 quiso evitar con el staging.

## Riesgos y regresiones

1. **Drafts existentes con `provider: jira`** de un adaptador propio: el arreglo del punto 1 sólo afecta a
   los que se regeneren; conviene que `check` avise del desacuerdo entre `remote.json` y `draft.md`.
2. **Instancias que promueven con el proveedor apagado** a propósito: el punto 2 las frena.

## Contexto de descubrimiento

Campaña del 2026-10-08, recorrido completo de Jira con fixtures, cambio remoto simulado en tres versiones y
un adaptador propio escrito siguiendo sólo la documentación; repetido entero sobre una instancia nueva antes
de escribir esto. Los puntos 1 y 2 se confirmaron en el fuente.

## Relacionados

## Cierre

Recorrido contra el caso entero:

- **`provider: ${name}` en `renderDraft`** — hecho: la función recibe el proveedor, los tres llamadores del
  sync le pasan el nombre del registro y las reconciliaciones el que trae el `remote.json`; `jira` queda como
  default para quien la llame sin nombre.
- **`promote` exige `enabled` igual que `sync`** — hecho, con los mismos dos interruptores y el mismo mensaje,
  «jira está deshabilitado». Se eligió negarse y no un `--force`: promover un staging que nadie va a volver a
  sincronizar es lo que el caso describía como daño, y habilitar el proveedor es un comando.
- **El sync cuenta aparte el `ready` que baja y `check` avisa** — hecho: `result.demoted` y una línea propia
  en el resumen, y un aviso de `check` para todo draft curado cuyo remoto cambió, hasta que se reconcilie. La
  condición de «curado» es `draftChanged`, la misma que usa el sync para preservar, y no la diferencia de
  resumen o descripción: una curación al pie del borrador también cuenta, y la primera versión de la prueba
  lo encontró en rojo.
- **Lo que se descarta** — sigue descartado, y la sección del caso dice por qué cada uno.
- **Tradeoff «quien deshabilita y quiere terminar de promover»** — se frena; el mensaje nombra el comando
  que lo destraba.
- **Riesgo «drafts existentes con `provider: jira` de un adaptador propio»** — el siguiente sync los regenera
  sólo si no están curados; un draft curado conserva el `provider` viejo. No se agregó aviso: el dato lo trae
  `remote.json` y el valor del frontmatter no decide nada en el motor.

Cómo se supo que funciona:

- Rojo previo: las tres pruebas nuevas en `test/wiring/jira-staging.test.js` fallaron antes de cada arreglo
  y pasan después, 6 de 6; `test/wiring`, `test/instance` y `test/planning` en 480 de 480.
- Mutaciones, una por punto y cada una con su prueba en rojo: no contar la bajada, saltar la comprobación de
  `enabled` en `promote`, y volver `provider` al literal; restauradas, 6 de 6.
- Corrida real sobre el banco de Jira de la campaña con el motor del fuente: el draft del adaptador `demo`
  dice `provider: demo`; `promote` con jira deshabilitado responde «jira está deshabilitado» y sale 1; y un
  `ready` curado tras un cambio remoto deja «↓ 1 curados bajaron de ready a pending porque el remoto cambió»
  en el resumen, `state: pending` en el draft y el aviso en `check`. Antes del arreglo: `provider: jira`,
  promovido con exit 0, y «1 curados preservados» con `check` en verde.

