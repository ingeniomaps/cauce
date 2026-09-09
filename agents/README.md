# El catálogo de cargos

Un cargo es un contrato: su `SKILL.md` declara cuándo actuar, qué decide, qué no le corresponde y cuál
es su entrega mínima; sus métodos viven en `references/`. Para ver la lista con una línea por cargo:

```bash
node tools/ops.js agents list
```

Un slug es único entre todas las categorías. Si dos contienen el mismo, el CLI falla por ambigüedad en
lugar de elegir uno en silencio.

## Dónde vive cada cosa

Los cargos que trae Cauce **no se copian al proyecto**: se resuelven desde la dependencia. Evolucionan
como profesión, y esa evolución es la misma para todas las empresas: investigarla una vez y bien es
mejor que repetirla en cada instalación.

| Qué | Dónde | Quién lo mantiene |
|---|---|---|
| El cargo como profesión | el paquete | el toolkit, con `learn` en **su** repositorio |
| Lo que el cargo debe saber de tu empresa | `organization/roles/<slug>.md` | la empresa |
| Un cargo propio, o una versión propia de uno del catálogo | `agents/roles/<slug>/` | la empresa |

Por eso `learn` falla si lo corrés sobre un cargo del catálogo dentro de una instancia: escribiría en el
paquete y se perdería. El ciclo de aprendizaje de esos cargos tampoco se distribuye.

## Las URLs que un cargo cita

Un cargo cita URLs en dos lugares y los dos se comprueban cada semana: `sources.yaml`, que es lo que
investiga, y `references/` más `SKILL.md`, que es el método que sigue. Las de `evaluations/` **no** —los
casos adversariales inventan dominios a propósito—, y las de `learning/reports` tampoco, porque son
evidencia fechada de lo que una corrida encontró.

Cuando una responde 403, casi nunca está muerta. Tres cosas que conviene probar antes de darla por
perdida, todas encontradas midiendo el catálogo:

- **El documento en vez de la página.** Cloudflare protege el HTML y no el PDF: `acm.org/code-of-ethics`
  bloquea y `acm.org/binaries/.../acm-code-of-ethics-booklet.pdf` no; lo mismo con los instrumentos de la
  OCDE, que se leen enteros bajo `legalinstruments.oecd.org/public/doc/<n>/<n>.en.pdf`.
- **Otro sitio del mismo organismo.** `oecd.org/en/topics/ai-principles.html` bloquea y `oecd.ai` no;
  `projectdelivery.gov.uk` bloquea y la misma norma está publicada en `gov.uk`.
- **La forma publicada del dato.** El catálogo KEV de CISA bloquea en HTML y su feed JSON, que la propia
  CISA distribuye, no.

Si aun así no hay ninguna que responda —`pmi.org`, `fatf-gafi.org`—, la fuente **se queda en
`sources.yaml`**, porque sigue siendo lo que la profesión publica y el chequeo semanal tiene algo que
decir sobre ella; lo que sale es el enlace en `references/`, donde un 403 sólo le hace perder un clic a
quien lee. El nombre se conserva.

### Lo que no se pudo abrir va en `pending:`, no en un comentario

Una fuente que el cargo necesita y no pudo verificar no es una fuente: `require_primary_source` exige
una ficha comprobada, no un número de norma. Pero tampoco es nada, y hasta 0.72.0 terminaba en un
comentario del propio archivo — cinco cargos lo escribían así, y uno dejó un «registrar cuando exista
una ficha legible» que nadie iba a revisar.

```yaml
pending:
  - name: IEEE 1028 Software Reviews and Audits
    url: https://standards.ieee.org/ieee/1028/4266/
    why: responde 200 pero la ficha se arma con JavaScript y sirve el título genérico del sitio
    since: 2026-08-22
  - name: ISO IEC IEEE 24765 vocabulario de ingeniería de software
    why: falta una URL primaria que responda
    since: 2026-08-22
```

`url` es opcional, y ésa es la mitad del punto: muchas están pendientes **porque no hay ninguna URL que
responda**, y exigirla dejaría fuera justo las que más cuestan. `why` y `since` no lo son — sin la razón
la lista es un cementerio de enlaces, y sin la fecha no se ve que una lleva meses ahí.

El chequeo semanal las prueba y reporta **sólo la que volvió a servir el documento**: «ya se puede
declarar». Una que sigue sin abrir es lo esperado y no se anuncia, porque un aviso que sale siempre es
el que enseña a ignorar el resto. Y no alcanza con que el host conteste: se pide además que la página
traiga la marca del documento —el primer número del nombre—, porque un sitio grande devuelve cientos de
palabras de navegación sin una línea de la norma. Eso pasó con la ficha de IEEE 1028 en la primera
corrida de este chequeo.

