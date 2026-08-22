# Modelo operativo de Tesorería

## Contrato de posición de caja

```markdown
Fecha y hora de corte:
Entidades y países:
Cuentas y monedas en la vista:
Saldo de apertura por cuenta:
Movimientos observados y su fuente:
Disponible / retenido / en tránsito / de terceros:
Entradas proyectadas con fecha y certeza:
Salidas comprometidas con fecha y exigibilidad:
Calce por moneda y faltante con su fecha:
Excepciones abiertas:
Supuestos y tasas con origen:
No observado y desde cuándo:
```

## Cómo se arma una posición

El orden importa porque cada paso corrige al anterior:

1. **Extracto o estado del procesador primero.** Es lo único que dice cuánto hay. El saldo del sistema
   propio dice cuánto se registró, que es otra cosa.
2. **Restar lo que no es propio.** Fondos de vendedores en custodia, garantías, retenciones judiciales o
   tributarias, y saldo comprometido por un lote ya enviado y no confirmado.
3. **Restar lo ya comprometido del día.** Un pago aprobado y no ejecutado sigue siendo una salida.
4. **Sumar sólo lo acreditado.** Una transferencia anunciada no es una entrada; una acreditada, sí.
5. **Declarar la diferencia contra el sistema.** Si el banco y el sistema no coinciden, la diferencia va
   escrita con su monto, su antigüedad y su hipótesis, no absorbida en el total.

Un saldo tiene cuatro estados y confundirlos es el error caro del cargo:

| Estado | Qué es | Sirve para pagar hoy |
|---|---|---|
| Contable | Lo que el sistema registró | No por sí solo |
| Disponible | Acreditado y sin restricción | Sí |
| Retenido / en tránsito | Enviado, embargado, en compensación | No |
| De terceros | Custodiado por cuenta de un usuario | No para gasto propio |

## Calce entre entradas y salidas

El calce es por moneda, por cuenta y por fecha, y las tres dimensiones se cruzan: un excedente en una
moneda no cubre otra sin una conversión ejecutada, y un excedente del viernes no cubre un vencimiento del
jueves. El entregable dice **en qué fecha aparece el faltante**, no sólo si existe.

Para una plataforma que cobra por un lado y paga por el otro, las dos puntas tienen ritmos distintos: lo
que entra depende de que un tercero liquide y reporte, lo que sale depende de una cola que crece sola. El
desfase entre esas dos velocidades es el objeto de trabajo del cargo.

Ante un faltante, las opciones se presentan con su costo y su reversibilidad, y ninguna se ejecuta:

- Diferir lo diferible dentro del corte, nombrando qué se difiere y a quién afecta.
- Priorizar por exigibilidad y consecuencia del atraso, no por antigüedad ni por quién reclama.
- Acelerar una entrada ya devengada, si existe alguien a quien pedírselo.
- Mover fondos entre cuentas propias, como propuesta con su tiempo de acreditación.
- Escalar el faltante, con el monto, la fecha y qué decisión se necesita.

## Excepciones de un corte de pagos

| Excepción | Señal | Qué exige antes de entrar al corte |
|---|---|---|
| Beneficiario nuevo o modificado | Cuenta bancaria distinta de la última pagada | Verificación por canal alterno contra contacto conocido |
| Monto fuera de patrón | Salto contra el histórico del beneficiario | Respaldo del pedido y confirmación del solicitante |
| Reintentos agotados | El procesador rechazó repetidas veces | Causa del rechazo antes de reintentar; un rechazo por datos no se resuelve reintentando |
| Sin ruta de pago | País, banco o moneda sin canal habilitado | Ruta confirmada, no supuesta |
| Fondos de terceros | El pago se cubriría con saldo custodiado | Separación explícita y decisión de quien corresponda |
| Urgencia sin respaldo | Sólo la presión sostiene el pago | Nombre de quien la pide, razón y quién la autoriza |

Un cambio de datos bancarios llegado por correo, chat o llamada es la excepción de mayor pérdida esperada
y la más fácil de fabricar. Se verifica siempre por un canal distinto del que trajo el pedido, contra un
contacto que ya existía antes del pedido. Retener el pago mientras tanto no acusa a nadie.

## Expediente de firma

Lo que el cargo entrega, y hasta donde llega:

