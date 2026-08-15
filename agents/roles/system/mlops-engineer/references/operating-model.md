# Modelo operativo de MLOps

## Contrato de release

```markdown
Use case, decisión, usuarios, owners y autoridad:
Model/data/feature/code/config/environment versions:
Artefacto, firma, provenance, SBOM y registry stage:
Firma de entrada/salida y compatibilidad:
Evaluaciones, slices, baselines, thresholds y riesgos:
Serving mode, SLO, capacidad, costo y dependencias:
Rollout, cohortes, fallback, abort y rollback:
Monitoreo, feedback, outcomes y vigencia:
Retención, auditoría, retiro y aprobaciones:
```

## Reproducibilidad y lineage

Asignar IDs inmutables a dataset/snapshot, feature definitions, labels, código, configuración, dependencias, entorno, parámetros, seeds, modelo y evaluaciones. Registrar quién/qué/cuándo produjo y aprobó cada artefacto sin guardar secretos ni datos innecesarios. Distinguir repetibilidad técnica de equivalencia estadística cuando hardware u operaciones sean no deterministas.

## Gates y despliegue

Validar schema, calidad, leakage, paridad, desempeño global/slices, calibración, robustez, seguridad, privacidad, latency, capacity y costo según el riesgo. Comparar con baseline/champion y criterios predefinidos. Separar registro de aprobación. Probar integración, fallback y rollback; promover progresivamente con límites y criterios de abort. Para modelos generativos incluir prompts/system config, herramientas/permisos, retrieval corpus/index, filtros y evaluación de comportamiento.

## Monitoreo, reentrenamiento y retiro

Vigilar infraestructura, datos, modelo y outcomes por separado. Medir distribuciones con volumen/contexto y slices relevantes; considerar feedback delay y ground truth quality. Una alerta inicia investigación, no diagnóstico automático. Reentrenar crea candidato nuevo con lineage y gates completos. Retirar cuando expire propósito, soporte, datos, riesgo o valor; revocar endpoints/credenciales, conservar evidencia requerida y verificar consumidores.

## Incidente de modelo

Confirmar alcance, versión, tráfico, usuarios, datos y síntomas. Contener de forma reversible: pausar promoción, reducir tráfico, usar fallback o deshabilitar función según autoridad. Preservar artefactos, lineage, logs redactados y timeline. Evaluar integridad, privacidad, seguridad y daño, no sólo uptime. Verificar recuperación end-to-end y convertir hallazgos en controles/evaluaciones.

## Fundamento externo

- [NIST AI RMF 1.0](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10): marco transversal y voluntario para riesgos de AI; NIST indica que está en revisión.
- [NIST SP 800-218A](https://csrc.nist.gov/pubs/sp/800/218/a/final): prácticas de desarrollo seguro específicas para modelos generativos y foundation models, complementarias al SSDF.
- [ISO/IEC 42001:2023](https://www.iso.org/standard/42001): sistema de gestión para desarrollo y uso responsable de AI, con mejora continua.
- [ISO/IEC 23894:2023](https://www.iso.org/standard/77304.html): guía para integrar gestión de riesgos de AI en actividades y funciones organizacionales.

Verificar versión y estado antes de proponer cambios. Estas fuentes no reemplazan evaluaciones del dominio, documentación de plataforma, obligaciones ni autoridad empresarial.
