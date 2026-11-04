<?php
declare(strict_types=1);

namespace Nightcrossing;

final class Api
{
    public static function run(array $config, ?object $login = null): void
    {
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
        $action = $_GET['action'] ?? 'session';
        $redirectLogin = false;
        try {
            self::checkConfig($config);
            self::startSession($config);
            $database = new Database($config['database']);
            $method = $_SERVER['REQUEST_METHOD'];
            if ($action === 'callback') {
                if ($method !== 'GET') throw new HttpError(405, 'Use GET for this endpoint.');
                $redirectLogin = ($_SESSION['oauth']['redirect'] ?? false) === true;
                self::callback($database, $login ?? new GoogleLogin($config));
                if ($redirectLogin) {
                    session_write_close();
                    header('Location: ' . self::gameUrl($config), true, 303);
                } else self::popup($config, true);
                return;
            }
            $reads = ['session', 'save'];
            if ($method !== (in_array($action, $reads, true) ? 'GET' : 'POST')) {
                throw new HttpError(405, 'Unsupported request method.');
            }
            $body = [];
            if ($method === 'POST') {
                self::checkCsrf($config);
                if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
                    throw new HttpError(415, 'Send JSON to this endpoint.');
                }
                $raw = file_get_contents('php://input', false, null, 0, 1550001);
                if (strlen($raw) > 1550000) throw new HttpError(413, 'This save is too large. Download a backup.');
                try { $body = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
                catch (\JsonException) { throw new HttpError(400, 'Invalid JSON.'); }
                if (!is_array($body)) throw new HttpError(400, 'Invalid request.');
            }
            $user = isset($_SESSION['uid']) ? $database->player($_SESSION['uid']) : null;
            if (!$user) unset($_SESSION['uid'], $_SESSION['reauthenticated_at']);
            switch ($action) {
                case 'session':
                    self::json(['user' => $user, 'csrf' => $_SESSION['csrf'], 'loginAttempt' => $_SESSION['login_attempt'] ?? null]);
                    break;
                case 'authorize':
                    $reauth = ($body['reauthenticate'] ?? false) === true;
                    if ($reauth) self::assertOwner($user, $body['uid'] ?? null);
                    $flow = ['state' => bin2hex(random_bytes(32)), 'nonce' => bin2hex(random_bytes(32)),
                        'verifier' => bin2hex(random_bytes(32)), 'created' => time(),
                        'redirect' => !$reauth && ($body['redirect'] ?? false) === true,
                        'reauth_uid' => $reauth ? $user['uid'] : null];
                    $_SESSION['oauth'] = $flow;
                    self::json(['url' => ($login ?? new GoogleLogin($config))->authorize($flow), 'attempt' => $flow['state'],
                        'mode' => $flow['redirect'] ? 'redirect' : 'popup']);
                    break;
                case 'save':
                    self::assertOwner($user, $_GET['uid'] ?? null);
                    self::json($database->read($user['uid']));
                    break;
                case 'write':
                    self::assertOwner($user, $body['uid'] ?? null);
                    if (!is_int($body['revision'] ?? null) || $body['revision'] < 0 || $body['revision'] >= 9007199254740991) {
                        throw new HttpError(400, 'Invalid save revision.');
                    }
                    self::validatePayload($body['payload'] ?? null);
                    self::json($database->write($user['uid'], $body['revision'], $body['payload']));
                    break;
                case 'logout':
                    self::endSession($config);
                    self::json(['ok' => true]);
                    break;
                case 'delete':
                    self::assertOwner($user, $body['uid'] ?? null);
                    if (time() - ($_SESSION['reauthenticated_at'] ?? 0) > 300) {
                        throw new HttpError(403, 'Confirm with Google again before deleting your account.');
                    }
                    $database->delete($user['uid']);
                    self::endSession($config);
                    self::json(['ok' => true]);
                    break;
                default:
                    throw new HttpError(404, 'Unknown account endpoint.');
            }
        } catch (\Throwable $error) {
            $status = $error instanceof HttpError ? $error->status : 503;
            $message = $error instanceof HttpError ? $error->getMessage() :
                'Account saves could not be reached. Your progress remains on this device.';
            if (!($error instanceof HttpError)) error_log('Nightcrossing accounts: ' . get_class($error));
            if ($action === 'callback' && isset($_SESSION['csrf'])) self::popup($config, false, $message, !$redirectLogin);
            else { http_response_code($status); self::json(['error' => $message]); }
        }
    }

