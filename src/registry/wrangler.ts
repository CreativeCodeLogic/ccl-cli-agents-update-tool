import { createNpmPackageTool } from "./npm-package-tool";

// developers.cloudflare.com/workers/wrangler/install-and-update/: npm only
// (bins wrangler, wrangler2, cf-wrangler; Node >= 22). Cloudflare recommends a
// per-project install ("rather than globally"), so the project-copy check and
// an info note apply. No self-update command.
const DOCS = "https://developers.cloudflare.com/workers/wrangler/install-and-update/";

export const wrangler = createNpmPackageTool({
  id: "wrangler",
  group: "dev",
  name: "Wrangler",
  binNames: ["wrangler"],
  pkg: "wrangler",
  description: "Cloudflare's CLI for Workers and the developer platform",
  docsUrl: DOCS,
  notes: [{ kind: "info", message: "Cloudflare recommends installing Wrangler per project (npm i -D wrangler).", url: DOCS }],
});