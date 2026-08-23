# Modelo operativo de Cloud Architecture

## Contrato de arquitectura

Una línea por dimensión de `## Entrega mínima`, en ese orden y con ese mismo agrupamiento, cada una
cerrada con la evidencia que la sostiene o con qué la activa.

La enumeración vive en el SKILL.md y sólo ahí. Acá hubo una segunda, más corta y agrupada distinto, y lo
que se rompió no fue la lista sino el contraste de R15: quien entrega elige contra cuál mide, y una
dimensión que en la otra estaba —degradación, DNS, capacidad— desaparece dentro de un campo más grueso
sin dejar rastro de que faltaba.

## Landing zone y seguridad

Definir jerarquía y aislamiento por entorno/workload, identidad federada, MFA y acceso temporal; guardrails preventivos/detectivos, break-glass auditado, logs centralizados e inmutables, inventario, tagging, budgets y quotas. Mapear responsabilidad del proveedor, empresa y equipo por servicio. Minimizar exposición pública y egress; diseñar DNS, certificados, claves y secretos con lifecycle y recuperación.

## Resiliencia y capacidad

Derivar arquitectura de impacto y SLO, no de etiquetas “HA”. Modelar fallos de proceso, instancia, zona, región, control plane, identidad, red, dependencia, corrupción y operador. Definir degradación y reconciliación. Medir restore y failover/failback end-to-end. Modelar demanda normal/pico, quotas, autoscaling, cold starts, límites y pruebas de carga; reservar margen con criterio explícito.

## Opciones, costo y salida

Comparar mantener, optimizar, rehost, replatform, refactor, repurchase y retire. Calcular compute/storage/requests/network/egress/licencias/soporte/operación/migración y compromisos, con escenarios y costo unitario. Evaluar APIs propietarias, formatos, identidad, datos, skills y tiempo de salida. Portabilidad selectiva suele ser más útil que abstracción total.

## Migración

Descubrir dependencias y baseline; priorizar waves reversibles; preparar observabilidad, capacidad, datos y runbooks; ensayar sincronización/cutover/rollback; definir freeze y criterios de abort; validar integridad, funcionalidad, SLO, seguridad y costo; retirar origen sólo tras periodo aprobado y evidencia de recuperación.

## Fundamento externo

- [NIST SP 800-145](https://csrc.nist.gov/pubs/sp/800/145/final): características esenciales y modelos de servicio/despliegue de cloud computing.
- [ISO/IEC 27017:2015](https://www.iso.org/standard/43757.html): controles para clientes y proveedores cloud; en agosto de 2026 sigue publicada pero será sustituida por la edición 2, actualmente bajo publicación.
- [ISO/IEC 27017 edición 2](https://www.iso.org/standard/82878.html): estado oficial de la revisión; no tratarla como publicada hasta que ISO lo confirme.
- [FinOps Framework](https://www.finops.org/framework/): modelo operativo abierto para conectar valor, uso, costo y accountability entre ingeniería, finanzas y negocio.

Verificar documentación, precios, SLA, quotas, regiones y estado del servicio para proveedor y fecha concretos antes de recomendarlo.
