# Product Development Team

## Cómo activarlo

Usar este equipo cuando exista un problema de producto que requiera discovery, diseño, construcción, validación, lanzamiento y aprendizaje coordinados. Empezar con una petición como:

```text
Usa el team product-development para evaluar y desarrollar esta oportunidad:
<problema, usuarios, contexto, restricciones y evidencia disponible>
```

Leer `team.json`, el contexto de `organization/` y el `SKILL.md` del agente activo. Ejecutar una etapa a la vez. Guardar cada artefacto en el sistema de planificación de la empresa o presentarlo al usuario; no crear una fuente de verdad paralela dentro de esta carpeta.

## Protocolo de handoff

Cada handoff debe incluir:

```markdown
Etapa y agente:
Outcome perseguido:
Entradas y evidencia utilizadas, como lista literal de lo consultado:
Artefactos producidos:
Decisiones tomadas, decisor y fecha:
Supuestos, incertidumbre y dissent:
Riesgos, guardrails y bloqueos:
Preguntas para la siguiente etapa:
Exit gate: cumplido / no cumplido
Autorizaciones pendientes:
```

No avanzar si el exit gate no se cumple. El agente siguiente puede devolver el handoff cuando falte evidencia, autoridad, contrato o criterio verificable.

Antes de usarlo, la etapa que recibe cruza lo afirmado contra esa lista: lo que cita algo que no está en ella
sigue viaje marcado, no borrado ni corregido en silencio (R14).

## Selección de ingeniería

La etapa `build` usa Backend Engineer como owner predeterminado del handoff, no como ejecutor universal. Engineering Manager y Software Architect seleccionan los agentes necesarios según la arquitectura:

- Frontend Engineer para interfaces web.
- Mobile Engineer para aplicaciones móviles.
- Backend Engineer para servicios y lógica de servidor.
- Data/ML/MLOps Engineers para datos o modelos en producción.
- DevOps/SRE/Cloud Architect para plataforma, delivery o confiabilidad.

La selección no autoriza asignar personas, ejecutar código ni cambiar producción.

## Consultas condicionales

Incorporar Security Engineer y Privacy Compliance Specialist temprano cuando haya datos sensibles, identidad, pagos, exposición pública, abuso o decisiones de alto impacto. Incorporar UI Designer para sistema visual, Technical Writer para documentación y Customer Support Specialist para readiness de soporte. Data Analyst participa al inicio si falta baseline y siempre en la revisión posterior cuando existan datos autorizados.

## Prueba rápida

```bash
make team-check TEAM=product-development
node engine/cli/ops.js team show product-development
```
