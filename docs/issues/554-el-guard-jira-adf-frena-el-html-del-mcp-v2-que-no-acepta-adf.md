---
caso: 554
titulo: el guard jira-adf frena el HTML del MCP v2 de Atlassian, que no acepta ADF
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.0
---

# 554 — El guard `jira-adf` toma por markdown toda descripción que no es ADF, y el MCP v2 sólo manda markdown o HTML

**🟢 resuelto en 0.124.0** · detectado en 0.123.0 · prioridad **media**: con el MCP v2 como único conector de Jira, cada edición de
una descripción frena por tarjeta, el mensaje manda al agente a una salida que ese servidor no tiene y, por decir que
se corrige solo, no abre el diálogo: lo único que la destraba es una persona pegando una línea en `.ops-approval` por
cada tarjeta. Afecta a toda instancia que edite Jira por ese conector, y el arreglo son dos líneas y un mensaje. Sube a
alta si una instancia, para no frenar en cada tarjeta, deja aprobaciones `jira … description` puestas para siempre:
ahí el guard deja de cuidar también el markdown.

## Resumen

`jiraAdf` deja pasar sólo un documento ADF (objeto o `contentFormat: "adf"`) y frena todo lo demás como markdown. Según
la instancia, el MCP v2 de Atlassian (`editJiraIssue`) acepta `contentFormat` `markdown` o `html`, nunca `adf`, así que
la salida que el mensaje propone —«mandalo con contentFormat "adf"»— no existe, y el HTML, que sí conserva casillas y
tablas, frena igual. Dos daños, y el arreglo tiene que cerrar los dos:

1. El HTML frena como si fuera markdown.
2. El mensaje marca el bloqueo como corregible por el agente (`fixable: true`), así que no abre el diálogo de
   aprobación (caso 285); con el v2 no hay corrección posible y la persona tiene que pegar la línea a mano por tarjeta.

## Reproducción

Desde un directorio vacío, con el motor en `$E`:

```bash
D=$(mktemp -d) && cd "$D" && echo '{}' > ops.config.json
IN='{"hook_event_name":"PreToolUse","tool_name":"mcp__atlassian__editJiraIssue","tool_input":{"issueIdOrKey":"ACME-1","contentFormat":"html","fields":{"description":"<ul data-type=\"task-list\"><li data-type=\"task-item\"><input type=\"checkbox\"> Pruebas</li></ul>"}},"cwd":"'$D'","transcript_path":"/nonexistent"}'
for f in html adf markdown; do echo "== $f"; echo "${IN/\"html\"/\"$f\"}" | OPS_ROOT=$D node $E/engine/hooks/run.js jira-adf; echo "exit=$?"; done
echo "== pre-mcp adf"; echo "${IN/\"html\"/\"adf\"}" | OPS_ROOT=$D node $E/engine/hooks/run.js pre-mcp; echo "exit=$?"
```

## Síntoma

Corrido el 2026-11-24 con el motor de la rama `fix/cases-from-an-instance-audit` (`5fff05a4`, sobre 0.124.0). La
instancia lo vio el 2026-11-23 con 0.123.0, con el mismo resultado para el HTML:

```
== html
BLOQUEADO: editar la descripción de ACME-1 en markdown la reemplaza entera y aplana lo que el ADF tenía —menciones, tablas, casillas—. Leela con getJiraIssue y responseContentFormat "adf", cambiá ese documento y mandalo con contentFormat "adf".
Esto lo corregís vos, con lo que dice arriba: no hace falta preguntarle a nadie. Esto lo aprueba una persona: que pegue ella tal cual en planning/.ops-approval estas líneas:
  jira ACME-1 description
Cada línea vale hasta que alguien la borre, y lo que no esté ahí vuelve a frenar. […]
exit=2
== adf
exit=0
== markdown
BLOQUEADO: editar la descripción de ACME-1 en markdown […]
exit=2
== pre-mcp adf
BLOQUEADO: 'editJiraIssue' escribe por el servidor MCP 'atlassian' en un sistema ajeno, y R12 lo deja a una persona: […] Aprobada una vez, vale el resto de la sesión para la conversación principal; […]
  mcp atlassian editJiraIssue
exit=2
```

El HTML frena con un mensaje que dice «en markdown»; la misma llamada con `contentFormat: "adf"` pasa, y es la que,
según la instancia, el v2 rechaza. `contentFormat: "HTML"` y sin `contentFormat` frenan igual que `html`.

La última corrida muestra lo que el caso no preveía: desde 0.124.0 el grupo `pre-mcp` corre además `mcp-writes`
(caso 541), que frena toda escritura por MCP hasta una aprobación **por herramienta y por sesión**. O sea que aun con
este caso arreglado la primera edición de la sesión pide una persona; lo que el arreglo quita es el freno **por
tarjeta** y sin diálogo de `jira-adf`.

