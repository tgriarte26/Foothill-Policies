"""
scrape_policies.py
------------------
Scrapes all Foothill-De Anza policy content from Boardable and uploads it
directly to S3. Nothing is written to disk locally.

What it does:
  1. Crawls the /policies index to discover all policy manual pages.
  2. For each manual page, extracts the text of every individual BP/AP
     policy section (identified by the #section-…-item-… anchor links).
  3. Saves each policy as a plain-text file to S3:
       s3://<bucket>/<prefix>/board-policy/BP-1100.txt
       s3://<bucket>/<prefix>/administrative-procedures/AP-2105.txt
       ...
  4. Downloads the PDF documents linked from the policy pages and uploads
     them to S3:
       s3://<bucket>/<prefix>/pdfs/<filename>.pdf

Config (all read from .env or environment variables):
  AWS_REGION         — default: us-west-2
  AWS_ACCESS_KEY_ID  — optional, falls back to ~/.aws credentials / IAM role
  AWS_SECRET_ACCESS_KEY
  AWS_SESSION_TOKEN
  AWS_BEARER_TOKEN_BEDROCK — not used here; S3 uses standard IAM credentials
  S3_BUCKET_NAME     — REQUIRED: target S3 bucket
  S3_PREFIX          — optional folder prefix, default: foothill-policies

Usage:
  pip install playwright boto3 python-dotenv requests
  playwright install chromium
  python3 scrape_policies.py
"""

import asyncio
import io
import os
import re
import sys
from urllib.parse import unquote, urljoin, urlparse

import boto3
import requests
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", "foothill-policies").strip().strip("/")

if not S3_BUCKET:
    print("ERROR: S3_BUCKET_NAME is not set in your .env file.", file=sys.stderr)
    sys.exit(1)

BASE_URL = "https://site.boardable.com/foothill-de-anza-community-college-district/policies"
BOARDABLE_HOST = "site.boardable.com"
POLICIES_PATH = "/foothill-de-anza-community-college-district/policies"

NETWORK_IDLE_TIMEOUT = 20_000
EXTRA_WAIT_MS = 3_000

# Map manual URL slug → subfolder name in S3
MANUAL_FOLDER = {
    "2ba933-board-policy": "board-policy",
    "2726fb-administrative-procedures": "administrative-procedures",
    "d5904a-board-policy-and-administrative-procedure-manual": "bp-ap-manual",
}
# ──────────────────────────────────────────────────────────────────────────────


# ── S3 helpers ────────────────────────────────────────────────────────────────
def s3_client():
    return boto3.client("s3", region_name=REGION)


def s3_key(folder: str, filename: str) -> str:
    parts = [p for p in [S3_PREFIX, folder, filename] if p]
    return "/".join(parts)


def upload_text(s3, key: str, text: str) -> None:
    body = text.encode("utf-8")
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=body, ContentType="text/plain; charset=utf-8")
    print(f"  ✓ s3://{S3_BUCKET}/{key}")


def upload_bytes(s3, key: str, data: bytes, content_type: str = "application/pdf") -> None:
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
    print(f"  ✓ s3://{S3_BUCKET}/{key}")
# ──────────────────────────────────────────────────────────────────────────────


# ── Page helpers ──────────────────────────────────────────────────────────────
def slug_from_url(url: str) -> str:
    """Extract the manual slug from a /policies/<slug> URL."""
    return urlparse(url).path.rstrip("/").split("/")[-1]


def item_name_from_fragment(fragment: str) -> str:
    """
    Turn a fragment like  section-Chapter%201-item-BP%201100
    into a safe filename like  BP-1100
    """
    # Decode percent-encoding first
    decoded = unquote(fragment)
    # Extract the part after '-item-'
    match = re.search(r"-item-(.+)$", decoded)
    if match:
        name = match.group(1).strip()
    else:
        # Fall back to the whole decoded fragment
        name = decoded
    # Make filesystem/S3-safe: replace spaces and slashes
    name = re.sub(r"[\s/\\]+", "-", name)
    name = re.sub(r"[^\w\-.]", "", name)
    return name or "unnamed"


async def load_page(page, url: str) -> None:
    try:
        await page.goto(url, wait_until="networkidle", timeout=NETWORK_IDLE_TIMEOUT)
    except PlaywrightTimeout:
        print(f"  [timeout – partial render] {url}", file=sys.stderr)
    await page.wait_for_timeout(EXTRA_WAIT_MS)


async def get_all_links(page, url: str) -> dict:
    """Return categorised links from a policy page."""
    await load_page(page, url)

    hrefs: list[str] = await page.eval_on_selector_all(
        "a[href]", "nodes => nodes.map(n => n.href)"
    )

    manual_pages: set[str] = set()
    item_links: list[str] = []
    pdf_links: set[str] = set()

    for href in hrefs:
        if not href or href.startswith("javascript:") or href.startswith("mailto:"):
            continue
        full = urljoin(url, href)
        p = urlparse(full)

        if p.netloc != BOARDABLE_HOST:
            if full.lower().split("?")[0].endswith(".pdf"):
                pdf_links.add(full)
            continue

        if not p.path.startswith(POLICIES_PATH):
            continue

        if full.lower().split("?")[0].endswith(".pdf"):
            pdf_links.add(full)
        elif p.fragment and "-item-" in p.fragment:
            item_links.append(full)
        elif not p.fragment:
            base = p._replace(fragment="").geturl()
            manual_pages.add(base)

    # Deduplicate items while preserving order
    seen: set[str] = set()
    unique_items: list[str] = []
    for lnk in item_links:
        if lnk not in seen:
            seen.add(lnk)
            unique_items.append(lnk)

    return {"manual_pages": manual_pages, "item_links": unique_items, "pdf_links": pdf_links}


