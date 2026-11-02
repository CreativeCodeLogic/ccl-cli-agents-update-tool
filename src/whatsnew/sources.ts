import type { InstallMethod } from "../types";

/*
 * Where each tool publishes its release notes (docs/whats-new-sources.md), and
 * how a version maps to them. Three kinds:
 * - github-release: one GitHub API request for the release of the version's tag;
 * - changelog-file: the first part of a Markdown file (HTTP Range), then the
 *   version's section, found by its heading;
 * - link-only: a web page, opened in the browser, never scraped.
 */

export type ReleaseNotesSource =
  | {
      kind: "github-release";
      /** owner/name */
      repo: string;
      /** The release tag for a version (e.g. "rust-v0.164.0"). */
      tag: (version: string) => string;
    }
  | {
      kind: "changelog-file";
      /** The raw file, fetched with a Range request. */
      url: string;
      /** Where a person reads it (the link). */
      page: string;
      /** The line that starts the version's section. */
      heading: (version: string) => RegExp;
      /** How much of the file to read (newest notes are at the top). */
      rangeBytes: number;
    }
  | {
      kind: "link-only";
      url: string;
      /** A page for one version, when the vendor has one. */
      versionUrl?: (version: string) => string;
    };

/** The source can depend on the copy that runs (e.g. Kimi's legacy Python CLI lives in another repo). */
export type ReleaseNotesSpec = ReleaseNotesSource | ((method: InstallMethod | null, installedVersion: string | null) => ReleaseNotesSource);

/** Bytes of a changelog file read with one Range request. */
export const NOTES_RANGE_BYTES = 128 * 1024;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const githubRelease = (repo: string, tag: (version: string) => string = (v) => `v${v}`): ReleaseNotesSource => ({ kind: "github-release", repo, tag });

/**
 * A Markdown changelog whose sections start with `prefix` + version + `suffix`
 * (a regex fragment; default: end of line), e.g. "## 4.152.0", "## 590.0.1 (2026-10-22)".
 */
export const changelogFile = (url: string, page: string, prefix: string, suffix = "\\s*$", rangeBytes = NOTES_RANGE_BYTES): ReleaseNotesSource => ({
  kind: "changelog-file",
  url,
  page,
  heading: (version) => new RegExp(`^${escape(prefix)}${escape(version)}${suffix}`, "m"),
  rangeBytes,
});

export const linkOnly = (url: string, versionUrl?: (version: string) => string): ReleaseNotesSource => ({
  kind: "link-only",
  url,
  ...(versionUrl && { versionUrl }),
});

export function resolveSource(spec: ReleaseNotesSpec, method: InstallMethod | null = null, installedVersion: string | null = null): ReleaseNotesSource {
  return typeof spec === "function" ? spec(method, installedVersion) : spec;
}

/** A tag in a github.com URL: "@scope/pkg@1.0" -> "%40scope/pkg%401.0" (the slash stays, as GitHub links it). */
const webTag = (tag: string) => encodeURIComponent(tag).replace(/%2F/gi, "/");

/** The official notes for `version` (the link `o` opens), or the notes overview when the version isn't known. */
export function notesLink(source: ReleaseNotesSource, version: string | null): string {
  switch (source.kind) {
    case "github-release":
      return version ? `https://github.com/${source.repo}/releases/tag/${webTag(source.tag(version))}` : `https://github.com/${source.repo}/releases`;
    case "changelog-file":
      return source.page;
    default:
      return version && source.versionUrl ? source.versionUrl(version) : source.url;
  }
}

/** Every release ("earlier changes"). */
export function historyLink(source: ReleaseNotesSource): string {
  return source.kind === "github-release" ? `https://github.com/${source.repo}/releases` : source.kind === "changelog-file" ? source.page : source.url;
}

/** The API request for a GitHub release (the tag fully encoded, slash included). */
export function releaseApiUrl(repo: string, tag: string): string {
  return `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
}

/** CCL CAUT's own notes. */
export const SELF_NOTES = githubRelease("CreativeCodeLogic/ccl-cli-agents-update-tool");
