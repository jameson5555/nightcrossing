<?php
declare(strict_types=1);

// For /home/USER/public_html/nightcrossing/api this resolves to
// /home/USER/nightcrossing-private. Override with an environment variable if
// your document root is elsewhere. No credentials belong in this public file.
$private = getenv('NC_PRIVATE_DIR') ?: dirname(__DIR__, 3) . '/nightcrossing-private';
if (!is_file($private . '/vendor/autoload.php') || !is_file($private . '/config.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'Account saves are not configured yet. Guest progress remains on this device.']);
    exit;
}
try {
    require $private . '/vendor/autoload.php';
    \Nightcrossing\Api::run(require $private . '/config.php');
} catch (\Throwable $error) {
    error_log('Nightcrossing account bootstrap: ' . get_class($error));
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'Account saves are unavailable. Your progress remains on this device.']);
}
