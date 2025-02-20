import process from 'process'; // Importa o objeto process do Node
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Permite que a aplicação escute em todas as interfaces
    port: Number(process.env.PORT) || 10000 // Usa a variável de ambiente PORT ou 10000 por padrão
  }
})
