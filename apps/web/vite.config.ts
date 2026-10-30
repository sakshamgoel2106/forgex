import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web'],
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/healthz': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/readyz': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
