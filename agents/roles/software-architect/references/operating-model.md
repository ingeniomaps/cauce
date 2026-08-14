# Modelo operativo de Software Architecture

## Escenario de atributo de calidad

```markdown
Atributo y objetivo:
Fuente del estímulo:
Estímulo:
Ambiente:
Elemento afectado:
Respuesta esperada:
Medida o umbral:
Evidencia actual:
Prioridad y owner:
```

Ejemplos de atributos: modificabilidad, disponibilidad, rendimiento, seguridad, privacidad, testabilidad, operabilidad, portabilidad y costo. Evitar palabras como “rápido”, “escalable” o “seguro” sin escenario y medida.

## Registro de decisión (ADR)

```markdown
Título y estado:
Fecha y owners:
Contexto y fuerzas:
Opciones consideradas:
Decisión:
Consecuencias positivas y negativas:
Supuestos y evidencia:
Plan de adopción y reversión:
Señales de validación:
Fecha o condición de revisión:
Decisiones relacionadas:
```

No borrar decisiones reemplazadas: conservar la razón histórica y enlazar el reemplazo. No registrar decisiones triviales; priorizar las costosas de revertir o con impacto entre equipos.

## Vistas y límites

- Contexto: personas, sistemas externos, propósito y fronteras.
- Contenedores ejecutables o desplegables: responsabilidades, tecnologías y comunicación.
- Componentes sólo donde ayuden a una decisión o onboarding concreto.
- Despliegue y datos cuando topología, residencia, capacidad o recuperación sean relevantes.

Cada flecha debe indicar dirección, protocolo o contrato y propósito. Marcar límites de confianza, ownership y fuentes de verdad. Mantener nombres consistentes con repositorios, runtime y operación.

## Trade-offs

Comparar opciones mediante escenarios, restricciones y costo total: construcción, migración, operación, soporte, aprendizaje, salida y oportunidad. Incluir “no cambiar” como opción. Una prueba de concepto valida una incógnita técnica acotada; no demuestra operabilidad, seguridad o economía a largo plazo.

## Evolución y migración

- Crear seams y compatibilidad antes de mover responsabilidad.
- Migrar recorridos verticales o datos por etapas observables.
- Evitar doble escritura sin reconciliación, idempotencia y ownership explícitos.
- Definir coexistencia, backfill, verificación, corte y retiro.
- Mantener rollback para cambios reversibles y forward-fix para transformaciones irreversibles.
- Retirar componentes y contratos antiguos con métricas de uso y responsables.

## Control de calidad

- ¿La decisión responde a un problema y escenarios medibles?
- ¿El estado actual fue observado y no sólo documentado?
- ¿Se consideró conservar o simplificar lo existente?
- ¿Límites, ownership, datos y contratos son explícitos?
- ¿Fallos, seguridad, privacidad, operación y costo forman parte del diseño?
- ¿Los trade-offs y la incertidumbre están visibles?
- ¿La migración entrega valor incremental y permite verificar o detener?
- ¿Existe condición para revisar o retirar la decisión?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [ISO/IEC/IEEE 42010](https://www.iso.org/standard/74393.html): conceptos para describir arquitecturas mediante stakeholders, concerns, viewpoints y decisiones.
- [C4 model](https://c4model.com/): vistas jerárquicas y notación mínima para comunicar contexto, contenedores, componentes y despliegue.
- [SEI Architecture Tradeoff Analysis Method](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/): análisis de decisiones a partir de atributos de calidad y trade-offs.
- [arc42](https://arc42.org/): estructura pragmática para documentar contexto, restricciones, decisiones, riesgos y operación.

Verificar documentación oficial del stack, datos operativos y decisiones reales de cada empresa.
