---
caso: 134
titulo: El aviso de credenciales sin dueño corta en cuarenta variables por servicio, y en una instancia real las tres credenciales del servicio quedan del lado que no se mira
estado: resuelto
resuelto-en: 0.87.0
prioridad: media
version-detectada: 0.86.0
---

# 134 — Las credenciales sin dueño de un servicio grande caen pasado el tope

**🟢 resuelto en 0.87.0**

## Resumen

`check` avisa de las credenciales que ningún contrato declara: las que tienen forma de secreto en el
nombre y no aparecen en `organization/workspace.md` ni en `planning/HUMAN_ACTIONS.md`. El escaneo del
`.env.example` de cada servicio **corta en cuarenta variables**, y lo que queda afuera no se mira.

El 102 aceptó ese riesgo y lo dejó escrito como tradeoff sin medir —«lo que quedó afuera puede incluir una
credencial que nadie carga»—. **Está medido y ocurre.** En `gouduet-ops`, una instancia real de 0.66.0
sobre este disco, el servicio `keycloak` declara 61 variables:

- de las **40 revisadas**, dos son credenciales: `KEYCLOAK_ADMIN_PASSWORD` y `KEYCLOAK_CLIENT_SECRET`, las
  dos declaradas en los contratos;
- de las **21 cortadas**, tres son credenciales: `DB_PASSWORD`, `REDIS_PASSWORD` e
  `INFISICAL_ADMIN_TOKEN`, y **dos de ellas no las declara ningún contrato**.

O sea que la instancia tiene dos credenciales sin dueño y el aviso que existe para encontrarlas no puede
verlas. Lo único que dice es que cortó.

## Reproducción

```bash
# Sobre una instancia con un servicio de más de 40 variables en su .env.example:
node engine/cli/ops.js check <instancia>/planning --json \
  | jq -r '.warnings[] | select(test("credencial"))'
```

## Síntoma

El aviso que sale, y el que no. Medido el 2026-09-13:

```
sin revisar por credenciales sin dueño, pasado el tope de variables por servicio: keycloak (21 de 61)
— lo que quedó afuera puede incluir una credencial que nadie carga
```

No hay ningún aviso de credencial sin dueño, y sin embargo hay dos. Aplicando a mano el mismo criterio del
motor —`SENSITIVE` y `ENV_MAX`— sobre las mismas 61 variables:

```
revisadas (primeras 40): 40 → credenciales: KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_CLIENT_SECRET
cortadas:                21 → credenciales: DB_PASSWORD, REDIS_PASSWORD, INFISICAL_ADMIN_TOKEN
  DB_PASSWORD:           SIN DUEÑO y fuera del corte
  INFISICAL_ADMIN_TOKEN: SIN DUEÑO y fuera del corte
```

`DB_PASSWORD` está en la posición 43 del archivo e `INFISICAL_ADMIN_TOKEN` en la 60. El corte es en 40.

## Causa raíz

`engine/core/scan.js:111` y `:125`. El tope se aplica **antes** de que nadie mire qué es cada variable:

```js
const ENV_MAX = 40
// …
return { file: name, names: names.slice(0, ENV_MAX), truncated: Math.max(0, names.length - ENV_MAX) }
```

`expectedEnv` devuelve los primeros cuarenta nombres en orden de aparición y cuenta el resto. Quien decide
si una variable es credencial —`sensitiveKey`, con `SENSITIVE` en `engine/integrations/registry.js:72`— y
quien busca su dueño —`orphanCredentials`, en `engine/core/onboarding.js:113`— trabajan sobre esa lista ya
recortada, así que una credencial en la posición 43 no existe para ellos.

El corte tiene su razón escrita y es buena: «un ejemplo con cientos de variables es un archivo generado, no
un contrato». Lo que no se separó es **para qué** se recorta. Cortar la lista que se le muestra a una
persona es sensato; cortar la que se analiza convierte un aviso de seguridad en uno que depende de dónde
cayó la variable en el archivo.

Y el orden no es una garantía de nada: en este `.env.example` las credenciales de Keycloak están al
principio porque el archivo agrupa por servicio, y las de la base y de Infisical al final por la misma
razón. Con otro orden el resultado sería el contrario.

