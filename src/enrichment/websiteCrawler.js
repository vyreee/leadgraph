import { log } from 'crawlee';
import { PlaywrightCrawler } from 'crawlee';
import { chromium } from 'playwright';
import { simpleFetch } from './simpleFetch.js';

export async function crawlWebsite(websiteUrl, options) {
  if (!websiteUrl) {
    return { pages: [], metadata: {}, htmlContent: '' };
  }

  const maxPages = options?.enrichment?.maxWebsitePages || 10;
  const crawledPages = [];
  let allHtml = '';
  
  try {
    const startUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const domain = new URL(startUrl).hostname;
    
    log.info(`Crawling website: ${domain}`);
    
    // HYBRID APPROACH: Try simple fetch first (fast), fallback to Playwright if it fails
    log.debug(`Trying simple fetch for ${domain}`);
    const simpleResult = await simpleFetch(startUrl, 10000);
    
    // Check if simple fetch succeeded with good content
    if (simpleResult.success && simpleResult.html && simpleResult.html.length > 1000) {
      // Check if we got blocked (403, 401, captcha, etc.)
      const isBlocked = simpleResult.html.includes('403 Forbidden') ||
                       simpleResult.html.includes('Access Denied') ||
                       simpleResult.html.includes('captcha') ||
                       simpleResult.html.includes('Cloudflare') ||
                       simpleResult.html.length < 5000; // Suspiciously small
      
      if (!isBlocked) {
        log.info(`Simple fetch succeeded for ${domain}`);
        crawledPages.push({
          url: startUrl,
          title: extractTitle(simpleResult.html),
          html: simpleResult.html
        });
        allHtml = simpleResult.text;
        
        return buildCrawlResult(crawledPages, allHtml, domain);
      } else {
        log.info(`Simple fetch blocked for ${domain}, trying Playwright`);
      }
    } else {
      log.debug(`Simple fetch failed for ${domain}: ${simpleResult.error || 'No content'}`);
    }
    
    // Fallback to Playwright if simple fetch failed or was blocked
    log.info(`Using Playwright for ${domain}`);
    return await crawlWithPlaywright(startUrl, domain, maxPages, options);
    
  } catch (error) {
    log.error(`Website crawl failed for ${websiteUrl}:`, error.message);
    return { pages: [], metadata: {}, htmlContent: '' };
  }
}

// Crawl using Playwright (bot detection bypass with headless browser)
async function crawlWithPlaywright(startUrl, domain, maxPages, options) {
  const crawledPages = [];
  let allHtml = '';
  
  try {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
      // Navigate with timeout
      await page.goto(startUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      // Wait a bit for dynamic content
      await page.waitForTimeout(2000);
      
      // Get page content
      const html = await page.content();
      const title = await page.title();
      
      crawledPages.push({
        url: startUrl,
        title: title,
        html: html
      });
      
      allHtml = html;
      
      log.info(`Playwright successfully crawled ${domain}`);
      
    } catch (pageError) {
      log.warning(`Playwright page error for ${domain}:`, pageError.message);
    } finally {
      await browser.close();
    }
    
    if (crawledPages.length > 0) {
      return buildCrawlResult(crawledPages, allHtml, domain);
    } else {
      return { pages: [], metadata: {}, htmlContent: '' };
    }
    
  } catch (error) {
    log.error(`Playwright error for ${domain}:`, error.message);
    return { pages: [], metadata: {}, htmlContent: '' };
  }
}

// Extract title from HTML
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : '';
}

// Build crawl result with metadata
function buildCrawlResult(crawledPages, allHtml, domain) {
  const hasContactForm = allHtml.toLowerCase().includes('contact') && 
                        (allHtml.toLowerCase().includes('form') || 
                         allHtml.toLowerCase().includes('submit'));
  
  const hasBookingWidget = allHtml.toLowerCase().includes('book') && 
                          (allHtml.toLowerCase().includes('appointment') || 
                           allHtml.toLowerCase().includes('schedule'));
  
  const hasChatWidget = allHtml.toLowerCase().includes('chat') || 
                       allHtml.toLowerCase().includes('intercom') ||
                       allHtml.toLowerCase().includes('drift');
  
  log.info(`Crawled ${crawledPages.length} page(s) from ${domain}`);
  
  return {
    pages: crawledPages,
    metadata: {
      pageCount: crawledPages.length,
      hasContactForm,
      hasBookingWidget,
      hasChatWidget
    },
    htmlContent: allHtml
  };
}
