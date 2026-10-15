---
caso: 381
titulo: las fases que juzgan no escalan con el tamaño de la tarea
estado: abierto
prioridad: media
version-detectada: 0.106.0
---

# 381 — Build, Review, Verify y QA cuestan casi lo mismo en una tarea de una línea que en una de cien, y en `lite` corren las cuatro

**🔴 abierto** · detectado en 0.106.0 · prioridad **media** — las fases que juzgan son el 67 % del gasto de una
corrida de tareas chicas. 0.103.3 y 0.103.4 abarataron los pasos de oficina y de escritura y dijeron, a propósito,
que «los pasos que juzgan no cambian»; éste es el caso que pide mirarlos.

## Resumen

En una corrida de tres tareas `[lite]` de pantalla (`wf_81ce8e36-77f`, instancia `acme-ops`), Build, Review,
Verify y QA juntos fueron 23 agentes y 6,22 M de los 10,67 M de tokens propios. Tres cosas los inflan sin que
el tamaño de la tarea las justifique:

1. **Verify lanza varios agentes por tarea**: `verify`, `missing-tests`, `verify-human`… 8 en la corrida, 1,61 M.
   `missing-tests` solo, en una tarea de `placeholder`, gastó 36 turnos.
2. **QA corre en `lite`** con un agente completo que vuelve a correr la suite que Verify ya corrió (57 turnos en
   uno de ellos), aunque la tarea no tenga recorrido de usuario distinto del que la prueba ya ejerce.
3. **Cada agente arranca con las reglas enteras del proyecto.** En esta instancia son 162 KB (`check` lo avisa:
   «el bloque de reglas carga 14 archivo(s), 162.3 KB en cada agente»). Parte es de la instancia —ver Tradeoffs—,
   pero el recorrido no distingue qué regla necesita cada fase: Commit carga las de seguridad y QA las de Jira.

## Reproducción

Corrida `wf_81ce8e36-77f` (Cauce 0.106.0), tareas `validacion-que-no-castiga-el-campo-vacio`,
`requisitos-de-la-contrasena-en-el-registro` y `ejemplo-en-correo-y-celular`, las tres `lite`. Agentes por
fase, del `journal.jsonl`: Build 6, Review 7, Verify 8, QA 2. Turnos de los más largos: build 76, 64 y 48; qa 57
y 38; verify `missing-tests` 36.

## Síntoma

| Fase | Agentes | Tokens propios | Caché releída |
|---|---:|---:|---:|
| Build | 6 | 1,85 M | 31,3 M |
| Review | 7 | 1,83 M | 8,1 M |
| Verify | 8 | 1,61 M | 16,5 M |
| QA | 2 | 0,93 M | 13,5 M |

## Causa raíz

Sin establecer en código. Lo observado: el número de agentes por fase no depende del carril salvo en Critique y
en el revisor de `express`; y `ops context` entrega a toda fase el mismo bloque de reglas.

## Fix propuesto

Tres palancas independientes, para medir de a una:

- En `lite`, QA no corre si Verify ya ejerció cada criterio con su prueba y la tarea no declara un recorrido
  aparte (`(fuera de verify: …)`).
- Verify en un solo agente cuando el carril no es `full`; `missing-tests` como pregunta dentro de él.
- Reglas por fase: que una regla declare `fase:` además de `aplica:`, y que Commit, WIP y Done carguen sólo las
  que nombran su fase.

## Tradeoffs

- Menos agentes es menos perspectivas: el caso 316 (la prueba inventada que encontró la revisión) es el argumento
  en contra. La propuesta no toca `full`.
- El peso de las reglas es en parte de la instancia: tiene 125 KB propios y ya usa `aplica:` en cuatro archivos.
  Aligerarlas es trabajo suyo y no lo resuelve este caso; lo que sí es del motor es no cargar a cada fase lo que
  esa fase no aplica.

## Contexto de descubrimiento

La persona vio 5,6 M de tokens para tres tareas chicas y preguntó por qué, si Cauce «ya lo había solucionado».
0.103.3 y 0.103.4 lo solucionaron para los pasos de oficina y de escritura —en esta corrida Triage, Claim y
Classify fueron el 2 %—; 0.103.5 volvió a cargar las reglas en los de escritura (WIP, Done y Commit: 23 %).

## Relacionados

- 380 — no hay salida «hazlo a mano».
- Las entradas de 0.103.3, 0.103.4 y 0.103.5 del CHANGELOG.
