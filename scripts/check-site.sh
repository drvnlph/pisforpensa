#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

node --check app.js
node --check preferences.js
node --check scans/transcriptions.js
node - <<'NODE'
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('scans.html', 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
for (const code of blocks) new vm.Script(code);

const peopleMatch = html.match(/const PEOPLE = ({[\s\S]*?\n});\n\nconst img=/);
if (!peopleMatch) throw new Error('Could not parse curated PEOPLE data');
const sandbox = {};
vm.runInNewContext(`people=${peopleMatch[1]}`, sandbox);
const pageMatch = html.match(/const PAGES = \[([\s\S]*?)\];/);
if (!pageMatch) throw new Error('Could not parse scan page manifest');
const pageSet = new Set((pageMatch[1].match(/\d+/g) || []).map(Number));
const expectedPeople = [
  'pchelintsev','chernov','ivankin','poltavets','shakursky',
  'filinkov','aksenova','frolova','kulkov'
];
if (JSON.stringify(Object.keys(sandbox.people)) !== JSON.stringify(expectedPeople)) {
  throw new Error('Curated PEOPLE keys are missing or reordered');
}
for (const [key, person] of Object.entries(sandbox.people)) {
  if (!person.pages.length || new Set(person.pages).size !== person.pages.length) {
    throw new Error(`${key}: occurrence pages must be non-empty and unique`);
  }
  if (person.pages.some((page, i) => i && page <= person.pages[i - 1])) {
    throw new Error(`${key}: occurrence pages must be sorted`);
  }
  if (person.pages.some(page => !pageSet.has(page))) {
    throw new Error(`${key}: occurrence page is outside PAGES`);
  }
  for (const qualifier of ['probablePages','continuationPages','variantPages','accountPages']) {
    const qualifiedPages = person[qualifier] || [];
    if (new Set(qualifiedPages).size !== qualifiedPages.length) {
      throw new Error(`${key}: ${qualifier} must contain unique pages`);
    }
    if (qualifiedPages.some(page => !person.pages.includes(page))) {
      throw new Error(`${key}: ${qualifier} must be a subset of occurrence pages`);
    }
  }
}

const article = fs.readFileSync('index.html', 'utf8');
const glossaryLinks = [...article.matchAll(
  /class="glossary-all" href="scans\.html\?person=([^"]+)">(\d+) /g
)];
if (glossaryLinks.length !== expectedPeople.length) {
  throw new Error('Every glossary row must have one complete archive link');
}
for (const [, key, count] of glossaryLinks) {
  const person = sandbox.people[key];
  if (!person) throw new Error(`Unknown glossary person filter: ${key}`);
  if (person.pages.length !== Number(count)) throw new Error(`${key}: glossary count differs from PEOPLE data`);
}
NODE
python3 scripts/check_site.py
