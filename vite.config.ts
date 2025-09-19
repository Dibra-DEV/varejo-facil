import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/TmConsultoria": {
        target: "http://10.0.10.35",
        changeOrigin: true,
        secure: false,
        ws: false,
      },
    },
  },
});
