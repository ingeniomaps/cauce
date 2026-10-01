---
caso: 206
titulo: un hallazgo del Review no dice en qué regla se apoya ni si se verificó
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 206 — Review nombra las reglas una vez por revisión, y cada hallazgo bloquea sin decir de dónde sale

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: es la base de 207 y de cualquier aprendizaje sobre lo que se revisa, y deja hoy dos
huecos sin mecanismo: un hallazgo de criterio no se distingue de uno respaldado por una regla, y un
hallazgo que el revisor no comprobó puede mandar a tocar código, que es lo que R14 prohíbe en prosa.

## Resumen

El esquema de Review pide la lista de reglas contra las que se revisó **una vez**, para toda la
revisión. Cada hallazgo es `detail`, `blocking` y `decision`: no dice en qué regla se apoya, ni si es
criterio del revisor, ni si se comprobó. Con eso:

1. Nadie puede ir de un hallazgo a la regla que lo sostiene, ni deduplicar dos hallazgos iguales.
2. Un criterio puede leerse como norma de la instancia.
3. Un hallazgo bloqueante sin comprobar dispara la vuelta de corrección igual que uno verificado.

## Reproducción

```bash
sed -n 154,164p automatization/workflows/autobuild.js
sed -n 179,182p automatization/workflows/autobuild.js
sed -n 352,353p automatization/workflows/autobuild.js
```

## Síntoma

```
const DECISION = {
  type: 'object', additionalProperties: false, required: ['verdict', 'concerns', 'consulted'],
  properties: {
    verdict: { type: 'string', enum: ['aprobado', 'con-condiciones', 'bloqueado'] },
    concerns: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['detail', 'blocking'],
      properties: { detail: { type: 'string' }, blocking: { type: 'boolean' } },
    } },
    consulted: { type: 'array', items: { type: 'string' } },
  },
}
const REVIEWED = { ...DECISION, required: [...DECISION.required, 'rules'],
  properties: {
    ...DECISION.properties,
    rules: { type: 'array', items: { type: 'string' } },
const blockers = (verdict) => verdict.concerns
  .filter((one) => one.blocking && !one.decision).map((one) => one.detail)
```

`rules` vive al lado de `concerns`, no adentro, y `blockers` filtra sólo por `blocking` y `decision`.

## Causa raíz

- `automatization/workflows/autobuild.js:179-189` — `REVIEWED` agrega `rules` a nivel revisión y extiende
  el hallazgo sólo con `decision`.
- `automatization/workflows/autobuild.js:345-348` — `RULED` pide nombrar las reglas, no atarlas a cada
  hallazgo.
- `automatization/workflows/autobuild.js:352-353` — `blockers` no tiene con qué distinguir un hallazgo
  verificado de uno supuesto.

## Fix propuesto

Decidido con Manuel el 2026-10-01, incluida la parte b.

**a. `ref` por hallazgo.** El hallazgo de `REVIEWED` suma `ref`, obligatorio: la ruta de una regla que
rige con su número (`planning/rules/system/conduct.md#R14`, `planning/rules/pagos.md#P3`) o la palabra
`criterio`. El workflow comprueba que cada `ref` a una regla esté entre las de `governing`; si no, para
con `review-unbacked`, igual que hoy cuando falta la lista. `RULED` pasa a pedir esto y deja de pedir la
lista aparte, o la lista se deriva de los `ref` —a decidir al mejorar el caso—.

**b. `verified` por hallazgo.** Suma `verified: boolean`: si el revisor comprobó lo que afirma —leyó la
función, corrió el comando— o lo supone. **Un hallazgo bloqueante no verificado no manda a corregir**:
baja a anotado y viaja al INBOX como el resto, con la marca de que no se comprobó. Es R14 con mecanismo:
una hipótesis no sostiene una negativa.

Sólo el Review lo lleva; Critique conserva `DECISION` tal cual.

**Decidido al implementarlo**, distinto de lo que decía arriba en un punto: un `ref` que cita una regla
que no rige **no frena la corrida**. El hallazgo pasa a `criterio (citó <ref>, que no rige)` y conserva su
peso. Frenar perdía la corrida entera por una cita mal hecha sobre un hallazgo que podía ser cierto; es
lo que R14 pide para lo que cita algo ausente: sigue viaje marcado, no se borra ni se corrige en
silencio. Y la lista `rules` se queda, no se deriva de los `ref`: dice también contra qué se revisó sin
encontrar nada, que ningún hallazgo puede decir.

## Tradeoffs

- La parte b puede dejar pasar un defecto real que el revisor no se tomó el trabajo de comprobar. La
  apuesta es que la corrida ya tiene con qué comprobar —el diff, el árbol, la suite—, así que lo no
  verificado es casi siempre lo no intentado, y mandar a corregir sobre eso cuesta una vuelta y a veces
  la corrida (`review-failed` sobre trabajo correcto, medido en 2026-09-17). Se mide en el cierre.
- El esquema crece dos campos por hallazgo; el prompt de Review, una frase.
- Instancias con un `autobuild.js` instalado viejo no cambian hasta `upgrade`; no hay datos que migrar.

## Contexto de descubrimiento

Revisión de los repositorios de Dropi del 2026-10-01: su contrato de hallazgo exige `ref` y separa
`guideline` de `criterio` (`dropi-code-review/skills/_shared/finding-contract.md:48`, `:108-117`), y un
hallazgo de confianza media no puede ser bloqueante (`:156`).

## Relacionados

- 207 — usa el `ref` para registrar lo que se corrigió.
- 205 — el mismo Review, del lado de qué superficies mira.

## Cierre

Recorrido contra el caso entero:

- **a, `ref` por hallazgo** → se hizo distinto: la cita a una regla que no rige se conserva marcada como
  criterio en vez de frenar (decisión escrita arriba).
- **b, `verified` por hallazgo** → se hizo: un bloqueante no verificado va al INBOX como `[sin verificar]`.
- **Critique conserva `DECISION`** → se hizo; una prueba fija que un bloqueante de Critique sigue bloqueando
  sin el campo.
- **Lo que faltaba decidir, derivar `rules` de los `ref`** → se decidió que no: `rules` dice también contra
  qué se revisó sin encontrar nada.
- **Tradeoff, un defecto real sin comprobar pasa** → medido en las mediciones C y B del plan: en las dos el
  revisor comprobó los bloqueantes y los marcó `verified: true`; ninguno quedó degradado sin razón.
- **Tradeoff, el esquema y el prompt crecen** → aceptado.
- **Lo que el caso no preveía:** en C y en B el revisor citó `commits.md#R9` para la mezcla de unidades, que
  era criterio. La semántica de una cita no se puede comprobar mecánicamente; queda observado (2 de 2) y no
  se cambió el prompt por eso.

**Probado corriendo.**
- Arnés: `test/workflows/autobuild-refs.test.js`. Mutaciones vistas en rojo: el no verificado bloquea, leer
  `verified` por verdad, no marcar la cita sin base, `cite` sin `ref` y no anotar el no verificado.
- **Corrida real** del 205: los tres hallazgos de Review traían `ref` (`criterio`,
  `planning/rules/system/commits.md#R9`) y `verified`, uno en `false` y sin bloquear.
