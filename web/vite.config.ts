import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const version = process.env.VERSION || 'dev';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-version',
      transformIndexHtml(html) {
        return html.replace('</head>', `  <meta name="version" content="${version}">\n  </head>`);
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
});
