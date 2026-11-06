<?php
declare(strict_types=1);

namespace Nightcrossing;

use PDO;

final class Database
{
    private PDO $db;

    public function __construct(array $config)
    {
        $this->db = new PDO($config['dsn'], $config['username'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }

    public function player(string $uid): ?array
    {
        $query = $this->db->prepare('SELECT uid, email, display_name AS displayName FROM nc_players WHERE uid = ?');
        $query->execute([$uid]);
        return $query->fetch() ?: null;
    }

    public function login(array $claims): array
    {
        // Identity is Google's immutable subject, never the email address.
        $uid = 'g_' . bin2hex(random_bytes(16));
        $query = $this->db->prepare('INSERT INTO nc_players (uid, google_sub, email, display_name)
            VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name)');
        $query->execute([$uid, $claims['sub'], mb_substr($claims['email'] ?? '', 0, 320),
            mb_substr($claims['name'] ?? '', 0, 255)]);
        $query = $this->db->prepare('SELECT uid FROM nc_players WHERE google_sub = ?');
        $query->execute([$claims['sub']]);
        $playerUid = $query->fetchColumn();
        // Only the request whose generated UID was inserted created the player,
        // including when two first sign-ins race for the same Google subject.
        $isNewAccount = $playerUid === $uid;
        $uid = $playerUid;
        $query = $this->db->prepare('INSERT IGNORE INTO nc_saves (uid) VALUES (?)');
        $query->execute([$uid]);
        return $this->player($uid) + ['isNewAccount' => $isNewAccount];
    }

    public function bySubject(string $subject): ?array
    {
        $query = $this->db->prepare('SELECT uid FROM nc_players WHERE google_sub = ?');
        $query->execute([$subject]);
        return $query->fetch() ?: null;
    }

    public function read(string $uid): array
    {
        $query = $this->db->prepare('SELECT revision, payload FROM nc_saves WHERE uid = ?');
        $query->execute([$uid]);
        $row = $query->fetch();
        if (!$row) throw new HttpError(401, 'Sign in again before syncing this account.');
        return ['revision' => (int) $row['revision'], 'payload' => $row['payload']];
    }

    public function write(string $uid, int $revision, string $payload): array
    {
        // Compare-and-swap is atomic across devices. A stale writer receives
        // the current save and must merge again rather than overwrite it.
        $query = $this->db->prepare('UPDATE nc_saves SET payload = ?, revision = revision + 1 WHERE uid = ? AND revision = ?');
        $query->execute([$payload, $uid, $revision]);
        if ($query->rowCount() !== 1) throw new HttpError(409, 'Another device saved first. Merge and retry.');
        return ['revision' => $revision + 1, 'payload' => $payload];
    }

    public function delete(string $uid): void
    {
        // The foreign key deletes the save in the same transaction.
        $query = $this->db->prepare('DELETE FROM nc_players WHERE uid = ?');
        $query->execute([$uid]);
    }
}
