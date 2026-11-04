# Nightcrossing private account backend

Install these files in `/home/CPANEL_USER/nightcrossing-private`, **outside
public_html**. Do not put this directory inside the game's public directory.
The public entrypoint is `public/api/index.php` in the source repository and
`nightcrossing/api/index.php` on the website.

Copy `config.example.php` to `config.php` here and enter the database and Google
OAuth client values. Do not upload config.php to GitHub or share its contents.
The PHP process needs read access to this directory and write access to
`runtime/sessions`, which it creates with restrictive permissions. Keep the
directory private to your hosting account; use permissions appropriate to your
host's PHP user (typically 0700 for private directories and 0600 for config.php).

Import schema.sql into the dedicated database through phpMyAdmin. It creates
tables without dropping existing data. The runtime DB user needs SELECT, INSERT,
UPDATE and DELETE on that database; schema import also needs CREATE/REFERENCES.

Google callback (register this exact URI, including the query string):
`https://jamesonmacarthur.com/nightcrossing/api/index.php?action=callback`

The source repository's `docs/cloud-saves.md` has the full setup and verification
steps. Backend updates replace src/ and vendor/ from the release package; keep
your private config.php and runtime/ directory.
