import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/weimo-ui-editor/',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/.pnpm/@tiptap+') || id.includes('/node_modules/.pnpm/prosemirror-')) {
            return 'rich-editor'
          }

          if (
            id.includes('/node_modules/.pnpm/react-markdown@') ||
            id.includes('/node_modules/.pnpm/rehype-') ||
            id.includes('/node_modules/.pnpm/remark-') ||
            id.includes('/node_modules/.pnpm/unified@')
          ) {
            return 'markdown-renderer'
          }
        },
      },
    },
  },
  server: {
    port: 4178,
    strictPort: true,
  },
})
