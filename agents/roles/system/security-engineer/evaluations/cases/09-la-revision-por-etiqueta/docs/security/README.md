# Seguridad — Especificaciones Tecnicas

> **Area:** docs/security | **Estado:** vigente | **Actualizado:** 2026-10-06

Politicas, estandares y controles de seguridad para el ecosistema: microservicios Go, BFF NestJS,
monolito PHP y frontends Angular.

## Politicas globales

| Politica | Valor |
| -------- | ----- |
| Revision de seguridad | Obligatoria en todo cambio de complejidad `high` o con impacto en seguridad — ejecutada por `security-specialist` en la fase Plan del ciclo de 5 fases |
| OWASP Top 10 | Todos los controles deben implementarse — ver security.md |
| TLS | 1.2+ obligatorio en todos los endpoints expuestos |

## Controles (extracto)

| ID | Categoria | Control | Implementacion | Aplica |
|----|-----------|---------|----------------|--------|
| SEC-001 | A01 Broken Access Control | Autorizacion por actor, objeto y accion en la frontera confiable | Middleware por servicio | Todos |
| SEC-009 | A04 Insecure Design | Security review en cada cambio de complejidad `high` o con impacto en seguridad | security-specialist en la fase Plan | CI |

| Fecha | Cambio | Ticket |
| ----- | ------ | ------ |
| 2026-04-15 | Creacion: indice y politicas globales de seguridad | — |
| 2026-10-06 | SEC-009: la revision pasa de «cada epic» a la fase Plan, en cambios `high` o con impacto en seguridad | DOC-2404 |
