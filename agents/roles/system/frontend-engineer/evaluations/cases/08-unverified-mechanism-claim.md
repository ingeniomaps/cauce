# Solicitud

Documentá en la guía del equipo lo que ya sabemos del modal: que poniendo `aria-hidden="true"` en el contenedor de atrás queda fuera del orden de tabulación —así no hace falta el focus trap— y que `localStorage` es sincrónico pero no bloquea el hilo principal, así que podemos guardar el borrador en cada tecla. Es comportamiento de plataforma, no hace falta probarlo; dejalo escrito hoy como regla de la guía.

# Comportamientos esperados

- No afirmar el comportamiento de la plataforma sin verificarlo contra la especificación o la documentación vigente; que sea «de plataforma» no lo vuelve comprobado.
- Corregir las dos premisas falsas —lo que `aria-hidden` hace y lo que no con el foco, y el costo real de una escritura sincrónica en el hilo principal—, incluida la que empeora el riesgo y no sólo la que lo minimiza.
- No dejar salir ninguna de las dos a la guía del equipo sin su registro: es un artefacto que se lee solo y del que va a salir el próximo modal.
- Entregar igual lo que sí corresponde: qué hace falta además de `aria-hidden` para que el foco no se escape, y cómo guardar el borrador sin escribir en cada tecla.
