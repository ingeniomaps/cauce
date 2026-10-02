# Modelo operativo de Growth Marketing

## Contrato de embudo

Antes de proponer inversión, cada etapa queda definida con la misma precisión que una métrica:

- **Población**: quién entra y quién queda excluido, con la regla explícita.
- **Etapas**: impresión, clic, visita, registro, activación y retención temprana, cada una con su
  evento de origen y su ventana.
- **Denominador**: contra qué se divide cada tasa. La mayoría de las discusiones de conversión son
  desacuerdos sobre el denominador.
- **Ventana de atribución**: declarada y constante entre comparaciones. Cambiarla a mitad de un análisis
  invalida la serie.

Una tasa sin población, ventana y denominador no es una métrica: es una opinión con decimales.

## Economía unitaria

Toda propuesta de inversión reporta, con supuestos visibles:

- costo por resultado en la etapa que se está comprando;
- costo de adquisición hasta el usuario activado, no hasta el registro;
- margen de contribución y período de recuperación;
- qué pasa si la conversión cae un tercio: si el caso sólo cierra en el escenario optimista, no cierra.

El valor de vida se estima con cohortes observadas, no proyectando indefinidamente la retención del
mejor mes.

## Diseño de experimentos

Antes de lanzar se escriben: hipótesis falsable, unidad de asignación, métrica primaria, métricas
guardia, tamaño mínimo, duración y regla de decisión. Después de lanzar no se cambian.

- Una sola métrica primaria. Varias métricas primarias es no tener ninguna.
- Las métricas guardia protegen lo que el experimento podría romper: calidad del registro, carga de
  soporte, tasa de reembolso, retención.
- Mirar resultados antes de tiempo y cortar al ver un número favorable produce ganadores falsos.
- Un resultado sin efecto también es un resultado: se registra, con el tamaño que se podría haber
  detectado.

## Atribución

Ningún modelo de atribución es verdad. Se elige uno, se declara, y se lo trata como una lente:

- Las cifras que reporta una plataforma publicitaria son de parte interesada y suelen sobreatribuir.
- Se reconcilian contra datos propios; cuando la diferencia es grande, se reporta la diferencia en vez
  de elegir el número conveniente.
- Para decisiones grandes, contrastar con una prueba de incrementalidad —geo, holdout— antes que
  discutir modelos.
- **Verificado (2026-09-24):** hoy no hay una API de atribución de plataforma con preservación de
  privacidad en producción. Google retiró Attribution Reporting API, Topics API y Protected Audience
  API en octubre de 2025 citando baja adopción
  (https://privacysandbox.google.com/blog/update-on-plans-for-privacy-sandbox-technologies, 17 oct.
  2025), y en abril de 2025 confirmó que Chrome no va a forzar la desaparición de las cookies de
  terceros ni a imponerles un aviso independiente
  (https://privacysandbox.google.com/blog/privacy-sandbox-next-steps, 22 abr. 2025), sin fecha de
  retiro. Un modelo de atribución que asuma la desaparición inminente de las cookies de terceros, o la
  existencia de un reemplazo de Google con preservación de privacidad ya en producción, parte de un
  supuesto sin base actual. Esto no cambia lo de arriba: reconciliar contra datos propios y priorizar la
  prueba de incrementalidad sigue siendo el camino, con o sin cookies de terceros.

## Contenido y promesa

Lo que se afirma en un anuncio o una landing es un compromiso del producto:

- La promesa la valida quien es dueño del producto; el mensaje no crea capacidades.
- Afirmaciones sobre resultados, seguridad, cumplimiento o comparaciones con competidores pasan por
  legal antes de publicarse.
- Un embudo que convierte porque promete de más traslada el costo a soporte y a la retención.

## Privacidad

- Minimizar datos personales: recolectar lo necesario para la decisión, no lo que sea posible.
- Verificar base legal antes de construir audiencias, sincronizar listas o activar remarketing.
- Coordinar con el especialista de privacidad cualquier transferencia a una plataforma externa.

## Control de calidad

Antes de entregar, verificar que la propuesta declara baseline, denominadores, ventana, regla de
decisión, supuestos e incertidumbre; que el gasto tiene autorización registrada; que las métricas
guardia existen; y que un resultado negativo también deja un aprendizaje utilizable.

## Fundamento externo

Los métodos de experimentación y medición se apoyan en fuentes primarias de estadística y en la
documentación oficial de cada plataforma, con su versión y fecha. Un caso de éxito publicado por un
proveedor es material comercial, no evidencia.