## Causa raíz

`engine/hooks/jira.js:22`:

```js
if (description === null || typeof description === 'object' || call.contentFormat === 'adf') return
```

Lo que no es ADF cae en el bloqueo, sin distinguir `html` de `markdown`. El texto de `engine/hooks/jira.js:25-27`
repite el supuesto («en markdown»), propone `contentFormat "adf"` como única salida y pasa `{ fixable: true }` a
`AP.HOW`, que con eso no abre el diálogo nativo (`engine/hooks/approval.js:145`).

Del lado del MCP, **reportado por la instancia y no comprobado acá** (hipótesis desde este repositorio: no hay conector
contra qué leerlo): el esquema de `editJiraIssue` del v2 declara `contentFormat` con `enum: ["markdown", "html"]` y su
descripción dice que `html` preserva lo que el markdown pierde (leído en una sesión de la instancia el 2026-11-23); y
una tarjeta creada con `<ul data-type="task-list"><li data-type="task-item">` quedó con nodos `taskItem` reales en el
ADF que Jira guarda (releída con `getJiraIssue` el 2026-11-22). Las dos cosas se comprueban con lecturas inocuas desde
una sesión que tenga el conector —el esquema de la herramienta y un `getJiraIssue` con `responseContentFormat: "adf"`—,
y esa comprobación es parte de construirlo (R14): el arreglo se apoya en que el HTML conserva la estructura.

## Fix propuesto

Tratar `contentFormat: "html"` como lo que es —un formato que no aplana— y dejar que el mensaje diga las dos salidas:

```js
const format = String(call.contentFormat || 'markdown').toLowerCase()
if (description === null || typeof description === 'object' || format === 'adf' || format === 'html') return
```

- El mensaje, cuando frena markdown, deja de decir sólo ADF: «mandalo en ADF si el servidor lo acepta, o con
  `contentFormat "html"` conservando la estructura».
- `fixable` se queda: con una salida real en el mensaje, el agente sí lo corrige solo.
- Pruebas en `test/hooks/jira-adf.test.js`: `html` y `HTML` pasan (a «lo que no aplana nada pasa»); `markdown` y sin
  `contentFormat` siguen frenando (ya cubiertas); el mensaje nombra `html`.
- Mutación declarada: quitar `|| format === 'html'` pone en rojo la prueba de `html`; quitar el `toLowerCase()` pone
  en rojo la de `HTML`.

Probado en una copia (`ops copy`), con la reproducción de arriba: `html` y `HTML` → `exit=0`; `adf` → `exit=0`;
`markdown` y sin `contentFormat` → `exit=2` con el mismo bloqueo; `pre-mcp` con `html` → frena sólo `mcp-writes`.
`test/hooks/jira-adf.test.js`, `mcp-writes.test.js` y `project-guards.test.js` con el cambio: 31 de 31 en verde, así
que ninguna prueba actual dependía de que el HTML frenara.

Sin contentFormat se sigue frenando aunque el default del v2 sea markdown o no: el 229 lo decidió porque el esquema
decía que el default «varía según la herramienta», y frenar es la dirección segura.

Una alternativa más estricta es convertir el HTML a ADF y frenarlo sólo si pierde nodos que la tarjeta tenía. La
instancia tiene algo así en un guard propio; desde Cauce costaría más de lo que parece, porque un hook no tiene la
descripción actual de la tarjeta —no lee Jira— y habría que comparar contra algo que no ve.

## Tradeoffs

- **Dejar pasar todo HTML confía en que el HTML lleve lo que había.** Medido en la copia: `<p>- [ ] Pruebas</p>` con
  `contentFormat: "html"` pasa (`exit=0`), y esas casillas se aplanan igual que en markdown. Es el mismo grado de
  confianza que ya se le da al ADF —un documento ADF a mano también puede venir sin lo que había—; lo que cuida el
  guard es el formato que no puede llevarlo, no el contenido.
- **Retroceso posible:** si algún servidor tratara `html` como texto y lo pasara por markdown, el guard dejaría de
  frenarlo. Ninguna fuente lo dice; se mira en el mismo esquema que se lee al construir.
- **Dependencia con el 541:** `pre-mcp` es `['jira-adf', 'mcp-writes']` y `test/hooks/mcp-writes.test.js:41-42` lo
  fija. El orden no cambia; el arreglo no toca `mcp-writes`.

## Contexto de descubrimiento

Una instancia en 0.123.0, durante una release. Al reescribir una tarjeta con el constructor de tarjetas de la
instancia, que desde el cambio al MCP v2 escribe HTML, el hook de `pre-mcp` (`jira-adf`) la frenó dos veces. No es
configuración de la instancia: el guard no tiene opción en `ops.config.json`, y el guard propio de la instancia dejó
pasar la misma llamada. La única salida fue la aprobación a mano por tarjeta.

## Relacionados

