---
caso: 459
titulo: La regla que instala el adaptador de Antigravity no tiene trigger en el frontmatter, y agy no la aplica nunca
estado: resuelto
resuelto-en: 0.117.2
prioridad: alta
version-detectada: 0.117.1
---

# 459 — La regla del adaptador de Antigravity no tiene trigger y agy no la aplica

**🟢 resuelto en 0.117.2** · detectado en 0.117.1 · prioridad **alta**: la regla que instala el adaptador es la única vía por la
que las reglas vigentes del proyecto llegan a `agy`, y queda inerte en toda instancia que use Antigravity. El doctor
de Cauce no avisa.

## Resumen

`automation install <ops> antigravity` copia `runners/antigravity/rules/cauce.md` a
`.agents/plugins/cauce/rules/cauce.md` sin frontmatter. Antigravity sólo aplica una regla de plugin si su frontmatter
declara `trigger` (`always_on`, `model_decision`, `glob` o `manual`), así que el plugin carga 0 reglas. Hay dos daños:

1. **`agy` no recibe las reglas.** La sesión carga los guards (el hook sí entra) y las skills, pero no la instrucción
   de leer `AGENTS.md`, `PROTOCOL.md` y las reglas, ni el bloque `cauce:reglas`. Ese bloque, para este runner, vive
   **sólo** en ese archivo: el `AGENTS.md` de la instancia no lo trae.
2. **Nada lo ve.** `agy plugin validate` lo marca como error y el `README.md` del adaptador manda a correrlo, pero
   `automation doctor` da el adaptador «operativo» con 0 advertencias.

## Reproducción

Desde la raíz del repo, sobre un banco desechable (2026-10-28, `main` en `fe889ed3`, `agy --version` → `1.4.8`):

```bash
B=$(node engine/cli/ops.js bench suelto --force)
node engine/cli/ops.js automation install "$PWD/$B" antigravity     # exit 0
cd .cauce-eval/_medicion                                            # donde aterriza .agents/
agy plugin validate .agents/plugins/cauce                           # exit 1
node ../../engine/cli/ops.js automation doctor "$PWD/suelto" antigravity   # exit 0
```

Se midió primero en una instancia real (Cauce 0.117.0) y después en el banco, con el mismo resultado.

## Síntoma

```
$ agy plugin validate .agents/plugins/cauce
Validating cauce (.agents/plugins/cauce/plugin.json)

  ✗ rules/cauce.md: no valid trigger in the frontmatter, so the rule never applies. Set trigger to always_on, model_decision, glob, manual

  skills 58 · agents 0 · rules 0 · hooks 1 · mcpServers 0 · sidecars 0

Error: validation failed: 1 error, 0 warnings
exit=1

$ cauce automation doctor <ops> antigravity
✓ antigravity: adaptador operativo (0 advertencia(s))
```

## Causa raíz

Citas abiertas el 2026-10-28:

- `automatization/runners/antigravity/rules/cauce.md:1` empieza con `# Cauce`, sin frontmatter.
  `grep -rn trigger automatization/runners/antigravity/` no devuelve nada (exit 1).
- `automatization/runners/antigravity/manifest.json:21-24` la instala como artefacto en
  `.agents/plugins/cauce/rules/cauce.md`. Es el único runner que instala un archivo de reglas de plugin: ningún otro
  `manifest.json` tiene un destino `rules/`.
- `test/wiring/rules.test.js:74` comprueba que el bloque de reglas llegue a ese archivo, pero no que `agy` lo cargue.
- El doctor (`engine/automation/index.js`) compara el archivo contra lo entregado y contra el bloque de reglas. No
  mira el frontmatter ni corre `agy plugin validate`.

No consta desde cuándo pasa. La plantilla nació así (`d8259b1a`, 2026-08-14, cuando el toolkit pasó a llamarse
cauce), y el adaptador se midió con `agy` 1.4 (`toolsMeasuredWith`). Si `agy` 1.4.0 aceptaba una regla sin `trigger`
y 1.4.8 dejó de hacerlo es una hipótesis: no está comprobada acá.

## Fix propuesto

1. **Frontmatter en la plantilla**:

   ```markdown
   ---
   trigger: always_on
   ---

   # Cauce
   ```

   `always_on` porque la regla dice qué leer **antes** de ejecutar trabajo. Con `model_decision` dependería de que el
   modelo decida aplicarla, que es justo lo que no tiene que quedar librado. **Verificado** que cierra la reproducción:
   con ese frontmatter agregado a una copia del plugin instalado, `agy plugin validate` da `rules 1` y
   `✔ Validation passed`, exit 0.