async def extract_policy_text(page, base_url: str, fragment: str) -> str:
    """
    Navigate to base_url#fragment and extract visible text for that policy
    item. The SPA highlights/expands the selected item when an anchor is
    active, so we navigate to the full URL with the fragment.
    """
    target = f"{base_url}#{fragment}"
    try:
        await page.goto(target, wait_until="networkidle", timeout=NETWORK_IDLE_TIMEOUT)
    except PlaywrightTimeout:
        pass
    await page.wait_for_timeout(EXTRA_WAIT_MS)

    # Try to grab the expanded/active policy content panel
    # Boardable renders selected items into a detail/content area —
    # try a few candidate selectors before falling back to full body text.
    selectors = [
        "[data-testid='policy-detail']",
        ".policy-detail",
        ".policy-content",
        ".document-content",
        "main article",
        "main",
    ]
    for sel in selectors:
        try:
            el = await page.query_selector(sel)
            if el:
                text = await el.inner_text()
                if text and len(text.strip()) > 50:
                    return text.strip()
        except Exception:
            pass

    # Fallback: get all visible text from the page
    return (await page.inner_text("body")).strip()
# ──────────────────────────────────────────────────────────────────────────────


# ── PDF download ──────────────────────────────────────────────────────────────
def download_and_upload_pdf(s3, pdf_url: str) -> None:
    filename = unquote(urlparse(pdf_url).path.split("/")[-1])
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    key = s3_key("pdfs", filename)

    print(f"  Downloading PDF: {pdf_url}")
    try:
        resp = requests.get(pdf_url, timeout=30, headers={"User-Agent": "PolicyCrawler/1.0"})
        resp.raise_for_status()
        upload_bytes(s3, key, resp.content, content_type="application/pdf")
    except Exception as exc:
        print(f"  [error] PDF {pdf_url}: {exc}", file=sys.stderr)
# ──────────────────────────────────────────────────────────────────────────────


# ── Main crawl & upload ───────────────────────────────────────────────────────
async def run() -> None:
    s3 = s3_client()
    print(f"Target: s3://{S3_BUCKET}/{S3_PREFIX}/\n{'═' * 60}")

    # Verify bucket is accessible early
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except Exception as exc:
        print(f"ERROR: Cannot access S3 bucket '{S3_BUCKET}': {exc}", file=sys.stderr)
        sys.exit(1)

    all_pdf_links: set[str] = set()
    # manual_url -> list of item link URLs
    manual_item_map: dict[str, list[str]] = {}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (compatible; PolicyCrawler/1.0)"
        )
        page = await context.new_page()

        # ── Step 1: discover all manual pages and item links ──────────────────
        print(f"\n[Step 1] Discovering policy manuals from {BASE_URL}")
        found = await get_all_links(page, BASE_URL)
        all_pdf_links.update(found["pdf_links"])

        manual_pages: set[str] = found["manual_pages"]
        # Include BASE_URL itself if it has items
        if found["item_links"]:
            manual_item_map[BASE_URL] = found["item_links"]

        for manual_url in sorted(manual_pages):
            if manual_url == BASE_URL:
                continue
            print(f"  Scanning manual: {manual_url}")
            mfound = await get_all_links(page, manual_url)
            all_pdf_links.update(mfound["pdf_links"])
            if mfound["item_links"]:
                manual_item_map[manual_url] = mfound["item_links"]

        total_items = sum(len(v) for v in manual_item_map.values())
        print(f"\n  Found {len(manual_item_map)} manuals, {total_items} policy items, "
              f"{len(all_pdf_links)} PDFs")

        # ── Step 2: scrape and upload each policy item ────────────────────────
        print(f"\n[Step 2] Scraping and uploading policy text")
        for manual_url, items in manual_item_map.items():
            slug = slug_from_url(manual_url)
            folder = MANUAL_FOLDER.get(slug, slug)
            base_url = urlparse(manual_url)._replace(fragment="").geturl()

            print(f"\n  Manual: {folder} ({len(items)} items)")
            for item_url in items:
                fragment = urlparse(item_url).fragment
                item_name = item_name_from_fragment(fragment)
                key = s3_key(folder, f"{item_name}.txt")

                try:
                    text = await extract_policy_text(page, base_url, fragment)
                    header = (
                        f"Source: {item_url}\n"
                        f"Manual: {manual_url}\n"
                        f"{'─' * 60}\n\n"
                    )
                    upload_text(s3, key, header + text)
                except Exception as exc:
                    print(f"  [error] {item_url}: {exc}", file=sys.stderr)

        await browser.close()

    # ── Step 3: download and upload PDFs ─────────────────────────────────────
    if all_pdf_links:
        print(f"\n[Step 3] Downloading and uploading {len(all_pdf_links)} PDFs")
        for pdf_url in sorted(all_pdf_links):
            download_and_upload_pdf(s3, pdf_url)

    print(f"\n{'═' * 60}")
    print(f"Done. All files uploaded to s3://{S3_BUCKET}/{S3_PREFIX}/")


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
