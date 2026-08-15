# Contexto por cargo

Un cargo del catálogo sabe de su profesión, no de esta empresa. Acá va lo que necesita saber para
trabajar en **este** contexto: `organization/roles/<slug>.md`.

```markdown
# QA Engineer en Aparatejo

No hay ambiente de staging: la verificación corre contra el entorno local y contra producción con
datos de prueba. No hay equipo de soporte, así que un defecto que llegue a producción lo paga el
tiempo de las cuatro personas del equipo.

Cada imagen generada cuesta plata real: una prueba que dispare generación tiene que declarar cuántas.
```

## Qué va acá y qué no

**Acá**: restricciones reales de esta empresa, herramientas que usa, quién decide qué, límites de
presupuesto, deudas conocidas, lo que ya se intentó y no funcionó.

**Acá no**: cómo se hace la profesión. Que exista una técnica nueva de testing o que cambie una norma
le pasa a todas las empresas por igual: eso vive en el catálogo y llega actualizando Cauce.

## Por qué está separado

Los cargos que trae Cauce viven en el paquete y se actualizan con él. Si el contexto de tu empresa
estuviera escrito dentro de un cargo del catálogo, cada actualización te obligaría a elegir entre
perder tu contexto o congelar el cargo.

Separados, las dos cosas mejoran sin pisarse: la profesión la mantiene el toolkit, el contexto lo
mantenés vos.

## Si necesitás cambiar el cargo, no sólo darle contexto

Escribí tu propia versión en `agents/roles/<slug>/`, con el mismo slug: reemplaza a la del catálogo.
Tené en cuenta que a partir de ahí ese cargo deja de recibir mejoras, así que conviene sólo cuando el
contrato en sí no te sirve —no cuando lo que falta es contexto—.
