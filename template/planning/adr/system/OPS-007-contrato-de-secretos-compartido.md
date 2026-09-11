# OPS-007 — Un contrato de secretos compartido, sin conocer ningún gestor

**Estado:** Aceptado
**Fecha:** 2026-09-10

> Decide qué parte del manejo de secretos es de la base; el gestor, sus scripts y su CI siguen siendo de
> la empresa.

## Contexto

Una empresa que adopta un gestor de secretos termina con el mismo modelo copiado en cada repositorio:
la identidad con que se lee el gestor, un script que compara el gestor contra el contrato de variables y
los workflows que avisan en el PR. Nada dice qué servicio usa qué cuenta ni qué identidad, y nada detecta
que una copia se quedó atrás. En una instancia real se contaron dieciséis copias de un mismo script en
tres variantes, y el arreglo que tenía una sola no había llegado ni al esqueleto del que salen los
servicios nuevos.

`integrations/` no sirve para esto: su ciclo es de contenido de trabajo que baja a planning (OPS-003), y
su README prohíbe guardar secretos ahí.

## Decisión

**La base declara y compara; no se conecta, no genera y no conoce ningún gestor.**

- La declaración vive en `organization/secrets.json`, que es del proyecto: cuentas, proyectos,
  identidades, servicios y los archivos que comparten. Nunca un valor: una clave con forma de secreto es
  un error.
- Una identidad es un nivel de acceso, no un repositorio. `source: file` es un archivo **fuera de todo
  repositorio**, que carga una persona; `source: ci-secret` vive en el CI.
- La copia canónica de cada archivo compartido vive en la instancia. `ops secrets check` compara cada
  copia de cada servicio contra ella por hash, sin red, y dice el `cp` que la pone al día. Cauce no
  escribe en los repositorios de producto.
- El chequeo compara los servicios de una instancia. Una empresa con varios proyectos los declara como
  raíces de la misma instancia, que es lo que hace que un esqueleto y sus derivados se midan contra lo
  mismo.

## Alternativas consideradas

- **Un adaptador de la empresa que genere los archivos**: flexible, pero obliga al motor a cargar código
  de la instancia y a versionar una interfaz, para resolver lo mismo que una copia comparada por hash.
- **El adaptador como paquete versionado que cada instancia instala**: mantiene una instancia por
  proyecto a cambio de publicar y versionar un paquete más.
- **Un workflow reutilizable compartido**: una sola copia, pero supone GitHub y una organización, y deja
  a la base atada a un proveedor de CI.
- **Hacerlo un proveedor de `integrations/`**: su staging, reconciliación y promoción no se aplican a
  secretos.

## Consecuencias

**Ganamos:** la copia que se quedó atrás se ve, con su arreglo al lado; rotar una identidad compartida
es cambiar un archivo; y la base sigue sin saber de ningún gestor.

**Costos que aceptamos:** un arreglo sigue siendo un commit por repositorio —el chequeo los lista, no los
aplica—. Juntar varios proyectos en una instancia comparte también su `planning/`. Y una credencial
dentro de un repositorio es un error aunque esté ignorada por git: es la copia por repositorio que esta
decisión viene a sacar.

## Estado de implementación

Implementado en 0.80.0: `organization/secrets.json`, `ops secrets check` y el recorrido documentado en
`organization/README.md`. Cauce no trae adaptadores ni un workflow de ejemplo que corra el chequeo en CI;
correrlo ahí es un paso de la empresa.