- 229 — el caso que creó este guard, cuando el MCP sí aceptaba ADF. Este caso revierte una parte de su decisión: el
  229 frenaba «todo lo que no es ADF»; esto deja pasar `html`.
- 285 — por qué un bloqueo `fixable` no abre el diálogo.
- 541 — `mcp-writes`, que corre después en el mismo grupo y sigue pidiendo una aprobación por sesión.

## Cierre

Se recorrió el caso entero, con la decisión de la persona del 2026-11-24 (dejar pasar todo HTML, no comparar estructura):

- **Fix, `html` no aplana**: se hizo, en cualquier mayúscula (`engine/hooks/jira.js`). Sin `contentFormat` sigue frenando.
- **Fix, el mensaje nombra las dos salidas**: se hizo, con los parámetros exactos —leer con `getJiraIssue` y
  `responseContentFormat "html"`, mandar con `contentFormat "html"`; `"adf"` en los dos donde el servidor lo acepta—.
  La primera versión decía «el formato que el servidor acepte», y la revisión la marcó por ambigua para un bloqueo
  `fixable`.
- **Fix, `fixable` se queda**: se decidió así; con una salida real en el mensaje el agente la toma solo.
- **R14, el esquema del v2**: se verificó en esta sesión, leyendo el esquema del conector de Atlassian que tiene cargado:
  `editJiraIssue.contentFormat` es `enum ["markdown","html"]`, «Defaults to markdown», `html` «preserves inline media»
  y, con el formato HTML apagado, «the call is rejected rather than downgraded»; `getJiraIssue.responseContentFormat` es
  `enum ["markdown","html"]` y su HTML «can be passed straight back to editJiraIssue». Eso cierra el retroceso que el caso
  dejaba abierto (un servidor que tratara `html` como markdown): el v2 lo rechaza.
- **R14, que el HTML con casillas deje `taskItem` reales en Jira**: no se comprobó. Exige escribir en un Jira real (R12),
  y la persona decidió cerrar sin eso; queda como dato informado por la instancia.
- **Alternativa estricta (comparar nodos)**: se decidió que no; el hook no lee Jira.
- **Tradeoff, un HTML a mano sin estructura aplana igual**: es así, y es la confianza que ya se le da al ADF a mano.
- **Lo que el enunciado no preveía**: que `pre-mcp` sigue pidiendo la aprobación por sesión de `mcp-writes` (caso 541),
  así que el arreglo quita el freno por tarjeta y no la primera aprobación; y la revisión marcó que un conector v1 —si
  existe uno que no reconozca `html`— recibiría el HTML sin freno. No se midió: no hay un v1 contra qué leerlo.

Lo que se corrió, guardado en el scratchpad de la sesión, fuera del repositorio:

- La reproducción del caso por `run.js jira-adf`, antes y después, con el motor final: antes `html` y `HTML` → `exit=2`
  con el bloqueo «en markdown»; después → `exit=0`. `adf` → 0 en las dos; `markdown` y sin formato → 2 en las dos;
  `pre-mcp` con `html` frena después sólo por `mcp-writes`.
- Las pruebas nuevas en `test/hooks/jira-adf.test.js`, 2 en rojo antes del arreglo y en verde después.
- 5 mutaciones en una copia, las 5 rojas: sin `html`, sin `toLowerCase`, el mensaje sin `html` (dos formas) y la llamada
  sin formato tomada como `html`.
- Dos pasadas de revisión independiente sobre el diff de los casos 554, 555 y 556; la segunda, sin nada que impida
  entregar.
- `npm run ci`: 1982 de 1982, exit 0.

**Sin probar:** una edición real en Jira con HTML y casillas (escribe en producción; decidido sin eso) y un conector v1.

### Lista de cierre

1. hecho: la reproducción del caso con el motor anterior, `html` y `HTML` en `exit=2`, guardada antes del arreglo.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas, 2 en rojo antes del arreglo y en verde después.
4. hecho: 5 mutaciones en una copia, las 5 rojas.
5. hecho: deja de frenar `html`; antes y después de la reproducción lado a lado, y la prueba de `markdown` sigue frenando.
6. hecho: la reproducción por `run.js`, el proceso que corre el hook, sin dobles; lo viejo (`exit=2`) se fue.
7. hecho: lo que depende del conector se verificó en su esquema; la escritura real en Jira no se corrió por R12, y la
   persona decidió cerrar sin ella (2026-11-24).
8. hecho: la reproducción se repitió con el motor final; corrieron los cinco formatos y `pre-mcp`.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: dependían `test/hooks/jira-adf.test.js`, `mcp-writes` (grupo `pre-mcp`) y el caso 229, que se revierte en
    parte y se dice en el CHANGELOG.
11. hecho: dos pasadas de revisión; los hallazgos de la primera se arreglaron y la segunda no trajo nada que impida
    entregar.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y las decisiones.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
