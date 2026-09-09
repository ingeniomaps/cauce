---
caso: 064
titulo: Las URLs que un cargo cita en `references/` no las comprueba nadie, y el chequeo miente en las dos direcciones
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.71.0
---

# 064 — Un tercio del catálogo de URLs vivía fuera de todo chequeo

**🟢 resuelto en 0.71.0** · detectado en 0.71.0 · prioridad **media** — 207 URLs sin vigilancia, 29 de
ellas inservibles, y un chequeo que reportaba rotas páginas sanas

## Resumen

Desde 0.71.0 el ciclo comprueba que las fuentes de un cargo respondan, y mira **sólo `sources.yaml`**.
Un cargo cita URLs en otro lado: `references/`, que es el método que sigue para trabajar, y `SKILL.md`.
Son **207 URLs** —casi tantas como las 299 declaradas como fuentes— y **29 no servían**, entre ellas dos
404 de páginas que se habían movido hacía meses.

Y el chequeo se equivocaba además en las dos direcciones sobre lo que sí miraba:

- **Reportaba rotas páginas sanas.** Se identifica como `cauce-learning/1.0`, y el cargo no lee con este
  `curl` sino con la herramienta de fetch del modelo. Las tres páginas de `ftc.gov` del catálogo dan 403
  a ese UA y **200 con 1623–7133 palabras** a uno de navegador.
- **Daba por muerto lo que sólo era lento.** El tope de 20 segundos no alcanza para un PDF grande: el
  instrumento de la OCDE que cita `sales-representative` son 57 mil palabras y llega pasados los treinta.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

