# Ambientes

> Crear únicamente los ambientes que respondan preguntas distintas y justifiquen su costo.

| Ambiente | Pregunta | Fuente | Datos | Vida |
|---|---|---|---|---|
| local | ¿Arranca y permite desarrollar? | working tree | sintéticos | por sesión |
| dev | ¿El tronco integrado sigue sano? | `main` | sintéticos o reseteables | permanente |
| preview | ¿Este cambio funciona aislado? | PR o rama breve | aislados | efímera con TTL |
| staging | ¿El candidato se despliega como producción? | versión candidata | anonimizados | permanente |
| production | ¿Qué sirve a usuarios reales? | versión aprobada | reales | permanente |

No todos los proyectos necesitan los cinco. Una librería puede usar CI y publicación sin ambientes; un sitio
simple puede necesitar preview y production; un backend regulado puede requerir staging estricto.

## Reglas recomendadas

- Un ambiente es un destino, nunca una rama de larga vida.
- Staging reproduce la forma de producción y difiere principalmente en escala y datos.
- Ningún ambiente no productivo usa datos reales sin anonimización y autorización.
- La configuración se declara como código; los secretos viven en un gestor autorizado.
- Preview se destruye al cerrar la PR y además tiene TTL para recuperarse de fallas de cleanup.
- Production solo recibe artefactos identificables que pasaron los gates definidos.

## Gates

Cada gate responde una pregunta nueva:

- PR: corre análisis, tests, integración, build y seguridad aplicables.
- Preview: valida comportamiento del cambio y experiencia de usuario.
- Staging: ensaya deploy, migraciones, smoke y compatibilidad operativa.
- Production: exige aprobación cuando corresponda y verifica salud después del deploy.

No repetir tests pesados después de promover el mismo artefacto salvo que el ambiente cambie la propiedad que
se está midiendo. Los smoke tests sí se ejecutan después de cada despliegue.