## Por qué las normas no se citan en `iso.org`

`sources.yaml` cita cada norma por una ficha de catálogo, y para ISO esa ficha **no es la de
`iso.org`**: ese dominio devuelve 403 a todo el catálogo —31 URLs, ninguna legible— y una fuente que no
se puede abrir produce el mismo informe «sin novedades» que una que no cambió. Las dos que sí responden:

- **`webstore.iec.ch/en/publication/<n>`** para una ISO/IEC, que los dos organismos co-publican.
- **`committee.iso.org/standard/<n>.html`** para una ISO sola. Es el mismo número de catálogo que
  llevaba la URL vieja, servido por un host que no bloquea.

La diferencia entre las dos importa al escribir una entrada nueva: el número del IEC Webstore es
**suyo** y nombra una edición concreta —buscar «ISO/IEC 25010» ahí devuelve primero la ficha de 2011,
no la de 2023—, así que se comprueba contra el `<title>` de la ficha antes de anotarla. El de
`committee.iso.org` es el mismo de ISO y no hay edición que equivocar.

## Quedarse con una versión propia

```bash
node tools/ops.js agents fork product-manager
```

Copia el cargo entero a `agents/roles/<slug>/` y desde ahí lo mantenés vos: `learn`, `evaluate` y el
puntero que instala el runner pasan a resolver contra tu copia. **Copiarlo a mano no es equivalente**
—se agarra el `SKILL.md`, que es lo que se ve, y quedan atrás los casos, las fuentes y el modelo
operativo: el cargo responde igual y ya no se puede evaluar—.

Lo que no viaja son los informes de aprendizaje, las propuestas y los veredictos de evaluación. Un
veredicto pertenece al contrato que lo ganó, y el fork nace para dejar de ser ese contrato.

Tu copia deja de recibir las mejoras del catálogo, pero no en silencio: `check` y `upgrade` avisan
cuando el original cambia río arriba. Editar tu propia copia no dispara nada — se compara contra lo que
el catálogo tenía el día del fork, no contra lo que escribiste después.

## Evaluar un cargo

`evaluate <slug>` corre los casos adversariales del cargo contra su contrato. Lo que se evalúa desde una
empresa tiene que ser un cargo suyo —propio o adoptado—, y su instancia ya es el lugar donde trabajar.

### Un caso en rojo dice algo, y casi nunca que el cargo esté roto

Los casos vienen con el catálogo; los veredictos, no. El primero que corras es tuyo, y va a decirte una
de tres cosas — separarlas es lo que evita arreglar lo que no estaba mal.

**El cargo no cumplió lo que su contrato ya pedía.** Es el caso más común y no pide cambiar nada: se
vuelve a correr. En el catálogo, dos cargos que arrastraban un rojo lo cerraron así, sin tocarles una
línea. Se reconoce porque el veredicto nombra un comportamiento que el contrato enumera y dice que no se
observó.

**El contrato tiene un hueco.** El veredicto lo dice con todas las letras: registra que ninguna conducta
enumerada cubre lo que ahí falló. Eso sí pide un cambio, y el camino es la propuesta mensual del cargo —
no editar `expected-behaviors.yaml` a mano, porque un contrato que cambia sin veredicto que lo respalde
deja de poder medirse.

**Fue varianza.** Existe y no es raro: un mismo caso puede pasar dos veces y fallar la tercera sin que
nada cambie. Por eso un rojo aislado no autoriza a concluir; y por eso repetir la corrida esperando otro
número no es medir. Lo que distingue una varianza de un defecto es que el defecto se repite **por la
misma razón**, no que se repita el rojo.

Hay un cuarto que no es ninguno de los tres y sólo le pasa a un caso recién escrito: **el rojo de su
primera corrida no lo calibra**. Prueba que el caso puede fallar, no que falle por lo que dice medir —
es la misma distinción que R9 hace para una prueba, aplicada al caso. Lo que lo calibra es una corrida
donde se rompa a propósito la conducta que el caso cuida, con el contrato puesto, y verlo ponerse rojo
**por eso**. Hasta entonces su veredicto no sostiene una conclusión sobre el cargo.

Lo que un rojo nunca significa es que el paquete venga fallado. El cargo es un contrato y el caso es la
medición: que la medición encuentre algo es para lo que existe, y un cargo con un caso en rojo se sigue
usando mientras se sepa por qué.
