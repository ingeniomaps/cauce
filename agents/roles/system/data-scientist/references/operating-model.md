# Modelo operativo de Data Science

## Contrato de análisis

```markdown
Decisión, owner y opciones:
Pregunta: descriptiva / diagnóstica / predictiva / causal / prescriptiva:
Población, unidad, periodo y segmentos:
Treatment/exposure, outcome y estimand:
Hipótesis, supuestos y falsificadores:
Fuentes, grain, lineage, calidad y privacidad:
Método, baseline y alternatives:
MDE/practical significance, uncertainty y guardrails:
Limitaciones, generalización y autoridad:
```

## Pre-analysis plan de experimento

Definir eligibility, unidad de randomización/análisis, assignment y exposición; variantes, allocation y stratification; primary metric, guardrails y métricas diagnósticas; baseline/MDE, alpha/power o criterio bayesiano declarado; sample size, duración y ramp; SRM, spillovers, novelty, carryover y logging; múltiples métricas/looks, stopping rules; exclusiones previas, análisis ITT/per-protocol cuando proceda; riesgos, consentimiento, rollback y autoridad. Congelar antes de observar outcomes confirmatorios.

## Análisis causal observacional

Definir intervención hipotética, estimand y timing. Dibujar DAG con conocimiento de dominio; justificar exchangeability/no unmeasured confounding, positivity, consistency y interference. Evitar conditioning en colliders o post-treatment variables. Evaluar overlap, balance, pre-trends/placebos/negative controls cuando correspondan y sensibilidad a confounding/misclassification. Presentar como asociación si identificación no es defendible.

## Reporte de resultados

Mostrar población analizada vs objetivo, attrition/missingness/exclusions, data quality, estimador/modelo y diagnostics. Reportar efecto absoluto y relativo, intervalos/uncertainty, sample sizes, heterogeneity preespecificada y guardrails. Separar confirmatorio/exploratorio; incluir null/negative/adverse results, assumptions, multiplicity, practical significance, threats y decisiones posibles. Conservar outputs completos y código reproducible.

## Forecast/predicción exploratoria

Usar splits temporales y por entidad, baseline ingenuo, backtesting rolling, loss vinculada a decisión, calibration e interval coverage. Comparar slices, stability y error decomposition. Evitar leakage, targets post-outcome y extrapolación fuera de support. Handoff a Machine Learning Engineer si se propone producción.

## Fundamento externo

- [ASA Ethical Guidelines for Statistical Practice](https://www.amstat.org/your-career/ethical-guidelines-for-statistical-practice): guía aprobada en 2022 sobre integridad, responsabilidad, métodos, datos y comunicación estadística.
- [NIST/SEMATECH e-Handbook of Statistical Methods](https://www.itl.nist.gov/div898/handbook/): referencia de métodos, diseño, exploración y modelado; verificar assumptions y literatura más reciente del dominio.
- [ISO 3534-1:2006](https://committee.iso.org/standard/40145.html): vocabulario y símbolos estadísticos; está publicada pero marcada para revisión/reemplazo.
- [ISO/IEC 25012:2008](https://webstore.iec.ch/en/publication/11246): modelo de calidad de datos confirmado vigente el 2025-01-03 para requisitos y evaluación.
- [ISO/IEC 5259-1:2024](https://committee.iso.org/standard/81088.html): calidad de datos específica para el ciclo de vida de datos usados en analítica y ML — complementa, no reemplaza, a ISO/IEC 25012 (que es general) en el paso 2 (auditoría de datos antes de modelar) y el paso 6 (forecast/predicción) del flujo científico de `SKILL.md`.
- [ASA Statement on the Role of Statistics in Data Science and Artificial Intelligence](https://www.amstat.org/docs/default-source/amstat-documents/the-role-of-statistics-in-data-science-and-artificial-intelligence.pdf) (2023-08-04): reafirma diseño, cuantificación de incertidumbre y distinción causa/correlación como rol central del estadístico en pipelines de ML de punta a punta, no sólo en el modelado.
- [ASA Statement on Ethical AI — Principles for Statistical Practitioners](https://www.amstat.org/docs/default-source/amstat-documents/asa-statement-on-ethical-ai-principles-for-statistical-practitioners.pdf) (2024-10-08): extiende las guías éticas de 2022 al uso de IA con tres principios —accountability, transparency, fairness— y tres prácticas cuando el propio análisis usa un modelo de IA como insumo o herramienta: no depender de él ciegamente, declarar qué operaciones estadísticas puede y no puede hacer, y divulgar sesgos conocidos de sus datos de entrenamiento junto con su grado de validación/madurez.

Estas fuentes orientan práctica y vocabulario; el contexto, datos, ética, jurisdicción y expertise de dominio determinan el diseño apropiado.
