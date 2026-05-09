import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const portEnv = process.env.PORT ? Number(process.env.PORT) : undefined;
  return {
    plugins: [react()],
    base: env.VITE_BASE ?? "/",
    server: portEnv ? { port: portEnv, strictPort: true } : undefined,
  };
});

declare const process: { cwd(): string; env: Record<string, string | undefined> };
