# Modelo operativo de Data Analysis

## Contrato de métrica

```markdown
Nombre y propósito:
Decisión que informa:
Unidad de análisis:
Población elegible:
Numerador:
Denominador:
Ventana y zona horaria:
Filtros y exclusiones:
Fuente y owner:
Granularidad y claves:
Latencia y datos tardíos:
Dimensiones permitidas:
Controles de calidad:
Versión y vigencia:
```

Una métrica reutilizable necesita definición estable y versionada. Separar métricas de resultado, diagnóstico y guardrail. No optimizar una proxy sin revisar cómo puede divergir del valor real.

## Revisión de consultas

- Confirmar una fila por unidad esperada en cada etapa.
- Medir cardinalidad y cobertura de claves antes de unir.
- Evitar many-to-many accidental y fanout de medidas.
- Definir comportamiento de `NULL`, cero, estados cancelados y entidades borradas.
- Deduplicar mediante regla de negocio explícita, no con `DISTINCT` indiscriminado.
- Reconciliar conteos, sumas y muestras con una fuente o reporte conocido.
- Registrar versión de consulta/modelo, parámetros y fecha de extracción.

## Calidad de datos

Evaluar completitud, unicidad, validez, consistencia, frescura y exactitud cuando exista referencia. Añadir representatividad y estabilidad de definición para análisis. Una prueba aprobada no garantiza significado correcto; combinar contratos técnicos con conocimiento del proceso que genera el dato.

## Inferencia responsable

- Descriptivo: qué se observó en población, fuente y periodo definidos.
- Asociativo: qué variables se mueven juntas, sin atribuir causa.
- Predictivo: qué desempeño tiene una predicción fuera de muestra y para quién.
- Causal: qué habría ocurrido sin la intervención, sustentado por asignación o supuestos identificables.

Reportar tamaño del efecto e incertidumbre, no sólo un umbral de significancia. Considerar poder, múltiples comparaciones, abandono, contaminación y análisis repetidos. Buscar explicaciones por cambios de tracking, mezcla, estacionalidad y regresión a la media.

## Visualización

Usar líneas para evolución, barras para comparación discreta, puntos para relaciones, histogramas/boxplots para distribución y tablas para valores exactos. Evitar doble eje, 3D y ejes truncados que exageren diferencias. Mostrar definición, fuente, periodo, unidad, muestra y notas sobre discontinuidades.

## Control de calidad

- ¿La pregunta está vinculada a una decisión concreta?
- ¿Población, unidad, numerador y denominador son inequívocos?
- ¿Granularidad, joins, zonas horarias y datos tardíos fueron verificados?
- ¿Calidad y representatividad permiten responder la pregunta?
- ¿Conteos y tasas se reconciliaron con evidencia independiente?
- ¿Segmentos o promedios ocultan composición o distribuciones distintas?
- ¿La inferencia distingue descripción, asociación, predicción y causa?
- ¿El resultado es reproducible, privado y comunica limitaciones?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [NIST/SEMATECH e-Handbook of Statistical Methods](https://www.itl.nist.gov/div898/handbook/): diseño, exploración, medición, modelado e incertidumbre estadística.
- [ASA Ethical Guidelines for Statistical Practice](https://www.amstat.org/your-career/ethical-guidelines-for-statistical-practice): integridad, transparencia, competencia, datos y comunicación responsable.
- [UK Government Analysis Function — Reproducible Analytical Pipelines](https://analysisfunction.civilservice.gov.uk/support/reproducible-analytical-pipelines/): análisis reproducible, automatizado, probado y auditable.
- [Eurostat Quality Assurance Framework](https://ec.europa.eu/eurostat/web/quality/european-quality-standards/european-statistics-code-of-practice): principios de calidad, metodología, precisión, oportunidad, coherencia y accesibilidad.

Verificar siempre documentación oficial del warehouse, BI, lenguaje y versiones reales de cada empresa.
