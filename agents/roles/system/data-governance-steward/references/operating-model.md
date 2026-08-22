# Modelo operativo de Data Governance

## Contrato de definición canónica

Un término sin este contrato no está definido: está nombrado. La mitad de las disputas por «el número
bueno» se disuelven al completar `Grain`, `Población` y `Momento`, porque ahí se ve que las dos áreas
estaban respondiendo preguntas distintas.

```markdown
Término:
Definición en una frase:
Pregunta que responde:
Grain (una fila es):
Población incluida:
Exclusiones explícitas:
Filtros y condiciones:
Momento (qué fecha manda):
Unidad, moneda y zona horaria:
Fuente autorizada (sistema y campo):
Dueño de negocio (persona o cargo):
Dueño del sistema:
Territorios donde aplica:
Qué NO es (términos vecinos con los que se confunde):
Versión y fecha de decisión:
Evidencia de la decisión:
```

`Qué NO es` no es cortesía editorial: es la línea que evita que el término absorba al vecino en la
próxima consulta. Cada fila vacía se entrega vacía, con quién la cierra.

## Registro mínimo de un dato

```markdown
Dataset o campo:
Dominio:
Dueño de negocio / dueño del sistema:
Clasificación:
Fuente autorizada:
Consumidores conocidos:
Retención y disposición:
Perímetro de acceso:
Linaje verificado hasta:
Estado: gobernado / en propuesta / sin dueño
```

## Diferencial semántico: dos áreas, la misma palabra

Cuando dos números que dicen lo mismo no coinciden, no se compara el número: se comparan las
definiciones, dimensión por dimensión, y la primera diferencia suele explicar todo el delta.

| Dimensión | Definición A | Definición B | ¿Explica el delta? |
|---|---|---|---|
| Grain | | | |
| Población | | | |
| Exclusiones | | | |
| Filtros | | | |
| Momento | | | |
| Unidad / moneda | | | |
| Fuente | | | |
| Corte temporal y reprocesos | | | |
| Territorio | | | |

Salidas posibles, y las tres son legítimas: una definición gana y la otra se deprecia con plazo; las dos
sobreviven con nombres distintos porque responden preguntas distintas; o la decisión queda abierta y
nombrada, con su dueño y qué la desbloquea. Lo que no es legítimo es que ninguna quede escrita.

## Variación por territorio

Una operación multi-país es el caso donde el mismo dato significa cosas distintas sin que nada falle: el
esquema es idéntico, los valores son válidos, y el total agregado es ficción.

Para cada término en alcance, una fila por territorio con: definición local, fuente, dueño local,
obligación que la condiciona y si es comparable con la definición canónica. `Comparable` se afirma con la
evidencia del mapeo, nunca porque el campo se llame igual. Lo no comparable se entrega no comparable: un
total regional que suma definiciones distintas es un número nuevo que nadie definió.

Si los territorios están en sistemas o bases separadas, registrar además que no existe vista agregada y
qué haría falta para tenerla —incluida la decisión de si debe existir—.

## Linaje

Registrar por tramo: origen, destino, transformación, sistema, responsable y cómo se verificó. Un tramo
que se afirma sin haberlo abierto se marca como no verificado; sirve igual, pero no sostiene una
afirmación sobre el número final.

El linaje se lee en dos direcciones y las dos hacen falta: hacia atrás responde de dónde salió este
número, hacia adelante responde a quién rompe cambiar esta definición.

## Acceso: perímetro y justificación

```markdown
Dato o dominio:
Clasificación:
Quién accede (rol o cuenta):
Perímetro (qué subconjunto, por qué le pertenece):
Finalidad declarada:
Quién autoriza:
Revisión (cada cuánto, quién):
Traza de la consulta: sí / no
```

Distinciones que se pierden si no se escriben:

- **Jerarquía no es permiso.** Ser responsable de una cuenta o de un equipo justifica ver su perímetro;
  no habilita el acceso global, aunque el sistema lo implemente con el mismo mecanismo.
- **Visibilidad acotada no es acceso administrativo.** Si se concede con el permiso de administrador
  porque es lo que hay, eso es un hallazgo de diseño, no una equivalencia.
- **Consultar es un acto auditable.** El acceso a datos sensibles o a un log de auditoría deja su propia
  traza; sin eso, el abuso de la herramienta de control no tiene control.
- **Exportar no es consultar.** La consulta acotada y la exportación masiva son decisiones distintas con
  riesgos distintos, y una política que sólo nombra la primera dejó la segunda sin decidir.

## Retención y disposición

