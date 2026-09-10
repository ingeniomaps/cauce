---
caso: 085
titulo: El sufijo aleatorio del nombre de un banco decide si una prueba de la suite pasa
estado: resuelto
prioridad: media
version-detectada: 0.77.0
---

# 085 — Un error ajeno entró a una prueba porque el nombre del banco terminaba en «adr»

**🟢 resuelto en 0.78.0** · detectado en 0.77.0 · prioridad **media** — falla una vez cada muchas
corridas, y como se lee igual que un hipo del entorno, la respuesta natural es relanzar

## Resumen

`npm run ci` falló una vez con esto, y las cuatro corridas siguientes pasaron:

```
✖ una copia de la plantilla de ADR se valida tal cual
  actual: [ "/tmp/cauce-test-3343382-w1cadr/cauce-plantilla-adr-8Zes27/integrations/config.json:
             JSON inválido o ausente (ENOENT: no such file or directory, open '…')" ]
  expected: []
```

La prueba mide plantillas de ADR y el error es de `integrations`. No tienen nada que ver.

## Reproducción

No se puede provocar a voluntad —depende de seis caracteres al azar— pero el mecanismo sí se comprueba
entero, y en dos mitades.

**La mitad determinista**: en un banco que sólo copia `template/planning`, `check` reporta **siempre**
ese error, porque el banco no es una instancia completa.

```
$ node -e '…tempRoot("cauce-forma-"); cpSync(template/planning); check --json…'
[ "/tmp/cauce-test-3446920-rQdTPX/cauce-forma-xwdtUb/integrations/config.json: JSON inválido o ausente …" ]
```

**La mitad azarosa**: la prueba se queda con lo suyo filtrando por substring, y el filtro corre sobre la
cadena entera, que empieza con la ruta absoluta del banco.

```
$ node -e 'console.log(/adr\//.test("/tmp/cauce-test-3343382-w1cadr/cauce-plantilla-adr-8Zes27/integrations/config.json"))'
true
$ node -e 'console.log("…-w1cadr/…".match(/.{0,14}adr\//)[0])'
st-3343382-w1cadr/
```

El sufijo aleatorio del directorio **padre** terminó en `adr`, y `w1cadr/` casó `adr/`.

## Síntoma

Un rojo en un test que no tiene relación con lo que falló, con un mensaje que nombra un archivo que la
prueba nunca miró. Lo caro no es el rojo: es que **relanzar lo arregla**, así que la conclusión natural
es «fue un hipo» y el defecto queda. Es el mismo modo de fallo que el 083 en otra capa — un mecanismo
determinista escondido detrás de una intermitencia que viene de otro lado.

Y no es un caso aislado: la suite tiene **24 filtros** sobre la salida de `check`, y cuatro de ellos usan
un patrón corto y en minúsculas que un sufijo de seis caracteres puede contener —`adr`, `alta`, `cast`,
`deps`—.

## Causa raíz

`tempRoot` armaba el banco con `mkdtemp`, que agrega seis caracteres al azar. **Esa aleatoriedad no le
servía a nadie**: `ROOT` ya es único por proceso —`cauce-test-<pid>-…`—, así que dentro de él alcanza
cualquier cosa que no se repita.

Lo que sí hacía era meter texto que nadie eligió en una cadena sobre la que la suite decide.

## Fix

El nombre del banco es el que pidió la prueba más un contador, y nada más. Un banco pasa a llamarse
`cauce-plantilla-adr-3` en vez de `cauce-plantilla-adr-8Zes27`, y el padre `cauce-test-<pid>-…` deja de
traer seis caracteres que pueden ser cualquier cosa.

## Tradeoffs

- **No cierra el caso en que la prueba elige el nombre que colisiona.** Un banco llamado
  `cauce-alta-algo` filtrado por `/alta/` sigue dejando pasar lo ajeno. La diferencia es que eso es
  determinista y está a la vista de quien lo escribe, en vez de aparecer un martes.
- `mkdtemp` garantiza unicidad atómica; el contador con `mkdirSync` no recursivo también, y falla ruidoso
  si alguna vez no la tuviera.

## Contexto de descubrimiento

Apareció en una corrida de `npm run ci` mientras se cerraba el caso 084. Se reportó como observación
—una ocurrencia, no reproducida en 9 corridas dirigidas ni en 2 suites enteras— y el operador señaló que
una observación sin issue no es un cabo atado. Diagnosticarlo tomó menos que medirlo.

## Relacionados

- **083** — la misma forma: un mecanismo determinista detrás de una intermitencia que viene de otro lado.
- **080** — la otra vez que el banco de pruebas fue el problema, y de donde salen `ROOT` y R23.

## Cierre

**🟢 resuelto en 0.78.0** · `test/support/environment.js`, `test/repo/repo.test.js`

### Lo que el caso enumeró

**El fix** — hecho, y en `bank()`, compartido por `tempRoot` y `outsideTempRoot`. El segundo no había
fallado nunca, y dejarlo con el sufijo aleatorio habría dejado media clase abierta por no haberla mirado.

**«No cierra el caso en que la prueba elige el nombre que colisiona»** — es cierto, se decidió no
cerrarlo y la razón está escrita en el código, donde la lee quien escriba el próximo banco. Cerrarlo
pediría prohibir nombres según lo que filtre cada prueba, que es una regla que nadie va a poder cumplir.

**«`mkdtemp` garantiza unicidad atómica»** — comprobado: el contador la da dentro del proceso y `ROOT` es
único entre procesos. La mutación que congela el contador deja dos bancos con el mismo nombre y la
prueba se pone en rojo.

### Lo que apareció midiendo y el enunciado no preveía

**Los 24 filtros no se tocan, y esa fue una decisión.** El arreglo obvio era recortar la raíz del banco
antes de filtrar, lo que obligaba a migrar 26 sitios en 7 archivos. Arreglar el nombre en un solo lugar
cierra lo mismo sin tocar ninguno.

**El error de `integrations` que se filtra no es un defecto del motor.** Se midió: sale porque el banco
copia sólo `template/planning` y no es una instancia completa —`integrations/config.json` lo crea
`init`, según `engine/core/ownership.js:201`—. Los filtros lo descartan a propósito. No sale como caso.

### Qué se corrió

`npm run ci` — **664 pruebas, 664 en verde**, con la prueba nueva «el nombre de un banco no trae nada que
la prueba no haya pedido». Comprueba la propiedad que impide el fallo —el nombre es el pedido más un
número— y no la ausencia de aquel rojo, que no se puede volver a provocar a voluntad. Incluye la forma
concreta que costó la corrida: que `/adr\//` no case el nombre de un banco `cauce-plantilla-adr-`.

**Cuatro mutaciones, en un clon desechable bajo `/tmp` (R23), todas en rojo:**

```
M1 vuelve el sufijo aleatorio (el defecto original):     fail 5 → ROJA
M2 el contador no avanza: dos bancos con el mismo nombre: fail 5 → ROJA
M3 outsideTempRoot se queda con el sufijo aleatorio:      fail 5 → ROJA
M4 el banco no se crea en disco:                          fail 5 → ROJA
```

Las cuatro se comprobaron aplicadas antes de contar.
