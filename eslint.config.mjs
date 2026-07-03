// Next 16 removed `next lint`; eslint 9 runs directly against this flat config.
// eslint-config-next@16 ships native flat configs (no FlatCompat needed).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off", // curly quotes in copy are fine
      // This app is an imperative game loop bridged into React through refs
      // (engine/renderer/input live outside the React tree). The React-Compiler
      // -era hooks rules flag that architecture wholesale, so keep them visible
      // as warnings instead of refactoring working, test-covered game code.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default config;
