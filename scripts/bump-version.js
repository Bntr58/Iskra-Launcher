'use strict';

/*
 * Build version: ГГ.ММ.ДД.НН — bumps automatically on every `npm run pack`.
 * НН resets to 01 on the first build of a new day, otherwise increments.
 * State lives in version.json at the project root (tracked with the source,
 * not the portable user data in config.json/images/).
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'version.json');

const pad2 = (n) => String(n).padStart(2, '0');

function todayParts() {
  const d = new Date();
  return {
    y: pad2(d.getFullYear() % 100),
    m: pad2(d.getMonth() + 1),
    day: pad2(d.getDate()),
    iso: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  };
}

function bumpVersion() {
  const { y, m, day, iso } = todayParts();

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch { /* first build */ }

  const build = prev && prev.date === iso ? (Number(prev.build) || 0) + 1 : 1;
  const info = { version: `${y}.${m}.${day}.${pad2(build)}`, date: iso, build };

  fs.writeFileSync(FILE, JSON.stringify(info, null, 2) + '\n', 'utf-8');
  return info;
}

module.exports = { bumpVersion };

if (require.main === module) {
  const info = bumpVersion();
  console.log('Version bumped to', info.version);
}
