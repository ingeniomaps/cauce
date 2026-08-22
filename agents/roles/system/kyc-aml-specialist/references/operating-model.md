# Modelo operativo de KYC & AML

## Contrato de programa

```markdown
Entidad legal y país:
Licencia o figura bajo la que opera:
Productos alcanzados:
Segmentos de cliente:
Norma y supervisor citados para este país:
Factores de riesgo y su peso:
Niveles de diligencia y disparadores:
Atributos de identidad verificados y su evidencia:
Listas cotejadas, fuente y frecuencia:
Criterio de coincidencia y quién resuelve:
Monitoreo: señales, umbrales y recalibración:
Conservación del expediente y su fundamento:
Ruta de escalación y responsable:
Vacíos, riesgo residual y fecha de revisión:
```

Un contrato de programa se escribe **por país**. Compartir el diseño entre países es una decisión de
arquitectura; compartir la norma que lo justifica no es una decisión, es un error: el mismo control puede ser
suficiente en uno e insuficiente en otro, y el documento no muestra la diferencia si la fuente no está por país.

## Perfil de riesgo del cliente

Factores que se declaran explícitos, con el valor observado y su procedencia:

- **Geografía**: país de residencia, nacionalidad, país de la operación, exposición a jurisdicciones bajo
  monitoreo reforzado según la lista que el programa declare y su fecha.
- **Producto y canal**: billetera, tarjeta virtual, transferencia, retiro; alta remota o presencial.
- **Cliente**: persona natural o jurídica, actividad declarada, antigüedad, volumen esperado, beneficiario final
  y estructura de propiedad cuando corresponda.
- **Condición**: PEP, familiar o allegado, según la definición vigente **de ese país**, que no se importa de otro.
- **Comportamiento**: coherencia entre lo declarado y lo observado desde el alta.

El perfil produce un nivel de diligencia, no un veredicto sobre la persona. Un factor alto no dice que alguien
lave dinero: dice cuánta verificación y cuánta observación exige la relación.

## Niveles de diligencia

| Nivel | Cuándo | Qué agrega |
|---|---|---|
| Simplificada | Sólo si la norma del país la permite explícitamente para ese producto y perfil | Menos atributos verificados, con el fundamento citado |
| Estándar | Caso base del programa | Identidad, documento vigente, cotejo de listas, actividad declarada |
| Reforzada | Riesgo alto por perfil, PEP, estructura opaca, país de riesgo o alerta previa | Origen de fondos, beneficiario final, aprobación de nivel superior, revisión más frecuente |

Aplicar un nivel distinto al que el perfil pide es una excepción: se documenta el motivo, quién la aprobó y hasta
cuándo rige. Una excepción sin vencimiento se convierte en la regla y nadie la vuelve a mirar.

## Verificación de identidad

Para cada atributo, registrar qué se verificó, contra qué fuente, con qué evidencia y con qué antigüedad:

```markdown
Atributo:
Fuente de verificación:
Evidencia conservada:
Fecha y hora (UTC):
Resultado:
Antigüedad admitida por la política:
```

Con proveedor externo, además: qué comprobación contrató la empresa, contra qué base la corrió el proveedor, qué
significa cada etiqueta o puntaje que devuelve, y qué **no** cubre. Un identificador de cuenta armado por
convención —un sufijo de país fijo en el identificador, por ejemplo— fija de hecho el alcance geográfico del
control: hay que saberlo antes de decir que el mismo control corre en otro país.

Cuando la verificación es remota y biométrica, el programa declara qué se hace ante fallo de vivacidad, ante
reintentos y ante re-enrolamiento, porque cada uno deja un rastro distinto en el expediente.

## Cotejo de listas

- Declarar la lista, su publicador, su URL, su frecuencia de actualización y la fecha de la copia usada.
- Escribir el criterio de coincidencia: exacta, fonética, difusa con su umbral, grafías alternativas,
  transliteraciones, orden de apellidos.
