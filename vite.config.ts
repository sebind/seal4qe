import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function githubPagesRootPlugin(): Plugin {
  return {
    name: 'github-pages-root-support',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) {
          // In `vite dev`, load directly from TypeScript source entry
          return html.replace('./assets/app.js', '/index.tsx');
        }
        // During `vite build`, transform ./assets/app.js back to ./index.tsx so Rollup bundles index.tsx
        return html.replace('./assets/app.js', './index.tsx');
      }
    },
    closeBundle() {
      // Copy compiled bundle to ./assets/app.js so GitHub Pages branch root deployment works out of the box
      const builtBundle = path.resolve(__dirname, 'dist/assets/app.js');
      const rootAssetsDir = path.resolve(__dirname, 'assets');
      const rootBundle = path.resolve(rootAssetsDir, 'app.js');
      if (fs.existsSync(builtBundle)) {
        fs.mkdirSync(rootAssetsDir, { recursive: true });
        fs.copyFileSync(builtBundle, rootBundle);
      }
    }
  };
}

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), githubPagesRootPlugin()],
  build: {
    copyPublicDir: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
