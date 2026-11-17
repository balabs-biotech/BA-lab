#!/usr/bin/env python3
"""Fetch and validate BA Labs public-site image assets for GitHub Pages."""
import argparse, json, pathlib, sys, time
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".webp": (b"RIFF",),
}
def download(url):
    last = None
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent":"BALabs-SiteAssetBuilder/1.0 (GitHub Pages image packaging)"})
            with urlopen(req, timeout=35) as response:
                data = response.read(20 * 1024 * 1024 + 1)
                if len(data) > 20 * 1024 * 1024:
                    raise RuntimeError("image exceeds 20 MB")
                final_url = response.geturl()
                content_type = response.headers.get("Content-Type", "")
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                if not data:
                    raise RuntimeError("empty response")
                return data, final_url, content_type
        except Exception as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(str(last))
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    entries = json.loads(pathlib.Path(args.manifest).read_text(encoding="utf-8"))
    out = pathlib.Path(args.output); out.mkdir(parents=True, exist_ok=True)
    failures = []
    for item in entries:
        try:
            data, final_url, mime = download(item["url"])
            ext = pathlib.Path(item["file"]).suffix.lower()
            valid = any(data.startswith(sig) for sig in SIGNATURES.get(ext, ()))
            if ext == ".webp":
                valid = data.startswith(b"RIFF") and data[8:12] == b"WEBP"
            if not valid:
                raise RuntimeError(f"response is not a valid {ext} image (Content-Type: {mime}; final URL: {final_url})")
            (out / item["file"]).write_bytes(data)
            print(f"OK {item['id']} {len(data)} bytes {mime} -> {final_url}")
        except Exception as exc:
            failures.append((item["id"], str(exc)))
            print(f"FAIL {item['id']}: {exc}", file=sys.stderr)
    if failures:
        print(f"\n{len(failures)} image(s) failed; refusing to publish a partial image set.", file=sys.stderr)
        sys.exit(1)
    print(f"Validated and packaged {len(entries)} unique BA Labs images.")
if __name__ == "__main__":
    main()
