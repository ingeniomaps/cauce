---
caso: 063
titulo: Las 31 URLs de `www.iso.org` del catálogo devuelven 403 y ninguna norma se puede leer
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.71.0
---

# 063 — Un tercio de las fuentes rotas del catálogo eran un solo dominio

**🟢 resuelto en 0.71.0** · detectado en 0.71.0 · prioridad **media** — 41 entradas de 22 cargos citaban
normas en un dominio que no le responde al ciclo

## Resumen

El catálogo cita 31 URLs distintas de `www.iso.org` y **ninguna responde**: el dominio devuelve 403 a
este entorno. Son 41 entradas repartidas en 22 cargos, y para cada una el ciclo semanal produce el mismo
informe «sin novedades» que produciría una norma que no cambió — que es exactamente la confusión que el
caso [051](051-una-fuente-que-el-entorno-no-puede-leer-no-la-detecta-nadie.md) vino a cerrar.

Lo dejó a la vista la medición del [060](060-una-fuente-que-responde-200-y-no-trae-nada-legible.md):
de las 63 fuentes inservibles del catálogo, 47 daban 403 y **31 de ellas eran de `iso.org`**. El cierre
de ese caso lo dejó anotado como decisión abierta porque un umbral de palabras no arregla un 403.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

node -e '
const fs = require("fs"), path = require("path")
const { sourceUrls } = require("./engine/agents/learning-sources.js")
const base = "agents/roles/system"
const urls = new Set()
for (const slug of fs.readdirSync(base)) {
  const file = path.join(base, slug, "learning/sources.yaml")
  if (!fs.existsSync(file)) continue
  for (const one of sourceUrls(fs.readFileSync(file, "utf8"))) {
    if (/iso\.org/.test(one.url)) urls.add(one.url)
  }
}
console.log([...urls].join("\n"))' | while read -r u; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 \
    -A 'cauce-learning/1.0 (+https://github.com/ingeniomaps/cauce)' "$u")" "$u"
done
```

## Síntoma

```
403  https://www.iso.org/standard/78176.html      (ISO/IEC 25010, qa-engineer y solutions-engineer)
403  https://www.iso.org/standard/65694.html      (ISO 31000, technical-program-manager)
403  https://www.iso.org/iso-31000-risk-management.html   (la misma norma, financial-controller)
…
200  https://committee.iso.org/sites/tc258/home/projects/published/iso-21502.html
```

Treinta y una de 403, y la única de 200 del catálogo **no es de `www.iso.org`**. Esa fila es la pista:
el problema es el host, no ISO.

## Causa raíz

Ninguna, en el sentido de que no hay código que arreglar. `sources.yaml` declara la URL que quien
escribió la entrada tenía a mano, y hasta 0.71.0 nada comprobaba que respondiera: el chequeo de
alcanzabilidad que lo destapa nació en esta misma versión, con el 051.

Lo que sí es causa raíz de que durara tanto es que **una fuente ilegible y una sin novedades producen
el mismo informe**, así que veintidós cargos venían reportando lo mismo semana tras semana sin que la
señal existiera.

## Fix propuesto

Cambiar el host, no la norma. Cada una tiene otra ficha de catálogo que sí responde, y son dos según
quién publique:

- **ISO/IEC** —co-publicada por los dos organismos— tiene ficha en `webstore.iec.ch/en/publication/<n>`.
  Son 13 URLs viejas —12 fichas, porque 42001 estaba escrita de dos formas— en 21 entradas. El
  catálogo ya citaba cuatro fuentes así, de `data-governance-steward` y de otros: la convención existía
  y nadie la había llevado al resto.
- **ISO sola** tiene la misma ficha en `committee.iso.org/standard/<n>.html`, **con el mismo número de
  catálogo** que llevaba la URL vieja. Son 18 URLs viejas —17 fichas, porque ISO 31000 estaba escrita
  de dos formas— en 20 entradas.

## Tradeoffs

- **El número del IEC Webstore es suyo, no de ISO, y nombra una edición concreta.** Ahí está el riesgo
  caro: buscar «ISO/IEC 25010» devuelve primero `publication/11245`, que es la edición **2011**, y la
  vigente es `publication/90024`, de **2023**. Una migración automática habría metido ediciones de hace
  una década que responden 200 con contenido — peor que un 403, porque el chequeo las llama sanas.
- `committee.iso.org` no tiene ese riesgo: el número es el mismo de ISO y no hay nada que resolver.
- Se depende de dos hosts en vez de uno. No es una pérdida: hoy se depende de uno que no responde.
- **No se sabe por qué `iso.org` bloquea ni si dejará de hacerlo.** Si volviera a responder, esto no
  habría que revertirlo — las fichas nuevas son las mismas normas y se leen igual.

## Contexto de descubrimiento

Cerrando el 060. Su medición de las 255 fuentes del catálogo dejó el número a la vista y su cierre lo
declaró explícitamente fuera de alcance: «eso no lo cierra un umbral».

## Relacionados

- [060](060-una-fuente-que-responde-200-y-no-trae-nada-legible.md) — lo midió y lo dejó abierto.
- [051](051-una-fuente-que-el-entorno-no-puede-leer-no-la-detecta-nadie.md) — el chequeo que lo destapa.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró:

- **Las 13 ISO/IEC se cambiaron por su ficha del IEC Webstore, verificando la edición de cada una.** No
  se buscó por número: de cada ficha se leyó el `<title>`, que nombra norma y edición, y se cruzó contra
  lo que el cargo declara. Las doce fichas —42001 y su alias caen en la misma— son `25012:2008`,
  `42001:2023`, `27017:2015`, `27017:2026`, `42005:2025`, `20000-1:2018`, `42010:2022`, `23894:2023`,
  `25010:2023`, `27040:2024`, `25059:2023` y `40500:2025`.
- **La enumeración se quedó corta y se amplió: eran 32 URLs, no 13.** El enunciado sólo cubría las
  ISO/IEC porque las otras 19 «no tenían alternativa». La tenían, y apareció mirando la única fila de
  200 del síntoma: `committee.iso.org` sirve el mismo registro con el mismo número. Cerrar sólo las 13
  habría dejado 18 cargos con fuentes ilegibles y un caso nuevo esperando.
- **La edición pasó al nombre de las 19 entradas ISO/IEC que no la tenían** —`ISO IEC 25010 product
  quality model` → `ISO IEC 25010:2023 …`—. La ficha del webstore es de una edición concreta, así que
  sin el año nada dice si la que se cita hoy es la que se citó al escribirla. Las de
  `committee.iso.org` **no** se renombraron: el número no cambió, y renombrar por prolijidad habría
  tocado veinte entradas sin arreglar nada.
- **Tres entradas no venían escritas como `/standard/<n>.html` y hubo que resolverlas.**
  `iso.org/standard/30414` es un alias que resuelve a la edición **2025** —no a `69338`, que es la de
  2018— y el nombre que el cargo declara, «human capital reporting and disclosure», es el título de la
  de 2025: quedó en `86106`. `iso-31000-risk-management.html` es la landing de ISO 31000, que es
  `65694`. Y la de ISO 21503 traía un `%20` incrustado en la ruta, que es `82868`.
- **`cloud-architect` declaraba «ISO IEC 27017 edition 2 status», y la edición 2 se publicó el
  2026-07-27.** El nombre habría quedado mintiendo con la URL nueva, así que pasó a
  `ISO IEC 27017:2026 cloud security controls`. Su `references/operating-model.md` decía además «no
  tratarla como publicada hasta que ISO lo confirme» y «será sustituida por la edición 2, actualmente
  bajo publicación»: las dos quedaron falsas y se corrigieron con la fecha que declara la ficha. Lo que
  **no** se decidió acá: ese cargo ahora declara las dos ediciones, y la de 2015 quedó reemplazada.
  Retirarla es una decisión de su propio ciclo de aprendizaje, no de este caso; queda dicho para que se vea.

- **La quita tenía un dependiente que la enumeración no preveía, y estaba en otro archivo.** Los
  `references/operating-model.md` de 22 cargos enlazaban las mismas normas a las mismas URLs muertas —40
  enlaces—, y ahí el 403 es peor que en `sources.yaml`: nada los comprueba, porque el chequeo del ciclo
  mira lo declarado en las fuentes. Se cambiaron con el mismo mapeo y se comprobaron los 31 enlaces
  resultantes, todos 200. La etiqueta de cada uno ya nombraba la edición y coincide con la ficha.

- **Los informes, propuestas y veredictos **no** se tocaron, y es deliberado.** Citan las mismas URLs, y
  varios dicen literalmente «HTTP 403, no leída, intentado el 2026-08-31». Eso es evidencia fechada de lo
  que esa corrida encontró: reescribirla la falsificaría. Un lector que las abra hoy y las vea responder
  está viendo este cambio, no un error de aquel informe.
- **Dos cargos citaban ISO 31000 por dos URLs distintas y la puerta no lo veía.** Al converger en una
  sola ficha, «una URL, un nombre» empezó a aplicar y hubo que unificar: `ISO 31000` de
  `financial-controller` pasó a `ISO 31000 risk management`. Es un hallazgo del cambio, no del enunciado.
- **Tradeoff «se depende de dos hosts en vez de uno» — se paga y no es una pérdida.** Antes se dependía
  de uno que no responde; ahora de dos que sí, y el chequeo semanal mide los dos igual. Lo que lo
  reabriría es que uno de ellos empiece a bloquear: ahí el aviso lo dice y la ficha alternativa existe.

- **La razón se escribió una sola vez**, en `agents/README.md`, y los tres comentarios de
  `qa-engineer` que la repetían se recortaron: decían «iso.org devuelve 403, lo legible es esta ficha» y
  nombraban la URL que ahora está en la línea de abajo. Lo que esos comentarios sí aportaban —que es
  ficha de catálogo y no el texto de la norma, la ambigüedad de «ISO/IEC 40500» a secas, el DIS de
  25059 que circula en catálogos de revendedores— quedó.

**Probado con el paso del ciclo ejecutado de verdad**, no con el mapeo en un papel: se corrió «Check
declared sources are reachable» sobre los 22 cargos tocados, con el `User-Agent` del workflow.

```
qa-engineer      declaradas 14 · sin contenido legible 0    (antes: 3 en 403)
cloud-architect  declaradas  6 · sin contenido legible 0    (antes: 2 en 403)
machine-learning-engineer  declaradas 7 · 0                 (antes: 3 en 403)
…
```

Ninguna fuente ISO queda sin contenido legible en ninguno de los 22. Lo que sigue apareciendo es de
otros dominios y ya está registrado en el 060: cuatro de `oecd.org` en 403, `pmi.org` en 403, un
`eur-lex` en 202 y dos cáscaras.

Cada URL nueva se comprobó una por una con el `User-Agent` del ciclo —no con el de un navegador, que es
donde esto se podría haber caído sin avisar—: las 12 del IEC Webstore entre 659 y 874 palabras legibles,
las 17 de `committee.iso.org` entre 750 y 1587. Todas por encima del umbral de 50 que fijó el 060.

**Lo que este caso no cierra.** `www.iso.org` sigue devolviendo 403 y no se estableció por qué; si
mañana respondiera, nada de esto habría que revertirlo. Y el chequeo del ciclo mira `sources.yaml` y no
los `references/`, así que la próxima URL muerta que se escriba ahí va a durar lo mismo que duraron
éstas — es la misma clase de hueco que el 060 dejó anotada para las URLs que un cargo prueba y nadie
declaró, y sigue sin dónde anotarse.

**La prueba es de ausencia**, que es la que R9 pide para una quita: `test/agents/sources.test.js`
comprueba que ninguna fuente del catálogo se cite en `www.iso.org`. Comprobar que las 41 apuntan a otro
host no comprueba que ninguna vuelva. Vista en rojo antes del arreglo, con dos cargos revertidos.
