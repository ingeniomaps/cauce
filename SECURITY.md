# Política de seguridad

## Qué versión recibe arreglos

La última publicada en npm, y sólo ésa. Cauce está en `0.x`: no hay ramas de mantenimiento y una
versión anterior no recibe backports. Si estás en una versión vieja, la respuesta a un problema de
seguridad va a ser actualizar.

## Cómo reportar

**No abras un issue público.** Usá el reporte privado de GitHub, en la pestaña
[Security](https://github.com/ingeniomaps/cauce/security/advisories/new) del repositorio: crea un hilo
que sólo ve quien mantiene el proyecto, y desde ahí se puede publicar el aviso y pedir el CVE cuando el
arreglo esté.

Ayuda que el reporte traiga qué versión, qué hace falta para reproducirlo, y qué consigue quien lo
explota. Si no tenés todo eso, mandalo igual: un reporte parcial llega antes que uno completo que nunca
se escribe.

## Qué esperar

Lo mantiene una sola persona. **No hay compromiso de plazo**, y decirlo es más útil que prometer
cuarenta y ocho horas que no se van a cumplir siempre. Lo que sí:

- Se responde que llegó, aunque todavía no haya diagnóstico.
- Si es real, el arreglo sale en la próxima versión y el aviso dice qué versiones alcanzaba.
- Si no lo es, se dice por qué, no se deja el hilo sin cerrar.

## Qué cuenta como vulnerabilidad acá

Cauce es un CLI que corre en la máquina de quien lo usa y un paquete que otros proyectos instalan.
Interesa sobre todo:

- Ejecución de código desde contenido que Cauce lee —un `planning/` ajeno, la respuesta de una
  integración, un artefacto de una corrida—.
- Escritura fuera del directorio de la instancia: cualquier ruta que se escape de donde el comando dijo
  que iba a escribir.
- Filtración de credenciales por la salida del CLI, un archivo generado o un log.
- Un guard que se puede eludir haciendo lo que justamente bloquea.

Lo que **no** es una vulnerabilidad de Cauce: que un agente haga algo que su contrato le permite. Para
eso están las reglas y sus casos adversariales, y el camino es un issue o un PR.

## Lo que este repositorio no guarda

No hay credenciales en el árbol. La publicación a npm va por *trusted publishing* con OIDC, así que no
existe un token de npm guardado como secreto. Los únicos secretos configurados son los del modelo que
corre el aprendizaje semanal, y ese workflow no puede escribir en el repositorio: quien corre el modelo
y quien abre el PR son jobs distintos, con permisos distintos.
