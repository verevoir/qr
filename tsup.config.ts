import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/node.ts',
    'src/web.ts',
    'src/qrcode/index.ts',
    'src/qrcode/node.ts',
    'src/qrcode/web.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['@resvg/resvg-js', 'node:fs/promises'],
});
