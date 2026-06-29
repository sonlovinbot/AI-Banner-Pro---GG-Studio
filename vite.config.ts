import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3100,
    host: '0.0.0.0',
    // strictPort: nếu 3100 cũng bị chiếm, Vite tự nhảy 3101/3102...
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
