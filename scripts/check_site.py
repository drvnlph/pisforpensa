#!/usr/bin/env python3
"""Repository-level integrity checks for the article and scan archive."""

from __future__ import annotations

import difflib
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = (ROOT / "index.html", ROOT / "scans.html")
EXPECTED_PAGES = [3, *range(6, 59)]
errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


class SiteHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[tuple[str, str, str]] = []
        self.metadata: dict[str, str] = {}
        self.canonical = ""
        self.scan_cites: list[str] = []
        self.id_refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if values.get("id"):
            self.ids.append(values["id"])
        for attr in ("aria-controls", "aria-describedby", "aria-labelledby"):
            for target_id in values.get(attr, "").split():
                self.id_refs.append((attr, target_id))
        if tag == "label" and values.get("for"):
            self.id_refs.append(("for", values["for"]))
        for attr in ("href", "src"):
            if values.get(attr):
                self.refs.append((tag, attr, values[attr]))
        if tag == "meta":
            key = values.get("name") or values.get("property")
            if key:
                self.metadata[key] = values.get("content", "")
        if tag == "link" and "canonical" in values.get("rel", "").split():
            self.canonical = values.get("href", "")
        if tag == "a" and "scan-cite" in values.get("class", "").split():
            self.scan_cites.append(values.get("href", ""))


def parse_html(path: Path) -> SiteHTMLParser:
    parser = SiteHTMLParser()
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()
    duplicates = [item for item, count in Counter(parser.ids).items() if count > 1]
    if duplicates:
        fail(f"{path.name}: duplicate ids: {', '.join(duplicates)}")
    known_ids = set(parser.ids)
    missing_refs = [f"{attr}={target}" for attr, target in parser.id_refs if target not in known_ids]
    if missing_refs:
        fail(f"{path.name}: missing ID references: {', '.join(missing_refs)}")
    return parser


parsers = {path: parse_html(path) for path in HTML_FILES}

article_html = (ROOT / "index.html").read_text(encoding="utf-8")
scan_html = (ROOT / "scans.html").read_text(encoding="utf-8")
for page, source in (("index.html", article_html), ("scans.html", scan_html)):
    preferences_at = source.find('src="preferences.js')
    stylesheet_at = source.find('href="style.css')
    if preferences_at == -1 or stylesheet_at == -1 or preferences_at > stylesheet_at:
        fail(f"{page}: shared preferences must load before the design system")
if "К именам" in article_html or "К именам" in scan_html:
    fail("archive return wording must remain uniformly ‘К разбору’")
if re.search(r"Ключев(?:ой|ые) лист", article_html):
    fail("index.html: glossary must not assign editorially ‘key’ scan pages")
if not re.search(r'<a class="home" href="index\.html">К разбору</a>', scan_html):
    fail("scans.html: missing uniform return link to the article")
if article_html.count('class="toc-archive-link"') != 1:
    fail("index.html: the full archive card must appear only in the desktop TOC")
mobile_bar_start = article_html.find('<div class="mobile-bar-top">')
mobile_bar_end = article_html.find('<div class="mobile-dropdown"', mobile_bar_start)
if mobile_bar_start == -1 or 'class="mobile-bar-archive"' not in article_html[mobile_bar_start:mobile_bar_end]:
    fail("index.html: mobile archive link must live in the top menu row")
if "@media (max-width:640px), (max-height:500px) and (hover:none) and (pointer:coarse)" not in scan_html:
    fail("scans.html: phone and short touch screens must use the overlay panel")


def resolve_local_ref(page: Path, raw: str) -> tuple[Path, str] | None:
    parts = urlsplit(raw)
    if parts.scheme or parts.netloc or raw.startswith(("mailto:", "tel:", "data:")):
        return None
    target_path = unquote(parts.path)
    target = page if not target_path else (page.parent / target_path).resolve()
    return target, unquote(parts.fragment)


for page, parser in parsers.items():
    for _tag, _attr, raw in parser.refs:
        resolved = resolve_local_ref(page, raw)
        if resolved is None:
            continue
        target, fragment = resolved
        if not target.exists():
            fail(f"{page.name}: missing local target {raw}")
            continue
        if not fragment:
            continue
        if target.name == "scans.html" and fragment.isdigit():
            if int(fragment) not in EXPECTED_PAGES:
                fail(f"{page.name}: unknown scan hash #{fragment}")
            continue
        if target.suffix.lower() == ".html":
            target_parser = parsers.get(target) or parse_html(target)
            if fragment not in target_parser.ids:
                fail(f"{page.name}: missing fragment target {raw}")


required_metadata = {
    "description",
    "og:type",
    "og:locale",
    "og:site_name",
    "og:title",
    "og:description",
    "og:url",
    "og:image",
    "og:image:width",
    "og:image:height",
    "og:image:alt",
    "twitter:card",
}
for page, parser in parsers.items():
    missing = sorted(required_metadata - parser.metadata.keys())
    if missing:
        fail(f"{page.name}: missing metadata: {', '.join(missing)}")
    if not parser.canonical.startswith("https://drvnlph.github.io/pisforpensa"):
        fail(f"{page.name}: canonical URL is absent or unexpected")