```markdown
Categoría de dato:
Plazo:
Qué lo sostiene: obligación (fuente, territorio, fecha) | necesidad operativa (dueño, razón)
Desde qué evento cuenta:
Mecanismo de disposición y su frecuencia:
Alcance en respaldos y réplicas:
Bloqueo por litigio: quién lo pide, sobre qué subconjunto, cómo se levanta
Qué pasa con una solicitud de borrado del titular:
Evidencia de que se ejecuta:
```

Tres confusiones frecuentes y caras:

- **El plazo máximo de una herramienta no es la política de retención.** Si una obligación excede lo que
  el sistema conserva, la brecha existe hoy y necesita un mecanismo fuera del sistema, con dueño.
- **Una obligación de un territorio no se extiende a los demás.** Ni el plazo ni el evento desde el que
  cuenta. Se verifica por territorio o se declara pendiente.
- **Una política que no se puede desactivar y una que nadie ejecutó se ven igual en el documento.** Lo
  que las separa es la evidencia de ejecución.

## Control de calidad

- ¿Cada término en alcance tiene grain, población, momento y unidad, o quedó en etiqueta?
- ¿Cada dato tiene un dueño nombrado, y los que no lo tienen están listados como vacío?
- ¿La definición canónica la decidió su dueño, o la decidió este cargo por defecto?
- ¿Las divergencias entre áreas y entre territorios están escritas con qué las separa?
- ¿El linaje distingue tramo verificado de tramo afirmado?
- ¿Cada acceso tiene perímetro y finalidad, y los accesos sin justificación están listados?
- ¿Cada plazo de retención dice qué lo sostiene, y las obligaciones citan territorio y fuente?
- ¿Hay algo que se esté afirmando como cumplimiento, certificación o aprobación de acceso?
- ¿Las decisiones pendientes dicen quién las toma y qué evidencia necesitan?

## Fundamento externo

Fuentes revisadas y abiertas en agosto de 2026; el detalle de qué se pudo verificar y qué no vive en
[../learning/sources.yaml](../learning/sources.yaml).

- [ISO/IEC 38505-1](https://webstore.iec.ch/en/publication/60383): gobierno del dato como aplicación del
  modelo de ISO/IEC 38500, con el eje valor / riesgo / restricción sobre el ciclo de vida. **Verificado**
  en la ficha del IEC Webstore: edición 1.0 de 2017-03-31, retirada el 2026-08-20 y reemplazada por
  ISO/IEC 38505-1:2026, cuya ficha no se pudo abrir. El texto de la norma no se leyó: `iso.org` devuelve
  403. Citarla exige nombrar la edición.
- [ISO/IEC 11179-1:2023](https://webstore.iec.ch/en/publication/81976): marco de registros de metadatos —
  cómo se identifica, nombra y versiona una definición para que dos sistemas se refieran a la misma cosa.
  **Verificado** en la ficha: edición 4.0 de 2023-01-16; el texto no se leyó.
- [DAMA-DMBOK](https://www.dama.org/cpages/body-of-knowledge): áreas de conocimiento de gestión de datos —
  gobierno, metadata, calidad, seguridad—. **Verificado** que la página presenta la 2.ª edición y anuncia
  un proyecto DMBOK 3.0 iniciado en 2025; el cuerpo del libro no se leyó.
- [EDM Council DCAM](https://edmcouncil.org/frameworks/dcam/): modelo de evaluación de capacidad de
  gestión de datos, con puntaje por compromiso, proceso y evidencia — útil para medir madurez sin
  confundirla con cumplimiento. **Verificado** que la página declara DCAM v3; el contenido del marco está
  tras registro y no se abrió.
- [EDM Council CDMC](https://edmcouncil.org/frameworks/cdmc/): controles de gestión de datos en nube,
  incluidos propiedad, soberanía, derechos de acceso y retención. **Verificado** que la página declara
  v1.1 (2021); el documento está tras registro y no se abrió.
- [W3C DCAT 3](https://www.w3.org/TR/vocab-dcat-3/): vocabulario para describir datasets y catálogos de
  forma interoperable. **Verificado**: Recomendación W3C del 2024-08-22.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/): ontología de procedencia —entidad, actividad, agente—, base
  para expresar linaje de forma comprobable. **Verificado**: Recomendación W3C del 2013-04-30.
- [OpenLineage](https://openlineage.io/docs/spec/object-model): modelo de objetos de linaje —job, run,
  dataset, facets— y sus eventos. **Verificado** leyendo la especificación; la versión del esquema no
  consta en esa página.

Ninguna de estas fuentes fija el plazo de retención ni la obligación de un territorio concreto. Eso se
verifica contra la norma de esa jurisdicción, con Legal o Privacy, y hasta entonces queda pendiente.
