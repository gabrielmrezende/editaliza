import type { NextConfig } from "next";

// Opções geradas pelo create-next-app@latest (padrão do template; mantidas):
// - cacheComponents: dados por request (cookies/sessão Supabase) exigem <Suspense> ou cache
//   explícito. Ver node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
// - partialPrefetching: prefetch parcial de rotas (par do cacheComponents); sem impacto no código.
// - turbopack.rules "*.css": processa o Tailwind v4 via @tailwindcss/turbopack; necessário para o CSS.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
