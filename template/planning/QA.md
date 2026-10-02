# QA — cómo se prueba una entrega

La fase 11 de `PROTOCOL.md` pide probar la aceptación por el camino que usa un consumidor real. Esto es
cómo, paso por paso. El método general —riesgos, oráculos, niveles de prueba— vive en el cargo
`qa-engineer`; acá va lo que se olvida en la práctica.

1. **Leer los criterios de la tarea**, uno por uno. El veredicto se da por criterio, no por la tarea entera.
2. **Elegir el ambiente por donde entra el usuario** del criterio: la API pública, la pantalla, el job. Un
   atajo interno —llamar a la función, escribir la fila a mano— no prueba lo que el usuario vive.
3. **Comprobar que el cambio está ahí.** Antes de probar, que el commit de la entrega esté en lo que corre ese
   ambiente (`git merge-base --is-ancestor <commit> <lo-desplegado>`, o la versión que reporta el servicio).
   Probar una versión vieja da un verde que no dice nada.
4. **Saber qué datos se gastan.** Si la prueba crea, cobra, envía o borra, decidir antes con qué datos y en qué
   ambiente, y respetar R12: lo que no está nombrado como sandbox es producción.
5. **Ir por el camino real** y guardar lo que se vio: el comando con su salida, la respuesta, la captura.
6. **Devolver lo que se tocó.** Una configuración, un flag o un dato cambiado para probar se lee antes, se
   cambia y se deja como estaba, y se dice que se hizo.
7. **Separar lo que ya fallaba.** Si algo falla, correrlo sin el cambio: lo que falla igual es preexistente y
   va al INBOX, no a la entrega.
8. **Escribir el veredicto en `qa:`**, criterio por criterio, con la evidencia de cada uno.
9. **Contrastar contra la enumeración** (R15): cada criterio de la tarea tiene su línea, también el que no se
   pudo probar —con qué lo activa y quién lo revisa—.
