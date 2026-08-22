import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: !isWatch,
  treeShaking: true,
  loader: {
    '.wasm': 'file',
  },
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview/src/main.tsx'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: !isWatch,
  treeShaking: true,
  jsx: 'automatic',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    'import.meta.env': JSON.stringify({ MODE: isWatch ? 'development' : 'production' }),
  },
};

function copyWebviewCss() {
  mkdirSync('dist', { recursive: true });
  copyFileSync('webview/src/style.css', 'dist/webview.css');
}

async function main() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    copyWebviewCss();
    console.log('[esbuild] watching extension + webview for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    copyWebviewCss();
    console.log('[esbuild] extension + webview build complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
