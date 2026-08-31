import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Standalone Vite config (no longer depends on @lovable.dev/vite-tanstack-config).
//
// This wires up, manually, the same pieces that Lovable's wrapper used to
// provide: TanStack Start, React, Tailwind v4, tsconfig path aliases (@/*),
// and a Nitro build preset.
//
// Deployment target: the "preset" below controls which server runtime Nitro
// builds for. It's set to "vercel" so `vite build` produces a `.vercel/output`
// directory that Vercel understands out of the box. If you deploy elsewhere,
// change it (e.g. "node-server" for a plain Node host, "netlify", or
// "cloudflare-module" for Cloudflare Workers/Pages).
export default defineConfig({
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      server: {
        entry: "server",
        preset: "vercel",
      },
    }),
    viteReact(),
  ],
  server: {
    port: 8080,
  },
});
