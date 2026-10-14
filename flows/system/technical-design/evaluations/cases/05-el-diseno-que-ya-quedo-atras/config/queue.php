<?php

return [
    'connections' => [
        'database' => [
            'driver' => 'database', 'table' => 'jobs', 'queue' => 'default',
            'retry_after' => 90,
        ],
        // Conexión propia para trabajos largos: con retry_after = 90 la cola default daba la
        // generación de exógena por abandonada y la liberaba mientras seguía ejecutándose.
        'database_reports' => [
            'driver' => 'database', 'table' => 'jobs', 'queue' => 'exogena',
            'retry_after' => 7200,
        ],
    ],
];
