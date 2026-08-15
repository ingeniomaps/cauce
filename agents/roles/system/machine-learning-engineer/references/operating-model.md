# Modelo operativo de Machine Learning Engineering

## Contrato de sistema ML

```markdown
Outcome, decisión y baseline sin ML:
Usuarios, sujetos y otras personas afectadas:
Input, output, acción, autonomía y fallback:
Costo de FP/FN/abstención y harms:
Intended use / prohibited use:
Datos, derechos, provenance y retención:
Métricas, slices, thresholds e incertidumbre:
Human oversight, appeals y autoridad:
Release, monitoreo, rollback y kill switch:
```

## Experimento reproducible

Registrar hipótesis, dataset/snapshot, feature/label definitions, splits y leakage checks; código/commit, configuración, seed, entorno, dependencias, hardware y costo; baseline, métricas y slices; artifact hashes, resultados completos, errores, limitaciones y decisión. Aislar test final y registrar cada acceso.

## Evaluación

Vincular métricas a decisiones y daños: discriminación/ranking/calibración según tarea, intervalos y sample size, slices relevantes, temporal/geographic shift, missingness, OOD, perturbaciones, adversarial abuse y downstream effects. Para GenAI usar conjuntos versionados y revisión humana calibrada; evaluar grounding, factualidad, citations, abstención, consistency, privacy leakage, harmful content, prompt injection y tool authorization.

## Release y monitoreo

Verificar registry, provenance/firma, lineage, licencia, security scan, compatibilidad de features, latencia/costo/capacidad y approvals. Ejecutar staging→shadow→canary con comparación y stop criteria. Monitorear datos, features, output distributions, performance cuando llegue ground truth, calibration, slices, incidents, overrides, latency, availability y cost. Diferenciar drift estadístico de degradación demostrada.

## Incidente

Contener herramientas/tráfico o volver al fallback mediante owner autorizado; preservar inputs/outputs, versión, prompt/config, retrieval, tool traces y timestamps con privacidad. Evaluar alcance y personas afectadas; comunicar incertidumbre; corregir causa; re-ejecutar evaluación/regresión; aprobar reapertura y documentar aprendizaje.

## Fundamento externo

- [NIST AI RMF 1.0](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10): marco voluntario y agnóstico al caso para Map, Measure, Manage y Govern; NIST indica que está en revisión.
- [NIST AI 600-1 — Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence): riesgos y acciones adicionales para IA generativa dentro del AI RMF.
- [ISO/IEC 23894:2023](https://www.iso.org/standard/77304.html): guía adaptable para integrar gestión de riesgos de IA en desarrollo, producción, despliegue y uso.
- [ISO/IEC 42001:2023](https://www.iso.org/standard/81230.html): requisitos de un sistema de gestión de IA y mejora continua; no demuestra que un modelo concreto sea seguro o conforme.
- [ISO/IEC 42005:2025](https://www.iso.org/standard/44545.html): guía para evaluar y documentar impactos de sistemas de IA sobre personas, grupos y sociedad durante todo el lifecycle.

Las fuentes orientan gobernanza. La evidencia del caso de uso, políticas, derechos, jurisdicción y autoridades reales determinan si un sistema puede operar.
