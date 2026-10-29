import { createNpmPackageTool } from "./npm-package-tool";
import { linkOnly } from "../whatsnew/sources";

// vercel.com/docs/cli: `npm i -g vercel` (also pnpm/yarn/bun); bins vercel and
// vc. `vercel upgrade` exists too; a global npm install is updated with npm
// like every other npm CLI.
export const vercel = createNpmPackageTool({
  id: "vercel",
  group: "dev",
  name: "Vercel CLI",
  shortName: "Vercel",
  binNames: ["vercel"],
  pkg: "vercel",
  description: "Vercel's CLI for deploying and managing projects",
  docsUrl: "https://vercel.com/docs/cli",
  releaseNotes: linkOnly("https://vercel.com/changelog"),
});