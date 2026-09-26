'use strict';

/*
 * Builds dist\IskraLauncherSetup.exe from dist\IskraLauncher-win32-x64 via
 * NSIS (scripts/installer.nsi). Requires `npm run pack` to have been run
 * first, and NSIS installed (e.g. `winget install NSIS.NSIS`).
 *
 * Run: npm run installer
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'dist', 'IskraLauncher-win32-x64');
const nsiFile = path.join(__dirname, 'installer.nsi');

if (!fs.existsSync(srcDir)) {
  console.error('dist\\IskraLauncher-win32-x64 not found — run `npm run pack` first.');
  process.exit(1);
}

const CANDIDATES = [
  'makensis',
  'C:\\Program Files (x86)\\NSIS\\makensis.exe',
  'C:\\Program Files\\NSIS\\makensis.exe'
];

function findMakensis() {
  for (const candidate of CANDIDATES) {
    if (!spawnSync(candidate, ['/VERSION'], { stdio: 'ignore' }).error) return candidate;
  }
  return null;
}

const makensis = findMakensis();
if (!makensis) {
  console.error('makensis.exe not found. Install NSIS first: winget install NSIS.NSIS');
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf-8'));
console.log(`Building IskraLauncherSetup_${version}.exe`);

const res = spawnSync(
  makensis,
  [`/DPROJECT_ROOT=${root}`, `/DAPP_VERSION=${version}`, nsiFile],
  { stdio: 'inherit', cwd: root }
);
process.exit(res.status ?? 1);
