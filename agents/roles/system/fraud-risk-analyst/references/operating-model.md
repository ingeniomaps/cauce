# Modelo operativo de riesgo de fraude

## Contrato del modelo de riesgo

```markdown
Esquema de fraude:
Actor, ganancia y ventana:
Punto de irreversibilidad del dinero:
Señales y registro del que sale cada una:
Comportamiento cuando la señal no tiene dato:
Composición del puntaje y procedencia de cada peso:
Cortes y costo del error que los justifica:
Qué se auto-rechaza y qué va a revisión humana:
Cola de revisión: quién, qué ve, cuánto tarda:
Acciones y su reversa, con quién autoriza cada una:
Excepciones vigentes (whitelist) con dueño y fecha de revisión:
Etiqueta de resultado y ventana de confirmación:
Medición por segmento y segmentos sin medir:
Riesgo residual y qué esquema queda descubierto:
```

## Del esquema a la señal

Un esquema se escribe con actor, ganancia, precondición y ventana. Sin esas cuatro cosas no se puede
decidir qué observar: «fraude en retiros» no dice qué mirar, y «recargar con tarjeta ajena y retirar
antes del contracargo» dice que hay que mirar la distancia entre recarga y retiro, la proporción
retirada y el medio de la recarga.

La señal es la huella que el esquema deja, no la característica del sospechoso. Para cada una:

| Qué se declara | Por qué |
|---|---|
| Registro y campo del que se lee | Sin eso la regla no se puede implementar ni auditar |
| Ventana de cálculo | La misma señal a 24 h y a 30 días detecta cosas distintas |
| Rama del dato ausente | «Sin dato» no es «sin riesgo» ni «riesgo alto»; es una decisión |
| Cuántos casos legítimos la disparan | Es la mitad del costo, y la que nadie trae |
| Qué la evade y a qué costo para el atacante | Una señal que se evade gratis dura una semana |

Una señal derivada de un atributo protegido —nacionalidad, país, origen, edad, género— o de un proxy
suyo lleva además la mecánica escrita que la explica y la medición de a quién bloquea de más. El
patrón en los datos es lo que hay que justificar, no la justificación.

## Los dos errores, y quién los paga

|  | El sistema deja pasar | El sistema detiene |
|---|---|---|
| **Era fraude** | Falso negativo: pérdida, contracargo, cartera negativa | Acierto |
| **Era legítimo** | Acierto | **Falso positivo: una persona sin su dinero** |

El falso positivo se reporta en personas y en tiempo, no sólo en porcentaje: cuántos clientes
legítimos detenidos, cuánto estuvo retenido el dinero de cada uno, cuántos escalaron y cuántos
volvieron a operar después. La versión en porcentaje esconde a quién le pasó.

El corte de auto-rechazo es el punto donde el costo del falso positivo todavía es menor que el del
falso negativo. El corte de revisión humana es un problema distinto y tiene un límite duro: la
capacidad de la cola. Un umbral que manda a revisión más casos de los que el recorrido puede atender no
agrega revisión, agrega demora — y una cola que se desborda se termina vaciando aprobando.

Antes de mover cualquiera de los dos, escribir qué esquema deja de detectarse, sobre qué volumen y
por cuánto tiempo.

## Operación: tres acciones, no una

- **Detener y revisar** — reversible, sin efecto para el cliente si se resuelve rápido. Es la acción
  por defecto ante sospecha; su costo es la demora y la capacidad de la cola.
- **Auto-rechazar** — reversible sobre la operación, no sobre la experiencia. Se justifica sólo donde
  la evidencia es fuerte y el volumen no deja revisar. Lleva ruta de reclamo escrita.
- **Contener** —congelar, listar, bloquear el instrumento— es la más cara y la que más se parece a una
  sanción. No es una decisión de este cargo: se propone con alcance, duración, reversa y quién la
  autoriza.

Ninguna de las tres se ejecuta desde acá. Lo que se entrega es la propuesta con su reversa.

## Revisión de una decisión automática

