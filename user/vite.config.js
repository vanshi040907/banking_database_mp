import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../shared', import.meta.url));
// where the Express backend listens (its default PORT is 5000); override with API_URL
const api = process.env.API_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': shared } },
  server: {
    fs: { allow: ['..'] },
    proxy: { '/api': api },
  },
});
