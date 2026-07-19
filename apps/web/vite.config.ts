import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } } },
  build: {
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], query: ['@tanstack/react-query'] } } },
  },
});
