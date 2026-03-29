import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/noaa/json': {
        target: 'https://services.swpc.noaa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/noaa\/json/, '/json'),
      },
      '/api/noaa/products': {
        target: 'https://services.swpc.noaa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/noaa\/products/, '/products'),
      },
    },
  },
});
