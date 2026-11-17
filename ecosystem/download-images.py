#!/usr/bin/env python3
"""Fetch, audit and validate every BA Labs public-site image for GitHub Pages."""
import argparse
import json
import pathlib
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.parse import quote, unquote

SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".webp": (b"RIFF",),
}

def audit_references(site, entries):
    ids = [item["id"] for item in entries]
    files = [item["file"] for item in entries]
    urls = [item["url"] for item in entries]
    if len(ids) != len(set(ids)) or len(files) != len(set(files)) or len(urls) != len(set(urls)):
        raise SystemExit("Image manifest contains duplicate IDs, filenames or source URLs.")
    pattern = re.compile(r"(?:[.]/assets/|/assets/)([A-Za-z0-9._-]+[.](?:jpg|jpeg|png|webp))", re.I)
    referenced = set()
    for source in site.rglob("*"):
        if source.is_file() and source.suffix.lower() in {".html", ".css", ".js"}:
            try:
                referenced.update(pattern.findall(source.read_text(encoding="utf-8")))
            except UnicodeDecodeError:
                continue
    packaged = set(files)
    missing = sorted(referenced - packaged)
    unused = sorted(packaged - referenced)
    if missing or unused:
        raise SystemExit(f"Image coverage audit failed. Missing from manifest: {missing}; unused manifest files: {unused}")
    print(f"Image coverage audit passed: {len(referenced)} unique image references across all HTML/CSS/JS files.")

def resolve_source(url):
    """Resolve Commons file titles through imageinfo instead of the fragile Special:FilePath redirect."""
    match = re.match(r"https://commons\.wikimedia\.org/wiki/Special:FilePath/(.+?)(?:\?.*)?$", url)
    if not match:
        return url
    filename = unquote(match.group(1))
    api = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=960&titles=" + quote("File:" + filename, safe="")
    req = Request(api, headers={"User-Agent": "BALabs-SiteAssetBuilder/1.2 (https://balabs-biotech.github.io/BA-lab/)"})
    with urlopen(req, timeout=18) as response:
        payload = json.loads(response.read().decode("utf-8"))
    pages = payload.get("query", {}).get("pages", {})
    page = next(iter(pages.values()), {})
    info = page.get("imageinfo", [])
    if not info:
        raise RuntimeError(f"Wikimedia Commons has no imageinfo for {filename}")
    time.sleep(1.4)  # Respect Commons API rate limits between metadata requests.
    return info[0].get("thumburl") or info[0].get("url")

def download(url):
    url = resolve_source(url)
    last = None
    for attempt in range(2):
        try:
            req = Request(url, headers={"User-Agent": "BALabs-SiteAssetBuilder/1.1 (https://balabs-biotech.github.io/BA-lab/)", "Referer": "https://balabs-biotech.github.io/BA-lab/"})
            with urlopen(req, timeout=18) as response:
                data = response.read(20 * 1024 * 1024 + 1)
                if len(data) > 20 * 1024 * 1024:
                    raise RuntimeError("image exceeds 20 MB")
                final_url = response.geturl()
                content_type = response.headers.get("Content-Type", "")
                if response.status != 200 or not data:
                    raise RuntimeError(f"invalid response: HTTP {response.status}")
                return data, final_url, content_type
        except Exception as exc:
            last = exc
            delay = (5, 10)[attempt] if getattr(exc, "code", None) == 429 else (1, 3)[attempt]
            time.sleep(delay)
    raise RuntimeError(str(last))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    site = pathlib.Path(__file__).resolve().parent
    entries = json.loads(pathlib.Path(args.manifest).read_text(encoding="utf-8"))
    audit_references(site, entries)
    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    failures = []

    def fetch_one(item):
        data, final_url, mime = download(item["url"])
        ext = pathlib.Path(item["file"]).suffix.lower()
        valid = any(data.startswith(sig) for sig in SIGNATURES.get(ext, ()))
        if ext == ".webp":
            valid = data.startswith(b"RIFF") and data[8:12] == b"WEBP"
        if not valid:
            raise RuntimeError(f"response is not a valid {ext} image (Content-Type: {mime}; final URL: {final_url})")
        (out / item["file"]).write_bytes(data)
        if "upload.wikimedia.org" in final_url:
            time.sleep(1.0)
        return f"OK {item['id']} {len(data)} bytes {mime} -> {final_url}"

    with ThreadPoolExecutor(max_workers=1) as pool:
        jobs = {pool.submit(fetch_one, item): item for item in entries}
        for future in as_completed(jobs):
            item = jobs[future]
            try:
                print(future.result())
            except Exception as exc:
                failures.append((item["id"], str(exc)))
                print(f"FAIL {item['id']}: {exc}", file=sys.stderr)
    if failures:
        print(f"\n{len(failures)} image(s) failed; refusing to publish a partial image set.", file=sys.stderr)
        sys.exit(1)
    print(f"Validated and packaged {len(entries)} unique BA Labs images.")

if __name__ == "__main__":
    main()
