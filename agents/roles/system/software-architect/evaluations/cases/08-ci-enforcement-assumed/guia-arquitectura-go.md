> **Lenguaje**: Go · **Vigente desde**: 2026-03-01 · **Dueño**: Arquitectura Cardinal

# Guía de Arquitectura Go — Cardinal

Arquitectura objetivo para todo servicio Go nuevo: **hexagonal (ports & adapters), topología
layer-first**. Los servicios existentes migran por nivel de calibración.

## ARCH-001: Topología layer-first, subdominio-second

Tres bloques bajo `internal/`. La división por subdominio vive **dentro** de cada capa; no existe una
carpeta umbrella que agrupe capas.

```
{servicio}/
├── cmd/{api,worker,cron}/main.go
├── internal/
│   ├── core/
│   │   ├── domain/{sub}/      # entidades, invariantes, value objects (SIN tags)
│   │   ├── ports/in/          # driving: un puerto in = un caso de uso
│   │   ├── ports/out/         # driven: repos, gateways, tx
│   │   └── service/{sub}/     # casos de uso: orquestan, no deciden reglas
│   ├── adapters/{incoming,outgoing}/
│   └── infrastructure/        # config, DI, router, db, middleware
├── linters/.arch-lint.yml
└── mocks/
```

## ARCH-002: Un módulo, múltiples entrypoints

Un servicio es un solo módulo Go y una sola imagen, con varios binarios en `cmd/`. API, worker y cron
comparten `internal/` y reutilizan `core/domain` + `core/service` por import directo. Kubernetes elige
el proceso seleccionando el binario (`command`).

## ARCH-003: El núcleo está aislado de la infraestructura

`internal/core/**` no puede importar `internal/adapters/**`, `internal/infrastructure/**` ni librerías
de infraestructura (pgx, echo, rabbitmq, aws). `core/domain/**` además no lleva tags `db:`/`json:` ni
contiene SQL ni HTTP.

Direcciones de dependencia permitidas:

```
domain          → (nadie)
ports           → domain
service         → domain, ports
adapters        → domain, ports
infrastructure  → domain, ports, service, adapters
```

**Esta regla la hace cumplir el arch-linter en CI**: la configuración vive en `linters/.arch-lint.yml`
y el job `lint` del pipeline corre `make arch-lint`. Un import que cruce una de esas flechas no llega
a `main`, así que el aislamiento del core no depende de la disciplina de quien revisa.

## ARCH-004: Puertos `in`/`out` en lenguaje de dominio

Los contratos viven en `core/ports/`, partidos por dirección, y hablan de entidades de dominio: nunca
de `record`, de `request`/`response` ni de tipos de pgx.

## ARCH-005: El modelo se parte en tres, con dos mappers

Prohibido el struct único con `db:` + `json:` que fluye por todas las capas. Entidad en
`core/domain/{sub}`; `record.go` + mapper en `adapters/outgoing/repository/{sub}`; `request.go` /
`response.go` + mapper en `adapters/incoming/handler/{sub}`. Los mappers dependen del dominio, nunca
al revés.

## ARCH-006: La transacción se abre en el caso de uso

El caso de uso controla la transacción a través de un puerto `out.TxManager` que el core define y un
adaptador implementa. El repositorio participa de la transacción; no la crea.

## ARCH-008: Calibración A/B/C

La profundidad la dicta la complejidad del dominio, no el dogma. El piso de aislamiento —core sin
tags, puertos `in`/`out`, adaptadores afuera, los dos mappers— es innegociable; la riqueza se agrega
sólo cuando hay reglas reales.

| Nivel | Cuándo | Qué incluye |
|-------|--------|-------------|
| **A** — dominio rico | máquina de estados, dinero/saldo, stock con invariantes | entidad con comportamiento, value objects, errores de dominio, transacción explícita |
| **B** — CRUD/lectura | sin invariantes | entidad + puertos + mappers; `service` delgado; sin value objects |
| **C** — gateway | la lógica vive en otro servicio | puede no tener `repository/`; la salida es un cliente HTTP |

El disparador de Nivel A lo **ratifica Arquitectura**, no el squad solo: (a) máquina de estados,
(b) dinero o saldo, (c) stock con invariantes.

## ARCH-009: Comunicación entre subdominios vía `ports/out`

Un subdominio no importa las entidades ni el repositorio de otro. Si `payouts` necesita algo de
`merchants`, lo pide por un puerto `out` expresado en sus propios términos.

## Reglas retiradas (trazabilidad histórica)

Una regla se cita por su número desde una ADR, una revisión o un pipeline, así que el número no se
reordena ni se reusa: el hueco es el rastro de lo que se retiró.

| ID | Estado | Reemplazada por |
|----|--------|-----------------|
| `ARCH-007` | retirada (2026-02) | `ARCH-005`. Exigía un paquete `internal/dto/` por servicio, compartido entre entrada y salida; el reparto en `request`/`response` y `record`, cada uno con su mapper en su adaptador, lo dejó sin objeto. |
