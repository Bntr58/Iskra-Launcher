'use strict';

/*
 * Portable build. Wraps @electron/packager and, crucially, preserves the
 * portable data that lives next to the .exe across rebuilds:
 *   - dist/IskraLauncher-win32-x64/images         (game covers)
 *   - dist/IskraLauncher-win32-x64/config.json    (games + colours)
 *   - dist/IskraLauncher-win32-x64/localization/  (UI strings per language)
 *
 * `--overwrite` wipes the output folder, so we stash those, repackage, and
 * put them back. An empty `images/` folder is always left in place.
 * `localization/` has no runtime-generated default, so on a first-ever
 * build (nothing to stash) it's seeded from the repo's own localization/
 * folder; after that it's just preserved as-is, so translations added or
 * edited directly in the built folder survive later rebuilds.
 *
 * Run: npm run pack
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const packager = require('@electron/packager');
const { bumpVersion } = require('./bump-version');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist');
const appOut = path.join(outDir, 'IskraLauncher-win32-x64');
const PRESERVE = ['images', 'config.json', 'localization'];

async function main() {
  // 0. bump the ГГ.ММ.ДД.НН build version (see scripts/bump-version.js)
  const versionInfo = bumpVersion();

  // 1. stash portable data from a previous build (if any)
  const stash = fs.mkdtempSync(path.join(os.tmpdir(), 'iskra-pack-'));
  const stashed = [];
  for (const name of PRESERVE) {
    const src = path.join(appOut, name);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(stash, name), { recursive: true });
      stashed.push(name);
    }
  }

  // 2. repackage
  const [built] = await packager({
    dir: root,
    name: 'IskraLauncher',
    platform: 'win32',
    arch: 'x64',
    out: outDir,
    overwrite: true,
    asar: true,
    icon: path.join(root, 'renderer', 'assets', 'icon.ico'),
    appVersion: versionInfo.version,
    ignore: [
      /^\/dist($|\/)/,
      /^\/scripts($|\/)/,
      /^\/\.git($|\/)/,
      /^\/images($|\/)/,       // dev-time portable data, never bundle it
      /^\/config\.json$/,
      /^\/localization($|\/)/ // shipped as a loose folder instead, see below
    ]
  });

  // 3. restore preserved data, and always leave an images/ folder
  for (const name of stashed) {
    fs.cpSync(path.join(stash, name), path.join(built, name), { recursive: true });
  }
  fs.mkdirSync(path.join(built, 'images'), { recursive: true });
  if (!stashed.includes('localization')) {
    fs.cpSync(path.join(root, 'localization'), path.join(built, 'localization'), { recursive: true });
  }
  fs.rmSync(stash, { recursive: true, force: true });

  console.log(`\nPackaged: ${built}`);
  console.log(`Version: ${versionInfo.version}`);
  console.log(stashed.length ? `Preserved: ${stashed.join(', ')}` : 'No previous portable data to preserve.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
