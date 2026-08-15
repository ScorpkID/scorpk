const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/ui/index.tsx'],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    outfile: 'media/webview.js',
    sourcemap: !production,
    minify: production,
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    console.log('watching...');
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
