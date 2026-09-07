---
caso: 046
titulo: El contrato de un cargo no tiene forma de hacerse cumplir, sólo de leerse
estado: abierto
prioridad: media
version-detectada: 0.66.0
---

# 046 — Un cargo puede hacer todo lo que su contrato le prohíbe

**🔴 abierto** · detectado en 0.66.0 · prioridad **media** — no es un defecto que rompa nada; es el techo del producto

## Resumen

Lo que Cauce fabrica son 52 contratos que dicen qué decide cada cargo, qué no le corresponde y cuál es
su entrega mínima. Ninguno de esos límites lo sostiene nada más que la lectura: un cargo se proyecta
como una **skill puntero** con dos campos de frontmatter, y es instrucción que carga el mismo actor que
después ejecuta. No hay un actor por cargo, así que no hay nada que pueda impedirle hacer lo que su
contrato prohíbe.

Contra el modo de fallo dominante eso importa más que en otros lados. El registro de evaluaciones del
proyecto tiene a R14 —afirmar el comportamiento de una herramienta sin comprobarlo— como la causa de
casi la mitad de los rojos. Un cargo al que se le dijo que no afirme sin verificar y un cargo que no
puede escribir sin haber invocado nada son cosas distintas, y hoy sólo existe la primera.

Este caso **no propone convertir los 52 cargos**. Propone medir primero si la conversión compra lo que
se supone que compra, porque hay una razón concreta para dudarlo y está en «Tradeoffs».

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce
npm ci
mkdir -p /tmp/demo
node engine/cli/ops.js init /tmp/demo/acme-ops --name Acme --mode sidecar --no-install

# `--no-install` no baja la dependencia, y `automation install` la necesita para resolver
# el catálogo. Se enlaza al repositorio en vez de instalarla:
mkdir -p /tmp/demo/acme-ops/node_modules/@ingeniomaps
ln -s "$PWD" /tmp/demo/acme-ops/node_modules/@ingeniomaps/cauce

node engine/cli/ops.js automation install /tmp/demo/acme-ops claude

grep -c . agents/roles/system/qa-engineer/SKILL.md   # el contrato completo
cat /tmp/demo/.claude/skills/qa-engineer/SKILL.md    # lo que el runner recibe
```

## Síntoma

El contrato tiene 95 líneas con contenido. Lo que el runner recibe es un puntero, sin una sola
declaración de capacidad:

```text
---
name: qa-engineer
description: Diseñar, ejecutar y revisar estrategias de calidad basadas en riesgo para productos de software de cualquier stack. Usar al convertir criterios de aceptación en evidencia, explorar comportamientos, automatizar pruebas, investigar defectos, evaluar regresión, accesibilidad, compatibilidad, rendimiento, seguridad básica o preparación de release. No usar para declarar calidad sin evidencia, sustituir revisiones especializadas ni cambiar requisitos o producción unilateralmente.
---

# qa-engineer

Leé `acme-ops/node_modules/@ingeniomaps/cauce/agents/roles/system/qa-engineer/SKILL.md` para el contrato completo del cargo: cuándo actuar,
qué decide, qué no le corresponde y cuál es su entrega mínima. Sus métodos y formatos de output están
en `acme-ops/node_modules/@ingeniomaps/cauce/agents/roles/system/qa-engineer/references/`.

Esas rutas se resuelven desde este directorio raíz, no desde el repositorio de operaciones: en modo
sidecar el wiring vive acá y el repo ops es uno de sus hijos.