Una decisión automática que afecta a una persona se revisa, y eso condiciona el diseño desde antes de
que exista el primer caso:

- **Los factores viajan con el caso.** El revisor tiene que ver qué disparó, con qué valor y en qué
  ventana, en términos que pueda contradecir. Un puntaje solo no se puede revisar: se puede acatar.
- **Hay una persona que puede decidir distinto**, y su decisión pesa más que el puntaje. Si sólo
  puede confirmar, no es revisión.
- **Se le dice al afectado que pasó y por qué**, en la medida en que decirlo no entregue el mapa de la
  detección. La tensión es real y se resuelve caso por caso, no apagando el aviso.
- **El bloqueo se levanta cuando la razón deja de existir**, y alguien es dueño de comprobarlo. Sin
  eso, la contención temporal se vuelve permanente por inercia.
- **Que el modelo sea opaco no reduce lo que hay que explicar.** Si no se pueden dar razones
  específicas, el problema es el modelo, no la explicación.

La revisión con dos operadores —uno revisa, otro autoriza el movimiento de fondos— existe para que
ninguna aprobación sea unilateral. Al diseñarla, comprobar que el segundo tenga información propia y
no sólo el veredicto del primero: si sólo ve «aprobado», la separación es nominal.

## Excepciones y supresión

Una whitelist es una excepción, no una corrección del modelo. Registrar siempre tipo de alerta
alcanzado, dueño, razón, fecha de alta y fecha de revisión; desactivar en vez de borrar, para que el
historial siga siendo auditable.

Señales de que la excepción está tapando un problema del modelo en vez de resolver un caso:

- Se otorga por tipo de alerta a muchos usuarios distintos → la señal está mal calibrada.
- Es global en vez de por tipo → apaga detección que nadie evaluó.
- No tiene fecha de revisión → nadie va a volver a mirarla.
- Crece más rápido que el volumen → se está usando para bajar la cola, no el error.

Contar las alertas omitidas por excepción es parte de la medición: sin ese número, la tasa de
detección se lee mejor de lo que es.

## Medición

- **Etiqueta de resultado primero.** Cada caso cierra con qué lo confirmó: contracargo, reconocimiento
  del titular, devolución, resolución del revisor, o «sin confirmar». Sin etiqueta no hay medición
  aunque el modelo lleve años corriendo.
- **Ventana de confirmación.** El fraude se confirma tarde; medir precisión sobre casos de esta semana
  la infla. Declarar la ventana y medir sólo cohortes cumplidas.
- **Los casos auto-rechazados no tienen resultado observable**: nunca ocurrieron. Es un sesgo de
  selección, no un dato faltante. Se acota dejando pasar una muestra pequeña bajo autorización, o se
  declara que la precisión por encima del corte no está medida.
- **Por segmento**, no sólo global: país, medio de pago, antigüedad de cuenta, monto. Un modelo que
  anda bien en promedio puede estar bloqueando a un segmento entero.
- **Deriva**: la misma batería en el tiempo, con la versión de las reglas y del puntaje como parte del
  entorno. El fraude se adapta, así que la caída de detección puede ser mejora del atacante y no falla
  del modelo.
- **Tasa base antes que precisión.** Con 0,3 % de fraude, una regla con 90 % de sensibilidad y 2 % de
  falsos positivos deja mayoría de legítimos entre los detenidos. Es aritmética, no pesimismo, y es lo
  primero que hay que poner sobre la mesa cuando alguien propone bajar un umbral.

## Control de calidad

- ¿Cada regla vigente tiene esquema, actor y ganancia escritos, o sólo una condición?
- ¿Cada señal declara su registro, su ventana y su rama de dato ausente?
- ¿Hay tasa base, o el umbral se justifica con un número redondo?
- ¿El falso positivo está reportado en personas y en tiempo de retención?
- ¿Los casos auto-rechazados tienen su sesgo de selección declarado?
- ¿El revisor humano recibe factores contradecibles y puede decidir distinto?
- ¿Cada acción tiene reversa escrita, con plazo y dueño?
- ¿Las whitelists tienen alcance, razón y fecha de revisión, y sus omisiones se cuentan?
- ¿Alguna señal es proxy de un atributo protegido sin mecánica escrita ni medición de sobre-bloqueo?
- ¿Se dijo qué segmento quedó sin medir y qué esquema queda descubierto?

