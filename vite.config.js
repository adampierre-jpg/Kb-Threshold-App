import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true, // Allow access from network (for testing on phone)
  },
  build: {
    outDir: 'dist',
  },
});
