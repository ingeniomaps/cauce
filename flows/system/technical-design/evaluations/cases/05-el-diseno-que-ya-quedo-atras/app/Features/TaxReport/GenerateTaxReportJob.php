<?php

namespace App\Features\TaxReport;

use Illuminate\Support\Facades\DB;

final class GenerateTaxReportJob
{
    public string $connection = 'database_reports';
    public string $queue = 'exogena';
    public int $timeout = 7000;

    public function __construct(private int $generationId) {}

    public function handle(TaxReportGenerator $generator): void
    {
        // Se lee la base transaccional, no el almacén analítico: el informe debe reproducir cifras
        // exactas al peso para una fiscalización. Contrastado 2022: entradas y salidas coinciden con
        // la suma directa sobre history_wallets sin un peso de diferencia.
        DB::connection('pgsql')->statement("SET statement_timeout = '1200s'");

        $generation = TaxReportGeneration::findOrFail($this->generationId);
        $generation->markProcessing();

        $generator->materializeRows($generation);     // tax_report_generation_rows
        $generator->resolveTransferChains($generation); // tax_report_transfer_chains
        $generator->consolidateParties($generation);    // tax_report_generation_parties
        $generator->applyUvtThreshold($generation);     // tax_report_uvt_values

        $generation->markDone();
    }
}
