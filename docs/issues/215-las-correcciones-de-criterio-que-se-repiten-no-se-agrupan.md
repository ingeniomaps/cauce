---
caso: 215
titulo: las correcciones de criterio que se repiten no se agrupan
estado: descartado
prioridad: baja
version-detectada: 0.99.2
---

# 215 — `ops lessons` agrupa por regla y deja sueltas las correcciones de criterio

**⚪ descartado** · detectado en 0.99.2 · prioridad **baja** — se midió con datos reales y no se construye:
el agrupamiento redescubriría reglas que ya existen.

**Prioridad baja**: hoy no hay con qué medirlo. Sube a media cuando una instancia real tenga al menos un mes
de entradas de `done/` con `corregido:`, que es lo que permite ver si el agrupamiento acierta.

## Resumen

Una corrección de criterio —un hallazgo que no cita ninguna regla— que se repite en varias tareas es la
señal más valiosa de las dos: dice que falta una regla. `ops lessons` las lista pero no las agrupa, porque
dos frases distintas que hablan del mismo defecto sólo se juntan con juicio, y un agrupamiento sin medir
llenaría el INBOX de lecciones falsas o callaría las verdaderas.

## Reproducción

```bash
node tools/ops.js lessons planning
```

sobre una instancia con dos tareas que corrigieron «falta el índice en alta» y «falta el índice en baja».

## Síntoma

```
2 corrección(es) de criterio, sin regla: ver si alguna se repite
  alta: falta el índice en alta
  baja: falta el índice en baja
```

No se propone ninguna lección por ellas.

## Causa raíz

`engine/planning/lessons.js`, `candidates`: el criterio va a `criteria` y nunca a `proposals`. Es una decisión
del caso 214, no un descuido.

## Fix propuesto

Un paso con juicio —en el cierre de `autobuild` o en un recorrido— que reciba la lista y proponga una regla
nueva sólo cuando el mismo defecto aparece en dos tareas o más, con el registro de `LESSONS.md` para no
insistir. Antes de escribirlo: medir con datos reales cuántas correcciones de criterio hay y cuántas se
repiten de verdad.

## Tradeoffs

- Una llamada con juicio en cada corrida que tenga criterios, o un recorrido aparte.

## Contexto de descubrimiento

Partición del caso 214, el 2026-10-01: lo determinista entró; lo que pide juicio espera datos.

## Relacionados

- 214 — el lector por regla.

## Cierre

Descartado el 2026-10-01 por decisión de Manuel, sobre la medición que el propio caso pedía antes de construir.
Se dejan escritos la hipótesis y lo que la habría desmentido: se esperaba que las correcciones de criterio se
repitieran, y menos de 3 grupos en todas las tareas habría bastado para no construir.

**La medición.** Un agente recorrió en sólo lectura los `done/` de tres instancias reales: acme-ops (201
entradas), initech (108) y hooli (89). Leyó entero cada `review:` y, en los demás campos, el contexto de
cada mención de una revisión. No contó lo que frenó una puerta automática ni lo que fue al INBOX sin
corregirse. Contrasté a mano cinco de sus citas contra los archivos, y las cinco están:

- `findById(undefined)` en `alta-resuelve-precio-por-pais.md`;
- «UPDATE de otra marca» en `sin-segundo-trial-tras-la-baja.md`;
- «tautología» en `integraciones-url-resolver-unico.md`;
- «diez parámetros» en `credencial-en-el-fan-out-del-home-a-payments.md`;
- «se adjudicaba un cierre» en `catalog-item-api-handlers.md`.

**Lo que devolvió.** Hay 70 correcciones de criterio, sin contar las de un revisor de hooli anterior a Cauce.
22 forman 9 grupos que se repiten en dos tareas o más, y 48 quedan sueltas. El umbral se cruzó, pero los grupos
no son lo que el fix suponía:

- **6 de los 9 grupos tienen una regla escrita que los cubre**, y el revisor no la citó. Son R9 (una prueba que
  no puede ponerse roja, en dos instancias, y una mutación sin declarar), R15 (una aserción enumerada que no
  llegó), R14/R15 (afirmar una cobertura que no se tiene) y R24 (un plan o un artefacto que afirma algo falso
  del proyecto). Proponer una regla por repetición habría llenado el INBOX de reglas que ya existen.
- **3 grupos, con 7 correcciones, no caen en ninguna regla de Cauce.** Dos son de acme: el acceso a datos de
  otra marca por id sin comprobar que le pertenece (3 tareas) y un webhook no idempotente ante un evento
  terminal repetido (2). Son reglas de negocio de esa empresa, y su lugar es su `business-rules/`, no una
  regla del sistema. El tercero es de initech: un riesgo que se atribuía un cierre ajeno. Sale de dos tareas
  seguidas del mismo hito, así que probablemente sea una sesión repitiéndose.
- **Los datos son anteriores al caso 206.** Desde 0.100.0 el Review nombra la regla de cada hallazgo o lo
  declara criterio. Lo que acá figura como criterio por falta de cita va a entrar por la vía de las reglas, que
  `ops lessons` ya agrupa sola.

**Recorrido de lo que el caso enumeraba:**

- **Medir cuántas correcciones de criterio hay y cuántas se repiten** — se hizo; es lo de arriba.
- **El paso con juicio que propone una regla con dos tareas o más** — se decidió que no, por lo que devolvió la
  medición: casi siempre redescubre una regla existente, y la causa principal ya la ataca el 206.
- **El registro de `LESSONS.md` para no insistir** — no aplica sin el paso.
- **Tradeoff: una llamada con juicio por corrida, o un recorrido aparte** — no aplica: no se agrega ninguna de
  las dos.

**Condición para reabrirlo.** Cuando una instancia tenga un mes de entradas `corregido:` con el formato de
0.100.0, se repite la medición con el mismo procedimiento. Si aparecen grupos de criterio que no caen en
ninguna regla escrita, del sistema o de la empresa, ahí el paso tiene con qué acertar. Si el caso se reabre,
el paso tendría que cruzar cada grupo contra las reglas existentes antes de proponer una nueva: la medición
mostró que sin ese cruce falla.

**Límites de la medición.**

- Clasifica por la prosa: «criterio» quiere decir que no cita una regla, no que la regla no exista.
- Varias revisiones dicen «con condiciones» sin decir qué se corrigió, y no se contaron.
- Las revisiones humanas de los PR no quedan en `done/`.
- Los dos grupos de acme no se llevaron a su INBOX: quedan citados acá, y llevarlos lo decide Manuel.
