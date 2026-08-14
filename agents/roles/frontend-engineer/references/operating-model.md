# Modelo operativo de Frontend Engineering

## Arquitectura adaptable

Seguir primero las convenciones del repositorio. En ausencia de ellas:

- separar presentación, estado y acceso a datos sólo donde reduzca acoplamiento real;
- mantener estado cerca de quien lo usa y una sola fuente de verdad;
- derivar valores en vez de sincronizar copias mediante efectos;
- aislar fronteras externas con contratos tipados o validados;
- favorecer composición y APIs pequeñas sobre componentes configurables sin límite;
- evitar abstracciones antes de que exista repetición estable.

## Contratos de interfaz

Para cada superficie relevante cubrir:

```markdown
Entrada y precondiciones:
Datos y contrato:
Estado inicial:
Carga y actualización:
Vacío:
Éxito:
Errores y recuperación:
Permisos y sesión:
Accesibilidad:
Responsive y contenido extremo:
Eventos y observabilidad:
Pruebas:
```

## Pruebas proporcionales

- Probar lógica pura con unidades.
- Probar componentes a través del comportamiento y semántica visibles.
- Probar integración en fronteras de router, red, almacenamiento y estado compartido.
- Probar end-to-end sólo los recorridos críticos y riesgos que requieran navegador real.
- Evitar snapshots grandes como única evidencia.
- Reproducir defectos con una prueba que falle antes del arreglo cuando exista superficie estable.

## Seguridad del navegador

- Conservar autoescape del framework y validar cualquier escape deliberado.
- Evitar HTML sin sanitizar, `document.write`, `eval` y ejecución construida desde strings.
- Validar origen y forma de mensajes entre ventanas o workers.
- No confiar en validación cliente como control de autorización.
- No guardar secretos en código distribuido al navegador.
- Aplicar dependencias, CSP y manejo de sesión según la política del proyecto y revisión de seguridad.

## Rendimiento

Definir presupuesto o señal antes de optimizar. Revisar tamaño inicial, trabajo del hilo principal, estabilidad visual, latencia percibida, caché y costo de terceros. Mantener medición de laboratorio separada de datos reales; una mejora local no prueba impacto en usuarios.

## Control de calidad

- ¿La implementación satisface aceptación y todos los estados?
- ¿Usa semántica nativa y funciona con teclado?
- ¿Los datos no confiables permanecen como datos?
- ¿Maneja carreras, cancelación, reintento y respuestas tardías?
- ¿Reutiliza componentes y contratos existentes?
- ¿Las pruebas observan comportamiento en vez de detalles internos?
- ¿Lint, tipos, pruebas y build finalizaron realmente?
- ¿No introduce dependencias, permisos o telemetría fuera de alcance?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [MDN Web Docs](https://developer.mozilla.org/): referencia de tecnologías web y compatibilidad; verificar además versiones reales del proyecto.
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/): preferir semántica nativa y cumplir interacción de teclado cuando se usa ARIA.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): criterios comprobables para accesibilidad web.
- [OWASP DOM XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html): evitar contextos y sinks inseguros para datos no confiables.

Las fuentes generales no sustituyen documentación oficial del framework y versiones fijadas en cada empresa.
