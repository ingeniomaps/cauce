# Este workspace

Lo que sólo sabe este proyecto: qué hay, contra qué se conecta y hasta dónde puede decidir solo un
runner. `AGENTS.md` gobierna el qué y el cuándo para cualquier proyecto; esto es lo que cambia entre
uno y otro, y por eso vive acá, donde Cauce no escribe: `upgrade` no lo toca nunca.

## Mapa real

Completar antes de la primera tarea:

- Qué producto se construye.
- Qué repos o servicios existen y dónde viven.
- Dónde documenta cada servicio sus comandos de test, lint y build.
- Qué directorios son legacy o están fuera de alcance.

El mapa no debe duplicar documentación técnica: enlaza a la fuente de verdad de cada servicio.

## Integraciones y ambientes

R12 fija el trato con todo sistema externo: real y de producción mientras no se lo nombre como sandbox.
Las excepciones de este proyecto —y sólo ellas— van acá, nombrando el entorno concreto.

Las credenciales que cada integración necesita se nombran acá o en `planning/HUMAN_ACTIONS.md`, con
quién las carga y dónde: `check` avisa cuando el proyecto declara una variable que no aparece en
ninguno de los dos, porque una credencial sin dueño no rompe nada hasta el día del despliegue.

## Excepciones de autonomía

Los límites que rigen sin escribir nada están en `AGENTS.md`, y son los mismos para todo proyecto. Acá
va lo que este proyecto amplía o restringe, con su razón: un servicio donde el runner no puede tocar
migraciones, un repo donde sí puede commitear directo, un entorno de pruebas que es seguro escribir.

Lo que no se puede ampliar acá: promover trabajo propio, prometer fechas, inventar evidencia o exceder
la autoridad de un cargo. Eso no depende del proyecto.
