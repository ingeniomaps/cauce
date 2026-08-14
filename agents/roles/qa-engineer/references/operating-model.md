# Modelo operativo de Quality Assurance

## Contrato de estrategia de calidad

```markdown
Cambio y objetivo:
Usuarios y superficies afectadas:
Riesgos priorizados:
Criterios y oráculos:
Niveles y tipos de prueba:
Datos y precondiciones:
Ambientes, versiones y matriz:
Automatización y exploración:
Cualidades no funcionales:
Evidencia y trazabilidad:
Criterios de entrada/salida:
Vacíos y riesgo residual:
```

## Diseño basado en riesgo

Para cada riesgo, describir condición, consecuencia, señales y prueba más económica capaz de detectarlo. Aplicar particiones de equivalencia, valores límite, tablas de decisión, transiciones de estado y combinaciones sólo donde aporten cobertura significativa. Priorizar riesgo sobre número de casos.

## Niveles y alcance

- Estático: requisitos, contratos, tipos, lint y análisis sin ejecutar el producto.
- Unidad/componente: lógica y estados aislados con feedback rápido.
- Contrato/integración: fronteras, esquemas, persistencia y dependencias reales controladas.
- Sistema/UI: recorridos críticos y comportamiento integrado, con uso selectivo por costo y fragilidad.
- Exploratorio: aprendizaje simultáneo, diseño y ejecución con misión, tiempo y notas explícitas.

Mantener más verificaciones en niveles rápidos cuando sean capaces de detectar el mismo riesgo. Un mock demuestra la expectativa del consumidor, no el comportamiento real del proveedor.

## Evidencia y defectos

Un resultado debe incluir versión o commit, entorno, configuración relevante, datos, comando o pasos, hora y salida. Preservar logs, screenshots o trazas sólo si ayudan y no exponen información sensible. Repetir para confirmar reproducibilidad, sin convertir la ausencia posterior en prueba de inexistencia.

Formato mínimo de defecto:

```markdown
Título observable:
Impacto y alcance:
Versión y ambiente:
Precondiciones y datos:
Pasos mínimos:
Esperado:
Actual:
Frecuencia:
Evidencia:
Notas e incertidumbre:
```

## Automatización saludable

- Cada prueba controla su estado o limpia sólo datos propios.
- Esperar condiciones observables, no tiempos arbitrarios.
- Evitar dependencia de orden y servicios externos inestables.
- Tratar un flake como defecto de confiabilidad con dueño y diagnóstico.
- Medir utilidad mediante riesgos detectados, señal y tiempo de feedback, no sólo cantidad.

## Revisión de release

Comunicar hechos, inferencias y desconocidos por separado. La recomendación puede ser liberar, liberar con riesgo aceptado o detener, acompañada de evidencia y recuperación. La decisión final pertenece al responsable definido por la empresa.

## Control de calidad

- ¿Cada riesgo crítico tiene una prueba u otra mitigación observable?
- ¿Los oráculos provienen de contratos o decisiones vigentes?
- ¿Los datos y ambientes son seguros y reproducibles?
- ¿Los casos cubren límites, errores, permisos, concurrencia y recuperación aplicables?
- ¿La automatización detecta comportamiento sin flakes ocultos?
- ¿Accesibilidad, compatibilidad, rendimiento y seguridad recibieron profundidad proporcional?
- ¿Los resultados distinguen ejecutado, no ejecutado, bloqueado y desconocido?
- ¿El riesgo residual y la autoridad de release son explícitos?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [ISTQB Certified Tester Foundation Level](https://www.istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/): principios, proceso, técnicas, pruebas basadas en riesgo y gestión de defectos.
- [ISO/IEC 25010](https://www.iso.org/standard/78176.html): modelo de calidad de producto para definir cualidades más allá de funcionalidad.
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/): estructura y escenarios para pruebas de seguridad web autorizadas.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): criterios verificables de accesibilidad para contenido web.

Verificar documentación oficial de las herramientas, plataformas y versiones reales de cada empresa.
