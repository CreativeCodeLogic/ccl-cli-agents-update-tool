import { createNpmPackageTool } from "./npm-package-tool";

// docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/:
// `npm install -g netlify-cli` (bins netlify and ntl; Node >= 22.13). Netlify
// suggests a local dev dependency in CI, so the project-copy check applies.
export const netlify = createNpmPackageTool({
  id: "netlify",
  group: "dev",
  name: "Netlify CLI",
  shortName: "Netlify",
  binNames: ["netlify"],
  pkg: "netlify-cli",
  description: "Netlify's CLI for sites, functions and deploys",
  docsUrl: "https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/",
});