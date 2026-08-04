import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (id.includes('/maplibre-gl/')) return 'maplibre-gl';
          if (id.includes('/@supabase/') || id.includes('/@gotrue/')) {
            return 'supabase';
          }
          if (id.includes('/motion/') || id.includes('/framer-motion/')) {
            return 'motion';
          }
          if (id.includes('/lucide-react/')) return 'icons';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
