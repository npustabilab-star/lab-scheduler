import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      if (!env[key]) throw new Error(`正式版建置缺少環境變數 ${key}`)
    }
  }
  return { plugins: [react(), tailwindcss()] }
})