Respetá los límites de ese contrato y las reglas de `AGENTS.md`. Generado por
`cauce automation install`: no lo edites acá.
```

La `description` es lo único que viaja del contrato, y dice «no usar para declarar calidad sin
evidencia»: el límite está escrito y nada lo sostiene. No hay `tools:`, no hay `hooks:`, y no hay un
proceso aparte — el mismo actor que lee «qué no le corresponde» es el que puede hacerlo en la línea
siguiente.

## Causa raíz

No es un error: es la forma que tiene hoy la proyección. `engine/automation/roles.js:27-45` arma el
archivo con `name` y `description` y nada más, y `installRoleSkills` (líneas 47-70) lo escribe en el
`roleSkills` que declara el manifiesto del runner —`.claude/skills`, `.agents/skills`, según cuál—.

Los guards, que sí son capacidad, viven en el otro extremo y son **ciegos al cargo**:
`engine/hooks/run.js:35-50` despacha por nombre de guard y el input del hook no trae quién está
actuando (`engine/hooks/input.js` no lee ningún campo de rol). O sea que hoy Cauce puede expresar
«nadie toca esto» y no «este cargo no toca esto».

## Fix propuesto

Un segundo modo de proyección, al lado del actual y no en su lugar: donde el runner lo soporte, un
cargo se proyecta como **subagente con lista de herramientas acotada**, y el contrato declara esa lista.

```diff
 // agents/roles/system/qa-engineer/SKILL.md
 ---
 name: qa-engineer
 description: …
+capabilities:
+  tools: [Read, Grep, Glob, Bash]
+  denyWrite: ["src/**"]        # un auditor de calidad no arregla el código que juzga
 ---
```

```diff
 // engine/automation/roles.js
-function roleSkill(role) {
-  return `---\nname: ${role.slug}\ndescription: ${role.description}\n---\n…`
+function roleSkill(role, runner) {
+  // Donde el runner acota herramientas por subagente, el contrato deja de ser sólo legible.
+  // Donde no, se emite lo de siempre: el puntero, y el límite lo sostiene la lectura.
+  const caps = runner.capabilities.boundedAgents ? capabilityFrontmatter(role) : ''
+  return `---\nname: ${role.slug}\ndescription: ${role.description}\n${caps}---\n…`
 }
```

**Y antes de escribir una línea de eso, la medición.** La hipótesis es «acotar la capacidad baja los
rojos de R14 más que la prosa». Se toman tres o cuatro cargos con rojos de R14 registrados, se los
proyecta con herramientas acotadas y se vuelven a correr **los casos que fallaron**, no la batería
—R20 y R21—. Lo que la refutaría: que los mismos casos sigan rojos.

## Tradeoffs

- **Hay una razón concreta para esperar que la medición dé que no.** R14 falla casi siempre por **no**
  invocar —el cargo afirma de memoria el default de una herramienta en vez de comprobarlo—, y contra
  eso una lista de herramientas permitidas no hace nada: prohíbe llamar de más, no obliga a llamar. Si
  la medición confirma eso, este caso se cierra como descartado y el hallazgo vale igual.
- Decidir el set de herramientas de 52 cargos es trabajo de diseño, y un allowlist mal puesto **rompe
  al cargo en silencio**: no falla, simplemente no puede hacer una parte de su trabajo y lo reporta
  como limitación propia. Es el modo de fallo más caro de los que este cambio introduce.
- La proyección se bifurca por runner y hay que decidir qué recibe el que no lo soporta. Un contrato
  que se cumple en un runner y se lee en otro es una promesa desigual, y eso hay que decirlo donde el
  usuario lo vea, no en el código.
- **No está verificado que un runner honre un bloque de hooks por subagente.** Que un subagente pueda
  tener su propia lista de herramientas sí lo está —los tipos de agente disponibles en una sesión de
  Claude Code declaran las suyas—; lo otro es plausible y no se comprobó acá. Sin ello, la mitad de la
  frontera —la que niega una escritura concreta— no existe y queda sólo el allowlist.

## Prioridad

**Media.** Nada se rompe hoy y ninguna entrega se pierde: lo que está en juego es cuánto vale un
contrato. Sube a alta si la medición muestra que la capacidad acotada mueve los rojos de R14; baja a
descartado si muestra que no.

## Contexto de descubrimiento

Salió de comparar Cauce contra otro orquestador de agentes con un modelo de ejecución propio, mirando
qué mecanismos de allá tendrían sentido acá. De doce candidatos, once se cerraron —o ya estaban
cubiertos por una regla, o pedían un modelo de ejecución que Cauce deliberadamente no tiene, o eran un
retroceso—. Éste es el único que quedó abierto, y se cerró mal la primera vez: se concluyó «no
transfiere» leyendo que la proyección de hoy son skills, que es una observación sobre la
implementación y no un límite del producto.

## Relacionados

- Ninguno. Es el único caso sobre la forma de un cargo; los demás son del motor.
