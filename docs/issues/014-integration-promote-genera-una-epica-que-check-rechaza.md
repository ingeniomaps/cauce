---
caso: 014
titulo: integration promote genera una épica con dos secciones de Criterios y check la rechaza
estado: resuelto
prioridad: alta
version-detectada: 0.58.0
resuelto-en: 0.60.0
---

# 014 — La épica que promueve la integración no pasa `check`

**🟢 resuelto en 0.60.0** · detectado en 0.58.0 · prioridad **alta** — el recorrido entero termina en un planning inválido

## Resumen

`integration promote` escribe la épica con una sección `## Criterios` propia **y** conserva el
encabezado que venía en la descripción remota, que en el fixture del propio toolkit es
`## Criterios de aceptación`. El parser busca la sección con `/Criterios/i` y se queda con la primera,
que es la importada y no tiene ningún `- **CN** —`.

Resultado: la épica recién promovida deja el planning en rojo, con dos errores que no nombran la
causa.

## Reproducción

Con el fixture que trae el toolkit, sin credenciales:

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install --integration jira
cd ops
cp <cauce>/test/support/fixtures/jira-search.json fx.json
# habilitar jira en integrations/jira/config.json y declarar la raíz ../app en ops.config.json

node tools/ops.js integration sync . jira --fixture fx.json
# curar el draft: state: ready, promotionKind: "epic"
node tools/ops.js integration rebase . jira DEMO-42
node tools/ops.js integration check . jira        # ✓ integraciones válidas
node tools/ops.js integration promote . jira DEMO-42   # ✓ promovido como epic

node tools/ops.js check planning                  # ✗ 2 errores
```

## Síntoma

```text
$ node tools/ops.js integration promote . jira DEMO-42
✓ jira:DEMO-42 promovido como epic

$ node tools/ops.js check planning
✗ roadmap/epic-001-mostrar-el-estado-de-sincronizacion.md: falta al menos un criterio observable
✗ roadmap/epic-001-mostrar-el-estado-de-sincronizacion.md: mostrar-el-estado-de-sincronizacion cita C1, que no existe
```

La épica generada, tal cual sale:

```markdown
## Criterios de aceptación        ← viene de la descripción de Jira

- La fecha del último sync es visible.

## Criterios                      ← la que escribe promote

- **C1** — - La fecha del último sync es visible.
```

## Causa raíz

`engine/planning/parser.js:49`:

```js
function section(text, heading) {
  const parts = text.split(/^##\s+/m)
  return parts.find((part) => heading.test(part.split('\n')[0])) || ''
}
```

`find` devuelve la **primera** coincidencia y `/Criterios/i` no está anclado, así que
`## Criterios de aceptación` gana sobre `## Criterios`. Esa sección no tiene viñetas `- **CN** —`, así
que `criteria` queda vacío: de ahí «falta al menos un criterio observable» y, como la historia sí cita
`C1`, «cita C1, que no existe».

Comprobado aislando la causa: renombrando la sección importada a un título **sin** la palabra
«Criterios» —no alcanza con `## Criterios importados de Jira`, que el regex sigue casando— `check`
pasa a verde sin tocar nada más.

Hay un segundo defecto menor en la misma salida: el criterio se emite como
`- **C1** — - La fecha del último sync es visible.`, con el guión de la viñeta importada pegado al
texto. No rompe el contrato, pero el criterio queda mal escrito en cada épica que entre por esta vía.

## Fix propuesto

Tres frentes, y el primero solo ya destraba el recorrido:

1. **Que `promote` no deje dos encabezados que compitan.** Al armar la épica, renombrar o absorber el
   encabezado importado que case con `/Criterios/i` — lo más simple es que la descripción remota entre
   bajo `## Contexto relevante` o con sus encabezados degradados a `###`, que además evita que un
   `## Historias` o un `## Resultado` remoto choquen mañana con los mismos nombres.

2. **Anclar la búsqueda de sección.** `section()` debería casar el encabezado completo, no un
   substring: hoy `## Criterios de aceptación`, `## Criterios importados` y `## Criterios que no
   usamos` son todos «la sección de criterios» para el parser. El mismo riesgo corre `/Historias/i`,
   que hoy acierta por suerte con `## Historias (Tareas)`.

3. **Limpiar la viñeta al construir el criterio**: `- **C1** — - texto` sale de no despuntar el `- `
   del ítem importado.

## Tradeoffs

Anclar `section()` es un cambio de parser y puede romper instancias cuyas épicas usen títulos con
sufijo —`## Historias (Tareas)` es un caso real, encontrado en una migración—. Si se ancla, conviene
aceptar un sufijo explícito entre paréntesis, o al menos que `check` avise cuando hay dos secciones que
compiten por el mismo rol, que es el síntoma que hoy no se ve por ningún lado.

El punto 1 no tiene tradeoff: nadie depende de que la descripción de Jira aporte un `## Criterios`.

## Contexto de descubrimiento

Barriendo la superficie de integraciones de 0.58.0 el 2026-09-03, con el `--fixture` que el propio CLI
expone para correr sin credenciales. Es el recorrido completo del README de Jira —sync, curación,
check, promote— con el fixture del toolkit y sin ninguna edición creativa: el único ajuste fue declarar
la raíz `app` que el fixture nombra.

## Resolución

**Resuelto en 0.60.0 por los tres frentes**, con una variante en el segundo que evita su tradeoff.

1. **`promote` ya no genera el conflicto.** Los encabezados de la descripción remota bajan un nivel al
   entrar en `## Resultado` —`nestHeadings`—, así que dejan de competir con las secciones de la épica y
   siguen legibles. Cubre igual un `## Historias` o un `## Resultado` remotos, que iban a chocar mañana.

2. **`section()` prefiere la coincidencia exacta y cae a la parcial si no hay.** El caso proponía
   anclar, y declaraba el tradeoff: rompería `## Historias (Tareas)`, un título real de una migración.
   Con exacta-primero, `## Criterios` gana sobre `## Criterios de aceptación` **y** el título con sufijo
   sigue resolviendo. No hay tradeoff que aceptar.

3. **El criterio sale sin el guión pegado**: `criterionText` despunta la viñeta importada, así que ya no
   queda `- **C1** — - La fecha…`.

Verificado el 2026-09-03 sobre el recorrido completo del README de Jira con el fixture del toolkit:
`sync` → curación → `check` → `promote` → `check planning` termina en
`✓ planning válido: 1 épica(s)`, con `### Criterios de aceptación` anidado, `## Criterios` con su
`- **C1** — La fecha del último sync es visible.` y las historias resolviendo.

**No entró** el aviso de `check` cuando dos secciones compiten: con el frente 1 la épica ya no las
genera, y con el 2 el parser resuelve la ambigüedad. Si aparece por otra vía, es un caso nuevo.

## Relacionados

- [015](015-el-recorrido-documentado-de-jira-se-traba-al-curar.md) — el paso anterior del mismo
  recorrido, que tampoco funciona como está escrito.
