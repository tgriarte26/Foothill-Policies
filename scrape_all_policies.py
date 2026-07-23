"""
scrape_all_policies.py
----------------------
Scrapes BOTH the Board Policy and Administrative Procedures pages from Boardable,
sections off text by policy number, and outputs policies-content.js.

Each policy section:
  - Starts at a policy number header (e.g., "BP 1100 The Foothill...")
  - Includes ALL text: paragraphs, bullet points, numbered lists, links, references
  - Ends after the "Adopted:" and "Last revised:" line (or right before the next policy header)

Also uploads each policy as an individual .txt file to S3 if configured.

Usage:
  pip install playwright boto3 python-dotenv
  playwright install chromium
  python scrape_all_policies.py
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

PAGES = [
    "https://site.boardable.com/foothill-de-anza-community-college-district/policies/2ba933-board-policy",
    "https://site.boardable.com/foothill-de-anza-community-college-district/policies/2726fb-administrative-procedures",
]

OUTPUT_FILE = Path(__file__).parent / "policies-content.js"
TIMEOUT = 60_000
WAIT_MS = 6_000

REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", "").strip().strip("/")
# ──────────────────────────────────────────────────────────────────────────────


def parse_policies_from_text(full_text: str) -> list[dict]:
    """
    Parse the full rendered page text into individual policy sections.

    Rules:
      - A policy starts at a line matching: BP/AP + space + number + space + title
      - A policy ends when we hit the "Adopted:" + "Last revised:" metadata
        OR when the next policy header begins
      - Must have real content (not just a TOC stub)
    """
    lines = full_text.split('\n')

    # Policy header pattern: "BP 1100 The Foothill..." or "AP 2105 Student Trustee..."
    header_re = re.compile(
        r'^((?:BP|AP)\s+\d[\d.]*(?:\s*\*?\s*\(?New\)?)?)\s+(.{3,})'
    )

    # "Adopted: MM/DD/YYYY" or "Last revised: MM/DD/YYYY" — signals end of a policy
    adopted_re = re.compile(r'^Adopted:\s*\d{2}/\d{2}/\d{4}')

    policies_raw = []  # list of (number, title, [lines])
    current_num = None
    current_title = ""
    current_lines = []
    found_adopted = False

    for line in lines:
        stripped = line.strip()

        # Check if this is a new policy header
        m = header_re.match(stripped)
        if m:
            # Save previous policy if it has content
            if current_num and current_lines:
                policies_raw.append((current_num, current_title, current_lines[:]))

            # Start new policy
            raw_num = m.group(1).strip()
            current_num = re.sub(r'\*\s*', '', raw_num).strip()
            current_title = m.group(2).strip()
            current_lines = []
            found_adopted = False
            continue

        # Skip "Chapter X:" divider lines
        if re.match(r'^Chapter \d+', stripped):
            continue

        # If we're inside a policy, collect the line
        if current_num:
            current_lines.append(line)

            # Check if we hit the "Adopted: XX/XX/XXXX Last revised:" pattern
            # This signals the absolute end of this policy's text
            if adopted_re.match(stripped):
                found_adopted = True
            elif found_adopted and stripped:
                # If there's content AFTER adopted line and it's not "Last revised",
                # it might be the start of something else
                if stripped.startswith('Last revised:'):
                    # Include it, then end
                    pass
                elif header_re.match(stripped):
                    # Actually a new policy starting — will be caught in next iteration
                    pass

    # Don't forget the last policy
    if current_num and current_lines:
        policies_raw.append((current_num, current_title, current_lines[:]))

    # Now clean up and deduplicate
    policies = []
    seen = {}

    for num, title, raw_lines in policies_raw:
        # Join and clean the content
        content = '\n'.join(raw_lines).strip()

        # Remove the trailing "Adopted: ...Last revised: ..." if it's glued together
        # (sometimes the site renders it without a newline)
        content = re.sub(
            r'Adopted:\s*\d{2}/\d{2}/\d{4}\s*Last revised:\s*\d{2}/\d{2}/\d{4}\s*$',
            lambda m: '\n' + m.group(0).strip(),
            content
        )

        # Validate: must have real descriptive content, not just metadata
        # Strip out all "Adopted/Amended/Approved/Readopted/Last revised" lines
        substance = re.sub(r'^(Adopted|Amended|Approved|Readopted|Last revised|Revised|Renumbered|See ).*$', '', content, flags=re.MULTILINE)
        substance = substance.strip()

        if len(substance) < 80:
            continue  # Skip TOC stubs or empty entries

        # Deduplicate: keep the longest content for each policy number
        if num in seen:
            if len(content) > len(seen[num]["content"]):
                seen[num] = {"id": num, "title": title, "content": content}
        else:
            seen[num] = {"id": num, "title": title, "content": content}

    policies = list(seen.values())
    # Sort by policy number
    policies.sort(key=lambda p: (p["id"][:2], float(re.search(r'[\d.]+', p["id"]).group() if re.search(r'[\d.]+', p["id"]) else 0)))

    return policies


def escape_js(s: str) -> str:
    """Escape for JS string literal."""
    return (s
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "")
            .replace("\t", "  "))


def generate_js(policies: list[dict]) -> str:
    """Generate policies-content.js."""
    lines = [
        "// AUTO-GENERATED by scrape_all_policies.py",
        f"// {len(policies)} policies scraped from Boardable",
        "// Each entry: id (policy number), title, content (full text with bullet points)",
        "",
        "var POLICY_CONTENT = [",
    ]
    for p in policies:
        pid = escape_js(p["id"])
        title = escape_js(p["title"])
        content = escape_js(p["content"])
        lines.append(f'{{"id":"{pid}","title":"{title}","content":"{content}"}},')
    lines.append("];")
    return "\n".join(lines)


def upload_to_s3(policies: list[dict]) -> None:
    """Upload each policy as a .txt file to S3."""
    if not S3_BUCKET:
        print("  S3_BUCKET_NAME not set — skipping S3 upload.")
        return

    s3 = boto3.client("s3", region_name=REGION)
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
    except Exception as exc:
        print(f"  Cannot access S3 bucket: {exc}")
        return

    # Check ACL mode
    use_acl = True
    try:
        resp = s3.get_bucket_ownership_controls(Bucket=S3_BUCKET)
        for rule in resp.get("OwnershipControls", {}).get("Rules", []):
            if rule.get("ObjectOwnership") == "BucketOwnerEnforced":
                use_acl = False
    except Exception:
        pass

    uploaded = 0
    for p in policies:
        is_ap = p["id"].startswith("AP")
        folder = "administrative-procedures" if is_ap else "board-policy"
        safe = p["id"].replace(" ", "-").replace("(", "").replace(")", "")
        safe = re.sub(r"\*", "", safe)
        safe = re.sub(r"-{2,}", "-", safe).strip("-")
        filename = f"{safe}.txt"

        key = "/".join([x for x in [S3_PREFIX, folder, filename] if x])
        body = f"{p['id']} {p['title']}\n{'─' * 50}\n\n{p['content']}"

        params = dict(
            Bucket=S3_BUCKET, Key=key,
            Body=body.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )
        if use_acl:
            params["ACL"] = "public-read"

        try:
            s3.put_object(**params)
            uploaded += 1
        except Exception as exc:
            print(f"    [err] {key}: {exc}")

    print(f"  ✓ Uploaded {uploaded}/{len(policies)} to s3://{S3_BUCKET}/{S3_PREFIX or '(root)'}/")


async def scrape_page(page, url: str) -> str:
    """Load a Boardable page and return all visible text."""
    print(f"  Loading: {url}")
    try:
        await page.goto(url, wait_until="networkidle", timeout=TIMEOUT)
    except PlaywrightTimeout:
        print("    [timeout — using partial content]")
    await page.wait_for_timeout(WAIT_MS)
    return await page.inner_text("body")


async def run():
    print(f"{'═' * 60}")
    print(f"  Foothill-De Anza Policy Scraper")
    print(f"  Output: {OUTPUT_FILE}")
    if S3_BUCKET:
        print(f"  S3: s3://{S3_BUCKET}/{S3_PREFIX or '(root)'}/")
    print(f"{'═' * 60}\n")

    all_text = ""

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        for url in PAGES:
            text = await scrape_page(page, url)
            print(f"    Got {len(text):,} chars")
            all_text += "\n" + text

        await browser.close()

    print(f"\n  Total text: {len(all_text):,} chars")
    print(f"  Parsing policies...")

    policies = parse_policies_from_text(all_text)
    bp_count = sum(1 for p in policies if p["id"].startswith("BP"))
    ap_count = sum(1 for p in policies if p["id"].startswith("AP"))
    print(f"  Found: {bp_count} Board Policies + {ap_count} Admin Procedures = {len(policies)} total")

    if not policies:
        print("ERROR: No policies found!", file=sys.stderr)
        sys.exit(1)

    # Generate JS file
    print(f"\n  Writing policies-content.js...")
    js = generate_js(policies)
    OUTPUT_FILE.write_text(js, encoding="utf-8")
    print(f"  ✓ {OUTPUT_FILE.name} ({OUTPUT_FILE.stat().st_size / 1024:.1f} KB)")

    # Upload to S3
    if S3_BUCKET:
        print(f"\n  Uploading to S3...")
        upload_to_s3(policies)

    # Summary
    print(f"\n{'═' * 60}")
    print(f"  Done! {len(policies)} policies ready.")
    print(f"  → Website: policies-content.js (loads instantly)")
    if S3_BUCKET:
        print(f"  → S3: individual .txt files (direct fetch backup)")
    print(f"\n  Sample (first 3):")
    for p in policies[:3]:
        preview = p["content"][:100].replace("\n", " ")
        print(f"    {p['id']}: {preview}...")


if __name__ == "__main__":
    asyncio.run(run())
