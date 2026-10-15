-- Consolidación por tercero, control de cadenas de transferencia y tope en UVT.
CREATE TABLE tax_report_generation_parties (
    id BIGSERIAL PRIMARY KEY, generation_id BIGINT NOT NULL REFERENCES tax_report_generations(id),
    document VARCHAR(20) NOT NULL, document_type_id INT, dian_document_type_code VARCHAR(2),
    name_to_invoice VARCHAR(450), municipality_dane_code VARCHAR(5),
    input_amount BIGINT NOT NULL DEFAULT 0, output_amount BIGINT NOT NULL DEFAULT 0,
    party_conflict_count INT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL,
    UNIQUE (generation_id, document)
);
CREATE TABLE tax_report_transfer_chains (
    id BIGSERIAL PRIMARY KEY, generation_id BIGINT NOT NULL, origin_wallet_id BIGINT NOT NULL,
    hop INT NOT NULL, wallet_id BIGINT NOT NULL, history_wallet_id BIGINT NOT NULL
);
CREATE TABLE tax_report_uvt_values (fiscal_year INT PRIMARY KEY, uvt_value BIGINT NOT NULL);
