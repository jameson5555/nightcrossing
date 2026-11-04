<?php
declare(strict_types=1);
$private = getenv('NC_TEST_PRIVATE_DIR') ?: dirname(__DIR__, 2) . '/server';
require $private . '/vendor/autoload.php';

use Firebase\JWT\JWT;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Nightcrossing\GoogleLogin;

$key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
$details = openssl_pkey_get_details($key);
$encode = fn (string $value) => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
$jwks = ['keys' => [['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => 'fictional-test-key',
    'n' => $encode($details['rsa']['n']), 'e' => $encode($details['rsa']['e'])]]];
$config = ['origin' => 'https://game.test', 'api_path' => '/nightcrossing/api/index.php',
    'google_client_id' => 'test.apps.googleusercontent.com', 'google_client_secret' => 'fictional-secret'];
$flow = ['state' => 'state-value', 'nonce' => 'nonce-value', 'verifier' => str_repeat('a', 64)];
$claims = ['iss' => 'https://accounts.google.com', 'aud' => $config['google_client_id'], 'sub' => 'fictional-subject',
    'iat' => time() - 1, 'exp' => time() + 60, 'nonce' => $flow['nonce']];
$verify = function (array $payload, mixed $signingKey = null) use ($key, $jwks, $config, $flow) {
    $jwt = JWT::encode($payload, $signingKey ?? $key, 'RS256', 'fictional-test-key');
    $mock = new MockHandler([
        new Response(200, ['Content-Type' => 'application/json'], json_encode(['access_token' => 'fictional', 'id_token' => $jwt])),
        new Response(200, ['Content-Type' => 'application/json'], json_encode($jwks)),
    ]);
    $google = new GoogleLogin($config, new Client(['handler' => HandlerStack::create($mock)]));
    return $google->verify('fictional-code', $flow);
};
if ($verify($claims)['sub'] !== 'fictional-subject') throw new RuntimeException('Valid signed identity rejected');
echo "PASS signed identity verified\n";
$cases = [
    'wrong audience' => [...$claims, 'aud' => 'another-client'],
    'missing audience' => array_diff_key($claims, ['aud' => true]),
    'expired' => [...$claims, 'exp' => time() - 60],
    'missing expiry' => array_diff_key($claims, ['exp' => true]),
    'wrong issuer' => [...$claims, 'iss' => 'https://attacker.test'],
    'wrong nonce' => [...$claims, 'nonce' => 'different'],
    'missing nonce' => array_diff_key($claims, ['nonce' => true]),
];
foreach ($cases as $name => $payload) {
    $rejected = false;
    try { $verify($payload); } catch (Throwable) { $rejected = true; }
    if (!$rejected) throw new RuntimeException('Accepted ' . $name);
    echo "PASS rejected $name\n";
}
$rejected = false;
try { $verify($claims, openssl_pkey_new(['private_key_bits' => 2048])); } catch (Throwable) { $rejected = true; }
if (!$rejected) throw new RuntimeException('Accepted invalid signature');
echo "PASS rejected invalid signature\n";
parse_str(parse_url((new GoogleLogin($config))->authorize($flow), PHP_URL_QUERY), $query);
if ($query['scope'] !== 'openid email profile' || $query['state'] !== $flow['state'] ||
    $query['nonce'] !== $flow['nonce'] || $query['code_challenge_method'] !== 'S256' ||
    $query['code_challenge'] !== $encode(hash('sha256', $flow['verifier'], true)) ||
    $query['redirect_uri'] !== $config['origin'] . $config['api_path'] . '?action=callback') {
    throw new RuntimeException('Invalid authorization request');
}
echo "PASS authorization uses exact callback, basic scopes, state, nonce and PKCE\n";
