import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Standard TanStack Start setup. Nitro lets the same code build for Vercel.
// Server-side code reads settings such as SUPABASE_URL from process.env,
// so the .env file is loaded into process.env for local development.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    server: { port: 8080 },
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
    plugins: [tsConfigPaths(), tanstackStart(), nitro(), viteReact(), tailwindcss()],
  };
});