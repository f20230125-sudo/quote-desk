import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds into ../public, served by Vercel's CDN; Flask serves index.html for deep links.
// In development Vite runs on 5200 and passes /api to Flask on 5201.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../public", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5200, strictPort: true, proxy: { "/api": "http://127.0.0.1:5201" } },
  preview: { host: "127.0.0.1", port: 5200, strictPort: true },
});
