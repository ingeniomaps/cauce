---
caso: 387
titulo: dos agent-eval lanzados a la vez pueden leer la lista de casos del otro, y sin filtro nadie lo nota
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.107.0
---

# 387 — El agente de casos de `agent-eval` elige solo dónde guardar la salida de `evaluate --cases --json`; dos corridas de la misma sesión comparten el archivo y una juzga los casos de otro cargo

**🟢 resuelto en 0.108.0** · detectado en 0.107.0 · prioridad **media** — hoy costó una corrida que se detuvo sola; el
mismo cruce sin filtro de casos, o con un id que dos cargos comparten, mide el contrato equivocado y
registra el veredicto como si fuera bueno.

## Resumen

La fase `Casos` de `automatization/workflows/agent-eval.js` le pide a un agente correr
`evaluate <cargo> --cases --json` y copiar lo que imprime. El prompt no dice dónde dejar la salida, y el
agente la redirigió a un archivo de nombre fijo en el scratchpad de la sesión. Ese scratchpad es uno solo
para todos los workflows que la sesión lanza, así que dos `agent-eval` en paralelo escriben y leen el mismo
`cases.json`. Una corrida de technical-program-manager leyó la lista de privacy-compliance-specialist.

Se detuvo porque corría con filtro (`cases: 08-standard-as-evidence`) y ese id no estaba en la lista ajena:
`pickCases` lo devolvió como faltante y el script paró con `caso-inexistente`. **Esa es la única defensa, y
es accidental.** Sin filtro no hay nada que comparar y la corrida sigue con los casos del otro cargo,
juzgados contra el `SKILL.md` propio. Con filtro tampoco alcanza cuando el id existe en los dos:
`06-adversarial-docs` lo tienen 32 cargos.

## Reproducción

Sesión del 2026-10-16, trece `agent-eval` lanzados en la misma vuelta desde una copia del workflow en el
scratchpad, cada uno con `{agent, cases}` de un cargo distinto. Corrida `wf_ca28bb3f-800`:

- El agente `cases` corrió, desde la raíz del repo,
  `node engine/cli/ops.js evaluate technical-program-manager --cases --json > <scratchpad>/cases.json`
  y después `cat <scratchpad>/cases.json`.
- Lo que devolvió trae `skill` de technical-program-manager e `items` de privacy-compliance-specialist
  (`01-consent`, `02-data-rights`, … `08-pending-guideline-finality`).
- La corrida de privacy (`wf_b15bebeb-e80`) estaba en la misma fase en ese momento.

Las otras doce corridas leyeron la lista de su propio cargo —el primer id de `items` en su `journal.jsonl`
coincide con el cargo de `skill`—, y la de technical-program-manager relanzada sola (`wf_453ddfee-60e`)
pasó.

## Síntoma

```
{"stopped":true,"reason":"caso-inexistente","detail":"technical-program-manager no tiene
08-standard-as-evidence. Tiene: 01-consent, 02-data-rights, 03-retention, 04-vendor-transfer,
05-incident, 06-adversarial-docs, 07-unverified-mechanism-claim, 08-pending-guideline-finality"}
```

El mensaje afirma algo falso sobre el cargo —el caso existe en
`agents/roles/system/technical-program-manager/evaluations/cases/`— y no da ninguna pista de que la lista
sea de otro.

## Causa raíz

- `automatization/workflows/agent-eval.js:90-100`: el prompt de `Casos` no prohíbe escribir archivos ni fija
  un destino, y el agente redirigió por su cuenta. La salida pesa unos 6 KB, así que no hacía falta.
- `engine/cli/catalog.js:196`: `evaluate --cases --json` imprime `{cases, forbidden}`, sin el cargo al que
  pertenecen, así que el script no tiene contra qué comprobar lo que el agente le devolvió.
- `automatization/workflows/flow-eval.js:78-87` tiene el mismo prompt para los recorridos.

## Fix propuesto

Dos partes, y la segunda es la que cierra el caso:

1. `evaluate --cases --json` imprime también el sujeto (`agent` o `flow`), y los dos workflows lo piden en
   el schema y lo comparan contra `AGENT`/`FLOW` antes de seguir. Si no coincide, `stop` con un motivo que
   diga de quién era la lista. Es una comprobación del script, no una instrucción: no depende de lo que el
   agente decida hacer con la salida.
