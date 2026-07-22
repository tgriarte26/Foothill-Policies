"""
crawl_policies.py
-----------------
Crawls https://site.boardable.com/foothill-de-anza-community-college-district/policies
and retrieves every policy link found on that page and its child pages.

Because the site is a JavaScript-rendered SPA, we use Playwright (headless Chromium)
to wait for the DOM to fully render before scraping.

Link categories collected:
  - policy_index_links : top-level policy manual pages
  - policy_item_links  : individual BP/AP anchor links within each manual
  - pdf_links          : PDF document links found anywhere on policy pages
  - external_links     : any other external links found on policy pages

Usage:
    pip install playwright
    playwright install chromium
    python3 crawl_policies.py

Output:
    - Prints all discovered links to stdout
    - Saves full results to policy_links.json
    - Saves a plain list to policy_links.txt
"""

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL = "https://site.boardable.com/foothill-de-anza-community-college-district/policies"
BOARDABLE_HOST = "site.boardable.com"
POLICIES_PATH_PREFIX = "/foothill-de-anza-community-college-district/policies"

OUTPUT_JSON = Path(__file__).parent / "policy_links.json"
OUTPUT_TXT = Path(__file__).parent / "policy_links.txt"

NETWORK_IDLE_TIMEOUT = 20_000  # ms
EXTRA_WAIT_MS = 3_000          # ms for deferred JS rendering
# ──────────────────────────────────────────────────────────────────────────────


def is_boardable_policy(url: str) -> bool:
    p = urlparse(url)
    return p.netloc == BOARDABLE_HOST and p.path.startswith(POLICIES_PATH_PREFIX)


def is_pdf(url: str) -> bool:
    return url.lower().split("?")[0].endswith(".pdf")


def normalise_base(url: str) -> str:
    """Strip fragment so we visit each page only once."""
    p = urlparse(url)
    return p._replace(fragment="").geturl()


async def load_page(page, url: str) -> None:
    try:
        await page.goto(url, wait_until="networkidle", timeout=NETWORK_IDLE_TIMEOUT)
    except PlaywrightTimeout:
        print(f"  [timeout – partial render] {url}", file=sys.stderr)
    await page.wait_for_timeout(EXTRA_WAIT_MS)


async def collect_links(page, url: str) -> dict:
    """Return categorised links found on *url*."""
    await load_page(page, url)

    hrefs: list[str] = await page.eval_on_selector_all(
        "a[href]",
        "nodes => nodes.map(n => n.href)",
    )

    policy_index: set[str] = set()
    policy_items: set[str] = set()
    pdfs: set[str] = set()
    external: set[str] = set()

    for href in hrefs:
        if not href or href.startswith("javascript:") or href.startswith("mailto:"):
            continue

        full = urljoin(url, href)
        parsed = urlparse(full)

        if is_pdf(full):
            pdfs.add(full)
            continue

        if parsed.netloc == BOARDABLE_HOST:
            if parsed.path.startswith(POLICIES_PATH_PREFIX):
                if parsed.fragment:
                    # Individual policy item anchor (#section-Chapter…-item-BP…)
                    policy_items.add(full)
                else:
                    policy_index.add(normalise_base(full))
        else:
            external.add(full)

    return {
        "policy_index": policy_index,
        "policy_items": policy_items,
        "pdfs": pdfs,
        "external": external,
    }


async def crawl() -> dict:
    all_policy_index: set[str] = set()
    all_policy_items: set[str] = set()
    all_pdfs: set[str] = set()
    all_external: set[str] = set()

    # Pages to visit (only /policies/* base paths, no fragments)
    to_visit: list[str] = [normalise_base(BASE_URL)]
    visited: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (compatible; PolicyCrawler/1.0; "
                "+https://github.com/foothill-policy-owl)"
            )
        )
        page = await context.new_page()

        while to_visit:
            url = to_visit.pop(0)
            if url in visited:
                continue
            visited.add(url)
            print(f"Crawling: {url}")

            try:
                found = await collect_links(page, url)
            except Exception as exc:
                print(f"  [error] {url}: {exc}", file=sys.stderr)
                continue

            all_policy_index.update(found["policy_index"])
            all_policy_items.update(found["policy_items"])
            all_pdfs.update(found["pdfs"])
            all_external.update(found["external"])

            # Queue any unvisited policy sub-pages (not items/fragments)
            for link in found["policy_index"]:
                if link not in visited:
                    to_visit.append(link)

        await browser.close()

    return {
        "policy_index_links": sorted(all_policy_index),
        "policy_item_links": sorted(all_policy_items),
        "pdf_links": sorted(all_pdfs),
        "external_links": sorted(all_external),
    }


def print_section(title: str, links: list[str]) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title} ({len(links)})")
    print(f"{'─' * 60}")
    for lnk in links:
        print(f"  {lnk}")


def save_results(results: dict) -> None:
    # JSON with categorised structure
    OUTPUT_JSON.write_text(json.dumps(results, indent=2), encoding="utf-8")

    # Flat TXT: all unique links
    all_links: list[str] = sorted(
        set(
            results["policy_index_links"]
            + results["policy_item_links"]
            + results["pdf_links"]
            + results["external_links"]
        )
    )
    OUTPUT_TXT.write_text("\n".join(all_links), encoding="utf-8")

    total = len(all_links)
    print(f"\nSaved {total} unique links to:")
    print(f"  {OUTPUT_JSON}  (categorised)")
    print(f"  {OUTPUT_TXT}   (flat list)")


async def main() -> None:
    print(f"Starting crawl of: {BASE_URL}\n{'═' * 60}")
    results = await crawl()

    print_section("Policy Manual Index Pages", results["policy_index_links"])
    print_section("Individual Policy / AP Item Links (anchors)", results["policy_item_links"])
    print_section("PDF Document Links", results["pdf_links"])
    print_section("External Links", results["external_links"])

    save_results(results)


if __name__ == "__main__":
    asyncio.run(main())
