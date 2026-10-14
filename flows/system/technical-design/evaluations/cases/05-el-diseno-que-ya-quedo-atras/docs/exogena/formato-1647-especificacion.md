# Formato 1647 versión 2 — especificación técnica oficial (extracto)

Fuente: Resolución 000111 del 29 de octubre de 2015 de la DIAN, Anexo No. 13.

- El archivo es **XML**, encoding **ISO-8859-1**, validado contra el XSD del anexo.
- Nombre: `Dmuisca_ccmmmmmvvaaaacccccccc.xml` (`cc` = 01 inserción / 02 reemplazo, `mmmmm` = 01647,
  `vv` = 02, `aaaa` = año de envío, `cccccccc` = consecutivo).
- Encabezado `Cab`: `Ano`, `CodCpt`, `Formato` (=1647), `Version` (=2), `NumEnvio`, `FecEnvio`,
  `FecInicial`, `FecFinal`, `ValorTotal` (Σ `vtotal`), `CantReg`.
- Cada elemento `ingresos` describe **dos partes**:

| Bloque | Atributos |
|--------|-----------|
| Quien recibe el ingreso | `con`, `tdoc`, `nid` (str20, sin guiones ni puntos), `dv` (si `tdoc`=31), `apl1`, `apl2`, `nom1`, `nom2`, `raz` (str450), `pais` |
| Valores | `vtotal`, `ving`, `vret` — enteros positivos, sin puntuación |
| Tercero para quien se recibió | `tdoc2`, `nid2i`, `apl1i`, `apl2i`, `nom1i`, `nom2i`, `razi`, `dir`, `cdpt` (str2 DANE), `cmcp` (str3 DANE), `paist` |

- Llave única: `con + tdoc + nid + tdoc2 + nid2i`, no repetible en un mismo envío.
- Máximo **5.000 registros por archivo**.

Pendiente de Financiera: para el caso de la plataforma, quién es `tdoc`/`nid` (receptor) y quién
`tdoc2`/`nid2i` (tercero). Presunción no confirmada: la plataforma recibe, el vendedor es el tercero.
