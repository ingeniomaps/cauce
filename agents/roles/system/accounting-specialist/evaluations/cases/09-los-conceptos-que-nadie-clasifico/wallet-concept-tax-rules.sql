-- Tabla de parametrización que lee el generador de la exógena.
-- Un concepto sin fila para la pareja (code, type) no entra al reporte: el generador no falla ni avisa.

CREATE TABLE wallet_concept_tax_rules (
    id             BIGSERIAL PRIMARY KEY,
    concept_code   VARCHAR(10) NOT NULL,            -- history_wallets.identification_code
    movement_type  VARCHAR(10) NOT NULL,            -- ENTRADA | SALIDA
    reportable     BOOLEAN     NOT NULL,
    reason         TEXT        NOT NULL,            -- por qué, con la fuente
    valid_from     DATE        NOT NULL,
    valid_to       DATE,
    approved_by    VARCHAR(80),                     -- quién firmó el criterio
    UNIQUE (concept_code, movement_type, valid_from)
);

-- Filas vigentes: 58 conceptos, hasta el código 1082 (estudio de Financiera, abril de 2026),
-- más 1102 y 1088 agregados el 2026-09-18.
