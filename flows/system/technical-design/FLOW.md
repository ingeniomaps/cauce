# Technical Design

## Cómo activarlo

Usar este equipo cuando **el cambio ya está decidido** y la pregunta es cómo hacerlo sin romper lo que
existe. Un encuadre, tres disciplinas en paralelo, una auditoría encima de las tres y una decisión
firmada.

```text
Usa el recorrido technical-design para diseñar este cambio:
<qué cambia, en qué sistema, y qué no se puede romper>
```

Si todavía no está decidido que valga la pena, corré antes `feasibility-review`. Si el problema no
está validado con usuarios, corré `product-development`, que trae descubrimiento.

## Cuándo usar este y cuándo los otros

| | `technical-design` | `product-development` | `feasibility-review` |
|---|---|---|---|
| Pregunta | ¿cómo lo hacemos sin romper nada? | ¿qué construimos y cómo? | ¿vale el esfuerzo? |
| Punto de partida | un cambio ya decidido | un problema validado | una intención |
| Disciplinas técnicas | tres en paralelo, más auditoría | una etapa de arquitectura | ninguna |
| Salida | ADR con fricciones nombradas | épica con criterios | hacer, no hacer o investigar |

## La forma del recorrido

```text
                      ┌─ service    (backend-engineer)      ─┐
frame (architect) ────┼─ data       (dba)                   ─┼──→ audit (security) ──→ decide (architect)
                      └─ interface  (frontend-engineer)     ─┘
```

Las tres del medio dependen del mismo encuadre y de nada más entre sí: **corren en paralelo y no se
leen**. Es deliberado. Cuando una disciplina lee a la otra antes de responder, ajusta su hallazgo para
que cierre con el ajeno, y el recorrido pierde justo lo que fue a buscar: tres lecturas independientes
del mismo cambio.

La auditoría va **después y sobre las tres juntas**, no en paralelo. El hallazgo que importa suele
vivir entre disciplinas —un dato que el servicio expone, el cliente cachea y la migración replica— y
ése no se ve mirando una sola entrega.

## Qué hace el facilitador

`technical-program-manager` no tiene etapa: sostiene las dependencias e interfaces entre las tres
disciplinas y el camino crítico del conjunto. No asigna trabajo ni decide el diseño.

## Lo que este equipo no hace

- **No autoriza construir.** Un ADR firmado es una decisión técnica, no la promoción del trabajo.
- **No aprueba seguridad.** `security-engineer` entrega hallazgos y cómo comprobarlos; quién los acepta
  es una decisión de la empresa.
- **No estima.** Si hace falta esfuerzo y capacidad, eso lo da la etapa `plan` de
  `product-development`.
- **No promedia.** Una fricción entre dos disciplinas se entrega nombrada, con su dueño de decisión. La
  redacción que contenta a las dos es la forma más cara de perder un hallazgo.

## Agentes condicionales

Entran por lo que el cambio toca, no por rutina:

| agente | cuándo |
|---|---|
| `mobile-engineer` | el contrato que cambia lo consume una app con versiones viejas en la calle |
| `site-reliability-engineer` | el cambio mueve un SLO, la capacidad o el camino de recuperación |
| `privacy-compliance-specialist` | hay dato personal cambiando de finalidad, retención o territorio |
| `finops-engineer` | el diseño cambia el costo por unidad de valor de forma no obvia |