- Resolver cada acierto con atributos adicionales; nunca por parecido de nombre solo.
- Documentar el descarte con el mismo detalle que el acierto: qué atributo lo descartó y quién lo resolvió.
- Registrar el falso positivo para calibrar, sin convertir la calibración en una forma de bajar el control.

```markdown
Alerta:
Lista, versión y fecha:
Registro coincidente:
Atributos comparados:
Resolución (confirmado / descartado / pendiente):
Motivo y evidencia:
Resuelto por, fecha y hora (UTC):
Escalado a:
```

Una alerta es una hipótesis en curso. No se escribe como acusación, no se comparte fuera de quienes la resuelven
y no se le comunica a la persona evaluada.

## Monitoreo posterior al alta

- Definir señales observables sobre el comportamiento esperado del perfil, no sobre intuiciones.
- Fijar umbrales con la medición que los sostiene, y una fecha de recalibración.
- Medir la salud del monitoreo por señal útil —alertas resueltas con hallazgo, tiempo hasta la resolución— y no
  por volumen de alertas ni por tamaño del backlog.
- Revisar el perfil cuando cambia el comportamiento, cuando la relación cumple el plazo de revisión periódica del
  programa o cuando la persona entra o sale de una condición como PEP.
- Un backlog de alertas es un riesgo operativo con dueño y plan, no un motivo para cerrar en lote ni para subir
  un umbral. Cualquier cambio de umbral o de regla se propone con evidencia, se aprueba y queda con fecha de
  vigencia.

## Expediente y auditabilidad

El expediente tiene que permitir que alguien sin contexto reconstruya la decisión años después:

```markdown
Cliente y país:
Evento (alta, revisión, alerta, cambio de perfil):
Datos y evidencia recibidos:
Verificaciones ejecutadas y su resultado:
Listas cotejadas y resolución:
Nivel de diligencia aplicado y qué lo disparó:
Regla o política que sostiene la decisión, con su versión:
Decisión, responsable, fecha y hora (UTC):
Excepciones y quién las aprobó:
Pendientes y escalaciones abiertas:
```

Conservar según el plazo que la norma financiera del país exige, que es distinto de la retención por finalidad de
privacidad y suele ser más largo. Cuando las dos entran en conflicto, preservar, documentar y escalar; el
conflicto lo resuelve Legal con el responsable de cumplimiento, no este cargo.

## Escalación

Escalar por la ruta que la empresa haya definido, con: qué se observó, cuándo se detectó (hora en UTC), qué
evidencia queda disponible y dónde, quién la resolvió hasta ahora y qué falta. La escalación no afirma que hubo
un delito ni decide si algo se reporta a una autoridad: esa calificación y esa decisión pertenecen al responsable
designado por la empresa, con Legal.

Mientras la escalación esté abierta: no borrar ni alterar evidencia, no cerrar la alerta y no informar a la
persona evaluada.

## Control de calidad

- ¿Cada país tiene su norma y su supervisor citados, sin importarlos de otro país?
- ¿Cada atributo verificado tiene fuente, evidencia y fecha?
- ¿Se sabe qué comprueba el proveedor y qué significa cada etiqueta que devuelve?
- ¿Los disparadores de diligencia reforzada están escritos y se aplicaron?
- ¿Cada acierto y cada descarte de lista tienen motivo, responsable y fecha?
- ¿El monitoreo tiene umbral, dueño y fecha de recalibración?
- ¿Las excepciones tienen aprobador y vencimiento?
- ¿El expediente permite reconstruir la decisión sin quien la tomó?
- ¿La conservación cita la obligación financiera del país, distinta de la retención por privacidad?
- ¿Lo que excede al cargo quedó escalado, con evidencia y sin decidir su destino?

## Fundamento externo

Estándares y fuentes consultadas el 2026-08-22. Son base metodológica: **ninguna sustituye a la norma del país
donde la entidad opera**, y el mismo programa puede ser suficiente en un país e insuficiente en el vecino.

- [FATF — The FATF Recommendations](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html):
  estándar internacional de referencia (enfoque basado en riesgo, debida diligencia, PEP, conservación de
  registros, reporte de operaciones sospechosas). **No se pudo abrir desde acá**: el sitio devolvió HTTP 403 el
  2026-08-22, así que la versión vigente y sus enmiendas se comprueban en la fuente antes de citarlas.
