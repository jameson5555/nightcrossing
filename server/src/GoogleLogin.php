<?php
declare(strict_types=1);

namespace Nightcrossing;

use Google\Client;
use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\ClientInterface;

final class GoogleLogin
{
    private Client $client;

    public function __construct(private array $config, ?ClientInterface $httpClient = null)
    {
        $this->client = new Client();
        $this->client->setClientId($config['google_client_id']);
        $this->client->setClientSecret($config['google_client_secret']);
        $this->client->setRedirectUri($config['origin'] . $config['api_path'] . '?action=callback');
        $this->client->setScopes(['openid', 'email', 'profile']);
        $this->client->setPrompt('select_account');
        $this->client->setHttpClient($httpClient ?? new HttpClient(['timeout' => 10, 'connect_timeout' => 5]));
    }

    public function authorize(array $flow): string
    {
        $this->client->setState($flow['state']);
        return $this->client->createAuthUrl(null, [
            'nonce' => $flow['nonce'],
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $flow['verifier'], true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
        ]);
    }

    public function verify(string $code, array $flow): array
    {
        $tokens = $this->client->fetchAccessTokenWithAuthCode($code, $flow['verifier']);
        if (!is_string($tokens['id_token'] ?? null)) throw new HttpError(401, 'Google sign-in could not be verified.');
        // The official library checks signature, audience, issuer and expiry.
        $claims = $this->client->verifyIdToken($tokens['id_token']);
        if (!$claims || ($claims['aud'] ?? null) !== $this->config['google_client_id'] ||
            !is_int($claims['exp'] ?? null) || $claims['exp'] <= time() ||
            !in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true) ||
            !is_string($claims['sub'] ?? null) || strlen($claims['sub']) > 255 ||
            !preg_match('/^[\x21-\x7e]+$/D', $claims['sub']) ||
            !is_string($claims['nonce'] ?? null) || !hash_equals($flow['nonce'], $claims['nonce'])) {
            throw new HttpError(401, 'Google sign-in could not be verified.');
        }
        // Tokens are used only for this login and are never stored in the DB.
        return $claims;
    }
}
