import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Efeitos atuais leem sessionStorage e disparam busca chamando
      // setState no corpo (auth-provider, caixa-app, dashboard-screen,
      // reservations-block). Aviso até um PR separar esse ciclo.
      "react-hooks/set-state-in-effect": "warn",
      // Logos e banners do caixa usam <img>. Aviso até um PR avaliar
      // next/image. O preset já emite aviso; mantemos aviso de propósito.
      "@next/next/no-img-element": "warn",
    },
  },
])

export default eslintConfig
