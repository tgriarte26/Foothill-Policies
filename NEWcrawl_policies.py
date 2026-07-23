"""
NEWcrawl_policies.py
--------------------
Crawls the Boardable policy page, extracts ALL policy text, and optionally
uploads each policy as a separate .txt file to S3.

This is the S3 upload version. If you just need the JS file, use NEWscrape_policies.py.

Usage:
  pip install playwright boto3 python-dotenv
  playwright install chromium
  python NEWcrawl_policies.py
"""

import asyncio
import os
import re
import sys
from pathlib import Path

import boto3
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

URL = "https://site.boardable.com/foothill-de-anza-community-college-district/policies/2ba933-board-policy"
TIMEOUT = 60_000
WAIT_MS = 5_000

REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", "foothill-policies").strip().strip("/")

OUTPUT_DIR = Path(__file__).parent / "scraped_policies"
# ──────────────────────────────────────────────────────────────────────────────


def parse_policies(full_text: str) -> list[dict]:
    """
    Split full page text into individual policy sections.
    Each section starts at a policy number header and ends at the next one.
    Only keeps entries with substantial content (not TOC stubs).
    """
    # Skip past the Table of Contents to actual content
    toc_end = full_text.find("Chapter 1:")
    if toc_end != -1:
        second = full_text.find("Chapter 1:", toc_end + 20)
        if second != -1:
            text = full_text[second:]
        else:
            text = full_text[toc_end:]
    else:
        text = full_text

    lines = text.split('\n')
    header_pattern = re.compile(r'^((?:BP|AP)\s+\d[\d.]*(?:\s*\*?\s*\(?New\)?)?)\s+(.+)')

    policies = []
    current_num = None
    current_title = ""
    current_lines = []

    for line in lines:
        stripped = line.strip()
        m = header_pattern.match(stripped)

        if m:
            # Save previous policy
            if current_num and current_lines:
                content = '\n'.join(current_lines).strip()
                # Check it has real content (not just adoption dates)
                clean = re.sub(r'Adopted:?\s*[\d/\-]*', '', content)
                clean = re.sub(r'Last revised:?\s*[\d/\-]*', '', clean).strip()
                if len(clean) > 100:
                    policies.append({"id": current_num, "title": current_title[:120], "content": content})

            raw_num = m.group(1).strip()
            current_num = re.sub(r'\*\s*', '', raw_num).strip()
            current_title = m.group(2).strip()
            current_lines = [current_title]
        elif current_num:
            if re.match(r'^Chapter \d+:', stripped):
                continue
            current_lines.append(line)

    # Last policy
    if current_num and current_lines:
        content = '\n'.join(current_lines).strip()
        clean = re.sub(r'Adopted:?\s*[\d/\-]*', '', content)
        clean = re.sub(r'Last revised:?\s*[\d/\-]*', '', clean).strip()
        if len(clean) > 100:
            policies.append({"id": current_num, "title": current_title[:120], "content": content})

    # Deduplicate: keep longest
    deduped = {}
    for p in policies:
        if p["id"] not in deduped or len(p["content"]) > len(deduped[p["id"]]["content"]):
            deduped[p["id"]] = p

    return list(deduped.values())


def make_filename(policy_num: str) -> str:
    """BP 1100 -> BP-1100.txt"""
    safe = policy_num.replace(" ", "-").replace("(", "").replace(")", "")
    safe = re.sub(r"\*", "", safe)
    safe = re.sub(r"-{2,}", "-", safe).strip("-")
    return f"{safe}.txt"


def make_s3_key(policy_num: str) -> str:
    """Determine S3 folder based on BP/AP prefix."""
    filename = make_filename(policy_num)
    folder = "administrative-procedures" if policy_num.startswith("AP") else "board-policy"
    parts = [p for p in [S3_PREFIX, folder, filename] if p]
    return "/".join(parts)


def save_local(policies: list[dict]) -> None:
    """Save each policy as a local .txt file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bp_dir = OUTPUT_DIR / "board-policy"
    ap_dir = OUTPUT_DIR / "administrative-procedures"
    bp_dir.mkdir(exist_ok=True)
    ap_dir.mkdir(exist_ok=True)

    for p in policies:
        filename = make_filename(p["id"])
        folder = ap_dir if p["id"].startswith("AP") else bp_dir
        filepath = folder / filename
        text = f"Policy: {p['id']}\nTitle: {p['title']}\n{'─' * 40}\n\n{p['content']}"
        filepath.write_text(text, encoding="utf-8")

    print(f"  Saved {len(policies)} files to {OUTPUT_DIR}/")


def upload_to_s3(policies: list[dict]) -> None:
    """Upload each policy to S3."""
    if not S3_BUCKET:
        print("  S3_BUCKET_NAME not set, skipping S3 upload.")
        return

    s3 = boto3.client("s3", region_name=REGION)

    # Check bucket access
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except Exception as exc:
        print(f"  ERROR: Cannot access bucket '{S3_BUCKET}': {exc}")
        return

    # Check ACL mode
    use_acl = True
    try:
        resp = s3.get_bucket_ownership_controls(Bucket=S3_BUCKET)
        rules = resp.get("OwnershipControls", {}).get("Rules", [])
        for rule in rules:
            if rule.get("ObjectOwnership") == "BucketOwnerEnforced":
                use_acl = False
    except Exception:
        pass

    uploaded = 0
    for p in policies:
        key = make_s3_key(p["id"])
        text = f"Policy: {p['id']}\nTitle: {p['title']}\n{'─' * 40}\n\n{p['content']}"

        params = dict(
            Bucket=S3_BUCKET,
            Key=key,
            Body=text.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )
        if use_acl:
            params["ACL"] = "public-read"

        try:
            s3.put_object(**params)
            uploaded += 1
        except Exception as exc:
            print(f"  [error] {key}: {exc}")

    print(f"  Uploaded {uploaded}/{len(policies)} to s3://{S3_BUCKET}/{S3_PREFIX}/")


async def run():
    print(f"Crawling: {URL}")
    print(f"{'═' * 60}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = await context.new_page()

        print("  Loading page...")
        try:
            await page.goto(URL, wait_until="networkidle", timeout=TIMEOUT)
        except PlaywrightTimeout:
            print("  [timeout, continuing...]")
        await page.wait_for_timeout(WAIT_MS)

        full_text = await page.inner_text("body")
        await browser.close()

    print(f"  Text length: {len(full_text)} chars")

    policies = parse_policies(full_text)
    print(f"  Parsed {len(policies)} policies")

    if not policies:
        print("ERROR: No policies found!", file=sys.stderr)
        sys.exit(1)

    # Save locally
    print("\n[Local save]")
    save_local(policies)

    # Upload to S3
    print("\n[S3 upload]")
    upload_to_s3(policies)

    # Show summary
    bp_count = sum(1 for p in policies if p["id"].startswith("BP"))
    ap_count = sum(1 for p in policies if p["id"].startswith("AP"))
    print(f"\n{'═' * 60}")
    print(f"Done! {bp_count} Board Policies, {ap_count} Admin Procedures")
    print(f"Total: {len(policies)} policies scraped")


if __name__ == "__main__":
    asyncio.run(run())
