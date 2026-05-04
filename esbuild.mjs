import * as esbuild from 'esbuild';

const isProd = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  minify: isProd,
  sourcemap: !isProd ? 'inline' : false,
  logLevel: 'info',
};

// Extension host bundle (Node.js / CommonJS)
const extensionConfig = {
  ...sharedOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
};

// Webview bundle (browser / IIFE — self-executing in <script> tag)
const webviewConfig = {
  ...sharedOptions,
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  define: {
    'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
  },
};

if (isWatch) {
  const [extCtx, webCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
}
