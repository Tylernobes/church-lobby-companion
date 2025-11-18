import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist/renderer",
    emptyOutDir: true,
  },
  base: "./", // Use relative paths for production builds
  plugins: [react()],
  server: { port: 5173 },
});
