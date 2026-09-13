---
caso: 134
titulo: El aviso de credenciales sin dueño corta en cuarenta variables por servicio, y en una instancia real las tres credenciales del servicio quedan del lado que no se mira
estado: abierto
prioridad: media
version-detectada: 0.86.0
---

# 134 — Las credenciales sin dueño de un servicio grande caen pasado el tope

**🔴 abierto**

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
node engine/cli/ops.js check /home/manuel/Code/gouduet/gouduet-ops/planning --json \
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
