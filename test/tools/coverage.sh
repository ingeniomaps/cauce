#!/usr/bin/env bash
set -euo pipefail

# Los pisos van unos puntos debajo de lo real: suficiente para que el trabajo normal no los toque, y
# para absorber el ~0.1 que varía entre corridas. El de ramas es la excepción y va pegado a lo medido,
# porque ahí el margen ya se lo come la varianza entre corridas. Se suben cuando lo real se despega, no
# se bajan cuando algo no llega — quedaron en 45 de ramas mientras lo real rondaba 62, y un piso así no
# protege de nada.
bash test/tools/hooks-smoke.sh
# Al registrar un piso se mide tres veces y se toma el mínimo: una sola corrida deja subir el piso por
# suerte —hay archivos que se mueven varios puntos según cómo caigan los tests en paralelo— y el gate
# queda fallando al azar. Comprobar sí necesita una sola.
corridas=1
[ "${1:-}" = "--update" ] && corridas=3

lcovs=()
limpiar() { rm -f "${lcovs[@]}"; }
# Sólo en la salida sana. Al abortar, esto se llevaba los lcov ya medidos, que son el único material con
# el que se podría reintentar desde donde murió: quien quedaba a mitad tenía que regenerarlos enteros.
trap limpiar 0

for _ in $(seq "$corridas"); do
  lcov=$(mktemp)
  lcovs+=("$lcov")
  # El veredicto de estas corridas no decide: existen para producir el lcov. Con `set -e` gobernándolas
  # como si fueran una puerta, registrar un piso era imposible mientras la puerta de pisos estuviera en
  # rojo —que es justo cuando hace falta, al agregar un archivo—, y el mensaje mandaba a correr el
  # comando que ese mismo rojo impedía completar (caso 144).
  #
  # Lo que sí decide es el contenido. Ignorar el exit a secas dejaría pasar una suite que no arrancó
  # —un error de sintaxis— con un lcov vacío detrás, y un lcov vacío no se distingue de uno sano mirando
  # el código de salida: hay que mirar si trajo algo.
  node --test \
    --experimental-test-coverage \
    --test-coverage-include='engine/**/*.js' \
    --test-coverage-include='automatization/**/*.js' \
    --test-coverage-exclude='**/.ops/**' \
    --test-coverage-lines=88 \
    --test-coverage-functions=92 \
    --test-coverage-branches=62 \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$lcov" \
    "test/**/*.test.js" || true
  if [ ! -s "$lcov" ]; then
    echo "✗ la corrida no dejó cobertura en $lcov: la suite no llegó a arrancar." >&2
    exit 1
  fi
done

# El total de arriba no ve el reparto: un módulo al 100% tapa a uno flojo. Éste pide que ninguno baje.
node test/tools/coverage-files.js "${lcovs[@]}" ${1:+"$1"}
