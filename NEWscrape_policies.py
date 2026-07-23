"""
NEWscrape_policies.py
---------------------
Scrapes ALL policy text from the Boardable site, generates policies-content.js,
AND uploads each policy as a separate .txt file to S3.

This gives you:
  1. policies-content.js — used by the website to show text instantly (no S3 needed)
  2. S3 files at board-policy/BP-XXXX.txt — available for direct fetching if S3 is public

Usage:
  pip install playwright boto3 python-dotenv
  playwright install chromium
  python NEWscrape_policies.py
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
OUTPUT_FILE = Path(__file__).parent / "policies-content.js"
TIMEOUT = 60_000
WAIT_MS = 5_000

REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", "").strip().strip("/")  # Empty = root of bucket
# ──────────────────────────────────────────────────────────────────────────────


def parse_policies(full_text: str) -> list[dict]:
    """
    Split the full page text into individual policy sections.
    Each policy section:
    - Starts at a policy number header (BP XXXX or AP XXXX)
    - Ends right before the NEXT policy number header
    - Must contain actual policy text (not just a title or TOC reference)
    """
    # Find the content section — skip the Table of Contents
    # Look for the second occurrence of "Chapter 1" which is the actual content
    toc_end = full_text.find("Chapter 1:")
    if toc_end != -1:
        # Find the SECOND "Chapter 1:" which starts the actual policy text
        second = full_text.find("Chapter 1:", toc_end + 20)
        if second != -1:
            text = full_text[second:]
        else:
            text = full_text[toc_end:]
    else:
        text = full_text

    # Split into lines for processing
    lines = text.split('\n')

    # Pattern: a line that starts a new policy section
    # Must be "BP" or "AP" + space + number at the START of the line content
    header_pattern = re.compile(r'^((?:BP|AP)\s+\d[\d.]*(?:\s*\*?\s*\(?New\)?)?)\s+(.+)')

    policies = []
    current_num = None
    current_title = ""
    current_lines = []

    for line in lines:
        stripped = line.strip()
        m = header_pattern.match(stripped)

        if m:
            # We hit a new policy header — save the previous one
            if current_num and current_lines:
                content = '\n'.join(current_lines).strip()
                # Only save if the content has real substance
                # (more than just metadata like "Adopted: ... Last revised: ...")
                clean_content = re.sub(r'Adopted:?\s*[\d/\-]*', '', content)
                clean_content = re.sub(r'Last revised:?\s*[\d/\-]*', '', clean_content)
                clean_content = re.sub(r'Adopted\s+\d+/\d+/\d+', '', clean_content)
                clean_content = clean_content.strip()

                if len(clean_content) > 100:
                    formatted = format_content(content)
                    policies.append({
                        "id": current_num,
                        "title": current_title[:120],
                        "content": formatted
                    })

            # Start new policy
            raw_num = m.group(1).strip()
            current_num = re.sub(r'\*\s*', '', raw_num).strip()
            current_title = m.group(2).strip()
            current_lines = [current_title]  # Include title as first line of content
        elif current_num:
            # Skip "Chapter X:" headers that appear between policies
            if re.match(r'^Chapter \d+:', stripped):
                continue
            current_lines.append(line)

    # Don't forget the last policy
    if current_num and current_lines:
        content = '\n'.join(current_lines).strip()
        clean_content = re.sub(r'Adopted:?\s*[\d/\-]*', '', content)
        clean_content = re.sub(r'Last revised:?\s*[\d/\-]*', '', clean_content)
        clean_content = clean_content.strip()
        if len(clean_content) > 100:
            formatted = format_content(content)
            policies.append({
                "id": current_num,
                "title": current_title[:120],
                "content": formatted
            })

    # Deduplicate: keep the longest version for each policy number
    deduped = {}
    for p in policies:
        pid = p["id"]
        if pid not in deduped or len(p["content"]) > len(deduped[pid]["content"]):
            deduped[pid] = p

    return list(deduped.values())


def format_content(raw: str) -> str:
    """
    Format raw policy text to preserve structure:
    - Convert tab-indented lines to bullet points
    - Preserve numbered lists
    - Clean up excessive whitespace while keeping paragraph breaks
    """
    lines = raw.split('\n')
    formatted = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            # Preserve paragraph breaks
            if formatted and formatted[-1] != '':
                formatted.append('')
            continue

        # Detect bullet-point-like patterns
        if stripped.startswith(('•', '·', '▪')):
            formatted.append('• ' + stripped.lstrip('•·▪ '))
        elif re.match(r'^[a-z]\.\s+', stripped):
            # Lettered list: a. b. c.
            formatted.append('  ' + stripped)
        elif re.match(r'^\d+[\.\)]\s+', stripped):
            # Numbered list: 1. 2. 3) etc
            formatted.append('  ' + stripped)
        elif line.startswith('\t') or line.startswith('    '):
            # Indented content — treat as sub-item
            if re.match(r'^\d+', stripped):
                formatted.append('  ' + stripped)
            else:
                formatted.append('  • ' + stripped)
        else:
            formatted.append(stripped)

    # Join and clean up
    result = '\n'.join(formatted)
    # Remove excessive blank lines
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()


def escape_js_string(s: str) -> str:
    """Escape a string for use inside a JS string literal."""
    return (s
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "")
            .replace("\t", " "))


def generate_js(policies: list[dict]) -> str:
    """Generate the policies-content.js file content."""
    lines = [
        "// AUTO-GENERATED by NEWscrape_policies.py",
        "// Full policy text scraped from Boardable",
        f"// Total policies: {len(policies)}",
        "// Source: https://site.boardable.com/foothill-de-anza-community-college-district/policies/2ba933-board-policy",
        "",
        "var POLICY_CONTENT = [",
    ]

    for p in policies:
        pid = escape_js_string(p["id"])
        title = escape_js_string(p["title"])
        content = escape_js_string(p["content"])
        lines.append(f'{{"id":"{pid}","title":"{title}","content":"{content}"}},')

    lines.append("];")
    return "\n".join(lines)


async def run():
    print(f"Scraping: {URL}")
    print(f"Output: {OUTPUT_FILE}")
    if S3_BUCKET:
        print(f"S3: s3://{S3_BUCKET}/{S3_PREFIX}/")
    print(f"{'═' * 60}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        print("  Loading page...")
        try:
            await page.goto(URL, wait_until="networkidle", timeout=TIMEOUT)
        except PlaywrightTimeout:
            print("  [timeout on load, continuing with partial content...]")

        await page.wait_for_timeout(WAIT_MS)

        print("  Extracting text...")
        # Get all visible text from the page body
        full_text = await page.inner_text("body")

        await browser.close()

    print(f"  Page text length: {len(full_text)} chars")

    # Parse individual policies
    print("  Parsing policies...")
    policies = parse_policies(full_text)
    print(f"  Found {len(policies)} policies with content")

    if not policies:
        print("ERROR: No policies extracted. The page may not have loaded correctly.", file=sys.stderr)
        sys.exit(1)

    # Generate JS file (used by the website directly — no S3 needed)
    print("  Generating policies-content.js...")
    js_content = generate_js(policies)
    OUTPUT_FILE.write_text(js_content, encoding="utf-8")
    print(f"  ✓ Wrote {OUTPUT_FILE.name} ({OUTPUT_FILE.stat().st_size / 1024:.1f} KB)")

    # Upload to S3 (optional — makes files available for direct fetch too)
    if S3_BUCKET:
        print(f"\n  Uploading to S3...")
        upload_to_s3(policies)
    else:
        print("\n  S3_BUCKET_NAME not set in .env — skipping S3 upload.")
        print("  The website will use policies-content.js directly (no S3 needed).")

    print(f"\n{'═' * 60}")
    print(f"Done! {len(policies)} policies scraped.")
    print(f"  → policies-content.js ready (website loads text from this)")
    if S3_BUCKET:
        print(f"  → S3 files uploaded (backup/direct fetch)")

    # Show first few for verification
    print(f"\nFirst 5 policies:")
    for p in policies[:5]:
        preview = p["content"][:80].replace("\n", " ")
        print(f"  {p['id']}: {preview}...")


def upload_to_s3(policies: list[dict]) -> None:
    """Upload each policy as a .txt file to S3."""
    s3 = boto3.client("s3", region_name=REGION)

    # Check bucket access
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except Exception as exc:
        print(f"  ERROR: Cannot access bucket '{S3_BUCKET}': {exc}")
        print("  Skipping S3 upload. The website will still work using policies-content.js.")
        return

    # Check if ACLs are enabled
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
        # Determine folder: BP → board-policy, AP → administrative-procedures
        is_ap = p["id"].strip().startswith("AP")
        folder = "administrative-procedures" if is_ap else "board-policy"

        # Build filename: "BP 1100" → "BP-1100.txt"
        safe_name = p["id"].replace(" ", "-").replace("(", "").replace(")", "")
        safe_name = re.sub(r"\*", "", safe_name)
        safe_name = re.sub(r"-{2,}", "-", safe_name).strip("-")
        filename = f"{safe_name}.txt"

        key = "/".join([p for p in [S3_PREFIX, folder, filename] if p])
        body = f"Policy: {p['id']}\nTitle: {p['title']}\n{'─' * 40}\n\n{p['content']}"

        params = dict(
            Bucket=S3_BUCKET,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )
        if use_acl:
            params["ACL"] = "public-read"

        try:
            s3.put_object(**params)
            uploaded += 1
        except Exception as exc:
            print(f"  [error] {key}: {exc}")

    print(f"  ✓ Uploaded {uploaded}/{len(policies)} files to S3")


if __name__ == "__main__":
    asyncio.run(run())
