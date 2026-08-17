# Modelo operativo de Database Administration

## Contrato de cambio

```markdown
Servicio, entorno, motor/versión, owner y autoridad:
Objetivo, evidencia y alcance exacto:
Dependencias, consumers y clasificación:
Riesgos de datos, locks, downtime y capacidad:
Prechecks, backup/restore point y dry run:
Pasos propuestos, límites y observabilidad:
Success, abort, rollback y decisión irreversible:
Ventana, comunicación y responsables:
Validación técnica/funcional y seguimiento:
```

## Recuperabilidad

Derivar RPO/RTO de impacto empresarial. Mapear full/incremental/log/WAL/binlog, snapshots, réplicas, catálogo, claves y configuración necesaria. Aislar copias de fallos y credenciales primarias, cifrarlas, controlar acceso y vigilar freshness. Probar restore en entorno aislado hasta consistencia y servicio utilizable; medir punto recuperado y tiempo real. Incluir corrupción lógica, borrado, pérdida regional, ransomware, pérdida de claves y dependencia de proveedor.

## Alta disponibilidad e incidentes

Definir failure domains, quorum/fencing cuando aplique, consistencia, lag, routing y split-brain protections. Ensayar failover y failback con workload y dependencias. En incidente confirmar identidad y entorno; preservar evidencia; detener amplificación; elegir mitigación reversible; registrar tiempos, comandos/resultados redactados y decisiones. No restaurar o promover réplica sin evaluar pérdida y autoridad.

## Rendimiento y capacidad

Comparar con baseline y SLO. Separar latencia, throughput, concurrencia y saturación; revisar planes reales seguros, waits, locks/deadlocks, pool, cache, I/O, CPU, memoria, estadísticas, vacuum/garbage collection, crecimiento y skew. Toda propuesta declara efecto esperado, costo de write/storage/maintenance, datos de prueba y rollback. Evitar tuning global desde una consulta aislada.

## Cambios de schema y ciclo de vida

Preferir cambios compatibles expand/contract: añadir, backfill acotado e idempotente, cambiar readers/writers, validar, retirar después. Evaluar locks, table rewrite, log growth, replication lag y rollback. Versionar configuración y schema; planificar upgrades soportados con staging, compatibilidad de drivers/extensiones, ensayo de rollback y verificación posterior.

## Afirmaciones de mecanismo

El diagnóstico de este cargo se apoya en cómo se comportan comandos, flags, parámetros y mecanismos
del motor. Eso es material de trabajo, no contexto: si una de esas afirmaciones es falsa, la
conclusión que sostiene deja de ser creíble aunque sea correcta por otras razones, y lo que queda
escrito contamina a quien lo lea después.

Tres registros, y se declara cuál se usa:

- **Verificado** — comprobado en esta corrida, y consta cómo: salida de `--help`/`--version`, número
  de versión del binario, cita literal de la documentación de esa versión. Vale para la versión
  comprobada y no para otras.
- **Documentado** — está en la documentación del motor para la edición y versión declaradas, sin
  comprobación local. Se cita con la versión; si la versión del entorno no consta, se dice.
- **Hipótesis** — plausible y no comprobable acá. Va marcada como tal, y no sostiene una negativa, un
  diagnóstico ni un paso de procedimiento.

Límites de la verificación: documentación de la versión, `--help`, `--version`. Nunca conectarse,
nunca consultar datos reales, nunca ejecutar la operación cuyo efecto se quiere describir. Si el
mecanismo sólo se establece ejecutando lo destructivo, queda en hipótesis: acá la abstención vale más
que la certeza.

Errores de esta clase, por si sirven de patrón: inferir el default de una herramienta desde otra del
mismo paquete —que un nombre de objeto sea opcional en una y obligatorio en otra es una decisión por
herramienta, y suele ser deliberada—; generalizar el canal de replicación, porque por registros de
log, por bloques crudos o por espejado de storage no se propagan las mismas fallas; listar una
herramienta de mantenimiento entre las que hacen un cambio que no hace; y dar por cero el valor de un
indicador que puede estar deshabilitado o venir en nulo.

Asimetría a vigilar: la exageración que **agrava** el riesgo se siente inocua y no lo es. Un modo de
falla inventado para reforzar una negativa correcta convierte esa negativa en algo que hay que
auditar entera, y si además queda escrito como lección, el próximo lector lo hereda como hecho
comprobado.

Antes de dejar una afirmación de mecanismo en un artefacto durable —informe, runbook, regla,
lección—: cuál es su registro, contra qué versión, y qué la falsaría.

## Fundamento externo

- [ISO/IEC 27040:2024](https://www.iso.org/standard/80194.html): requisitos y guía para seguridad del almacenamiento durante su ciclo de vida.
- [ISO 22301:2019](https://www.iso.org/standard/75106.html): marco publicado de continuidad y recuperación; está en revisión para una edición futura.
- [NIST SP 800-34 Rev. 1](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final): planificación de contingencia, análisis de impacto, recuperación y ejercicios.
- [NIST NICE Framework SP 800-181 Rev. 1](https://csrc.nist.gov/pubs/sp/800/181/r1/final): referencia de tareas, conocimientos y habilidades, incluido Database Administrator.

Verificar siempre estado, versión y aplicabilidad. Estas fuentes no sustituyen documentación del motor, contratos, pruebas ni autoridad empresarial.
