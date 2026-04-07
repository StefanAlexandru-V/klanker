import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/v1': {
        target: 'http://10.3.58.20:1234',
        changeOrigin: true,
      },
      '/search': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    alias: {
      '$lib': '/src/lib',
    },
  },
})
