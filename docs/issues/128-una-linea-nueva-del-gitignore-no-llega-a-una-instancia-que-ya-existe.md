---
caso: 128
titulo: Una línea nueva del `.gitignore` no llega nunca a una instancia que ya existe, así que cada rastro local que agregamos aparece listo para commitearse
estado: resuelto
resuelto-en: 0.86.0
prioridad: media
version-detectada: 0.86.0
---

# 128 — El `.gitignore` se escribe al crear la instancia y ninguna versión posterior puede tocarlo

**🟢 resuelto en 0.86.0**

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

## Cierre

**🟢 resuelto en 0.86.0** · `engine/core/trails.js`, `engine/cli/planning.js`,
`test/planning/ignored-trails.test.js`

### Contra lo que el caso enumeró

**Opción 1, «que `check` avise» — elegida, y hecha distinta de como el caso la pedía.** El caso decía
avisar «si falta una línea que esta versión espera», o sea comparar el `.gitignore` contra el molde. Se
hizo preguntándole a git si el rastro está **ignorado**, con `check-ignore`. La razón es que comparar
texto se equivoca en los dos sentidos:

- la empresa puede cubrirlo con una regla propia —`planning/.*-log`, o una entrada más ancha— y el aviso
  la acusaría de no tener una línea que no necesita;
- y en **sidecar** el `.gitignore` vive en la instancia mientras el repositorio es el workspace de arriba.
  Medido en las dos topologías: `check-ignore` contesta igual, y comparar texto habría obligado a razonar
  dónde vive el archivo en cada modo.

Lo accionable se conserva: el aviso nombra las rutas, que es exactamente lo que hay que pegar.

**Opción 2, «anexar sólo lo que falta» — decidida que no.** Estrena un efecto que `upgrade` no tiene:
escribir en un archivo cuyo dueño es la empresa. El propio caso lo marcaba como su costo, y el daño que
evita es reversible. **La reactiva** que aparezca un rastro con algo que no deba publicarse; hoy ninguno
guarda el texto de la persona, que es la decisión del 098.

**Opción 3, «dejarlo como está y declararlo» — se hace además, no en lugar de.** El CHANGELOG de 0.86.0
dice la línea a copiar a mano, porque quien actualiza sí puede actuar sobre eso. Lo que el caso proponía
como alternativa suficiente resultó ser el complemento: el aviso lo detecta, el CHANGELOG lo anticipa.

**Tradeoff «la opción 1 no cierra el hueco, lo hace visible»** — asumido tal cual. `check` no edita el
`.gitignore` de nadie.

**Tradeoff «no está medido cuántas instancias tienen hoy el `.gitignore` sin la línea»** — sigue sin
medirse y ya no hace falta para este arreglo: el aviso lo contesta por instancia, en la máquina donde
está, que es donde la pregunta tiene respuesta.

### Lo que apareció y el caso no preveía

**La topología sidecar.** El caso razonaba sobre una instancia que es el repositorio. En sidecar el
`.gitignore` queda dentro de la instancia y el repositorio es el workspace de arriba — y git aplica igual
las reglas de un subdirectorio a las rutas de ese subdirectorio. Hay una prueba dedicada, porque es la
topología que rompería un aviso que resolviera mal la raíz.

**Los tres rastros estaban declarados en tres módulos distintos.** `.verify-log` en `evidence.js`,
`.push-log` en `push.js`, `.grant-log` en `chat.js`, más el molde y `teamwork.md`. El aviso necesitaba los
tres: escribirlos ahí habría sido la cuarta copia. Salieron a `core/trails.js` y los tres módulos lo
importan, así que la lista quedó declarada una sola vez.

**Produje un import huérfano al hacerlo.** Al sustituir el `path.join` de `push.js` por el `require` del
módulo nuevo, su `require('node:path')` quedó sin uso — una hora después de haber commiteado, en el
#398, el arreglo de exactamente ese defecto. Ninguna puerta de `ci` lo ve: el barrido de imports está
fuera por costo. Lo encontré mirando, y se quitó.

**Y la primera prueba tenía un falso verde, que sólo destapó la mutación.** Filtraba los avisos por la
ruta del rastro, así que no veía el mensaje degenerado que produce un aviso roto —«0 rastro(s) local(es)
… ()»—: con `warnings()` avisando siempre, la prueba de «se calla» pasaba creyendo que no hubo aviso. La
mutación que avisa siempre **sobrevivía a las tres pruebas**. Se arregló mirando la forma del aviso y no
las rutas que nombra, y con eso la mutación cae en dos.

Vale nombrar la forma general, porque no es la primera vez en esta tanda: una mutación que sobrevive
significa que falta el caso **o** que la rama es inobservable, y acá no era ninguna de las dos —era el
instrumento de la prueba, que filtraba justo lo que tenía que detectar—. Es la tercera vez en la sesión
que un patrón demasiado laxo produce un resultado que se lee como hallazgo.

### Qué se corrió

- **Rojo previo**: `pass 1, fail 2`. La que pasaba es la de «se calla», y pasaba **con razón** —hoy no hay
  aviso y callarse es el estado actual—; las dos que exigen el aviso fallaron por lo suyo, `actual 0` y
  `actual ''`. Que la primera pasara desde el principio es la señal de que el montaje —`git init`, el
  molde copiado, la topología sidecar— estaba bien armado.
- **Verde**: 3 de 3, y **782 de 782** en la suite entera con `npm run ci` en 0. Las 103 pruebas del 112 y
  del 127 siguen verdes, que es lo que importa al haber movido los tres `LOG` de módulo: un nombre mal
  exportado habría dejado el rastro escribiéndose en una ruta rota **sin que nada fallara**, porque
  `TRAIL.append` traga excepciones.
- **Mutaciones**, en copia desechable (R23), con la copia verde antes:
  - avisar siempre → **sobrevivía**, y ése fue el hallazgo; con el filtro corregido cae en 2 pruebas;
  - tratar «sin repositorio» como «no ignorado» → roja la de degradación;
  - perder uno de los tres rastros → roja la que los nombra;
  - dar por cubierto lo que git no nombró → rojas las tres.
- **Cobertura**: `trails.js` en 100 % de ramas y líneas (5/5, 52/52), medido en la corrida completa. El
  piso se registró **a mano** —`coverage:update` nunca sube uno solo— y se contrastó que no movió ningún
  piso ajeno: «entradas con valor cambiado: ninguna», 66 → 67 archivos.
