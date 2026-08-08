import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Next's flat configs are the ones eslint-config-next already ships, so this
// is the whole config: the rules Next recommends, plus the paths that are
// not source.
const config = [
  {
    ignores: [".next/**", "dist/**", "plugin/**"],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
