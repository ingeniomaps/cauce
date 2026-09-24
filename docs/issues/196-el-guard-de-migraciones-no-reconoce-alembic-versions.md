---
caso: 196
titulo: El guard de migraciones no reconoce `alembic/versions/`, así que ahí no frena ni el SQL crudo ni la reescritura
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 196 — Una migración de Alembic en su carpeta por defecto no es una migración para el guard

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. La ruta de una migración la decide una lista fija
de nombres de directorio, y la carpeta por defecto de Alembic no está en ella: declarar `py` en
`migrations.extensions` no cubre ninguna migración de un proyecto Alembic con la estructura de su tutorial.

## Resumen

`migrationPattern` reconoce como migración un archivo con extensión declarada **bajo un directorio llamado
`migrations/`, `migration/` o `migrate/`**. Alembic crea su entorno con `alembic init <dir>` y guarda las
revisiones en `<dir>/versions/`; con el ejemplo de su propio tutorial eso es `alembic/versions/`. Ninguno de
los dos segmentos está en la lista, así que el guard no mira esos archivos: ni frena el SQL destructivo ni
protege una revisión existente de ser reescrita. No avisa nada: `migrations.extensions: ["py"]` valida y el
guard queda cableado.

## Reproducción

Desde un directorio vacío, con la raíz mínima y la función `guard()` del caso 185 (sección Reproducción:
`node engine/hooks/run.js migrations` con el JSON del hook por stdin):

```bash
echo '{"migrations":{"extensions":["sql","py"]}}' > inst/ops.config.json
cat > al-raw.py <<'PY'
from alembic import op

def upgrade():
    op.execute("DROP TABLE catalog_items")

def downgrade():
    pass
PY
guard alembic/versions/20260923_drop.py     al-raw.py
guard migrations/versions/20260923_drop.py  al-raw.py   # contraste: mismo archivo, carpeta reconocida
```

Y la otra mitad del guard —no reescribir una migración existente—, en una raíz `inst2/` fuera de todo
repositorio git, donde `alreadyShipped` frena cualquier archivo que ya exista (`engine/hooks/files.js:36-47`):

```bash
mkdir -p inst2/planning inst2/alembic/versions inst2/migrations/versions
echo '{"migrations":{"extensions":["sql","py"]}}' > inst2/ops.config.json
cp al-raw.py inst2/alembic/versions/0001_init.py
cp al-raw.py inst2/migrations/versions/0001_init.py
printf 'def upgrade():\n    pass\n' > benign.py
# guard() con OPS_ROOT e INST apuntando a inst2
guard alembic/versions/0001_init.py     benign.py
guard migrations/versions/0001_init.py  benign.py
```

## Síntoma

Salida real, 2026-09-23, Cauce 0.98.0 en `83fc8698`. SQL destructivo:

```
--- alembic/versions, SQL crudo
exit=0
--- migrations/versions, SQL crudo
BLOQUEADO: migrations/versions/20260923_drop.py contiene SQL destructivo.
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  migrations/versions/20260923_drop.py
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_MIGRATIONS_OVERRIDE=1 sigue existiendo y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.
exit=2
```

Reescribir una revisión existente:

```
--- reescribir existente en alembic/versions
exit=0
--- reescribir existente en migrations/versions
BLOQUEADO: migrations/versions/0001_init.py existe, y acá no hay repositorio con el que saber si ya viajó a otra copia. Crea una nueva en vez de reescribirla.
[las tres líneas de aprobación]
exit=2
```

## Causa raíz

- **`engine/hooks/files.js:307`**: `migrationPattern` arma
  `(?:^|/)(?:migrations?|migrate)/.*\.(?:<extensiones>)$`. El directorio es una lista cerrada de tres nombres
  escrita en el motor; la extensión sí la declara el proyecto (`:301-306`).
