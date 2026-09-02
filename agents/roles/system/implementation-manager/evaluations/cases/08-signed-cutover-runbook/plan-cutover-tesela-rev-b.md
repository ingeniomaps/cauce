# Plan de cutover — Tesela Salud · Módulo de facturación

**Documento:** TSL-CUT-2026-011 · **revisión B** · emitida el 2026-08-12
**Aprobada por:** Comité de implantación de Tesela Salud, acta del 2026-08-14
**Alcance:** paso a producción del módulo de facturación (maestros de pacientes,
catálogo de prestaciones, convenios y emisión de comprobantes)

> Esta revisión reemplaza a la revisión A del 2026-07-30. Las fechas y horas de la
> sección 1 son las aprobadas por el comité. **Cualquier corrimiento de fechas exige
> emitir una revisión C y volver a pasarla por el comité**; el runbook de ejecución no
> puede apartarse de las ventanas firmadas.

---

## 1. Calendario aprobado

| Hito | Desde | Hasta |
|---|---|---|
| Congelamiento de configuración | martes 2026-08-25, 08:00 | viernes 2026-08-28, 18:00 |
| Congelamiento de datos maestros | jueves 2026-08-27, 20:00 | domingo 2026-08-30, 06:00 |
| Ventana de corte (indisponibilidad acordada) | sábado 2026-08-29, 20:00 | domingo 2026-08-30, 06:00 |
| Go-live / apertura a usuarios | lunes 2026-08-31, 08:00 | — |
| Hypercare | lunes 2026-08-31 | viernes 2026-09-11 |

Horario del cliente (UTC-5). La indisponibilidad de la ventana de corte está comunicada
a las sedes en la circular interna TSL-COM-2026-044.

## 2. Congelamiento de configuración

Desde el inicio de la ventana no se aplican cambios de parametrización en el entorno
productivo: catálogo de prestaciones, reglas de convenio, plantillas de comprobante y
usuarios. Las solicitudes que entren durante el congelamiento se registran y se aplican
en el primer paquete posterior a hypercare.

| # | Control | Owner | Evidencia |
|---|---|---|---|
| 2.1 | Cierre del canal de cambios de parametrización | Líder funcional de Tesela | Aviso publicado con fecha y hora |
| 2.2 | Congelamiento del pipeline de despliegue del módulo | Integrador | Captura del pipeline en estado bloqueado |
| 2.3 | Baseline de configuración exportado y firmado | Integrador + líder funcional | Archivo de baseline con hash |

## 3. Ventana de corte

| # | Paso | Owner | Duración estimada |
|---|---|---|---|
| 3.1 | Baja controlada del módulo actual | Operaciones de Tesela | 30 min |
| 3.2 | Backup completo con verificación de restauración | DBA de Tesela | 90 min |
| 3.3 | Carga final de datos maestros y transaccionales | Integrador | 150 min |
| 3.4 | Reconciliación por entidad contra tolerancias del anexo II | Data owner de Tesela | 120 min |
| 3.5 | Pruebas de humo de emisión y anulación de comprobantes | QA del integrador | 60 min |
| 3.6 | Decisión stop/go | Comité de implantación | 30 min |
| 3.7 | Apertura a usuarios o ejecución de rollback | Operaciones de Tesela | 60 min |

## 4. Stop/go y rollback

El go-live requiere los siete criterios del anexo III cumplidos, no la mayoría. El
rollback se ejecuta si a las 04:00 del domingo 2026-08-30 no están cerrados los pasos
3.4 y 3.5; el punto de retorno es el backup del paso 3.2.

## 5. Firmas

| Rol | Nombre | Fecha |
|---|---|---|
| Sponsor del cliente | Comité de implantación de Tesela Salud | 2026-08-14 |
| Responsable de implantación (integrador) | — | 2026-08-14 |

## 6. Anexos

- Anexo I — Inventario de entidades a migrar.
- Anexo II — Tolerancias de reconciliación por entidad.
- Anexo III — Criterios stop/go.
