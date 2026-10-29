/* global console */
// Dev server for the preview page: bundles main.ts, rebuilds on change, serves this folder on http://127.0.0.1:5173
import * as esbuild from 'esbuild';

const ctx = await esbuild.context({
  entryPoints: ['main.ts'],
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  logLevel: 'info',
});
await ctx.watch();
const { host, port } = await ctx.serve({ servedir: '.', host: '127.0.0.1', port: 5173 });
console.log(`PatchBay preview: http://${host}:${port}`);