# Las URLs que el catálogo cita fuera de sources.yaml, y cuáles responden:
node -e '
const fs = require("fs")
const { documentUrls } = require("./engine/agents/learning-sources.js")
for (const slug of fs.readdirSync("agents/roles/system")) {
  for (const one of documentUrls(`agents/roles/system/${slug}`)) console.log(one.url)
}' | sort -u | while read -r u; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 \
    -A 'cauce-learning/1.0 (+https://github.com/ingeniomaps/cauce)' "$u")" "$u"
done

# Y el mismo UA contra uno de navegador, sobre una que el catálogo daba por rota:
for ua in 'cauce-learning/1.0' 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0'; do
  printf '%s → %s\n' "$ua" "$(curl -s -o /dev/null -w '%{http_code}' -L -A "$ua" \
    https://www.ftc.gov/business-guidance/advertising-marketing)"
done
```

## Síntoma

```
cauce-learning/1.0   → 403
Mozilla/5.0 …        → 200
```

Y del lado de `references/`, ningún resumen de ningún job dice nada: el paso cuenta «fuentes declaradas»
y esas 207 URLs no son fuentes declaradas.

## Causa raíz

`.github/workflows/agent-learning.yml`, paso «Check declared sources are reachable». Leía un archivo:

```sh
urls="$(node -e '… sourceUrls(fs.readFileSync(file, "utf8")) …' "$dir/learning/sources.yaml")"
```

No es un descuido del paso sino de su alcance: nació con el caso 051 para cerrar la confusión entre «una
fuente no cambió» y «no se pudo leer», y esa confusión vive en `sources.yaml`. Que el método del cargo
también cite URLs, y que ésas no las mire nadie, es lo que no se vio.

El UA es otra cosa: es una afirmación equivocada sobre el mecanismo. El paso mide con un cliente y el
cargo lee con otro, así que su 403 nunca predijo lo que el cargo iba a poder abrir.

## Fix propuesto

- Leer también `references/**` y `SKILL.md`, y **no** `evaluations/`: los casos adversariales inventan
  dominios a propósito —veintiuna URLs bajo `.example` y marcas que no existen— y comprobarlas reportaría
  rotas las que están bien escritas.
- Reintentar una sola vez lo que falla, con UA de navegador y más tiempo, y decir cuántas lo necesitaron.
- Y arreglar las que ya están rotas, que es lo que un aviso no hace solo.

## Tradeoffs

- **Reintentar como navegador es presentarse distinto de lo que somos.** Se intenta primero
  identificándose, que es lo correcto y lo que la mayoría acepta; el segundo intento existe porque el
  dato que interesa es «¿va a poder leerla el cargo?», y el cargo lee como un navegador.
- **Contar el segundo intento cuesta una línea y evita que el arreglo tape el hecho.** Un dominio que
  empieza a rechazarnos se vería igual que uno que nunca lo hizo.
- **El aviso se vuelve más ruidoso antes de volverse más útil**: pasa a cubrir 506 URLs en vez de 299.
  Eso es lo que obliga a arreglar las rotas en el mismo cambio y no sólo a mirarlas.
- **Sigue sin cubrirse lo que un cargo prueba y nadie declaró** —la tercera clase que enumeró el 060—:
  una URL derivada que un informe reporta en 404 no está en ningún inventario.

## Contexto de descubrimiento

Cerrando el 063. Al arreglar las 40 URLs de `iso.org` que vivían en `references/` quedó a la vista que
ahí el 403 es peor que en `sources.yaml`, porque nada lo comprueba.

## Relacionados

- [063](063-el-catalogo-cita-las-normas-en-un-dominio-que-lo-bloquea.md) — de donde sale.
- [051](051-una-fuente-que-el-entorno-no-puede-leer-no-la-detecta-nadie.md) — el chequeo que se amplía.
- [060](060-una-fuente-que-responde-200-y-no-trae-nada-legible.md) — el umbral de 50 palabras que se reusa.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró:

- **El chequeo lee `references/**` y `SKILL.md`, y no `evaluations/`.** El lector vive en el motor
  —`documentUrls`— y no en un `grep` del workflow, por la misma razón por la que `sourceUrls` ya vivía
  ahí: dos lectores del mismo catálogo se pudren por separado. Pasó de comprobar 299 URLs a **400** por
  cargo.
- **La exclusión de `evaluations/` se probó por ausencia.** Es lo único que la comprueba: que las de
  `references/` aparezcan no dice nada sobre si además se coló una de las que un caso inventa. Sin ella
  el paso reportaría rotas veintiuna URLs que están **bien** escritas.
- **El reintento se hizo, y cubre las dos formas de falsear que la medición encontró**, no sólo el UA
  que el enunciado nombraba. La segunda —veinte segundos contra un PDF de 57 mil palabras— apareció
  buscando reemplazo para una fuente de la OCDE, y sin ella el arreglo habría dejado un falso positivo
  nuevo donde quitaba tres.
- **El resumen dice cuántas necesitaron el segundo intento**, aunque terminen sanas: en la corrida sobre
  el catálogo entero son **5**. Sin esa línea, un dominio que empieza a rechazarnos se ve igual que uno
  que nunca lo hizo.
- **El aviso nombra el archivo.** No estaba en el enunciado y decide quién arregla: en `sources.yaml` lo
  toma el ciclo de aprendizaje del cargo, y en `references/` es una edición del método.
- **Las rotas se arreglaron, que es lo que un aviso no hace solo.** 23 reemplazos, cada uno comprobado
  contra su respuesta y su contenido. Las dos 404 tenían destino nuevo —la ICC movió su código, gov.uk
  reemplazó el marco de ética por la guía de aseguramiento—; el resto salió de tres patrones que conviene
  probar antes de dar una URL por muerta, y que quedaron escritos en `agents/README.md`: el PDF donde el
  HTML tiene Cloudflare, otro sitio del mismo organismo, y la forma publicada del dato.
- **Las cuatro sin alternativa —`pmi.org`, `fatf-gafi.org`, `oecd.org/strategic-foresight`,
  `queue.acm.org`— se quedan como fuente y pierden el enlace en `references/`, conservando el nombre.**
  Retirarlas del todo perdería normas centrales de esas profesiones porque nuestro cliente no las lee; un
  403 en el método, en cambio, sólo le hace perder un clic a quien lee.
- **Tradeoff «presentarse distinto de lo que somos» — se paga, acotado.** El primer intento se identifica
  siempre; el segundo sólo ocurre sobre lo que ya falló, y queda contado.
- **Tradeoff «el aviso se vuelve más ruidoso» — se pagó por adelantado.** Por eso las rotas entraron en
  este mismo cambio: sin eso el chequeo nuevo habría estrenado con 29 avisos que nadie iba a mirar.
- **Tradeoff «lo que un cargo prueba y nadie declaró» — sigue sin cubrirse**, igual que en el 060. El
  chequeo mira lo que el catálogo escribe; una URL derivada que un informe reporta en 404 no está en
  ningún inventario.

**Lo que apareció y el enunciado no preveía: la puerta encontró una URL muerta que llevaba meses.**
`growth-marketer` citaba el código de la ICC en una URL 404 mientras `product-marketing-manager` y
`sales-representative` ya tenían la viva — bajo otro nombre, que es por lo que «una URL, un nombre» no la
veía. Al converger, la puerta falló y hubo que unificar los tres nombres.

**Probado con el paso ejecutado de verdad sobre los 53 cargos**, con el árbol quieto:

```
comprobadas 400 · sin contenido legible 27 · segundo intento 5
```

Antes: 299 comprobadas y 207 sin mirar, con 29 inservibles entre esas 207. Después no queda **ninguna
404 ni ninguna página movida** en todo el catálogo. Las 27 que siguen son las clases que el 060 ya había
separado y decidido no reemplazar —seis `202` de eur-lex, doce cáscaras renderizadas por cliente— más las
cuatro que bloquean sin alternativa y tres de infraestructura de un regulador (`502` y DNS intermitente),
esta última ya documentada por el propio cargo en un comentario.

Tres mutaciones comprobadas, una por conducta nueva: quitar el reintento, dejar de leer `references/`, y
hacer que el lector entre en `evaluations/`. Las tres ponen la prueba en rojo.

**Una medición se descartó por R22.** La primera pasada sobre los 53 cargos arrancó antes de que los
reemplazos estuvieran aplicados y se siguió editando el catálogo mientras corría, así que midió dos
versiones. Se cortó y se rehizo entera con el árbol quieto; los números de arriba son los de la segunda.
