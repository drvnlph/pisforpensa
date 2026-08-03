#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

node --check app.js
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
}

const article = fs.readFileSync('index.html', 'utf8');
const glossaryLinks = [...article.matchAll(
  /class="glossary-all" href="scans\.html\?person=([^#"]+)#(\d+)">(\d+) /g
)];
if (glossaryLinks.length !== expectedPeople.length) {
  throw new Error('Every glossary row must have one complete archive link');
}
for (const [, key, hash, count] of glossaryLinks) {
  const person = sandbox.people[key];
  if (!person) throw new Error(`Unknown glossary person filter: ${key}`);
  if (!person.pages.includes(Number(hash))) throw new Error(`${key}: glossary hash is outside its page set`);
  if (person.pages.length !== Number(count)) throw new Error(`${key}: glossary count differs from PEOPLE data`);
}
NODE
python3 scripts/check_site.py