2. **El doctor lo comprueba sin depender de `agy`**: cada `rules/*.md` del plugin tiene un `trigger` válido en su
   frontmatter, o hay advertencia. Correr además `agy plugin validate` cuando `agy` está en el `PATH` es opcional. La
   prueba se ve en rojo sacando el frontmatter de la plantilla.

3. **Llegada a las instancias ya instaladas**: con `automation install` (o `upgrade`). Comprobado en el banco y leído
   en `deliveryState` (`engine/automation/index.js:208`):
   - un archivo intacto se clasifica `desactualizado` y se reescribe;
   - uno que la empresa editó **no se conserva**: `install` para con exit 2 y «1 archivo(s) que mantiene Cauce fueron
     editados y se perderían», y sólo `--force` lo pisa.

   Por eso el arreglo a mano, agregar el `trigger` en la instancia, frena el `install` siguiente. Si lo que se agregó
   coincide letra por letra con la plantilla nueva, el archivo queda `al día`. Lo que hay que avisarle a quien ya lo
   parchó es que repita con `--force` después de actualizar.

### Aceptación y mutación (R29)

- La plantilla instalada valida: una prueba de `test/wiring/` instala el adaptador y comprueba el `trigger` del
  frontmatter. Mutación: quitar el frontmatter de la plantilla; la prueba se pone roja.
- El doctor avisa: con la regla instalada sin `trigger`, `automation doctor` da una advertencia nombrando el archivo.
  Mutación: sacar la comprobación; la prueba se pone roja.
- Prueba real: `agy plugin validate` en exit 0 sobre el banco instalado.
- Una sesión de `agy` con la regla activa: que lea de verdad `AGENTS.md` y el protocolo antes de actuar. Es la
  predicción del arreglo, y no está medida.

## Tradeoffs

- **Contexto.** Con `always_on`, la regla y su bloque viajan en cada sesión de `agy`: 45.8 KB según el doctor del
  banco. Es el costo que el adaptador ya pretendía pagar y hoy no paga. Si pesa, el bloque ya separa las reglas
  «aplica:» que se leen por superficie.
- **Dependencia del doctor.** Correr `agy plugin validate` desde el doctor lo ata a que `agy` esté instalado. La
  comprobación del frontmatter no, y por eso es lo mínimo.
- **Instancias parcheadas a mano.** Las que agregaron el `trigger` a mano frenan en el próximo `install` (punto 3).
  El CHANGELOG de la versión que lo arregle lo dice.

## Contexto de descubrimiento

En una instancia real, revisando qué carpetas de agentes se usan (`.claude/`, `.agents/`, `.gemini/`) antes de quitar
el adaptador de Gemini CLI, que no se usaba. Para confirmar que el plugin de Antigravity seguía entero se corrió
`agy plugin validate`, y falló por esto. En esa instancia, `agy` es quien programa cada tarea del release local, así
que el camino es el principal, no un borde.

## Relacionados

Ninguno con la misma causa entre los casos abiertos (se buscó `trigger` en `docs/issues/`).

## Cierre

**Resuelto en 0.117.2.**

- **Daño 1, `agy` no recibe las reglas.** Se hizo: `automatization/runners/antigravity/rules/cauce.md` empieza con
  `trigger: always_on`. Se midió con sesiones reales (abajo).
- **Daño 2, nada lo ve.** Se hizo distinto de lo propuesto: el requisito lo declara el manifiesto, en `frontmatter`
  del artefacto (`manifest.json`, campo y valores admitidos), y lo comprueba `frontmatterProblems` en
  `engine/automation/registration.js`. Va junto a `trustProblems`, que es la misma clase de defecto: lo que el runner
  tiene instalado y no corre. Es **error** y no advertencia, porque «operativo» con la regla inerte era justo la
  mentira del caso. No va en `index.js`, que está en 499 líneas. Durante `install` no aparece: con la regla sin
  `trigger`, `install` frena con exit 2 («fueron editados y se perderían»), y con `--force` la reescribe con su
  `trigger`, así que el doctor del final de `install` ya la ve bien. Corrido sobre el banco embedded de abajo.
- **Correr `agy plugin validate` desde el doctor.** Se decidió que no: ata el doctor a que `agy` esté en el `PATH`, y
  la comprobación del frontmatter cubre el error que el validador reportaba.
