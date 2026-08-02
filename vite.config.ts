import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
  },
});
