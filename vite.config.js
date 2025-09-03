import process from 'process'; // Importa o objeto process do Node
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 10000
  },
  preview: {
    allowedHosts: ["task-manager-16h0.onrender.com"]
  }
})