## Fix propuesto

No está decidido. Tres formas, y la elección cambia qué se promete.

1. **Analizar todo y mostrar recortado.** `expectedEnv` devuelve los nombres completos y el tope se aplica
   al **texto del aviso**, no al análisis. Es la que respeta la razón original del corte —no inundar a
   quien lee— sin heredar su efecto. El costo es leer y filtrar la lista entera, que para un archivo de
   cientos de variables sigue siendo barato: es un `.env.example`, no un volcado.
2. **Analizar sólo las credenciales, sin tope.** Filtrar por `SENSITIVE` antes de recortar: las
   credenciales nunca se cortan y el resto sí. Más acotado que la 1, y deja el tope donde está para todo
   lo demás.
3. **Subir `ENV_MAX`.** No resuelve nada: mueve el problema a los servicios que pasen el número nuevo, y
   el caso volvería con otro `.env.example` más largo.

Cualquiera que se tome, lo que hoy avisa —el mensaje de truncado— tiene que seguir avisando: es lo único
que hace visible que hubo un corte.

## Tradeoffs

- **Es un aviso, no un bloqueo**, así que nadie pierde trabajo hoy. Lo que se pierde es la confianza en un
  aviso de seguridad que calla justamente donde más falta hace: en el servicio con más variables.
- **La opción 1 hace leer más.** Medido: el archivo de `keycloak` son 61 líneas. El tope existe para
  archivos «con cientos de variables», y ni así el costo de filtrar por un regex es apreciable.
- **La opción 2 parte el criterio en dos lugares** —qué se recorta y qué se analiza— y eso hay que
  escribirlo donde se decide, o el próximo que lea `ENV_MAX` no va a entender por qué no aplica a todo.
- **Ninguna arregla el secreto mal nombrado.** El criterio sigue siendo el nombre, y el 107 ya midió que
  16 de 72 variables sensibles no lo delatan. Este caso es sobre las que **sí** lo delatan y aun así no se
  miran.

## Prioridad

**Media.** No rompe nada y no bloquea a nadie, pero es el único caso de esta familia donde el daño es
externo: una credencial sin dueño en una instancia real significa que nadie sabe quién la carga ni de
dónde sale, y el aviso que existe para decirlo no la ve. Sube a alta si aparece en un servicio cuyas
credenciales sean de producción.

## Contexto de descubrimiento

Salió midiendo contra instancias reales el hueco que el 102 había declarado sin medir. Ese caso dice
—porque en su momento era cierto— que los adaptadores propios de una empresa «no están en esta máquina»;
sí están: `venotal-ops` y `gouduet-ops`. Correr el aviso contra las dos convirtió una predicción en dos
nombres.

Vale decir que `venotal-ops` no lo dispara: sus servicios no pasan el tope. Hizo falta la segunda
instancia, y eso es parte del hallazgo: con un solo ejemplar el aviso se ve correcto.

## Relacionados

- **102** — el caso que introdujo el filtro y declaró este riesgo como tradeoff aceptado y no medido.
- **107** — midió la otra mitad del criterio: 16 de 72 variables sensibles no tienen forma de secreto en
  el nombre. Aquél es sobre las que el nombre no delata; éste sobre las que sí y no se miran igual.
- **111** — salió de la misma reproducción del 102.

## Cierre

**🟢 resuelto en 0.87.0** · `engine/core/scan.js`, `engine/core/onboarding.js`, `engine/cli/wiring.js`,
`test/planning/orphan-credentials.test.js`

Se tomó la **opción 1**: el tope recorta lo que se **lista** y ya no lo que se **mira**. `expectedEnv`
devuelve los nombres completos, `truncated` sigue contando lo que no se lista, y el recorte de pantalla se
aplica en `cli/wiring.js`, junto al otro recorte que ese mismo comando ya tenía.

### Contra lo que el caso enumeró

