# Modelo operativo de registro contable

## Ficha de imputación

Es el entregable del cargo: el asiento sin su ficha no se puede revisar, porque lo que se revisa es el criterio.

```markdown
Hecho económico:
Fecha del hecho y fecha de registro:
Entidad, país, moneda y marco:
Documento soporte (tipo, número, emisor, fecha):
Contraparte y su razón social:
Sustancia (propio/de terceros, principal/agente):
Criterio de imputación:
Fuente del criterio (estándar y párrafo, política interna, norma local con jurisdicción):
Alternativas descartadas y por qué:
Registro de la afirmación (verificado / documentado / hipótesis):
Supuestos:
Faltantes para poder registrar:
Revisa / aprueba / registra:
```

## Formato del asiento

```markdown
Periodo fiscal y fecha del asiento:
Tipo de documento:
| Cuenta | Nombre | Clasificación IFRS | Débito | Crédito | Centro de costo | Área funcional | Razón social | Soporte |
Suma débitos = suma créditos:
Asiento de reversión (si aplica) y su fecha:
Asiento original al que corrige (si es ajuste):
```

Cada línea lleva su propio soporte. Un asiento con un único documento adjunto para diez líneas obliga a quien lo revise
a reconstruir a mano cuál sostiene cuál, que es exactamente el trabajo que la ficha existe para evitar.

## Camino de trazabilidad

Se escribe hacia adelante, desde el evento, y se recorre hacia atrás para comprobarlo. Cada eslabón nombra el
identificador con el que se salta al siguiente.

```markdown
Evento operativo (qué sistema, qué identificador, qué fecha):
Registro intermedio (archivo cargado, lote, job, reporte) e identificador:
Regla o cálculo que transforma el evento en importes:
Asiento resultante e identificador:
Línea del libro y saldo afectado:
Eslabones faltantes y qué haría falta para cerrarlos:
```

Un cruce por monto y fecha no es un eslabón: es una coincidencia que se rompe con dos transacciones iguales el mismo
día. Cuando sea lo único disponible, se declara como tal y se pide el identificador estable.

## Criterios de imputación

- **Sustancia antes que forma.** El documento dice qué se firmó; el criterio depende de qué se transfirió y cuándo.
- **Dinero de terceros.** Lo cobrado por cuenta de otro nace como pasivo con esa contraparte. Se reconoce ingreso
  sólo por la porción que le corresponde a la entidad, y se demuestra con el contrato, no con el flujo.
- **Principal o agente.** La pregunta es quién controla el bien o servicio antes de transferirlo, no quién factura ni
  quién recibe el dinero. La respuesta cambia si se registra bruto o neto, y por eso se documenta.
- **Bruto y neto.** Flete, manejo, comisión, devolución y retención van en líneas propias. Compensarlas en un neto
  ahorra una línea hoy y pierde la explicación de la diferencia mañana.
- **Corte.** El periodo lo fija la fecha del hecho, no la de la carga del archivo ni la del proceso que lo consolidó.
- **Moneda.** Tasa de la fecha del hecho, con fuente y valor registrados; la diferencia de cambio es una línea, no un
  redondeo.

## Dimensiones analíticas

Centro de costo, área funcional y razón social no son etiquetas: son parte de la identidad del registro y suelen tener
clave compuesta —código más área más país, o documento más país—. Reglas de trabajo:

- Resolver la clave completa antes de imputar. El mismo código en otra área o país es otro objeto.
- No usar un centro «genérico» para salir del paso: un reparto sin criterio se vuelve permanente y nadie lo revisa.
- Un reparto entre dimensiones lleva su driver explícito —cabeceras, órdenes, metros, headcount—, su periodo de
  vigencia y quién lo aprobó.
- Verificar que la cuenta esté habilitada para ese centro cuando el plan lo restringe.
- Si la dimensión correcta no existe, pedir su alta con el criterio; no imputar a la más parecida.

## Corrección de un registro

Un libro no se edita. La secuencia es:

1. Establecer qué quedó efectivamente registrado, sobre todo tras un lote con inserción parcial.
2. Cuantificar la diferencia y su efecto por cuenta, dimensión y periodo.
3. Preparar el asiento de ajuste referenciando el original, con cálculo, soporte y reversión si aplica.
4. Si el periodo está cerrado, no proponer un registro con fecha del periodo cerrado: se eleva la excepción con su
   monto y su efecto, y decide quien tiene la autoridad de reapertura.
5. Registrar la excepción abierta mientras no se resuelva: monto, fecha, cuenta, owner y qué evidencia la cierra.