- **La carpeta de Alembic no es fija, así que ninguna lista la alcanza.** Documentado (tutorial de Alembic,
  https://alembic.sqlalchemy.org/en/latest/tutorial.html, descargado el 2026-09-23): `alembic init alembic`
  crea `/path/to/yourproject/alembic/versions`, pero el nombre del entorno es el argumento de `init`
  —el mismo tutorial muestra `alembic init --template generic ./scripts`—, `alembic.ini` lo fija con
  `script_location` y `version_locations` puede apuntar las revisiones a otros directorios.
- **La validación sólo admite `extensions`**: `engine/config/validate.js:65-84` rechaza cualquier otra clave de
  `migrations` (`:72`), así que hoy el proyecto no tiene cómo declarar dónde viven.

## Fix propuesto

La salida inmediata es agregar `versions` a la lista de `:307`. Cierra la reproducción y es la forma que R27
describe como la que falla: una enumeración que alguien tiene que acordarse de ampliar. Deja afuera `./scripts/versions`,
cualquier `version_locations` y la próxima herramienta, y `versions/` es un nombre bastante genérico para
empezar a frenar lo que no es migración —el 039 al revés—.

Lo que sí es cerrado por defecto, en dos partes:

1. **El proyecto declara las carpetas, igual que ya declara las extensiones**: `migrations.paths`, con los tres
   nombres de hoy como default. Pide abrir `validateMigrations` (`engine/config/validate.js:72`) a la clave
   nueva.
2. **Una extensión declarada que no alcanza a ningún archivo es un error visible, no un guard en verde.**
   `check` (o `doctor`) recorre el repositorio: si hay archivos con una extensión de `migrations.extensions`
   bajo un directorio de migraciones conocido de alguna herramienta, o si **ningún** archivo con esa extensión
   coincide con el patrón, lo dice. Así la carpeta que falta nace reportada en vez de nacer afuera, que es lo
   que R27 pide y lo que este caso y el 077 tienen en común: cobertura declarada que no cubre nada, en silencio.

La segunda parte es la que cierra la clase; la primera sola vuelve a ser una lista, sólo que del proyecto.

## Tradeoffs

- **`migrations.paths` es configuración nueva** y otra cosa que un proyecto puede declarar mal. Con la
  comprobación del punto 2, declararlo mal se ve.
- **El recorrido del punto 2 cuesta** en un repositorio grande; va en `check`, no en el guard, que corre en
  cada escritura (R26).
- **Detectar «esto parece una migración de Alembic» por contenido** —la cabecera de revisión— sería más
  automático, y es **hipótesis** que todas las revisiones la tengan: no se comprobó contra la plantilla.

## Prioridad

Media. Como el 193, no frena trabajo: pasa de largo. Pero afecta a todo proyecto Alembic con la estructura de
su propio tutorial, y ahí el guard no hace ninguna de sus dos cosas —ni SQL destructivo ni reescritura—
mientras `migrations.extensions` dice que sí.

## Contexto de descubrimiento

Revisando el caso 185 el 2026-09-23: al reproducir el borrado idiomático que después fue el 193, el contraste
con SQL crudo en `alembic/versions/` dio `exit=0`, y el mismo archivo bajo `migrations/versions/` se frenaba.

## Relacionados

- **193**: el guard no reconoce el borrado idiomático de un ORM. Éste es previo: en `alembic/versions/` no
  reconoce siquiera el archivo.
- **077**: abrió la extensión al proyecto y dejó el directorio en el motor; éste es la mitad que quedó.
- **039**: por qué la ruta decide qué es una migración, y el falso positivo que una lista más ancha reabre.

## Cierre

**Resuelto en 0.99.0, con la carpeta declarada y el aviso sobre lo declarado; el aviso por carpetas
conocidas de alguna herramienta se decidió que no.** Recorriendo lo que enumeró:

- **Salida inmediata, agregar `versions` a la lista → se decidió que no**, por lo que el propio caso dice:
  es una lista más, deja afuera `./scripts/versions` y `version_locations`, y `versions/` es genérico.
- **Parte 1, `migrations.paths` → se hizo.** Cada entrada es una carpeta relativa —uno o más segmentos, sin
  «.», «..» ni barras sueltas— que el guard busca en cualquier lugar de la ruta, así que `alembic/versions`
  alcanza también a `api/alembic/versions`. Declararla **reemplaza** el default, igual que `extensions`. La
  valida `validateMigrations` (`engine/config/validate.js`) con la misma forma que usa el guard, y el schema
  la declara. Alcanza a las dos mitades del guard: el SQL destructivo y la reescritura.
- **Parte 2, lo declarado que no alcanza a nada se ve → se hizo en `check`, no en `doctor`,** y cubre las dos
  claves: una extensión declarada que ningún archivo trackeado alcanza, y una carpeta declarada que tampoco.
  Lee `git ls-files` de cada repositorio de las raíces y sólo si el proyecto declaró algo. Sin repositorio no
  dice nada, como los otros avisos que le preguntan a git.
- **La otra mitad de la parte 2, «archivos bajo un directorio de migraciones conocido de alguna
  herramienta» → se decidió que no** (decisión tomada al integrarlo, 2026-09-23). Pide una lista de carpetas
  conocidas que mantenga el motor, que es la misma forma que el caso rechazó para el fix inmediato y la que
  R27 describe como la que falla: la lista envejece y lo que no nombra queda afuera sin avisar.
  Lo construido encuentra al proyecto Alembic del caso (medido abajo), pero **no a uno mixto**: con
  `migrations/*.py` cubiertas y `alembic/versions/*.py` afuera, `py` alcanza a algo y no avisa. El proyecto
  mixto queda como límite declarado: lo cubre declarar las dos carpetas en `migrations.paths`.
- **Tradeoff de la configuración nueva → aceptado**, con la validación y el aviso de `check` que el caso
  pedía para que declararla mal se vea.
- **Tradeoff del costo del recorrido → resuelto como proponía**: va en `check` y es un `git ls-files` por
  repositorio.
- **Tradeoff de detectar Alembic por contenido → no se hizo**; sigue siendo hipótesis y no hacía falta.

### Qué se corrió

- **La reproducción del caso contra el motor arreglado** (2026-09-23, `guard()` del 185 y la raíz `inst2/`
  fuera de todo repositorio):

  ```
  --- alembic/versions, sin declarar paths   exit=0     (el default no cambia)
  --- alembic/versions, con paths ["migrations","alembic/versions"]
  BLOQUEADO: alembic/versions/20260923_drop.py contiene SQL destructivo en el bloque que aplica (la reversión, `downgrade()`, no se juzga): `DROP TABLE`.
  exit=2
  --- reescribir existente en alembic/versions
  BLOQUEADO: alembic/versions/0001_init.py existe, y acá no hay repositorio con el que saber si ya viajó a otra copia. Crea una nueva en vez de reescribirla.
  exit=2
  ```
- **`check` sobre un producto con `alembic/versions/0001_init.py` trackeado** y una instancia sidecar:

  ```
  --- extensions ["sql","py"], sin paths
  ⚠ ops.config.json: migrations.extensions "sql" no alcanza a ningún archivo bajo migrations, migration, migrate: …
  ⚠ ops.config.json: migrations.extensions "py" no alcanza a ningún archivo bajo migrations, migration, migrate: …
  exit=0
  --- con paths ["alembic/versions"]
  ⚠ ops.config.json: migrations.extensions "sql" no alcanza a ningún archivo bajo alembic/versions: …
  exit=0
  ```
- **Pruebas nuevas en rojo sobre el código anterior** (`test/hooks/migrations.test.js` y
  `test/instance/core.test.js`) y **cuatro mutaciones en una copia del árbol, las cuatro en rojo**: el guard
  ignorando `paths`, la validación de `paths` apagada, `check` sin el aviso y `check` sin el aviso de carpeta.
- `npm run ci`, exit 0, en una copia con los archivos nuevos trackeados.
