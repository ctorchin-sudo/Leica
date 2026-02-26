#!/usr/bin/env python3
"""
Legoland Deals Search
Searches for Legoland deals and discounts for the week of April 1–7, 2026.
"""

import urllib.request
import urllib.parse
import json
from datetime import date, timedelta

SEARCH_START = date(2026, 4, 1)
SEARCH_END   = date(2026, 4, 7)

# Legoland locations with their official ticket/deals URLs
LEGOLAND_LOCATIONS = [
    {
        "name": "Legoland California",
        "url": "https://www.legoland.com/california/tickets/",
        "deals_url": "https://www.legoland.com/california/tickets/special-offers/",
    },
    {
        "name": "Legoland Florida",
        "url": "https://www.legoland.com/florida/tickets/",
        "deals_url": "https://www.legoland.com/florida/tickets/special-offers/",
    },
    {
        "name": "Legoland New York",
        "url": "https://www.legoland.com/new-york/tickets/",
        "deals_url": "https://www.legoland.com/new-york/tickets/special-offers/",
    },
]

# Third-party deal aggregator search endpoints
DEAL_SOURCES = [
    {
        "name": "Undercover Tourist",
        "search_url": "https://www.undercovertourist.com/",
        "query": "legoland tickets april 2026",
    },
    {
        "name": "Mouse Savers / Theme Park Deals",
        "search_url": "https://www.mousesavers.com/",
        "query": "legoland discount april 2026",
    },
    {
        "name": "GroupOn",
        "search_url": "https://www.groupon.com/",
        "query": "legoland",
    },
]


def build_google_search_url(query: str) -> str:
    """Build a Google search URL for the given query."""
    params = urllib.parse.urlencode({"q": query})
    return f"https://www.google.com/search?{params}"


def fetch_url(url: str, timeout: int = 10) -> str | None:
    """Fetch a URL and return the response body as text, or None on error."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        )
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return None


def extract_price_mentions(html: str) -> list[str]:
    """
    Very lightweight price-pattern extraction from raw HTML.
    Looks for dollar amounts near the words 'ticket', 'deal', 'offer',
    'discount', 'save', or 'admission'.
    """
    import re

    results = []
    # Strip tags for easier scanning
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    # Find sentences that contain a price
    pattern = re.compile(
        r"([^.!?]{0,80}"
        r"\$\d[\d,]*(?:\.\d{2})?"
        r"[^.!?]{0,80}[.!?]?)",
        re.IGNORECASE,
    )
    for match in pattern.finditer(text):
        snippet = match.group(1).strip()
        keywords = ("ticket", "deal", "offer", "discount", "save", "admission", "legoland")
        if any(kw in snippet.lower() for kw in keywords):
            results.append(snippet)

    return results[:10]  # cap at 10 snippets per source


def search_legoland_deals() -> None:
    week_label = f"{SEARCH_START.strftime('%B %-d')}–{SEARCH_END.strftime('%-d, %Y')}"
    print("=" * 70)
    print(f"  LEGOLAND DEALS SEARCH  |  Week of {week_label}")
    print("=" * 70)
    print()

    # ------------------------------------------------------------------ #
    # 1. Official Legoland park pages                                     #
    # ------------------------------------------------------------------ #
    print(">>> OFFICIAL LEGOLAND SPECIAL-OFFERS PAGES")
    print("-" * 70)
    for park in LEGOLAND_LOCATIONS:
        print(f"\n[{park['name']}]")
        print(f"  Tickets:       {park['url']}")
        print(f"  Special Offers:{park['deals_url']}")

        html = fetch_url(park["deals_url"])
        if html:
            snippets = extract_price_mentions(html)
            if snippets:
                print("  Price mentions found on page:")
                for s in snippets:
                    print(f"    • {s}")
            else:
                print("  (No price snippets extracted — check the page directly)")
        else:
            print("  (Could not fetch page — check the URL in your browser)")

    # ------------------------------------------------------------------ #
    # 2. Third-party deal sites                                           #
    # ------------------------------------------------------------------ #
    print()
    print(">>> THIRD-PARTY DEAL AGGREGATORS")
    print("-" * 70)
    for source in DEAL_SOURCES:
        search_url = build_google_search_url(
            f"site:{urllib.parse.urlparse(source['search_url']).netloc} "
            + source["query"]
        )
        print(f"\n[{source['name']}]")
        print(f"  Homepage:      {source['search_url']}")
        print(f"  Google search: {search_url}")

        html = fetch_url(source["search_url"])
        if html:
            snippets = extract_price_mentions(html)
            if snippets:
                print("  Price mentions found on homepage:")
                for s in snippets:
                    print(f"    • {s}")
            else:
                print("  (No price snippets extracted — follow the Google search link)")
        else:
            print("  (Could not fetch page — follow the Google search link)")

    # ------------------------------------------------------------------ #
    # 3. Suggested Google searches                                        #
    # ------------------------------------------------------------------ #
    print()
    print(">>> SUGGESTED GOOGLE SEARCHES")
    print("-" * 70)
    queries = [
        "Legoland tickets deals April 2026",
        "Legoland California discount coupon April 2026",
        "Legoland Florida promo code April 2026",
        "Legoland New York special offer spring 2026",
        "Legoland annual pass discount 2026",
        "Legoland military discount 2026",
        "Legoland AAA discount 2026",
        "Legoland Costco tickets 2026",
    ]
    for q in queries:
        url = build_google_search_url(q)
        print(f"  • {q}")
        print(f"    {url}")

    # ------------------------------------------------------------------ #
    # 4. Tips                                                             #
    # ------------------------------------------------------------------ #
    print()
    print(">>> DEAL-FINDING TIPS FOR THE WEEK OF", week_label.upper())
    print("-" * 70)
    tips = [
        "Buy tickets directly on Legoland's website — online prices are usually lower than gate prices.",
        "Check Costco Travel for bundled hotel + park ticket packages.",
        "AAA members often receive 10–20 % off admission at Legoland parks.",
        "Military/veterans may qualify for free or discounted admission via Veterans Advantage.",
        "Legoland Florida hosts 'Spring into Savings' events in April — watch the official site.",
        "Consider a Legoland Annual Pass if visiting more than once; it often pays off in 2 visits.",
        "GroupOn and LivingSocial occasionally list Legoland vouchers at 20–40 % off.",
        "The week of April 1 falls in Spring Break season — book early, prices rise closer to the date.",
        f"Dates searched: {SEARCH_START.isoformat()} through {SEARCH_END.isoformat()}",
    ]
    for tip in tips:
        print(f"  • {tip}")

    print()
    print("=" * 70)
    print("  Search complete. Open the links above to see current pricing.")
    print("=" * 70)


if __name__ == "__main__":
    search_legoland_deals()