- **Resumen: «hay dos credenciales sin dueño y el aviso no puede verlas»** — arreglado y comprobado contra
  la misma instancia: `gouduet-ops` ahora acusa `DB_PASSWORD (keycloak), INFISICAL_ADMIN_TOKEN (keycloak)`
  por nombre. `venotal-ops` sigue sin avisos, así que el cambio no fabricó falsos positivos.
- **Opción 1, analizar todo y mostrar recortado** — es la construida.
- **Opción 2, filtrar por `SENSITIVE` antes de recortar** — se decidió que no, y por medición: el costo que
  la 1 supuestamente tenía no existe. De seis `.env.example` en las dos instancias reales, **uno solo**
  pasa el tope —`keycloak`, con 61—; el resto va de 2 a 34. Partir el criterio en dos lugares para ahorrar
  eso no se paga.
- **Opción 3, subir `ENV_MAX`** — se decidió que no, por lo que el propio caso decía: mueve el problema al
  siguiente `.env.example` más largo.
- **«Lo que hoy avisa tiene que seguir avisando»** — sigue, y cambió de sentido con el texto: de «sin
  revisar… lo que quedó afuera puede incluir una credencial» a «el ejemplo se lista recortado; las
  credenciales se buscan igual sobre el archivo entero». Un caso lo fija y además asercia que el texto
  viejo **no** vuelva.
- **Tradeoff «es un aviso, no un bloqueo»** — sin cambios: sigue siendo advertencia.
- **Tradeoff «la opción 1 hace leer más»** — medido y descartado arriba.
- **Tradeoff «la 2 parte el criterio en dos lugares»** — por eso no se tomó.
- **Tradeoff «ninguna arregla el secreto mal nombrado»** — cierto y sin tocar: el criterio sigue siendo el
  nombre, y el 107 ya midió esa otra mitad.
- **Prioridad: «sube a alta si aparece en un servicio cuyas credenciales sean de producción»** — la
  condición deja de poder cumplirse en silencio: ya no hay credencial que el tope esconda.

### Lo que el caso no preveía

- **`wiring.js` también consumía la lista**, y el caso no lo nombraba. Es quien imprime `espera …` en
  `scan`, así que devolver los nombres completos sin más habría pasado de listar 40 a listar 61 — justo lo
  que el tope existe para evitar. Ahí estaba la pista del diseño: ese comando **ya** recorta servicios y lo
  anuncia, con el comentario que da el principio entero —«un corte que no se anuncia hace pasar lo listado
  por todo lo que hay»—. El repositorio ya distinguía listar de mirar en un lugar y no en el otro; la
  opción 1 no inventa un criterio, extiende el que estaba.
- **Una prueba existente describía el defecto en vez de la conducta.** «Lo que pasa del tope se dice en vez
  de callarlo» montaba 40 variables de configuración más un `DB_PASSWORD` al final —el caso en miniatura— y
  pasaba **aceptando** que la credencial no se mirara. Se reescribió para exigir que se acuse.
- **El arreglo introdujo un defecto y su propia prueba lo atrapó.** Con `names` completo, el conteo del
  aviso —`names.length + truncated`— pasó a contar dos veces lo mismo: decía «1 de 82» donde eran 61. Lo
  marcó en rojo la prueba del recorte, que era la única que quedaba mirando ese número.

### Qué se corrió

- **Rojo previo**: 1 de 7 en rojo —la que exige que la credencial de la posición 41 se acuse— y 6 en
  verde, incluida la que fija que el aviso de recorte sigue. El desglose descarta que el roto fuera el
  arnés.
- **Verde**: 7 de 7, `npm run ci` en 0 y la suite en **809 pruebas, 809 en verde**.
- **Contra lo real, que es lo que originó el caso**: `gouduet-ops` acusa las dos credenciales por nombre;
  `venotal-ops` sigue en cero. Y `scan` sobre un servicio de 61 variables imprime 40 y dice «y 21 más»,
  mientras `--json` sigue trayendo las 61.
- **Tres mutaciones en copia por `tar`, con verde de control antes y después.** Volver a recortar el
  análisis mata dos casos; devolver el conteo duplicado mata al del recorte; quitar el aviso de recorte
  mata al suyo. Ninguna sobrevivió.
