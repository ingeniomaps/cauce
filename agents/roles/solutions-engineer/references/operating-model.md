# Modelo operativo de Solutions Engineering

## Discovery técnico

```markdown
Outcome y métrica:
Usuarios y proceso actual:
Sistemas, interfaces y owners:
Volumen, latencia, disponibilidad y regiones:
Datos, clasificación, residencia y retención:
Identidad, roles y trust boundaries:
Operación, soporte y observabilidad:
Restricciones, fecha objetivo y presupuesto:
Requisitos obligatorios / preferencias:
Supuestos, incógnitas y criterio de decisión:
```

## Matriz de solution fit

Por requisito registrar prioridad, caso de uso, capacidad y versión, tipo de fit —nativo, configuración, integración, personalización o gap—, evidencia reproducible, limitaciones, dependencia, riesgo, owner y estado de validación. No usar roadmap como capacidad disponible.

## Arquitectura de solución

Mostrar contexto y límites; componentes y responsabilidades; interfaces y contratos; flujos, clasificación y lifecycle de datos; identidad, autorización y secretos; trust boundaries y amenazas; escalabilidad, disponibilidad y fallos; observabilidad, soporte, recuperación y costos. Registrar decisiones, alternativas y trade-offs.

## Contrato de demo

Definir audiencia, objetivo, narrativa, versión/entorno, datos sintéticos o saneados, prechecks, pasos, claims vinculados a evidencia, límites conocidos, contingencia y material que puede compartirse. Una simulación debe estar rotulada como tal.

## Contrato de POC

```markdown
Hipótesis y decisión que habilita:
Alcance / no alcance:
Criterios de éxito, baseline y medición:
Entorno, versiones y dataset autorizado:
Responsables, accesos y soporte:
Timebox, hitos y stop conditions:
Riesgos, seguridad, privacidad y costos:
Evidencia y reproducibilidad:
Teardown, borrado y handoff:
```

## Control de calidad

- ¿Cada claim tiene versión, fuente, entorno y estado de verificación?
- ¿Los gaps y dependencias son visibles?
- ¿Arquitectura cubre datos, identidad, fallos, operación y costo?
- ¿Demo distingue comportamiento real, mock y simulación?
- ¿POC tiene hipótesis, criterios medibles, baseline y teardown?
- ¿RFP evita certificaciones o garantías no demostradas?
- ¿Promesas y excepciones tienen owner y autoridad?
- ¿Handoff conserva decisiones, evidencia y riesgos abiertos?

## Fundamento externo

- [ISO/IEC/IEEE 42010:2022](https://www.iso.org/standard/74393.html): conceptos y estructura para describir arquitectura desde concerns y viewpoints; verificar aplicabilidad y acceso a la edición vigente.
- [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html): modelo de nueve características para especificar y evaluar calidad de productos ICT.
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20): lenguaje de outcomes para entender y comunicar riesgo de ciberseguridad; no certifica una solución.
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html): contrato agnóstico al lenguaje para describir APIs HTTP; comprobar la versión soportada por producto y tooling.

Estas fuentes orientan el método. Sólo evidencia aprobada y reproducible demuestra las capacidades de una empresa o producto.