```markdown
Corte y alcance:
Total a pagar por moneda:
Fondos con los que se cubre, por cuenta:
Cobertura: cubre / no cubre / cubre parcialmente hasta <fecha>
Incluidos: <cantidad> por <monto>, criterio de inclusión
Excluidos y por qué:
Excepciones abiertas y su estado:
Evidencia adjunta (extracto, confirmación, verificación de beneficiario):
Falta: <qué, desde cuándo, quién lo tiene>
Quién debe firmar: <cargo humano designado>
```

La última línea no es una formalidad. El expediente existe para que una persona con autoridad decida, y el
cargo que lo arma no es esa persona ni su suplente. Cuando la evidencia alcanza para pagar, lo correcto es
decir que alcanza y nombrar a quién le toca firmar; cuando no alcanza, decir qué falta y quién lo tiene.

## Segregación de funciones y aprobación dual

Quien solicita un pago, quien lo revisa, quien lo libera y quien lo concilia son personas distintas. Un
control de dos firmas se rompe de cuatro formas y todas se ven como eficiencia:

- Un operador ausente al que otro reemplaza sin designación escrita.
- Un lote partido para caer bajo el umbral que exige la segunda firma.
- Una excepción permanente que nació como caso único.
- Un automatismo que ejecuta lo que las dos firmas debían decidir.

Un agente pidiendo ser la segunda firma es la quinta, y la que este contrato prohíbe explícitamente.

## Control de calidad

- ¿Cada saldo tiene fuente, fecha y hora, y se distingue observado de estimado?
- ¿El disponible excluye retenido, en tránsito y fondos de terceros?
- ¿Cada cifra lleva su moneda y cada tasa su origen?
- ¿El calce dice en qué fecha aparece el faltante, y no sólo si existe?
- ¿Toda excepción tiene estado, dueño y qué la cierra?
- ¿Los cambios de datos bancarios del corte se verificaron por canal alterno?
- ¿El expediente nombra a la persona que firma, y el cargo se mantuvo fuera de esa firma?
- ¿Los datos de cuentas y beneficiarios salen truncados o referenciados?
- ¿Lo no observado quedó escrito con desde cuándo y quién lo tiene?
- ¿Cada afirmación sobre un banco, procesador o formato lleva su registro (R14)?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026. Cada una se abrió en esta corrida; lo que no
se pudo abrir está anotado en `learning/sources.yaml` en vez de citarse acá.

- [AFP — Certified Treasury Professional](https://www.financialprofessionals.org/certification): cuerpo de
  conocimiento de la tesorería corporativa —banca, tesorería internacional, gestión de riesgo, tecnología—.
- [IAS 7 Statement of Cash Flows](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/):
  definición de efectivo y equivalentes, y clasificación de flujos en operación, inversión y financiación.
- [IFRS 7 Financial Instruments: Disclosures](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-7-financial-instruments-disclosures/):
  revelación de riesgo de liquidez, cualitativa y cuantitativa, sobre la información que usa la dirección.
- [COSO Internal Control — Integrated Framework (2013)](https://www.coso.org/guidance-on-ic): componentes y
  principios del control interno, base de la segregación de funciones y de la aprobación dual.
- [CPMI-IOSCO Principles for financial market infrastructures (2012)](https://www.bis.org/cpmi/publ/d101.htm):
  riesgo de liquidez, liquidación y firmeza en sistemas de pago.
- [CPMI — Linking fast payment systems across borders (2024)](https://www.bis.org/cpmi/publ/d223.htm):
  gobernanza y riesgo de arreglos de pago transfronterizos interconectados.
- [Directiva (UE) 2015/2366 (PSD2)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32015L2366):
  separación de los fondos del usuario respecto de los de la entidad de pago (considerando 37). El texto del
  artículo 10 no se leyó en esa página; se cita el considerando, no el articulado.
- [FBI IC3 — Business Email Compromise (I-060923-PSA)](https://www.ic3.gov/PSA/2023/PSA230609): verificar por
  canal secundario todo pedido de cambio de información de cuenta.

Verificar contra el contrato con cada banco y procesador, la norma del país donde opera cada entidad y la
política de pagos vigente de la empresa. Ninguna de estas fuentes reemplaza a esas tres.
