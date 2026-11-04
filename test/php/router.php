<?php
// Test-only entrypoint. This file is never copied to public/ or release packages.
declare(strict_types=1);
require dirname(__DIR__, 2) . '/server/vendor/autoload.php';
$config = [
    'origin' => getenv('NC_TEST_ORIGIN') ?: 'http://127.0.0.1:8099',
    'api_path' => '/nightcrossing/api/index.php',
    'development' => true,
    'google_client_id' => 'test.apps.googleusercontent.com',
    'google_client_secret' => 'test-secret',
    'session_directory' => getenv('NC_TEST_SESSION_DIR') ?: '/tmp/nightcrossing-api-test-sessions',
    'database' => ['dsn' => getenv('NC_TEST_DATABASE_DSN') ?: 'mysql:host=127.0.0.1;port=33316;dbname=nightcrossing_test;charset=utf8mb4',
        'username' => 'root', 'password' => 'nightcrossing-test-only'],
];
$login = new class {
    public function authorize(array $flow): string
    {
        return 'https://accounts.google.com/mock-nightcrossing?state=' . $flow['state'];
    }
    public function verify(string $code, array $flow): array
    {
        if (!in_array($code, ['alice', 'bob'], true)) throw new \Nightcrossing\HttpError(401, 'Invalid fictional Google token.');
        return ['sub' => 'fictional-' . $code, 'email' => $code . '@example.test', 'name' => ucfirst($code)];
    }
};
\Nightcrossing\Api::run($config, $login);
