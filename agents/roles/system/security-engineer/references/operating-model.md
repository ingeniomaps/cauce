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
- Automatización: qué procesos automáticos tienen identidad y credenciales propias, qué entradas gobiernan su decisión, quién puede modificar lo que ejecutan y qué alcanzan si obedecen a un tercero.

## Automatización y agentes con credenciales

Un proceso automático con credenciales es un actor del modelo, con identidad, privilegios y
superficie propios. Cuando además decide qué hacer a partir de contenido que no controla —páginas,
issues, documentos, salidas de herramientas—, la entrada es el programa: el compromiso no exige
robar la credencial, alcanza con dirigir al proceso que ya la tiene.

Preguntas del modelado:

- ¿Qué entradas gobiernan la decisión y quién puede escribirlas?
- ¿Qué credenciales viven en el mismo entorno que el paso que lee esa entrada, y qué alcanzan?
- ¿Qué puede hacer el proceso que nadie revisa antes de que ocurra?
- ¿Quién puede cambiar lo que el proceso ejecuta, y está fijado a una referencia verificable?

El orden de mitigación es el del flujo general: eliminar superficie antes que detectar. Que el paso
que lee contenido no confiable no tenga credenciales de escritura y que el paso con privilegio
consuma sólo un resultado acotado; fijar por versión o hash lo que el pipeline ejecuta; acotar la
credencial al recurso y al plazo mínimos; exigir aprobación humana en la frontera donde la acción
sale del entorno (publicar, desplegar, escribir en el repositorio). Separar privilegio no reemplaza
validar la entrada: son capas distintas y la ausencia de una no la cubre la otra.

Una verificación del resultado —revisar el diff, comprobar que sólo se tocaron rutas permitidas— es
detección útil y hay que decir que existe. Pero es post hoc: corre después de que el proceso ya pudo
usar sus credenciales, y verifica el artefacto, no el proceso. No cubre lo que se exfiltró ni los
comandos que se emitieron mientras corría. Presentarla como contención es el error a nombrar.

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
- ¿Los procesos automáticos con credenciales están tratados como actores, con su entrada no confiable identificada?
- ¿El control propuesto actúa antes de la acción o sólo verifica el resultado después?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [NIST Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final): prácticas de preparación, protección, producción y respuesta a vulnerabilidades.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/): requisitos verificables de seguridad para aplicaciones y servicios.
- [MITRE CWE](https://cwe.mitre.org/): taxonomía de debilidades para describir causas y mitigaciones sin confundirlas con vulnerabilidades concretas.
- [CISA Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog): evidencia de explotación conocida para priorización basada en riesgo.
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/): riesgos de sistemas autónomos —uso de herramientas, identidad, ejecución de código y agencia excesiva—. Citado como marco: el documento no fue leído, así que no se atribuye ningún identificador de categoría a un hallazgo.

Verificar siempre versiones, avisos oficiales y contexto real de cada empresa.
