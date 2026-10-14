-- Migración inicial del módulo TaxReport (4 tablas del diseño).
CREATE TABLE wallet_concept_tax_rules (
    id BIGSERIAL PRIMARY KEY, concept_code VARCHAR(10) NOT NULL, movement_type VARCHAR(10) NOT NULL,
    reportable BOOLEAN NOT NULL, reason TEXT NOT NULL, valid_from DATE NOT NULL, valid_to DATE,
    approved_by VARCHAR(80), UNIQUE (concept_code, movement_type, valid_from)
);
CREATE TABLE tax_report_excluded_wallets (
    id BIGSERIAL PRIMARY KEY, wallet_id BIGINT NOT NULL, country_id INT NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE tax_report_generations (
    id BIGSERIAL PRIMARY KEY, fiscal_year INT NOT NULL, white_brand_id INT NOT NULL,
    status VARCHAR(20) NOT NULL, rules_snapshot JSONB NOT NULL, started_at TIMESTAMP, finished_at TIMESTAMP
);
CREATE TABLE tax_report_generation_rows (
    id BIGSERIAL PRIMARY KEY, generation_id BIGINT NOT NULL REFERENCES tax_report_generations(id),
    wallet_id BIGINT NOT NULL, user_id BIGINT NOT NULL, document VARCHAR(20), document_type_id INT,
    name_to_invoice VARCHAR(450), period_start DATE NOT NULL, period_end DATE NOT NULL,
    input_amount BIGINT NOT NULL DEFAULT 0, output_amount BIGINT NOT NULL DEFAULT 0
);