- [GAFILAT](https://www.gafilat.org/index.php/es/): organismo regional de tipo GAFI; su página de miembros
  enumera 18 países e incluye a los ocho de esta operación —CO, EC, GT, PA, CL, MX, PY, PE— (verificado
  2026-08-22).
- [GAFILAT — Las 40 Recomendaciones](https://www.gafilat.org/index.php/es/las-40-recomendaciones): versión en
  español, con su biblioteca. La página describe la revisión de febrero de 2012, de modo que **puede ir por
  detrás** del texto vigente: sirve para leer, no para fechar (verificado 2026-08-22).
- [BCBS — Sound management of risks related to money laundering and financing of terrorism: revisions to
  supervisory cooperation](https://www.bis.org/bcbs/publ/d505.htm): guía del Comité de Basilea, 2 de julio de
  2020, sobre cooperación entre supervisores prudenciales y de ALA/CFT (verificado 2026-08-22). La guía base de
  2016 ([d353](https://www.bis.org/bcbs/publ/d353.htm)) aparece marcada como *Superseded* en bis.org, así que la
  versión en vigor se confirma en el marco consolidado antes de citarla.
- [Wolfsberg Group](https://wolfsberg-group.org/): guías de la industria bancaria sobre enfoque basado en riesgo,
  monitoreo de actividad sospechosa y debida diligencia en banca corresponsal (verificado 2026-08-22). Es práctica
  de industria, no norma.
- [NIST SP 800-63A rev. 4 — Identity Proofing and Enrollment](https://pages.nist.gov/800-63-4/sp800-63a.html):
  publicada el 26 de agosto de 2025; niveles de aseguramiento de identidad (IAL) y requisitos de comprobación
  remota y presencial (verificado 2026-08-22). Es marco técnico estadounidense: aporta vocabulario para decir qué
  tan fuerte es una verificación, no obligación para estas ocho jurisdicciones.
- [Egmont Group](https://egmontgroup.org/): red de unidades de inteligencia financiera; explica qué hace una UIF
  y qué no —no conduce investigaciones financieras— (verificado 2026-08-22).
- [Consolidated United Nations Security Council Sanctions List](https://scsanctions.un.org/consolidated/): lista
  consolidada del Consejo de Seguridad. El 2026-08-22 la URL respondió 302 hacia un archivo firmado y temporal,
  así que la descarga se rehace desde esta dirección en cada uso, no desde el enlace redirigido.
- [OFAC — Specially Designated Nationals (SDN) List](https://sanctionslist.ofac.treas.gov/Home/SdnList): lista de
  sanciones del Tesoro de los Estados Unidos (verificado 2026-08-22). Su aplicabilidad depende del vínculo con esa
  jurisdicción y de lo que el programa de la empresa declare cotejar.

Autoridades y supervisores por país, para los que se pudo verificar una URL el 2026-08-22:

- Colombia — [UIAF](https://www.uiaf.gov.co/) (unidad de inteligencia financiera, recibe el ROS) y
  [Superintendencia Financiera de Colombia](https://www.superfinanciera.gov.co/) (supervisor; su portal referencia
  el sistema de administración de riesgo de LA/FT).
- Chile — [Unidad de Análisis Financiero](https://www.uaf.cl/).
- Ecuador — [UAFE](https://www.uafe.gob.ec/).
- Panamá — [Superintendencia de Bancos de Panamá](https://www.superbancos.gob.pa/).

Faltan las cuatro restantes de la operación, y la falta se nombra en vez de rellenarse por analogía: **Guatemala,
México, Paraguay y Perú** no tienen acá una URL oficial comprobada (los intentos del 2026-08-22 fallaron por DNS,
certificado, 403 o redirección). Hasta que se verifiquen, ninguna afirmación sobre la norma, el umbral, el plazo o
la autoridad de esos cuatro países sale de este cargo como verificada.
