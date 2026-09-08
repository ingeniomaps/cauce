---
caso: 052
titulo: `agent-evaluate` reporta «contrato cambiado» sobre un contrato que no cambió
estado: abierto
prioridad: baja
version-detectada: 0.70.0
---

# 052 — Un falso positivo de «contrato cambiado» que ya recurrió

**🔴 abierto** · detectado en 0.70.0 · prioridad **baja** — **sin reproducción propia**, ver abajo

## Resumen

Dos cargos registraron, en informes distintos y en semanas distintas, que el recorrido de evaluación
anunció que el contrato del cargo había cambiado cuando no había cambiado. `site-reliability-engineer` lo
reportó dos veces —2026-08-31 y 2026-09-07— y `qa-engineer` una, el 2026-08-29.

Los dos coinciden en que no es un asunto del contrato de su profesión sino del mecanismo compartido, y
por eso ninguno lo llevó a su `sources.yaml` ni a su `SKILL.md`. El de SRE lo dice explícito: «es un
asunto del mecanismo compartido de `agent-evaluate`, no de `sources.yaml`/`SKILL.md`», y deja para quien
consolide la propuesta mensual la decisión de si amerita una nota operativa fuera del cargo.

Con tres observaciones en dos cargos deja de ser un evento aislado, y como no le toca a ningún cargo
resolverlo, sale como caso propio antes de que los informes que lo reportan se cierren y se lo lleven
adentro.

## Reproducción

**No la tengo, y eso deja el caso incompleto según el README de esta carpeta.** Escribirla exige una
corrida real de `agent-eval` sobre un cargo, que cuesta agentes y minutos, y lo que hay que capturar es
un falso positivo que aparece de forma intermitente: una corrida que no lo muestre no prueba nada.

Lo que sí está establecido es dónde mirar. El recorrido compara el contrato contra algo para decidir si
cambió, y esa comparación es la que hay que instrumentar antes de volver a correr:

```bash
grep -rn "contrato cambiado\|contract changed" agents/ automatization/ engine/
```

Dejarlo escrito sin reproducción es deliberado: el hallazgo existe en tres informes que se van a cerrar,
y perderlo cuesta más que un caso que declara qué le falta.

## Síntoma

Del informe de `site-reliability-engineer` del 2026-09-07, recomendación 4:

> H5 (falso positivo de «contrato cambiado») recurrió una segunda vez, ahora con dos puntos de datos en
> vez de uno. Sigue sin ser una recomendación de cambio de contrato de este cargo — es un asunto del
> mecanismo compartido de `agent-evaluate`.

Del de `qa-engineer` del 2026-09-07, recomendación 3, sobre la misma clase de nota que dejaron los
informes del 2026-08-29 y 2026-08-31:

> un veredicto que pasa a «no pasa» entre corridas del mismo sujeto contra el mismo contrato es señal de
> variar, no de que el caso mida mal.

## Causa raíz

**No encontrada.** No se buscó en el código: el caso se abre para no perder el hallazgo, no porque esté
diagnosticado.

## Fix propuesto

Ninguno todavía. El primer paso no es un arreglo sino instrumentar la comparación para que, cuando el
falso positivo aparezca, quede registrado contra qué comparó y qué diferencia encontró. Sin eso, cada
observación nueva vuelve a ser una línea de prosa en el informe de un cargo.

## Tradeoffs

- Un caso sin reproducción ni causa raíz es una anotación, no trabajo listo para tomar. Se marca así a
  propósito: el README pide la reproducción y acá se declara que falta, en vez de inventar una.
- Instrumentar cuesta una corrida de evaluación para comprobar que la instrumentación sirve, y esa
  corrida puede no mostrar el falso positivo.

## Contexto de descubrimiento

Leyendo los veinte informes de la tanda del 2026-09-07 para decidir cuáles mergear. Aparece en la sección
«Recomendación» de dos cargos que explícitamente lo mandan afuera de su propio contrato.

## Relacionados

- Ninguno todavía.
