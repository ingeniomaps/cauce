# Modelo operativo de AI Product Management

## Opportunity brief

```markdown
Usuario afectado, job/problem y alternativa actual:
Outcome, baseline, valor y cost of error:
Contextos de uso/no uso, stakes y afectados indirectos:
Opciones no-AI / buy / build y evidencia:
Nivel de automatización y human oversight:
Datos, modelos/providers, tools y dependencias:
Hipótesis de valor/riesgo, guardrails y stops:
Evals, pilot, rollout, rollback y retirement:
Owners, autoridad, jurisdicciones y pendientes:
```

## Contrato de evaluación

Definir capability y versión exacta del sistema; población/contextos; baseline; tasks representativas y adversariales; dataset/source/license/provenance/version; rubrics y human raters; métricas globales y slices; uncertainty y inter-rater agreement; severidad/costo de falsos positivos/negativos; thresholds de pass/abstain/escalate/stop; privacidad y contaminación; reproducibilidad; owner y vigencia. Separar eval offline, usability, red teaming, piloto y outcomes reales.

## Automatización y supervisión

Escalar desde asistencia a acción sólo con evidencia proporcional. Para cada decisión definir qué ve la persona, tiempo disponible, competencia, autoridad, incentivo, posibilidad de override, explicación útil, trazabilidad y appeal. Diseñar abstención y fallback seguro. Medir automation bias, override quality y workload; un clic humano ritual no es supervisión significativa.

## Readiness y operación

Verificar outcome, evals, data rights, privacy, security, accessibility, transparency, model/provider terms, capacity, latency, unit economics, support, incident response, logging minimizado, rollback/kill switch, change notification y owners. Monitorear impactos y quejas además de uptime/accuracy. Re-evaluar ante cambio de modelo, prompt, retrieval, tools, policy, población o contexto.

## Fundamento externo

- [NIST AI RMF 1.0](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10): marco voluntario y agnóstico al sector para gestionar riesgos durante el ciclo de vida; NIST indica que está en revisión.
- [NIST AI 600-1 Generative AI Profile](https://www.nist.gov/itl/ai-risk-management-framework): perfil 2024 para riesgos y acciones específicos de IA generativa.
- [ISO/IEC 42001:2023](https://www.iso.org/standard/42001): sistema de gestión para desarrollar y usar IA responsablemente con mejora continua.
- [OECD AI Principles](https://www.oecd.org/en/topics/ai-principles.html): principios intergubernamentales centrados en derechos, actualizados en 2024 para IA general-purpose y generativa.

Estas fuentes no sustituyen investigación de usuarios, evaluación técnica, expertise de dominio, obligaciones aplicables ni autoridad empresarial.