- **Llegada a las instancias instaladas.** Se hizo y se probó (abajo): un archivo intacto queda `desactualizado` y
  `install` lo reescribe. El caso de quien lo editó a mano quedó en el CHANGELOG de 0.117.2. Lo que **no** lo
  actualiza es `upgrade`: no reinstala los adaptadores (`engine/cli/instance.js` sólo llama a `A.uninstall` y
  revisa los bloques de `AGENTS.md`). Lo marcan el doctor y `ops contract` (`staleArtifacts`). La primera versión
  del CHANGELOG decía lo contrario, y se corrigió antes del commit.
- **Prueba de que la plantilla instala el `trigger` y el doctor lo exige.** Se hizo en
  `test/wiring/registration.test.js`, «la regla del plugin de Antigravity se instala con trigger…». Mutaciones:
  - sacar el frontmatter de la plantilla → rojo con `actual: undefined, expected: 'always_on'`;
  - sacar `frontmatterProblems` de `registrationProblems` → rojo con `actual: ''` en la aserción del error.

  Las dos se restauraron, y se comprobó con `grep` que el código volvió.
- **`test/wiring/rules.test.js:74` no comprobaba que `agy` cargue la regla.** Lo cubre la prueba de arriba, y la deja
  como está.
- **Tradeoff de contexto (45.8 KB por sesión).** Se acepta: es lo que el adaptador declaraba pagar. No se midió una
  sesión.
- **Desde cuándo pasa.** Queda como hipótesis. `agy changelog`, leído con 1.4.8 instalado, no menciona `trigger` en
  ninguna versión, y no se instaló un `agy` viejo para comprobarlo. El arreglo no depende de eso, porque
  `always_on` es válido en 1.4.8.
- **Modo embedded.** Se corrió: instancia `ops init --mode embedded` con el motor enlazado.
  - `install` → `instalado .agents/plugins/cauce/rules/cauce.md`.
  - `agy plugin validate` → `rules 1`, `✔ Validation passed`.
  - El doctor → exit 0; sin el frontmatter → el error de `trigger`, exit 1.
- **Que `agy` con la regla activa la cumpla.** Se midió con dos sesiones reales de `agy` 1.4.8 en modo `plan`, sobre
  dos copias del banco fuera del árbol de Cauce, sin `AGENTS.md` en la raíz del workspace. Una copia tenía la regla
  vieja y la otra la nueva. Es una corrida de cada una: muestra la diferencia, pero no estima su varianza.
  - **¿Está en contexto?** Pedido: «sin usar herramientas, ¿tenés cargada alguna regla?».
    - Vieja: `NINGUNA`.
    - Nueva: cita `.agents/plugins/cauce/rules/cauce.md`, su primera línea, `AGENTS.md`, `PROTOCOL.md` y las seis reglas de `system/` del bloque.
  - **¿La cumple?** Pedido incidental, que no nombra las reglas: «armá el plan de dónde anotarías una idea nueva».
    - Nueva: lo primero que hace es leer `suelto/AGENTS.md`, `suelto/planning/PROTOCOL.md` y cinco de las seis
      reglas de `system/`, y recién después el INBOX. Son 22 pasos.
    - Vieja: explora con `find`, encuentra `rules/cauce.md` en disco y lo lee como archivo. Llega a `AGENTS.md`, a
      `PROTOCOL.md` en el paso 13 y a dos reglas de `system/`. Son 33 pasos.

  Las dos sesiones dejaron su plan en `~/.gemini/antigravity-cli/brain/<id>/`, que es donde `agy` guarda sus
  artefactos, y no tocaron el banco.

Prueba real en un banco de medición (`ops bench suelto`), con `agy` 1.4.8:

1. Se instaló con la plantilla y el manifiesto de `main` (`fe889ed3`).
   - `agy plugin validate .agents/plugins/cauce` → `✗ rules/cauce.md: no valid trigger…`, `rules 0`.
   - El doctor de la rama → `✗ … rules/cauce.md: sin trigger válido en el frontmatter (always_on, model_decision,
     glob o manual): agy no lo carga`, exit 1.
2. Se reinstaló con la rama.
   - `install` → `✓ antigravity: actualizado .agents/plugins/cauce/rules/cauce.md`, exit 0.
   - `agy plugin validate` → `rules 1`, `✔ Validation passed`, exit 0.
   - El doctor → `adaptador operativo (0 advertencia(s))`, exit 0.
