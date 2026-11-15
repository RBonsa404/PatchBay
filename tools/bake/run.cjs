// The whole light bake, to run again whenever a room changes: npm run bake (the game must be running on port 5180).
// 1. export.cjs: the still parts of the building, from the game. 2. Blender (Cycles, on the graphics card): the light.
// 3. finish.cjs: WebP pictures and the manifest, in apps/web/src/assets/lightmaps/. About seven minutes on an RTX 4050.
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '../..');
const blender = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

run('node', ['tools/bake/export.cjs']);
run(blender, ['--background', '--factory-startup', '--python', 'art/blender/bake_lightmaps.py', '--', 'art/bake/scene.json', 'art/bake', process.argv[2] || 'all', '1', process.argv[3] || '256']);
run('node', ['tools/bake/finish.cjs']);
