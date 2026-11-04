<?php
declare(strict_types=1);

// Copy to config.php IN THE PRIVATE DIRECTORY, outside public_html.
// Never commit config.php, put it in dist/, or paste its contents into chat.
return [
    'origin' => 'https://jamesonmacarthur.com',
    'api_path' => '/nightcrossing/api/index.php',
    'development' => false,
    'google_client_id' => 'REPLACE.apps.googleusercontent.com',
    'google_client_secret' => 'REPLACE',
    'database' => [
        'dsn' => 'mysql:host=localhost;dbname=REPLACE;charset=utf8mb4',
        'username' => 'REPLACE',
        'password' => 'REPLACE',
    ],
];