## Fundamento externo

Fuentes primarias consultadas en agosto de 2026; cada una se cita con la versión que se leyó.

- [Reglamento (UE) 2016/679 (GDPR), artículo 22](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679):
  una decisión basada únicamente en tratamiento automatizado con efecto significativo sobre una persona
  exige, como mínimo, «the right to obtain human intervention on the part of the controller, to express
  his or her point of view and to contest the decision» (art. 22.3). Es el piso de la ruta de revisión.
- [Reglamento (UE) 2024/1689 (AI Act), anexo III punto 5(b)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401689):
  clasifica como alto riesgo los sistemas de IA que evalúan solvencia «with the exception of AI systems
  used for the purpose of detecting financial fraud». La excepción acota la obligación, no la buena
  práctica: un modelo de fraude sigue decidiendo sobre personas.
- [Directiva (UE) 2015/2366 (PSD2), artículo 68](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32015L2366):
  bloquear un instrumento de pago por sospecha de uso fraudulento requiere razones «objectively
  justified», informar al titular del bloqueo y de sus razones —antes si es posible, inmediatamente
  después si no— y desbloquear «once the reasons for blocking no longer exist».
- [CFPB Consumer Financial Protection Circular 2022-03](https://www.consumerfinance.gov/compliance/circulars/circular-2022-03-adverse-action-notification-requirements-in-connection-with-credit-decisions-based-on-complex-algorithms/)
  (26/05/2022): un acreedor no puede justificar la falta de razones específicas alegando que su modelo
  es demasiado complejo u opaco. Aplica a crédito en EE. UU., y el principio —la opacidad del modelo no
  reduce lo que hay que explicar— es el que se traslada al diseño.
- [Federal Reserve SR 26-2, «Revised Guidance on Model Risk Management»](https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm)
  (17/04/2026): reemplaza a SR 11-7 (2011) y SR 21-8 (2021), y pide un enfoque de gestión de riesgo de
  modelo proporcional al perfil de la organización. Citar SR 11-7 hoy es citar una guía derogada.
- [OCC Bulletin 2026-13, «Model Risk Management: Revised Guidance»](https://www.occ.gov/news-issuances/bulletins/2026/bulletin-2026-13.html)
  (17/04/2026): define «modelo» como método cuantitativo complejo y **excluye** procesos determinísticos
  basados en reglas. Un motor de reglas de fraude no es un modelo bajo esa definición, y esa distinción
  cambia qué gobierno le aplica.
- [NIST AI Risk Management Framework 1.0 (NIST.AI.100-1)](https://www.nist.gov/itl/ai-risk-management-framework)
  (26/01/2023): funciones Govern, Map, Measure y Manage; marco voluntario para incorporar confiabilidad
  al ciclo de vida de un sistema de IA.
- [EBA/GL/2020/01, guías de reporte de fraude bajo PSD2](https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money/guidelines-on-fraud-reporting-under-psd2)
  (22/01/2020, aplicables desde 01/07/2020): taxonomía y plantillas con las que los proveedores de pago
  reportan fraude a su autoridad. Sirve como vocabulario común aunque la obligación no aplique.
- [ACFE, «Occupational Fraud 2026: A Report to the Nations»](https://www.acfe.com/fraud-resources/report-to-the-nations)
  (14.ª edición, 2.402 casos en 143 países): fuente profesional sobre fraude **ocupacional** —interno—,
  útil para esquemas de colusión y para métodos de detección; no cubre fraude transaccional externo.

Las normas locales del mercado en el que corre el producto —Colombia, Brasil, México— mandan sobre
todo lo anterior y no están registradas acá: verificarlas contra la fuente del regulador antes de
apoyar una decisión en ellas.
