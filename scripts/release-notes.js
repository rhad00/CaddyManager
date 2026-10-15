#!/usr/bin/env node
/**
 * Builds the GitHub release body for a version tag and prints it to stdout:
 *
 *   ## Summary          the "## Summary" section of every pull request merged since the previous release
 *   ## What's Changed   the commits of this release, grouped by type (this version's CHANGELOG.md section)
 *   Full changelog      links to CHANGELOG.md at the tag and to the compare view
 *   ## Docker Images
 *
 * Needs git (full history and tags) and, for the summaries, the gh CLI with GH_TOKEN.
 *
 *   VERSION=v0.5.0 GITHUB_REPOSITORY=rhad00/CaddyManager node scripts/release-notes.js
 */
const { execFileSync } = require('child_process');

const tag = process.env.VERSION;
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag) || !repo) {
  console.error('VERSION (for example v1.2.3) and GITHUB_REPOSITORY (owner/name) are required');
  process.exit(1);
}
const bare = tag.replace(/^v/, '');
const owner = repo.split('/')[0];
const MAX_SUMMARY_CHARS = 6000;

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryRun(cmd, args) {
  try {
    return run(cmd, args);
  } catch (error) {
    console.error(`warning: ${cmd} ${args.slice(0, 2).join(' ')} failed: ${String(error.stderr || error.message).trim()}`);
    return '';
  }
}

// Releases are tagged on bump commits that are not part of main's history, so "the previous release" is
// the next lower version tag, not whatever git describe finds.
function previousTag() {
  const tags = run('git', ['tag', '--list', 'v[0-9]*', '--sort=-v:refname']).split('\n').filter(Boolean);
  const index = tags.indexOf(tag);
  return index === -1 ? undefined : tags[index + 1];
}

// The text of a "## Summary" section, without the closing "Generated with" signature line
function summaryOf(body) {
  const match = /^##\s+Summary\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(body || '');
  if (!match) return '';
  return match[1]
    .replace(/^.*Generated with.*$/gm, '')
    .replace(/^(#{3,5}) /gm, (_, hashes) => `${hashes}# `) // keep headings below "## Summary"
    .trim();
}

function pullRequestSummaries(previous) {
  const range = previous ? `${previous}..${tag}` : tag;
  const subjects = tryRun('git', ['log', range, '--format=%s']).split('\n');
  const numbers = [...new Set(subjects.map((s) => /\(#(\d+)\)\s*$/.exec(s)?.[1]).filter(Boolean))];

  const sections = [];
  for (const number of numbers) {
    const json = tryRun('gh', ['pr', 'view', number, '--repo', repo, '--json', 'title,body,url,author']);
    if (!json) continue;
    const pr = JSON.parse(json);
    if (pr.author?.is_bot || /^(app\/|dependabot)/.test(pr.author?.login || '')) continue;
    let summary = summaryOf(pr.body);
    if (!summary) continue;
    if (summary.length > MAX_SUMMARY_CHARS) {
      summary = `${summary.slice(0, MAX_SUMMARY_CHARS).replace(/\s+\S*$/, '')} …\n\n[Read the full description](${pr.url})`;
    }
    sections.push(`**${pr.title}** ([#${number}](${pr.url}))\n\n${summary}`);
  }
  return sections.join('\n\n---\n\n');
}

// This version's section of CHANGELOG.md as stored on the tag, minus its own heading
function changelogSection() {
  const file = tryRun('git', ['show', `${tag}:CHANGELOG.md`]);
  const lines = file.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^## \\[v?${bare.replace(/\./g, '\\.')}\\]`).test(line));
  if (start === -1) return '';
  const end = lines.findIndex((line, i) => i > start && /^- - -\s*$/.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .replace(/^#### /gm, '### ') // cog groups by "####"; they sit under "## What's Changed"
    .trim();
}

const previous = previousTag();
const summary = pullRequestSummaries(previous);
const commits = changelogSection();
const base = `https://github.com/${repo}`;

const parts = [];
if (summary) parts.push(`## Summary\n\n${summary}`);
parts.push(`## What's Changed\n\n${commits || '_No user-facing changes were recorded for this release._'}`);
parts.push(
  [
    `**Full changelog:** [CHANGELOG.md](${base}/blob/${tag}/CHANGELOG.md)`,
    previous ? ` · [${previous}...${tag}](${base}/compare/${previous}...${tag})` : '',
  ].join(''),
);
parts.push(
  `## Docker Images\n\n\`\`\`\nghcr.io/${owner}/caddymanager-backend:${bare}\nghcr.io/${owner}/caddymanager-frontend:${bare}\nghcr.io/${owner}/caddymanager-caddy:${bare}\n\`\`\``,
);

process.stdout.write(`${parts.join('\n\n')}\n`);
