---
caso: 128
titulo: Una línea nueva del `.gitignore` no llega nunca a una instancia que ya existe, así que cada rastro local que agregamos aparece listo para commitearse
estado: abierto
prioridad: media
version-detectada: 0.86.0
---

# 128 — El `.gitignore` se escribe al crear la instancia y ninguna versión posterior puede tocarlo

**🔴 abierto**

## Resumen

Cada vez que Cauce agrega un archivo local que **no debe viajar** —un rastro, un registro de corrida— lo
declara en `template/gitignore`. Eso funciona para una instancia nueva y **no llega a ninguna de las que
ya existen**, así que en ellas el archivo aparece en `git status` sin nada que lo cubra, listo para entrar
a la historia de la empresa por descuido.

No es hipotético: ya pasó con `planning/.push-log`, y va a volver a pasar con cada rastro que agreguemos.

## Reproducción

```bash
# Una instancia creada antes de que existiera la línea:
node <motor>/engine/cli/ops.js init acme --name Acme --mode sidecar
grep -c 'push-log' acme/.gitignore     # 1 en una instancia nueva

# Se simula la instancia vieja quitando la línea, que es como quedó la creada antes:
sed -i '/push-log/d' acme/.gitignore

node <motor>/engine/cli/ops.js upgrade acme
grep -c 'push-log' acme/.gitignore     # sigue en 0: upgrade no la repone
```

## Causa raíz

`engine/core/ownership.js`, en `TEMPLATE_OWN`: la entrada es `'gitignore': 'init'`, y `addedPaths()`
devuelve **sólo** las marcadas `'upgrade'`:

```js
function addedPaths() {
  return Object.entries(TEMPLATE_OWN).filter(([, via]) => via === 'upgrade').map(([file]) => file)
}
```

Y marcarlo `'upgrade'` **tampoco alcanza**, que es lo que hace al caso menos obvio de lo que parece: esa
vía crea el archivo si falta y nunca lo pisa —«se crea si falta y nunca se pisa», dice `instance.js`—, así
que en una instancia donde el `.gitignore` ya existe se saltea igual.

O sea que hoy no hay **ninguna** vía para agregarle una línea al `.gitignore` de una instancia existente, y
la razón por la que no la hay es correcta: ese archivo es de la empresa y puede tener líneas propias que
un reemplazo se llevaría puestas.

## Fix propuesto

No está decidido, y la decisión es parte del caso porque toca un archivo que no es nuestro.

1. **Que `check` avise.** Si falta una línea que esta versión espera, decirlo con la línea exacta para
   pegar. No toca nada de la empresa y sigue el patrón de todo lo demás que `check` reporta y no arregla.
2. **Anexar sólo lo que falta**, sin reescribir el archivo: `upgrade` agrega las líneas ausentes al final,
   bajo un encabezado que diga de dónde salieron. Es lo único que de verdad cierra el hueco, y es escribir
   en un archivo del proyecto, que hasta hoy `upgrade` no hace.
3. **Dejarlo como está y declararlo**, documentando en el CHANGELOG de cada versión que agregue una línea
   que hay que copiarla a mano.

## Tradeoffs

- La opción 2 es la única que no depende de que alguien lea un aviso, y es también la que estrena un
  efecto que `upgrade` no tiene: modificar un archivo cuyo dueño es la empresa.
- La opción 1 no cierra el hueco, lo hace visible. Puede alcanzar: el daño —un archivo local commiteado—
  es reversible, a diferencia del que motivó el 125.
- **No está medido cuántas instancias tienen hoy el `.gitignore` sin la línea de `.push-log`.** Contarlas
  desde este repositorio no se puede, igual que en el 110.

## Prioridad

**Media.** El daño es real pero reversible —se borra el archivo del índice y se agrega la línea— y no
pierde trabajo, a diferencia del 125. Sube a alta si algún rastro futuro llegara a contener algo que no
deba publicarse; hoy ni `.push-log` ni el rastro de concesiones guardan el texto de la persona, que es la
decisión del **098** y lo que mantiene el daño en «ruido» y no en «filtración».

## Contexto de descubrimiento

Salió construyendo el **127**, al ir a declarar que su rastro de concesiones no viaja. La afirmación era
cierta para una instancia nueva y falsa para una existente, y comprobarlo mostró que `planning/.push-log`
ya vivía con el mismo hueco desde que entró: el commit que lo agregó (`636c4eff`) tocó `template/gitignore`
y no trajo ninguna migración.

## Relacionados

- **127** — de donde salió; su rastro sigue el mismo patrón y hereda esta limitación, declarada en su
  cierre en vez de silenciada.
- **112** — el que introdujo `planning/.push-log`, primer afectado.
- **110** y **125** — la misma familia: lo que una versión nueva no puede hacerle a una instancia vieja.
