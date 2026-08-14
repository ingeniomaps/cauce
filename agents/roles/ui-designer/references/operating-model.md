# Modelo operativo de UI Design

## Orden de trabajo

1. Confirmar flujo, contenido y estados con UX.
2. Auditar design system, componentes y marca existentes.
3. Definir jerarquía visual en escala de grises cuando ayude a separar estructura de decoración.
4. Aplicar tokens semánticos y componentes reutilizables.
5. Diseñar estados, adaptación, temas y accesibilidad.
6. Revisar consistencia y casos extremos.
7. Preparar handoff verificable y acompañar implementación.

## Especificar un componente

```markdown
# Componente — <nombre>

## Propósito y cuándo usarlo
## Cuándo no usarlo
## Anatomía
## Variantes y tamaños
## Estados e interacción
## Contenido y localización
## Tokens
## Responsive behavior
## Accesibilidad
## Ejemplos y casos extremos
## Criterios de aceptación
```

Nombrar tokens por función (`color-text-danger`) y no por valor (`red-500`) en la capa semántica. Mantener una fuente de verdad y evitar valores sueltos sin justificación.

## Jerarquía y legibilidad

- Limitar niveles visuales a los necesarios para la tarea.
- Mantener escalas tipográficas y espaciales consistentes.
- Diseñar para texto ampliado y traducciones sin truncar información esencial.
- Usar color como refuerzo, nunca como único portador de significado.
- Reservar énfasis fuerte para decisiones y acciones realmente prioritarias.
- Mantener foco visible y estados diferenciables en todos los temas.

## Handoff

Entregar nombres reales de componentes y tokens, medidas relevantes, reglas de adaptación, assets con licencia, contenido, estados y criterios observables. Señalar qué es requisito, qué es recomendación y qué sigue abierto. No exigir coincidencia arbitraria de píxeles cuando el sistema o contenido deben adaptarse.

## Control de calidad

- ¿Se reutilizó el sistema existente antes de extenderlo?
- ¿Jerarquía, acción principal y estado se entienden sin explicación?
- ¿Cada componente tiene todos sus estados?
- ¿Color, tipografía, espacio e iconos usan tokens coherentes?
- ¿La interfaz soporta teclado, foco, zoom, contraste y texto ampliado?
- ¿Funciona con contenido realista, localizado y extremo?
- ¿El handoff permite implementación sin adivinar decisiones críticas?
- ¿Las diferencias respecto a UX o marca están documentadas y aprobadas?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): criterios comprobables de contraste, foco, adaptación, entrada y tamaños de objetivo.
- [Apple Human Interface Guidelines: accesibilidad](https://developer.apple.com/design/human-interface-guidelines/accessibility/): soportar texto ampliado, contraste, VoiceOver y significado más allá del color.
- [Apple Human Interface Guidelines: color](https://developer.apple.com/design/Human-Interface-Guidelines/color): usar color consistente y adaptable a apariencia y contraste.
- [GOV.UK Design System](https://design-system.service.gov.uk/get-started/): estilos, componentes y patrones documentados con implementación y accesibilidad.

Adaptar las decisiones al producto, plataforma, marca y usuarios reales; estas referencias no sustituyen pruebas ni requisitos locales.
