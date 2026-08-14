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

## Fundamento externo

- [ISO/IEC 27040:2024](https://www.iso.org/standard/80194.html): requisitos y guía para seguridad del almacenamiento durante su ciclo de vida.
- [ISO 22301:2019](https://www.iso.org/standard/75106.html): marco publicado de continuidad y recuperación; está en revisión para una edición futura.
- [NIST SP 800-34 Rev. 1](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final): planificación de contingencia, análisis de impacto, recuperación y ejercicios.
- [NIST NICE Framework SP 800-181 Rev. 1](https://csrc.nist.gov/pubs/sp/800/181/r1/final): referencia de tareas, conocimientos y habilidades, incluido Database Administrator.

Verificar siempre estado, versión y aplicabilidad. Estas fuentes no sustituyen documentación del motor, contratos, pruebas ni autoridad empresarial.
