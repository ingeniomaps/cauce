# Contexto estable del proyecto

Este directorio contiene hechos de negocio y producto que cambian lentamente. No guarda tareas ni estado.

Con molde, y `check` avisa si a alguno le faltan secciones del original:

- `company.md`: misión, modelo de negocio, objetivos, estructura y derechos de decisión.
- `product.md`: problema, usuarios, propuesta de valor y límites.
- `domains.md`: lenguaje ubicuo, dominios y dueños.
- `workspace.md`: el mapa real, las integraciones con su entorno y las excepciones de autonomía.
  Es lo que `AGENTS.md` no puede llevar: ese archivo lo mantiene Cauce y se reemplaza al actualizar.

Recomendados, sin molde: escribilos con la forma que le sirva a este proyecto.

- `architecture.md`: mapa de sistemas y enlaces a las fuentes técnicas.
- `risks.md`: riesgos operativos, regulatorios, financieros y de seguridad.

La lista no es cerrada. Todo hecho de negocio o producto que cambie lentamente vive acá —una guía de
marca, un manual de operación, un pipeline de contenido— aunque no tenga una línea propia arriba.

Opcional, con forma fija: `secrets.json`, el contrato de secretos que la empresa comparte entre sus
repositorios. Ver «Secretos compartidos» abajo.

Principio: cada hecho tiene un dueño. Enlaza en vez de copiar información que ya vive en otro lugar.

## Secretos compartidos

Cuando varios servicios usan el mismo gestor de secretos —Infisical, Vault, Doppler—, terminan con los
mismos scripts y workflows copiados en cada repositorio, y la copia que se quedó atrás no avisa.
`secrets.json` declara ese contrato una vez y `node tools/ops.js secrets check .` lo compara contra cada
servicio **sin conectarse a nada**. Cauce no conoce ningún gestor: lo que habla con él es de la empresa.

```json
{
  "schemaVersion": 1,
  "accounts":   { "principal": { "url": "https://app.infisical.com" } },
  "projects":   { "tienda": { "account": "principal" } },
  "identities": {
    "local-dev": { "account": "principal", "source": "file", "file": "~/.config/acme/local-dev.env" },
    "ci":        { "account": "principal", "source": "ci-secret" }
  },
  "shared":   { "check-schema": "organization/secrets/check-schema.py" },
  "services": {
    "api": { "root": "api", "project": "tienda", "identity": "local-dev",
             "files": { "scripts/check-schema.py": "check-schema" } }
  }
}
```

- **Nunca guarda un valor.** Una clave con forma de secreto —`token`, `password`, `secret`— es un error.
  Las entradas pueden llevar otros campos que lean los scripts de la empresa (un id de proyecto, sus
  ambientes); el chequeo no los mira.
- **Una identidad por nivel de acceso, no por repositorio.** Compartir credenciales es apuntar al mismo
  alias, y rotar es cambiar un archivo. `source: file` es un archivo **fuera de todo repositorio**, que
  carga una persona; `source: ci-secret` vive en el CI y no lleva ruta.
- **`shared` guarda la copia canónica** de cada archivo compartido, dentro de esta instancia, y
  `services.<nombre>.files` dice dónde va en el servicio. Cada `root` es una raíz de `ops.config.json`.
- **Varios proyectos, una instancia.** El chequeo compara los servicios de esta instancia; para que el
  esqueleto de un proyecto y los servicios de otro se midan contra lo mismo, los dos van como raíces acá.

`secrets check` falla si una copia no coincide con la canónica —y dice el `cp` que la pone al día—, si
falta, si una referencia no cierra o si una credencial está dentro de un repositorio. Una identidad que
no está en esta máquina es una advertencia: en el CI no tiene por qué estar.

El recorrido:

- **Adoptar un servicio**: declararlo, copiar los archivos de `shared` y correr `secrets check`. Cargar
  la identidad en su archivo y los secretos del CI lo hace una persona: el guard de secretos frena que
  un agente escriba un `.env.*`, y es lo correcto.
- **Mantener**: se cambia la copia canónica, `secrets check` lista los servicios que quedaron atrás y
  cada uno se actualiza con un commit en su repositorio.
- **Rotar**: se reemplaza el archivo de la identidad; los servicios que la usan no cambian.
- **Dar de baja**: se saca el servicio de `services` y se borran sus copias en su repositorio.
