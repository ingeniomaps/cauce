# Modelo operativo de Implementation Management

## Contrato de inicio

```markdown
Outcomes y métricas:
Contrato/SOW y versiones:
Alcance / no alcance:
Entregables y criterios de aceptación:
Supuestos, restricciones y dependencias:
Stakeholders, RACI y autoridad:
Workstreams, hitos y camino crítico:
Cadencia, canales y escalación:
Control de cambios:
Definición de cierre y handoff:
```

## Registros mínimos

Mantener requirements traceability, RAID —riesgos, supuestos, issues y dependencias—, decisiones, acciones y cambios. Cada entrada incluye ID, descripción, impacto, probabilidad cuando aplique, owner, fecha, evidencia, estado y escalación. No sustituir incertidumbre con un porcentaje arbitrario.

## Migración de datos

Definir source/target, owners, clasificación, propósito, mapping, reglas de transformación, profiling, calidad, duplicados, retención y borrado. Ensayar con dataset autorizado; reconciliar conteos, totales, relaciones, muestras y errores. Establecer freeze, backup, rollback, aceptación y evidencia antes de producción.

## Gates de readiness

- Alcance y cambios aprobados; gaps visibles.
- Configuración e integraciones versionadas y probadas.
- Migración ensayada y reconciliación dentro de tolerancias acordadas.
- Pruebas funcionales, seguridad, rendimiento y UAT con owners y defectos clasificados.
- Roles, accesos, runbooks, monitoreo, soporte y escalación listos.
- Capacitación y comunicaciones aprobadas; usuarios y proceso preparados.
- Cutover, stop/go, rollback y hypercare ensayados.
- Riesgo residual y excepciones aceptados por autoridad competente.

## Contrato de cutover

```markdown
Ventana, alcance y prerequisitos:
Runbook con pasos, owner y duración:
Checkpoints y evidencia:
Stop/go criteria y decision makers:
Freeze, backup y reconciliación:
Rollback trigger, pasos y límite temporal:
Comunicación y escalación:
Validación posterior y hypercare:
```

## Cierre y handoff

Registrar aceptación autorizada, outcomes/baseline, configuración final, arquitectura, inventario de datos, accesos, runbooks, alertas, soporte, SLAs aprobados, defectos/deuda, riesgos residuales, cambios pendientes, owners y fechas de revisión. El cierre administrativo no prueba adopción o valor.

## Fundamento externo

- [ISO 21502:2020](https://www.iso.org/standard/74947.html): guía adaptable de project management para distintos enfoques, tamaños y organizaciones.
- [ISO 10005:2018](https://www.iso.org/standard/70398.html): guía para establecer, revisar, aceptar, aplicar y revisar planes de calidad; no establece requisitos de certificación.
- [ISO/IEC 20000-1:2018](https://www.iso.org/standard/70636.html): requisitos de gestión del servicio que incluyen planificación, diseño, transición, entrega y mejora; verificar la enmienda aplicable.
- [NIST CSF 2.0 Organizational Profiles](https://www.nist.gov/cyberframework/profiles): comparación de outcomes actuales y objetivo para analizar gaps de riesgo; no certifica readiness ni cumplimiento.

Estas fuentes orientan gobernanza y controles. El contrato, políticas, producto, jurisdicción y autoridades reales de cada empresa prevalecen.
