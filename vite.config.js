import { defineConfig } from 'vite'

export default defineConfig({
  // Makes all asset paths relative to the current folder
  base: './',
  
  build: {
    // Optional: Changes the output directory name if you want (defaults to 'dist')
    outDir: 'dist', 
  }
})

