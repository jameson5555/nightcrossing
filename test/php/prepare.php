<?php
declare(strict_types=1);
$dsn = getenv('NC_TEST_DATABASE_DSN') ?: 'mysql:host=127.0.0.1;port=33316;dbname=nightcrossing_test;charset=utf8mb4';
// Refuse any DSN except our isolated loopback test DB, never load live config.
if (!preg_match('/^mysql:host=127\.0\.0\.1;port=\d+;dbname=nightcrossing_test;charset=utf8mb4$/D', $dsn)) {
    throw new RuntimeException('Use only the isolated nightcrossing_test database.');
}
$db = new PDO($dsn, 'root', 'nightcrossing-test-only', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('DROP TABLE IF EXISTS nc_saves');
$db->exec('DROP TABLE IF EXISTS nc_players');
$db->exec(file_get_contents(dirname(__DIR__, 2) . '/server/schema.sql'));
echo "Prepared isolated test database.\n";