    private static function checkConfig(array $config): void
    {
        $origin = $config['origin'] ?? '';
        $parts = parse_url($origin);
        $local = ($config['development'] ?? false) && in_array($parts['host'] ?? '', ['localhost', '127.0.0.1'], true);
        if (!$parts || !isset($parts['host']) || isset($parts['path']) || isset($parts['query']) ||
            isset($parts['user']) || isset($parts['fragment']) ||
            (!str_starts_with($origin, 'https://') && !($local && str_starts_with($origin, 'http://'))) ||
            !preg_match('~^/[a-zA-Z0-9/_-]+\.php$~D', $config['api_path'] ?? '') ||
            empty($config['google_client_id']) || empty($config['google_client_secret'])) {
            throw new HttpError(503, 'Account saves need server configuration. Guest progress is still available.');
        }
        if (!$local && ($_SERVER['HTTPS'] ?? '') !== 'on' && ($_SERVER['SERVER_PORT'] ?? '') !== '443') {
            throw new HttpError(400, 'Account requests require HTTPS.');
        }
    }

    private static function startSession(array $config): void
    {
        $path = $config['session_directory'] ?? dirname(__DIR__) . '/runtime/sessions';
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) throw new \RuntimeException('Cannot create session directory');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', '2592000');
        session_save_path($path);
        session_name('nc_session');
        session_set_cookie_params(['lifetime' => 2592000, 'path' => dirname($config['api_path']) . '/',
            'secure' => !($config['development'] ?? false), 'httponly' => true, 'samesite' => 'Lax']);
        session_start();
        if (time() - ($_SESSION['last_seen'] ?? time()) > 2592000) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['last_seen'] = time();
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    }

    private static function checkCsrf(array $config): void
    {
        if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $config['origin'] ||
            !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_NC_CSRF'] ?? '')) {
            throw new HttpError(403, 'Refresh your account session and try again.');
        }
    }

    private static function assertOwner(?array $user, mixed $uid): void
    {
        if (!$user) throw new HttpError(401, 'Sign in again before syncing this account.');
        if (!is_string($uid) || $uid !== $user['uid']) throw new HttpError(403, 'This session belongs to a different account. Sign in again.');
    }

    private static function callback(Database $database, object $login): void
    {
        $flow = $_SESSION['oauth'] ?? null;
        unset($_SESSION['oauth']); // Authorization responses are single-use, including failures.
        if (!$flow || time() - $flow['created'] > 300 || !is_string($_GET['state'] ?? null) ||
            !hash_equals($flow['state'], $_GET['state'])) throw new HttpError(401, 'Sign-in expired. Close this window and try again.');
        if (isset($_GET['error'])) throw new HttpError(401, 'Google sign-in was cancelled.');
        if (!is_string($_GET['code'] ?? null) || strlen($_GET['code']) > 4096) throw new HttpError(400, 'Invalid sign-in response.');
        $claims = $login->verify($_GET['code'], $flow);
        if ($flow['reauth_uid']) {
            // Do not accidentally switch accounts while confirming a deletion.
            $queryUser = $database->bySubject($claims['sub']);
            if (($queryUser['uid'] ?? null) !== $flow['reauth_uid'] || ($_SESSION['uid'] ?? null) !== $flow['reauth_uid']) {
                throw new HttpError(403, 'Choose the same Google account to confirm deletion.');
            }
            $uid = $flow['reauth_uid'];
        } else {
            $user = $database->login($claims);
            $uid = $user['uid'];
        }
        // A mobile poll can arrive with the old cookie after this callback.
        // Retain an anonymous old session so strict mode does not issue a new
        // guest cookie that overwrites the authenticated cookie. Assign account
        // access only after rotation; the old session keeps no identity or flow.
        $_SESSION = ['last_seen' => time()];
        if (!session_regenerate_id(false)) throw new \RuntimeException('Cannot rotate session');
        $_SESSION = ['uid' => $uid, 'last_seen' => time(), 'csrf' => bin2hex(random_bytes(32)),
            'login_attempt' => $flow['state']];
        if ($flow['reauth_uid']) $_SESSION['reauthenticated_at'] = time();
    }

    public static function validatePayload(mixed $payload): void
    {
        if (!is_string($payload) || strlen($payload) > 750000) throw new HttpError(413, 'This save is too large or invalid. Download a backup.');
        try { $data = json_decode($payload, false, 48, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new HttpError(400, 'Invalid save JSON.'); }
        if (!is_object($data) || ($data->schemaVersion ?? null) !== 1 ||
            !is_int($data->clock ?? null) || $data->clock < 0 || $data->clock > 9007199254740991 ||
            !is_object($data->records ?? null) || !is_object($data->archives ?? null) || !is_object($data->choices ?? null)) {
            throw new HttpError(400, 'Unsupported save format.');
        }
        // Detailed puzzle validation remains in the shared client decoder.
        // Bound JSON size/depth and require records with valid timestamps here.
        self::validateRecords($data->records);
        foreach ($data->archives as $versions) {
            if (!is_object($versions)) throw new HttpError(400, 'Invalid saved editions.');
            foreach ($versions as $records) {
                if (!is_object($records)) throw new HttpError(400, 'Invalid saved edition.');
                self::validateRecords($records);
            }
        }
        self::validateRecords($data->choices);
    }

    private static function validateRecords(object $records): void
    {
        foreach ($records as $key => $record) {
            if (strlen((string) $key) > 256 || !is_object($record) ||
                !(is_string($record->value ?? null) || (property_exists($record, 'value') && $record->value === null)) ||
                !is_object($record->stamp ?? null) || !is_int($record->stamp->time ?? null) ||
                $record->stamp->time < 0 || $record->stamp->time > 9007199254740991 ||
                !is_string($record->stamp->device ?? null) || strlen($record->stamp->device) > 200) {
                throw new HttpError(400, 'Invalid saved progress record.');
            }
        }
    }

    private static function endSession(array $config): void
    {
        // Leave an anonymous tombstone for already submitted requests. Account
        // access is revoked now; PHP's normal session GC removes the old file.
        $_SESSION = ['last_seen' => time()];
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => dirname($config['api_path']) . '/',
            'secure' => !($config['development'] ?? false), 'httponly' => true, 'samesite' => 'Lax']);
        session_write_close();
    }

    private static function json(array $data): void
    {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    private static function gameUrl(array $config): string
    {
        return $config['origin'] . rtrim(dirname(dirname($config['api_path'])), '/') . '/';
    }

    private static function popup(array $config, bool $ok, string $error = '', bool $close = true): void
    {
        $nonce = bin2hex(random_bytes(16));
        header('Content-Type: text/html; charset=utf-8');
        header("Content-Security-Policy: default-src 'none'; script-src 'nonce-$nonce'; frame-ancestors 'none'; base-uri 'none'");
        $flags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
        $origin = json_encode($config['origin'], $flags);
        $message = json_encode(['type' => 'nightcrossing-auth', 'ok' => $ok, 'error' => $error], $flags);
        $game = htmlspecialchars(self::gameUrl($config), ENT_QUOTES);
        echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nightcrossing sign-in</title><body><p>' .
            htmlspecialchars($ok ? 'Signed in. You can close this window and return to Nightcrossing.' : $error, ENT_QUOTES) .
            "</p><p><a href=\"$game\">Return to Nightcrossing</a></p>" .
            ($close ? "<script nonce=\"$nonce\">if(window.opener)window.opener.postMessage($message,$origin);window.close();</script>" : '') .
            '</body></html>';
    }
}
