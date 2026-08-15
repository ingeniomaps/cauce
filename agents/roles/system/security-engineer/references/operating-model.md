# Modelo operativo de Security Engineering

## Contrato de revisión

```markdown
Objetivo y alcance autorizado:
Activos y datos:
Actores e identidades:
Arquitectura y límites de confianza:
Entradas y superficies expuestas:
Dependencias y terceros:
Amenazas y casos de abuso:
Controles existentes:
Evidencia y reproducibilidad:
Explotabilidad y precondiciones:
Impacto y prioridad:
Mitigación y verificación:
Riesgo residual, owner y plazo:
```

## Modelado de amenazas

Empezar por diagramas simples de componentes, flujos y límites. Preguntar qué se protege, de quién, por qué vías y con qué consecuencia. Considerar suplantación, manipulación, repudio, exposición, denegación y elevación como ayudas de exploración, no como checklist obligatorio. Añadir abuso de lógica de negocio, supply chain, insiders y recuperación según contexto.

## Revisión de controles

- Identidad: ciclo de sesión, MFA según riesgo, recuperación, revocación y separación de funciones.
- Autorización: comprobación por objeto, propiedad y acción del lado confiable; denegar por defecto.
- Datos: clasificación, minimización, cifrado, claves, retención, backups y borrado verificable.
- Entradas: validación semántica, límites, parsing seguro, uploads, URLs, callbacks y deserialización.
- Dependencias: procedencia, versión, mantenimiento, exposición, exploit conocido y camino de actualización.
- Operación: mínimo privilegio, secretos, auditoría, detección, respuesta y recuperación.

## Gestión de vulnerabilidades

Validar el hallazgo antes de escalarlo. Registrar activo y versión, fuente, evidencia segura, precondiciones, exposición, impacto, controles compensatorios, explotabilidad conocida y fix disponible. Priorizar vulnerabilidades explotadas o expuestas sobre puntuación aislada. Probar la corrección y las regresiones; documentar aceptación temporal con owner y vencimiento.

## Incidentes de seguridad

Preservar evidencia y cadena de decisiones, limitar acceso y usar canales autorizados. Priorizar contención reversible, erradicación verificada y recuperación segura. No rotar, aislar ni divulgar por iniciativa propia. Coordinar requisitos legales y comunicación con responsables especializados; no emitir conclusiones prematuras.

## Control de calidad

- ¿El alcance y autorización cubren exactamente la actividad propuesta?
- ¿Activos, flujos y límites de confianza son explícitos?
- ¿El hallazgo tiene evidencia reproducible sin datos sensibles?
- ¿Exposición, precondiciones e impacto justifican la prioridad?
- ¿El control está en la frontera correcta y falla de forma segura?
- ¿Secretos, claves y privilegios están minimizados y rotables?
- ¿La mitigación fue verificada y conserva recuperación operativa?
- ¿Riesgo residual, owner, plazo y autoridad de aceptación son visibles?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [NIST Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final): prácticas de preparación, protección, producción y respuesta a vulnerabilidades.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/): requisitos verificables de seguridad para aplicaciones y servicios.
- [MITRE CWE](https://cwe.mitre.org/): taxonomía de debilidades para describir causas y mitigaciones sin confundirlas con vulnerabilidades concretas.
- [CISA Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog): evidencia de explotación conocida para priorización basada en riesgo.

Verificar siempre versiones, avisos oficiales y contexto real de cada empresa.
