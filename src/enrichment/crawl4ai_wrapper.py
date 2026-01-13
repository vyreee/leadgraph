#!/usr/bin/env python3
"""
Crawl4AI Python Wrapper
Provides web scraping with bot detection bypass for LeadGraph
"""

import sys
import json
import asyncio
import os
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

# Suppress all Crawl4AI progress output
os.environ['CRAWL4AI_VERBOSE'] = '0'

async def crawl_url(url, timeout=30):
    """
    Crawl a single URL using Crawl4AI with stealth mode
    """
    try:
        # Configure browser with stealth mode
        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
            extra_args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled"
            ]
        )
        
        # Configure crawler
        crawler_config = CrawlerRunConfig(
            cache_mode="bypass",
            page_timeout=timeout * 1000,
            wait_until="domcontentloaded"
        )
        
        # Create crawler and fetch page
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(
                url=url,
                config=crawler_config
            )
            
            if result.success:
                return {
                    "success": True,
                    "url": result.url,
                    "title": result.metadata.get("title", "") if result.metadata else "",
                    "html": result.html or "",
                    "markdown": result.markdown or "",
                    "text": result.cleaned_html or result.markdown or "",
                    "links": result.links.get("internal", []) if result.links else [],
                    "images": [img.get("src", "") for img in (result.media.get("images", []) if result.media else [])],
                    "metadata": result.metadata or {}
                }
            else:
                return {
                    "success": False,
                    "error": result.error_message or "Unknown error"
                }
                
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    """
    Main entry point - expects JSON input via stdin
    """
    # Redirect stderr to devnull to suppress all progress output
    sys.stderr = open(os.devnull, 'w')
    
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        url = input_data.get("url")
        timeout = input_data.get("timeout", 30)
        
        if not url:
            # Write to stdout only
            sys.stdout.write(json.dumps({"success": False, "error": "No URL provided"}) + "\n")
            sys.stdout.flush()
            sys.exit(1)
        
        # Run async crawler
        result = asyncio.run(crawl_url(url, timeout))
        
        # Output result as JSON to stdout only
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()
        sys.exit(0)
        
    except Exception as e:
        sys.stdout.write(json.dumps({"success": False, "error": str(e)}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