2. El prompt dice que la salida se lee de stdout y que no se escribe ningún archivo. Baja la frecuencia,
   pero no reemplaza a la primera.

## Tradeoffs

- Agregar un campo al JSON de `evaluate` cambia una salida que otros pueden leer. Hoy la consumen los dos
  workflows; cualquier otro lector tiene que tolerar el campo nuevo (un campo de más no rompe a nadie que
  lea `cases` y `forbidden`).
- La comprobación no detecta que otra fase haya leído algo ajeno —los bancos van por cargo y caso, en
  `.cauce-eval/<cargo>/<caso>`, así que hoy no comparten ruta—. Vale mirar si alguna otra fase deja
  archivos en el scratchpad.

## Contexto de descubrimiento

Correr los trece casos de cargo que nunca se habían medido, todos en la misma vuelta, para no esperar trece
veces. Lanzar en paralelo es lo natural cuando son independientes, y nada en el workflow ni en `AGENTS.md`
dice que no se pueda.

## Relacionados

- 386: otra corrida en la que el instrumento falló y el veredicto se leía como de un cargo.

## Cierre

**Resuelto en 0.108.0**, que todavía no se publicó. Recorrido contra el caso entero:

- **Fix propuesto, parte 1 —el sujeto en la salida y la comprobación—: se hizo.**
  - `engine/cli/catalog.js` imprime `{subject, cases, forbidden}`.
  - Los dos evaluadores piden `subject` como campo obligatorio del schema y se detienen con `casos-ajenos` si no
    coincide con el sujeto que se pidió, antes de armar un solo banco.
  - La comprobación la hace el script, así que no depende de lo que el agente haga con la salida.
- **Fix propuesto, parte 2 —el prompt—: se hizo.** Pide leer la salida de stdout y no escribir ningún archivo.
- **`flow-eval` con el mismo prompt: se arregló igual.** La prueba nueva corre los dos.
- **Tradeoff del campo nuevo en el JSON:** los únicos lectores del JSON son los dos evaluadores. Un `grep` de
  `--cases` sobre `automatization/`, `engine/` y `template/` encontró además `agent-propose`, que usa la salida
  legible, sin `--json`, y esa salida no cambió.
- **Tradeoff «otras fases que dejen archivos en el scratchpad»: se miró.** Los bancos van por cargo y caso. La fase
  de casos era la única cuyo agente redirigía a un nombre fijo: en el scratchpad de esta sesión había `cases.json`,
  compartido, y archivos con nombre por cargo (`ux.json`, `lc.json`, `tw.json`…), que no chocan. No encontré
  otra fase que escriba ahí.

**Prueba corrida.**

- `test/agents/eval.test.js` suma tres pruebas, las tres en rojo antes del arreglo:
  - `agent-eval` y `flow-eval` con una lista de otro sujeto frenan en `casos-ajenos`, sin pedir bancos;
  - `evaluate --cases --json` trae `subject` para un cargo y para un recorrido.
- Tres mutaciones en una copia del árbol, cada una con una prueba en rojo (5 de 6):
  - sacar la comprobación de `agent-eval`;
  - sacarla de `flow-eval`;
  - sacar `subject` de la CLI.
- Corrida real: el workflow renderizado, cortado después de la comprobación y lanzado dos veces a la vez.
  - `ux-designer` devolvió `subject: ux-designer`, primer caso `01-checkout-flow`, 10 casos.
  - `legal-counsel` devolvió `subject: legal-counsel`, primer caso `01-invented-law`, 8 casos.
  - Los dos agentes corrieron `evaluate … --cases --json` sin redirigir la salida.
  - Ningún archivo nuevo apareció en el scratchpad.
- La misma corrida real sobre `flow-eval`, dos recorridos a la vez:
  - `intake` devolvió `subject: intake`, 4 casos.
  - `change-review` devolvió `subject: change-review`, 8 casos.
  - Los dos leyeron la salida de stdout, y tampoco apareció ningún archivo nuevo.
