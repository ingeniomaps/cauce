---
caso: 060
titulo: Una fuente que responde 200 y devuelve una cáscara vacía cuenta como alcanzable
estado: abierto
prioridad: baja
version-detectada: 0.71.0
---

# 060 — Alcanzable no es lo mismo que legible, y el chequeo sólo mira lo primero

**🔴 abierto** · detectado en 0.71.0 · prioridad **baja** — la mitad del problema que el 051 vino a cerrar sigue sin señal

## Resumen

Desde 0.71.0 el ciclo comprueba que las fuentes declaradas de un cargo respondan, y anota las que no. Ese
chequeo mira el **código de respuesta**, así que atrapa un 403 o un 404 y da por buena cualquier página
que conteste 200.

Hay fuentes que contestan 200 y no sirven: una aplicación renderizada por cliente devuelve un esqueleto
—el `<title>` y poco más— y el cargo no puede leer nada de ahí. Para el ciclo son verdes; para quien
investiga son tan inútiles como un 403.

Es exactamente la mitad del síntoma que enumeraba el caso
[051](051-una-fuente-que-el-entorno-no-puede-leer-no-la-detecta-nadie.md) y que su arreglo no cubre.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

# Las dos fuentes de ui-designer que sus informes reportan como ilegibles:
for u in https://developer.apple.com/design/human-interface-guidelines/ https://m3.material.io/; do
  printf '%s → HTTP %s · %s bytes\n' "$u" \
    "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$u")" \
    "$(curl -s -L --max-time 20 "$u" | wc -c)"
done

# Y lo que el chequeo del ciclo dice de ese cargo:
OPS=engine/cli/ops.js AGENT=ui-designer GITHUB_STEP_SUMMARY=/dev/stdout bash -c "$(node -e '
  const { workflowStep } = require("./test/support/environment.js")
  const fs = require("node:fs")
  console.log(workflowStep(fs.readFileSync(".github/workflows/agent-learning.yml", "utf8"),
    "Check declared sources are reachable"))')"
```

## Síntoma

```
| fuentes declaradas | 4 |
```

Ninguna no alcanzable. Y los informes de ese mismo cargo dicen, semana tras semana, que no pudo leer ni
Apple HIG ni Material Design: «el fetch devolvió sólo el título de la página, sin cuerpo (sitio
renderizado por cliente)».

## Causa raíz

`.github/workflows/agent-learning.yml`, paso «Check declared sources are reachable». Clasifica por código:

```sh
case "$code" in
  2*|3*) ;;
  *) rotas="$rotas$url $code"$'\n' ;;
esac
```

No es un descuido: distinguir «trae contenido» de «trae una cáscara» pide decidir cuánto cuerpo es
suficiente, y ese umbral no existe. El chequeo se escribió para lo que sí es objetivo.

## Fix propuesto

Ninguno cerrado, y por eso esto es un caso y no una línea más en el otro. Las vías que se ven:

- **Un piso de bytes**, comparando el cuerpo contra un mínimo. Barato y arbitrario: una página legítima y
  corta daría falso positivo, y una cáscara grande pasaría igual.
- **Buscar la ausencia de texto**, contando palabras fuera de etiquetas. Menos arbitrario y más caro, y
  sigue necesitando un umbral.
- **No resolverlo acá y usar lo que el cargo ya sabe**: el informe declara qué no pudo leer, en prosa. Un
  campo del frontmatter —como `propone`— lo volvería un dato. Depende del modelo, con el modo de fallo
  seguro que ya se usó para `readOk`.

La tercera es la que menos inventa umbrales y la que más se parece a lo que ya funcionó.

## Y una tercera clase, que tampoco se cubre

El chequeo mira **las fuentes declaradas** en `sources.yaml`. Durante la investigación un cargo prueba
además URLs derivadas —`…/whats-new`, un changelog, la página de una release— y si ésas fallan no queda
registro en ningún inventario: no están declaradas, así que nadie las mira después. El `whats-new` de
Apple, que aparece en varios informes como 404, es exactamente ese caso.

No es lo mismo que el problema de arriba y probablemente no se arregla igual: una URL que el cargo probó
por su cuenta es un hecho de esa corrida, no del contrato de fuentes.

## Tradeoffs

- Un umbral mal puesto es peor que no medir: un falso positivo semanal sobre una fuente sana enseña a
  ignorar el aviso, y entonces también se ignora el 403 que sí importa.
- La vía del frontmatter mueve el juicio al modelo, que es lo que el chequeo de alcanzabilidad
  deliberadamente evitó.
- **No medido**: no se sabe cuántas fuentes del catálogo son cáscaras. Se conocen dos, las dos del mismo
  cargo, y las dos ya bajaron de cadencia por otro camino — así que el costo que esto ahorraría hoy es
  cercano a cero.

## Contexto de descubrimiento

Cerrando el caso 051. El chequeo nuevo corrido de verdad sobre `ui-designer` devolvió sus cuatro fuentes
alcanzables, y sus informes dicen lo contrario desde hace semanas. La diferencia entre las dos cosas es
este caso.

## Relacionados

- [051](051-una-fuente-que-el-entorno-no-puede-leer-no-la-detecta-nadie.md) — de donde sale, y que cubre
  la otra mitad: la fuente que directamente no responde.