all_text = "\n".join(
    path.read_text(encoding="utf-8")
    for path in (*HTML_FILES, ROOT / "style.css", ROOT / "fonts.css")
)
for forbidden in ("fonts.googleapis.com", "fonts.gstatic.com"):
    if forbidden in all_text:
        fail(f"remote font reference remains: {forbidden}")
ui_source_files = (*HTML_FILES, ROOT / "style.css", ROOT / "app.js", ROOT / "preferences.js")
for arrow in "→←↑↩▶◀↗":
    for source_file in ui_source_files:
        if arrow in source_file.read_text(encoding="utf-8"):
            fail(f"{source_file.name}: Unicode arrow may be rendered as emoji ({arrow})")

font_css = (ROOT / "fonts.css").read_text(encoding="utf-8")
for raw_url in re.findall(r"url\(['\"]?([^)'\"]+)", font_css):
    asset = (ROOT / raw_url).resolve()
    if not asset.exists():
        fail(f"fonts.css: missing asset {raw_url}")
for license_name in ("SourceSerif4-OFL.txt", "SourceSans3-OFL.txt", "IBMPlexMono-OFL.txt"):
    if not (ROOT / "fonts" / "licenses" / license_name).exists():
        fail(f"missing font licence: {license_name}")


pages_match = re.search(r"const\s+PAGES\s*=\s*\[([^]]+)\]", scan_html, re.S)
if not pages_match:
    fail("scans.html: could not parse PAGES")
    pages: list[int] = []
else:
    pages = [int(value) for value in re.findall(r"\d+", pages_match.group(1))]
    if pages != EXPECTED_PAGES:
        fail(f"scans.html: PAGES differs from expected 54-page manifest: {pages}")

jpg_pages = sorted(
    int(match.group(1))
    for path in (ROOT / "scans").glob("v28_gray-*.jpg")
    if (match := re.fullmatch(r"v28_gray-(\d{3})\.jpg", path.name))
)
if jpg_pages != EXPECTED_PAGES:
    fail("scan JPEG set does not match PAGES")

transcription_path = ROOT / "scans" / "transcriptions.js"
transcription_source = transcription_path.read_text(encoding="utf-8")
json_source = re.sub(r"^window\.PAGE_TRANSCRIPTS\s*=\s*", "", transcription_source).rstrip()
if json_source.endswith(";"):
    json_source = json_source[:-1]
try:
    transcriptions: dict[str, str] = json.loads(json_source)
except json.JSONDecodeError as exc:
    fail(f"transcriptions.js: invalid data object: {exc}")
    transcriptions = {}

expected_keys = {f"v28_gray-{number:03d}.jpg" for number in EXPECTED_PAGES}
if set(transcriptions) != expected_keys:
    fail("transcription keys do not exactly match the scan manifest")
if any(not value.strip() for value in transcriptions.values()):
    fail("one or more scan transcriptions are empty")

transcript_txt = (ROOT / "scans" / "tom-28.txt").read_text(encoding="utf-8")
headers = list(re.finditer(r"^===== ([^\n]+) =====\n", transcript_txt, re.M))
txt_transcriptions: dict[str, str] = {}
for position, header in enumerate(headers):
    start = header.end()
    end = headers[position + 1].start() if position + 1 < len(headers) else len(transcript_txt)
    txt_transcriptions[header.group(1)] = transcript_txt[start:end].rstrip("\n")
if txt_transcriptions != transcriptions:
    fail("tom-28.txt does not exactly match transcriptions.js")

for href in parsers[ROOT / "index.html"].scan_cites:
    match = re.fullmatch(r"scans\.html#(\d+)", href)
    if not match or int(match.group(1)) not in EXPECTED_PAGES:
        fail(f"index.html: invalid scan citation {href}")


def command_output(command: list[str]) -> str:
    try:
        return subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True).stdout
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        fail(f"command failed: {' '.join(command)} ({exc})")
        return ""


pdf_path = ROOT / "scans" / "tom-28.pdf"
if shutil.which("pdfinfo") and shutil.which("pdftotext"):
    pdf_info = command_output(["pdfinfo", str(pdf_path)])
    page_count_match = re.search(r"^Pages:\s+(\d+)", pdf_info, re.M)
    if not page_count_match or int(page_count_match.group(1)) != 54:
        fail("tom-28.pdf must contain exactly 54 pages")

    for pdf_page, scan_page in enumerate(EXPECTED_PAGES, start=1):
        extracted = command_output(
            ["pdftotext", "-f", str(pdf_page), "-l", str(pdf_page), str(pdf_path), "-"]
        )
        expected = transcriptions.get(f"v28_gray-{scan_page:03d}.jpg", "")
        normalize = lambda value: re.sub(r"\W+", "", value.lower(), flags=re.UNICODE)
        ratio = difflib.SequenceMatcher(
            None, normalize(expected), normalize(extracted), autojunk=False
        ).ratio()
        if ratio < 0.985:
            fail(f"PDF text layer differs from transcript on scan {scan_page} ({ratio:.3f})")
else:
    fail("Poppler commands pdfinfo and pdftotext are required")


if errors:
    print("Site checks failed:", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    raise SystemExit(1)

print(
    "Site checks passed: HTML and ARIA references, metadata, local assets, "
    "responsive UI contracts, 54 scans and transcripts, citations and PDF text layer."
)
