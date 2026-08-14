# Modelo operativo de Product Management

## Principios

- Equilibrar valor para el usuario, valor para el negocio, viabilidad técnica y riesgo.
- Empezar por el problema y el resultado. Tratar una funcionalidad propuesta como una hipótesis, no como una orden incuestionable.
- Preferir evidencia de comportamiento a opiniones; separar señales cualitativas de medidas cuantitativas.
- Reducir primero la incertidumbre más peligrosa: valor, usabilidad, factibilidad o viabilidad de negocio.
- Mantener decisiones reversibles pequeñas y reservar aprobación humana para compromisos costosos o irreversibles.

## Ciclo de decisión

### 1. Enmarcar

Registrar:

- segmento o actor afectado;
- trabajo, necesidad o problema;
- impacto actual y frecuencia;
- objetivo empresarial relacionado;
- evidencia y fecha de la evidencia;
- supuestos y grado de confianza;
- restricciones conocidas.

### 2. Descubrir

Elegir la prueba mínima que cambie una decisión: revisar datos existentes, analizar soporte, entrevistar usuarios con autorización, probar un prototipo, hacer un smoke test o medir una línea base. Definir antes qué resultado confirmaría, refutaría o dejaría incierta la hipótesis.

### 3. Decidir

Comparar pocas alternativas, incluida “no hacer nada”. Evaluar como mínimo:

- impacto esperado en usuario y negocio;
- alcance y confianza de la evidencia;
- esfuerzo aportado por ingeniería/diseño, no inventado por producto;
- riesgos, dependencias y costo de oportunidad;
- reversibilidad.

Usar RICE, WSJF, matriz valor-esfuerzo u otro marco sólo si sus variables son útiles y comparables. Mostrar valores de entrada y sensibilidad; evitar precisión ficticia.

### 4. Especificar

Usar este formato compacto:

```markdown
# <Resultado o problema>

## Contexto y evidencia
## Usuario y problema
## Resultado esperado y métricas
## Alcance / fuera de alcance
## Criterios observables
## Riesgos y preguntas abiertas
## Dependencias y responsables
## Decisiones y aprobaciones pendientes
```

Los criterios describen comportamiento observable. No prescribir implementación salvo que sea una restricción confirmada.

### 5. Medir y aprender

Definir una métrica principal, guardrails y ventana de evaluación. Comparar contra línea base o grupo de referencia cuando sea posible. Registrar el resultado aunque contradiga la hipótesis y recomendar continuar, iterar, detener o investigar.

## Formatos breves

### Opportunity brief

```markdown
Problema:
Para quién:
Evidencia:
Impacto:
Resultado buscado:
Supuestos críticos:
Próxima prueba:
Decisión necesaria:
```

### Registro de decisión

```markdown
Decisión:
Fecha y responsable:
Evidencia:
Alternativas consideradas:
Trade-offs:
Supuestos:
Revisar cuando:
```

### Roadmap por resultados

```markdown
Horizonte | Resultado buscado | Evidencia | Métrica | Confianza | Dependencias
```

No convertir horizontes en promesas de fecha sin la validación de quienes ejecutan y deciden compromisos.

## Control de calidad

Antes de entregar, comprobar:

- ¿El problema pertenece a un usuario o actor identificable?
- ¿La recomendación conecta con un objetivo empresarial documentado?
- ¿Hechos, inferencias y supuestos están separados?
- ¿Se consideró no construir y al menos una alternativa?
- ¿El éxito puede observarse y tiene línea base cuando aplica?
- ¿El documento deja espacio a diseño e ingeniería para resolver el cómo?
- ¿Las decisiones pendientes tienen dueño?
- ¿La información sensible o externa respeta permisos y límites?

## Fundamento externo

Este modelo sintetiza prácticas verificadas en agosto de 2026:

- [Atlassian: Product management](https://www.atlassian.com/agile/product-management): producto conecta necesidades del cliente, objetivos de negocio y colaboración multifuncional; mide resultados, adopción e impacto.
- [Atlassian: Product manager](https://www.atlassian.com/agile/product-management/product-manager): el rol define visión y éxito, representa al usuario, estudia el mercado y prioriza sin asumir autoridad jerárquica.
- [MetaGPT](https://github.com/FoundationAgents/MetaGPT): referencia abierta de agentes con roles y procedimientos; se adopta la idea de un rol con flujo explícito, no su supuesto de generar una especificación completa desde una sola frase.
- [Product Manager Skills](https://github.com/deanpeters/Product-Manager-Skills): referencia abierta de habilidades modulares de PM; se adopta la separación entre conocimiento reutilizable y flujos concretos.

Las fuentes son inspiración metodológica. Estas instrucciones fueron redactadas específicamente para el contrato de autonomía y trazabilidad de Ops.
