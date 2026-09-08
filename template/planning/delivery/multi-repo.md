# Entrega multi-repo

> Aplicar solo cuando `ops.config.json` declara varios repositorios o servicios liberables.

Cada repositorio mantiene su propio tronco, artefactos, tags y cadencia. No crear una “versión de plataforma”
que obligue a liberar componentes sin cambios únicamente para mantener números sincronizados.

## Estado desplegado

Un manifiesto generado por ambiente registra qué versión o digest de cada componente está desplegado. El
manifiesto es evidencia del pipeline, no una lista que una persona edita manualmente.

## Compatibilidad

- Los consumidores verifican contratos publicados por sus proveedores.
- Un cambio compatible se libera sin coordinar calendarios.
- Un cambio incompatible ocurre en fases: proveedor soporta ambas formas, consumidores migran y después se
  retira la forma anterior.
- Bases de datos y APIs aplican expand/contract durante la ventana de convivencia.
- Una entrega cross-repo registra qué PR y versión satisface cada lado del contrato.

## El `service:` de una tarea tiene que resolver a un solo repositorio

Con varias raíces declaradas, un `service:` que existe en más de una es ambiguo: `.` existe en todas, y un
`src` puede existir en dos. `ops worktree` lo nombra y se niega en vez de elegir la primera, porque elegir
da una respuesta plausible y equivocada —el árbol de trabajo en el repositorio que no era— sin que nada lo
diga. El aviso de avance de un reclamo degrada por lo mismo: sin poder resolver el repositorio, mira sólo
la fecha en que se tomó.

La salida es escribir servicios que sólo existan en una raíz. Si dos repositorios tienen un directorio con
el mismo nombre y los dos son servicios de verdad, conviene una instancia por repositorio.

## Cuándo coordinar

Coordinar solo cuando una propiedad no puede preservarse mediante compatibilidad temporal, por ejemplo una
migración legal, rotación de protocolo o cambio atómico autorizado. Documentar orden, rollback y dueño en el
plan; no convertir esa excepción en la mecánica habitual.
