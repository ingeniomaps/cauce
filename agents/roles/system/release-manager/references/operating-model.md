# Modelo operativo de Release Management

## Contrato de release

```markdown
Objetivo, alcance / no alcance:
Versión, commit, digest y procedencia:
Servicios, entornos, regiones y cohortes:
Owners, aprobadores y on-call:
Cambios, flags, configuración y dependencias:
Compatibilidad y migraciones:
Evidencias de readiness:
Rollout, observación y guardrails:
Rollback / roll-forward y última prueba:
Comunicaciones y soporte:
Ventana, go/no-go y cierre:
```

## Readiness

Exigir evidencia proporcional: artefacto inmutable, tests del candidato, QA/aceptación, vulnerabilidades y excepciones, privacidad/compliance, capacidad, observabilidad, runbook, migración, backup/restore, rollback, soporte y documentación. Registrar owner, timestamp, entorno y resultado; una casilla antigua no es evidencia vigente.

La procedencia entra por gate como dos evidencias y no como una: la del artefacto —builder, workflow y
digest— y la del origen —el historial de la revisión de la que ese artefacto salió—. La segunda depende de
que el sistema de control de fuente la atestigüe, así que lo que se exige es declararla, no obtenerla: cuando
no está atestiguada, la fila del contrato lo dice y nombra qué lo impide, en vez de quedar cubierta con la
del artefacto. Sin fijar niveles acá: cuál se alcanza y contra qué marco se mide lo decide el proyecto, por
la misma razón por la que este contrato no fija motores de base de datos — una tabla de niveles envejece
peor que el criterio de declararlos.

## Rollout progresivo

```markdown
Etapa y cohorte:
Blast radius:
Inicio y mínimo de observación:
Señales técnicas y de usuario:
Baseline y umbral de avanzar / pausar / abortar:
Owner y autoridad:
Resultado y evidencia:
```

Comparar canary con baseline relevante y contemplar volumen suficiente, latencia de efectos y segmentos críticos. Detener ante telemetría insuficiente.

## Rollback y migraciones

Definir punto de no retorno, RTO/RPO aplicables, compatibilidad de versión N/N-1, datos escritos durante rollout y procedimiento ensayado. Para schema, preferir expand/migrate/contract. Si revertir empeora integridad, preparar roll-forward explícito y autoridad de incidente.

## Qué preserva cada operación de esquema

Renombrar, copiar y borrar no tienen el mismo efecto sobre vistas, vistas materializadas, índices,
constraints, claves foráneas, triggers y código almacenado, y ese efecto cambia entre motores y entre
versiones del mismo motor. Es material público y verificable: se declara el motor y la versión contra los
que se comprobó, o la afirmación queda en hipótesis y no sostiene el plan.

El caso que más engaña es el rename usado como ensayo. La idea es buena —romper fuerte y temprano a los
consumidores que la lista no tiene— y depende por completo de cómo el motor guarda las definiciones
dependientes: si guarda referencias resueltas al nombre, rompen; si guarda referencias internas al objeto o
a la posición de la columna, sobreviven al rename y se re-renderizan con el nombre nuevo. En el segundo
caso el ensayo esconde justo lo que se quería encontrar, y quien lo lea después va a leer «no rompió nada»
como evidencia de que no hay consumidores. Antes de proponerlo: ¿contra qué motor y versión se verificó que
este rename rompe? Si no consta, no habilita avanzar.

Una copia previa al borrado —`CREATE TABLE … AS SELECT` o equivalente— es una foto de un instante. Recupera
los datos que copió, por la clave con la que los copió. No lleva el esquema de la columna —tipo, nulabilidad,
default, constraints, comentario—, no lleva los objetos dependientes que un borrado en cascada se lleve, y
no cubre lo que se escriba después de la copia ni durante ella. Nombrarla como red exige decir esas tres
cosas; sin ellas promete una recuperación que no da, y sustituye a un backup ensayado sin serlo.

Y cuando la conclusión es que revertir dejó de ser seguro, esa conclusión no cierra sola: el roll-forward
concreto y la autoridad de incidente van en la misma pieza. Un no-go que establece el punto de no retorno y
deja sin escribir qué se hace del otro lado traslada el problema al peor momento posible.

## Hotfix

Confirmar incidente/impacto, cambio mínimo, candidato identificable, revisión independiente disponible, tests enfocados, plan de recuperación, on-call y verificación. Documentar excepciones y realizar revisión posterior. No mezclar mejoras oportunistas.

## Control de calidad

- ¿El artefacto probado es exactamente el promovido?
- ¿Cada gate tiene owner y evidencia actual?
- ¿Dependencias, compatibilidad y migraciones tienen orden seguro?
- ¿Rollout limita blast radius y tiene umbrales observables?
- ¿Rollback o roll-forward fue probado en condiciones representativas?
- ¿Go/no-go y emergencias conservan autoridad y trazabilidad?
- ¿Soporte y comunicaciones conocen impacto y versión?
- ¿Cierre vincula código, artefacto, deploy, exposición y outcome?

## Fundamento externo

- [DORA — Continuous delivery](https://dora.dev/capabilities/continuous-delivery/): cambios bajo demanda de manera rápida, segura y sostenible.
- [DORA — Deployment automation](https://dora.dev/capabilities/deployment-automation/): artefactos promovibles, proceso repetible, configuración versionada y verificación automática.
- [Google SRE — Release Engineering](https://sre.google/sre-book/release-engineering/): builds reproducibles, releases trazables, canaries, rollout y rollback.
- [SLSA specification v1.2](https://slsa.dev/spec/v1.2/): procedencia y garantías incrementales para la cadena de suministro de software.

Adaptar gates y autoridad al riesgo, plataforma, regulación y políticas reales.