## Auditoría de un recaudo

Cuando el importe reportado por un tercero se reconcilia contra los eventos propios:

- Separar las diferencias por causa —evento inexistente, importe distinto, concepto no reportado, duplicado, fuera de
  periodo—, no por tamaño.
- No cerrar una diferencia como «de timing» sin transacción identificada, fecha esperada y owner.
- Conservar el archivo original, quién lo cargó y cuándo; el reporte de errores es evidencia, no un descarte.
- Un ítem que el proceso ignora en silencio es un hallazgo: lo que no aparece en el reporte de errores tampoco
  aparece en el libro.
- El resultado se entrega como diferencias explicadas y no explicadas, con el asiento propuesto para las primeras.

## Control de calidad

- ¿Entidad, país, periodo, moneda y marco están declarados?
- ¿El hecho económico está descrito, y es distinguible del movimiento de caja?
- ¿Cada cuenta elegida existe en el plan de ese país y está justificada frente a su vecina?
- ¿Cada criterio tiene fuente con edición, y ninguna se tomó de otra jurisdicción?
- ¿Débitos igualan créditos y cada línea tiene soporte y dimensiones completas?
- ¿El camino de trazabilidad se puede recorrer hacia atrás sin coincidencias de monto?
- ¿Las diferencias sin documento quedan como excepción abierta y no en una transitoria?
- ¿La entrega dice explícitamente que el asiento no fue registrado y quién debe aprobarlo?

## Fundamento externo

Fuentes primarias consultadas el 2026-08-22; cada una se anota con la edición leída. El texto completo de los
estándares IFRS requiere registro en el sitio de la fundación, así que lo verificado acá es la página oficial de cada
estándar, no el texto íntegro.

- [Conceptual Framework for Financial Reporting](https://www.ifrs.org/issued-standards/list-of-standards/conceptual-framework/):
  emitido en 2010 y revisado en marzo de 2018; definiciones de activo, pasivo, ingreso y gasto, y criterios de
  reconocimiento cuando ningún estándar aplica directamente.
- [IAS 8 Accounting Policies, Changes in Accounting Estimates and Errors](https://www.ifrs.org/issued-standards/list-of-standards/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors/):
  jerarquía para desarrollar una política cuando no hay estándar específico, y corrección retrospectiva de errores de
  periodos anteriores.
- [IFRS 15 Revenue from Contracts with Customers](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/):
  emitido en mayo de 2014, vigente para periodos que empiezan desde el 1 de enero de 2018; reconocimiento de ingreso
  por obligaciones de desempeño, base para la pregunta de principal o agente.
- [IFRS 9 Financial Instruments](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/):
  clasificación y medición de activos financieros y deterioro por pérdida crediticia esperada; aplica a las cuentas
  por cobrar que nacen de un recaudo pendiente de liquidar.
- [IAS 21 The Effects of Changes in Foreign Exchange Rates](https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/):
  moneda funcional y de presentación, y qué tasa usar en una operación multi-país.
- [IFRS 18 Presentation and Disclosure in Financial Statements](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/):
  emitido en abril de 2024, vigente para periodos que empiezan desde el 1 de enero de 2027, reemplaza a IAS 1. La
  presentación cambia de fecha, así que el plan de cuentas y sus agrupaciones se revisan contra la edición vigente
  para el periodo que se está registrando.
- [IFRS Practice Statement 2 Making Materiality Judgements](https://www.ifrs.org/issued-standards/list-of-standards/materiality-practice-statement/):
  proceso de cuatro pasos para juzgar materialidad. La propia página declara que es un documento **no obligatorio** y
  que no introduce requisitos, así que no se cita como si obligara.
- [COSO Internal Control—Integrated Framework](https://www.coso.org/guidance-on-ic): edición 2013, que refresca la de
  1992; separación de funciones, evidencia de control y rastro de aprobación alrededor del registro.
- [Use of IFRS Accounting Standards by jurisdiction](https://www.ifrs.org/use-around-the-world/use-of-ifrs-standards-by-jurisdiction/):
  perfiles por jurisdicción —170 al momento de la consulta— con el estado de adopción de cada país. Es la fuente para
  no dar por sentado que el marco de un país aplica en el vecino.

El plan de cuentas obligatorio, el documento fiscal válido, la retención aplicable y el plazo de conservación son
**locales** y no están cubiertos por ninguna de estas fuentes: se verifican en la fuente oficial del país concreto
antes de sostener un criterio.
