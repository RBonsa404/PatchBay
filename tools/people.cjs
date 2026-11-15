// Build the game's people with Blender and MakeHuman (MPFB extension, its free asset packs) and their shared
// animations (Quaternius's Universal Animation Library, CC0, kept in art/vendor/).
//   node tools/people.cjs            every person of art/blender/mh_cast.json, then anims.glb
//   node tools/people.cjs awa anims  only those
// The cast itself is written by `python art/blender/make_cast.py`.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const blender = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const only = process.argv.slice(2);
const out = path.join(root, 'apps/web/public/models/people');
fs.mkdirSync(out, { recursive: true });
const cast = JSON.parse(fs.readFileSync(path.join(root, 'art/blender/mh_cast.json'), 'utf8'));
const run = (script, args) =>
  execFileSync(blender, ['--background', '--python', `art/blender/${script}`, '--', ...args], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
for (const name of Object.keys(cast)) {
  if (name.startsWith('_') || (only.length && !only.includes(name))) continue;
  const file = path.join(out, `${name}.glb`);
  run('mh_person.py', [`art/blender/mh_cast.json#${name}`, file]);
  console.log(name, kb(file), 'Ko');
}
if (!only.length || only.includes('anims')) {
  const file = path.join(out, 'anims.glb');
  run('mh_anims.py', ['art/vendor/UAL1_Standard.glb', file]);
  console.log('anims', kb(file), 'Ko');
}
