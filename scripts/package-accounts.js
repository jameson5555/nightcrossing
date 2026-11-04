import { execFileSync } from 'node:child_process';
import { mkdir, rm, access, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import process from 'node:process';

// An explicit allowlist prevents credentials, sessions and test-only login
// providers from entering the release. Upload this OUTSIDE public_html.
const server = fileURLToPath(new URL('../server/', import.meta.url));
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
const output = `${artifacts}nightcrossing-private.zip`;
await access(`${server}vendor/autoload.php`);
await mkdir(artifacts, { recursive: true });
await rm(output, { force: true });
execFileSync('zip', ['-q', '-r', output, 'composer.json', 'composer.lock',
  'config.example.php', 'schema.sql', 'README.md', 'src', 'vendor',
  // Google service API wrappers (Drive, Gmail, etc.) are not used for login.
  // Retain their autoload entrypoint/metadata but omit the 200MB of wrappers.
  '-x', 'vendor/google/apiclient-services/src/*'], { cwd: server });
const entries = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).split('\n');
if (entries.some(entry => entry === 'config.php' || /^(runtime|test)\//.test(entry))) {
  await rm(output);
  throw new Error('Private credentials or test files must not enter a release.');
}
const extracted = await mkdtemp(`${tmpdir()}/nightcrossing-package-`);
try {
  execFileSync('unzip', ['-q', output, '-d', extracted]);
  // Exercise the actual stripped package, including its Composer autoloader.
  execFileSync('php', [fileURLToPath(new URL('../test/php/google-login.php', import.meta.url))], {
    env: { ...process.env, NC_TEST_PRIVATE_DIR: extracted },
  });
} finally { await rm(extracted, { recursive: true, force: true }); }
console.log(`Private backend package: ${output}`);
