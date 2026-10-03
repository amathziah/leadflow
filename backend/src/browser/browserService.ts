import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { configurePage } from './pageSetup.js';
import { SetOfMarkGrounder, InteractiveElement } from './somGrounding.js';
import supabaseStorage from '../services/supabaseStorage.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * A single normalized organic search result extracted from a search engine.
 * Declared as a `type` (not `interface`) so it carries an implicit index
 * signature and stays assignable to Prisma's JSON input types when logged.
 */
type SearchResult = {
  title: string;
  url: string;
  description: string;
};

class BrowserService {
  private browser: Browser | null = null;
  private isCDP = false;
  private userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  /**
   * Initializes the persistent browser engine singleton
   */
  public async initialize(): Promise<void> {
    if (this.browser) return;

    if (env.BROWSER_MODE === 'cdp') {
      const cdpUrl = `http://127.0.0.1:${env.CHROME_CDP_PORT}`;
      logger.info(`🔌 Attempting to connect to your active Chrome browser via CDP on port ${env.CHROME_CDP_PORT}...`);
      try {
        this.browser = await chromium.connectOverCDP(cdpUrl, { noDefaults: true });
        this.isCDP = true;
        logger.info('✅ Successfully connected to active local Chrome browser via CDP');
        return;
      } catch (cdpError: any) {
        logger.warn(`⚠️ Failed to connect to Chrome over CDP on port ${env.CHROME_CDP_PORT}: ${cdpError.message}`);
        logger.warn(`👉 Make sure Chrome is running with remote debugging:`);
        logger.warn(`   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${env.CHROME_CDP_PORT}`);
        logger.warn(`🔄 Falling back to launching an isolated local browser instance...`);
      }
    }

    // Fallback: Launch a local Chromium browser (headless: false to show human interaction)
    try {
      this.browser = await chromium.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--window-size=1280,800'
        ]
      });
      this.isCDP = false;
      logger.info('✅ Local Chromium browser launched successfully (ClubBot-style)');
    } catch (launchError: any) {
      logger.error(`❌ Failed to launch local Chromium: ${launchError.message}`);
      throw new Error(`Failed to initialize browser engine. CDP failed and local launch failed: ${launchError.message}`);
    }
  }

  /**
   * Safe teardown of the browser engine
   */
  public async shutdown(): Promise<void> {
    if (!this.browser) return;
    try {
      if (this.isCDP) {
        logger.info('🔌 Disconnecting from active Chrome browser connection...');
        await this.browser.close().catch(() => {});
      } else {
        logger.info('🔌 Shutting down background browser engine...');
        await this.browser.close();
      }
      this.browser = null;
      logger.info('✅ Browser connection cleaned up');
    } catch (error) {
      logger.error('❌ Error during browser shutdown:', error);
    }
  }

  /**
   * Creates an isolated browser context and a configured page
   */
  public async createPage(): Promise<{ context: BrowserContext; page: Page }> {
    if (!this.browser) {
      await this.initialize();
    }

    if (this.isCDP) {
      // Connect to the default context in the running Chrome browser
      const contexts = this.browser!.contexts();
      const context = contexts.length > 0 ? contexts[0] : await this.browser!.newContext();

      const page = await context.newPage();

      // Apply baseline page configuration
      await configurePage(page);

      // Standard timeouts
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Protect the user's primary/shared browser context by making close() a no-op
      context.close = async () => {
        logger.debug('Context close requested in CDP mode (bypassed to protect user browser tabs)');
      };

      return { context, page };
    }

    const randomUA = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    
    // Create isolated context to manage cookies/caches independently
    const context = await this.browser!.newContext({
      userAgent: randomUA,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    
    // Apply baseline page configuration
    await configurePage(page);

    // Standard timeouts
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    return { context, page };
  }

  /**
   * Captures the current page view, uploads it to Supabase Storage, and yields the URL
   */
  public async captureAndUploadScreenshot(page: Page, workflowId: string, stepName: string): Promise<string | null> {
    try {
      logger.debug(`Capturing screenshot for workflow ${workflowId} (Step: ${stepName})...`);
      const buffer = await page.screenshot({ type: 'png', fullPage: false });
      
      const fileName = `${Date.now()}_${stepName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
      
      // Save locally to logs/screenshots/ for local development audit trace
      try {
        const fs = await import('fs');
        await fs.promises.mkdir('logs/screenshots', { recursive: true });
        await fs.promises.writeFile(`logs/screenshots/${fileName}`, buffer);
        logger.debug(`💾 Local screenshot audit saved: logs/screenshots/${fileName}`);
      } catch (localWriteError: any) {
        logger.warn(`Could not save local screenshot copy: ${localWriteError.message}`);
      }

      try {
        const storagePath = await supabaseStorage.uploadScreenshot(workflowId, fileName, buffer);
        try {
          const signedUrl = await supabaseStorage.getSignedUrl(env.SUPABASE_SCREENSHOTS_BUCKET, storagePath, 86400);
          return signedUrl;
        } catch {
          return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_SCREENSHOTS_BUCKET}/${storagePath}`;
        }
      } catch (uploadError) {
        // Fallback to local server endpoint so images always display in dashboard
        return `/screenshots/${fileName}`;
      }
    } catch (error: any) {
      logger.warn(`Could not capture visual telemetry: ${error.message}`);
      return null;
    }
  }

  /**
   * Resilient multi-engine web search.
   *
   * Tries Google first, then transparently falls back through Bing and Mojeek.
   * Each engine runs in its own fresh browser context and returns [] on a block /
   * zero results, so a single provider being CAPTCHA'd or empty never aborts the
   * workflow. Only if EVERY engine yields nothing do we throw — which is what
   * previously surfaced as "returned zero results or was blocked".
   *
   * (Public name kept as `searchGoogle` for caller compatibility.)
   */
  /**
   * Serper API Google search lookup
   */
  /**
   * Generates a random delay between min and max milliseconds to simulate human behavior.
   */
  private async humanDelay(min = 800, max = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Simulates natural human-like mouse movement using intermediate steps.
   */
  private async humanMove(page: Page, x: number, y: number): Promise<void> {
    try {
      const steps = Math.floor(Math.random() * 8) + 8; // 8 to 15 steps
      await page.mouse.move(x, y, { steps });
    } catch (err) {
      logger.debug(`humanMove error: ${err}`);
    }
  }

  /**
   * Simulates a human scrolling down a page to read or trigger lazy-loading.
   */
  private async humanScroll(page: Page, distance?: number): Promise<void> {
    try {
      const scrollDistance = distance || Math.floor(Math.random() * 300) + 200;
      const steps = Math.floor(Math.random() * 5) + 5;
      for (let i = 0; i < steps; i++) {
        await page.evaluate((dist) => {
          window.scrollBy(0, dist);
        }, scrollDistance / steps);
        await this.humanDelay(150, 350);
      }
    } catch (err) {
      logger.debug(`humanScroll error: ${err}`);
    }
  }

  /**
   * Simulates typing text with random keystroke delays and occasional typos/backspaces.
   */
  private async humanType(page: Page, selector: string, text: string): Promise<void> {
    try {
      const element = page.locator(selector);
      await element.focus();
      await this.humanDelay(200, 500);

      for (const char of text) {
        // Occasional typo (1.5% chance)
        if (Math.random() < 0.015 && char !== ' ') {
          const typos = 'abcdefghijklmnopqrstuvwxyz';
          const randomChar = typos[Math.floor(Math.random() * typos.length)];
          await page.keyboard.type(randomChar);
          await this.humanDelay(150, 300);
          await page.keyboard.press('Backspace');
          await this.humanDelay(100, 200);
        }
        await page.keyboard.type(char);
        await this.humanDelay(60, 180); // random delay per keystroke
      }
      await this.humanDelay(400, 800);
    } catch (err) {
      await page.fill(selector, text).catch(() => {});
    }
  }

  public async searchGoogle(
    query: string,
    workflowId: string,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<SearchResult[]> {
    logger.info('Performing search via Playwright browser scraper...');
    if (onLogUpdate) {
      await onLogUpdate('Performing search via Playwright browser scraper...');
    }

    const engines: Array<{ name: string; run: (page: Page) => Promise<SearchResult[]> }> = [
      { name: 'Google', run: (page) => this.searchViaGoogle(query, workflowId, page, onLogUpdate) },
      { name: 'DuckDuckGo', run: (page) => this.searchViaDuckDuckGo(query, workflowId, page, onLogUpdate) },
      { name: 'Bing', run: (page) => this.searchViaBing(query, workflowId, page, onLogUpdate) },
      { name: 'Mojeek', run: (page) => this.searchViaMojeek(query, workflowId, page, onLogUpdate) },
    ];

    for (let i = 0; i < engines.length; i++) {
      const engine = engines[i];
      const next = engines[i + 1];

      const { context, page } = await this.createPage();
      try {
        const results = this.dedupeResults(await engine.run(page));

        if (results.length > 0) {
          logger.info(`Successfully parsed ${results.length} valid search result entries via ${engine.name}`);
          return results.slice(0, 8); // Yield top 8 matching profiles
        }

        logger.warn(`${engine.name} returned 0 usable results.`);
        if (onLogUpdate && next) {
          await onLogUpdate(`${engine.name} returned no usable results. Falling back to ${next.name}...`);
        }
      } catch (err: any) {
        logger.warn(`${engine.name} search failed or was blocked: ${err.message}`);
        if (onLogUpdate) {
          const tail = next ? ` Falling back to ${next.name}...` : '';
          await onLogUpdate(`${engine.name} search was rate limited or blocked.${tail}`, { reason: err.message });
        }
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }

    throw new Error('All search providers (browser-scraping engines) returned zero results or were blocked');
  }

  /**
   * Removes duplicate URLs across providers while preserving discovery order.
   */
  private dedupeResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const unique: SearchResult[] = [];
    for (const r of results) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      unique.push(r);
    }
    return unique;
  }

  /**
   * Google provider. Throws if blocked by a CAPTCHA.
   */
  private async searchViaGoogle(
    query: string,
    workflowId: string,
    page: Page,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<SearchResult[]> {
    logger.info(`Searching Google for query: "${query}" (ClubBot-style)`);
    if (onLogUpdate) {
      await onLogUpdate('Initiating Google Search (ClubBot-style)', { query });
    }

    // Pre-seed consent cookies so we land on results instead of the EU consent wall.
    await page.context().addCookies([
      { name: 'CONSENT', value: 'YES+cb', domain: '.google.com', path: '/' },
      { name: 'SOCS', value: 'CAESHAgBEhIaAB', domain: '.google.com', path: '/' },
    ]).catch(() => {});

    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    await this.humanDelay(1200, 2500);

    // Solve any Cloudflare challenges
    await this.handleCloudflareChallenge(page, onLogUpdate);

    // Dismiss consent banners if present
    await this.handleCookieBanners(page, onLogUpdate);

    const searchInputSelector = 'textarea[name="q"], input[name="q"]';
    await page.waitForSelector(searchInputSelector, { state: 'visible', timeout: 10000 });
    await this.humanType(page, searchInputSelector, query);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await this.humanDelay(1500, 3000);

    const ssUrl = await this.captureAndUploadScreenshot(page, workflowId, 'google_search_results');
    if (onLogUpdate && ssUrl) {
      await onLogUpdate('Google Search completed, captured page viewport', { screenshotUrl: ssUrl });
    }

    // Detect CAPTCHA / sorry-interstitial pages.
    const blocked = await page.locator('#captcha-form, iframe[src*="recaptcha"], form[action*="sorry"]').count();
    if (blocked > 0) {
      logger.error('⚠️ Hit CAPTCHA on Google Search');
      throw new Error('Search blocked by CAPTCHA page');
    }

    await this.humanScroll(page, 400);

    return this.extractGoogleResults(page);
  }

  /**
   * Parses organic result cards from a loaded Google results page.
   */
  private async extractGoogleResults(page: Page): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const isJunkUrl = (url: string): boolean =>
      !url.startsWith('http') || url.includes('google.com') || url.includes('webcache.googleusercontent.com');

    let resultLocators = page.locator('div.g');
    let count = await resultLocators.count();
    logger.debug(`Found raw search layout targets count: ${count}`);

    if (count === 0) {
      logger.info('div.g selector returned 0 matches. Attempting robust fallback selector (a:has(h3))...');
      resultLocators = page.locator('a:has(h3)');
      count = await resultLocators.count();
      logger.debug(`Found fallback layout title-anchors count: ${count}`);

      for (let i = 0; i < count; i++) {
        const linkAnchor = resultLocators.nth(i);
        const url = (await linkAnchor.getAttribute('href', { timeout: 2000 }).catch(() => '')) || '';
        if (isJunkUrl(url)) continue;

        const title = (await linkAnchor.locator('h3').first().innerText().catch(() => '')) || '';
        results.push({ title: title.trim(), url: url.trim(), description: '' });
      }
      return results;
    }

    for (let i = 0; i < count; i++) {
      const item = resultLocators.nth(i);
      const titleAnchor = item.locator('h3');
      const linkAnchor = item.locator('a[href]');
      if ((await titleAnchor.count()) === 0 || (await linkAnchor.count()) === 0) continue;

      const title = (await titleAnchor.first().textContent({ timeout: 2000 }).catch(() => '')) || '';
      const url = (await linkAnchor.first().getAttribute('href', { timeout: 2000 }).catch(() => '')) || '';
      if (isJunkUrl(url)) continue;

      const descLocator = item.locator('.VwiC3b');
      const description = (await descLocator.count()) > 0 ? (await descLocator.first().textContent({ timeout: 2000 }).catch(() => '')) || '' : '';

      results.push({ title: title.trim(), url: url.trim(), description: description.trim() });
    }
    return results;
  }

  /**
   * DuckDuckGo provider using the simple HTML version.
   */
  private async searchViaDuckDuckGo(
    query: string,
    workflowId: string,
    page: Page,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<SearchResult[]> {
    logger.info(`Searching DuckDuckGo for query: "${query}" (ClubBot-style)`);
    if (onLogUpdate) {
      await onLogUpdate('Initiating DuckDuckGo Search (ClubBot-style)', { query });
    }

    await page.goto('https://html.duckduckgo.com/html/', { waitUntil: 'domcontentloaded' });
    await this.humanDelay(1000, 2000);

    // Solve any Cloudflare challenges
    await this.handleCloudflareChallenge(page, onLogUpdate);

    const searchInputSelector = 'input[name="q"]';
    await page.waitForSelector(searchInputSelector, { state: 'visible', timeout: 10000 });
    await this.humanType(page, searchInputSelector, query);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForSelector('div.result', { state: 'attached', timeout: 10000 }).catch(() => null);
    await this.humanDelay(1500, 2500);

    const ddgScreenshot = await this.captureAndUploadScreenshot(page, workflowId, 'duckduckgo_search_results');
    if (onLogUpdate && ddgScreenshot) {
      await onLogUpdate('DuckDuckGo Search completed, captured page viewport', { screenshotUrl: ddgScreenshot });
    }

    await this.humanScroll(page, 350);

    const results: SearchResult[] = [];
    const resultElements = page.locator('div.result');
    const count = await resultElements.count();
    logger.debug(`Found DuckDuckGo search results count: ${count}`);

    for (let i = 0; i < count; i++) {
      const item = resultElements.nth(i);
      let titleAnchor = item.locator('a.result__a');
      if ((await titleAnchor.count()) === 0) {
        titleAnchor = item.locator('a.result__url');
      }
      if ((await titleAnchor.count()) === 0) continue;

      const title = (await titleAnchor.first().textContent({ timeout: 2000 }).catch(() => '')) || '';
      const href = (await titleAnchor.first().getAttribute('href', { timeout: 2000 }).catch(() => '')) || '';
      
      let url = href.startsWith('//') ? `https:${href}` : href;
      if (url.includes('uddg=')) {
        try {
          const searchParams = new URL(url).searchParams;
          const decoded = searchParams.get('uddg');
          if (decoded) url = decoded;
        } catch {}
      }

      if (!url || !url.startsWith('http') || url.includes('duckduckgo.com')) continue;

      const descLoc = item.locator('.result__snippet');
      const description = (await descLoc.count()) > 0 ? (await descLoc.first().textContent({ timeout: 2000 }).catch(() => '')) || '' : '';

      results.push({ title: title.trim(), url: url.trim(), description: description.trim() });
    }
    return results;
  }

  /**
   * Bing provider.
   */
  private async searchViaBing(
    query: string,
    workflowId: string,
    page: Page,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<SearchResult[]> {
    logger.info(`Searching Bing for query: "${query}" (ClubBot-style)`);
    if (onLogUpdate) {
      await onLogUpdate('Initiating Bing Search (ClubBot-style)', { query });
    }

    await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded' });
    await this.humanDelay(1000, 2000);

    // Solve any Cloudflare challenges
    await this.handleCloudflareChallenge(page, onLogUpdate);

    const searchInputSelector = 'input[name="q"], textarea[name="q"]';
    await page.waitForSelector(searchInputSelector, { state: 'visible', timeout: 10000 });
    await this.humanType(page, searchInputSelector, query);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForSelector('li.b_algo', { state: 'attached', timeout: 10000 }).catch(() => null);
    await this.humanDelay(1500, 3000);

    const bingScreenshot = await this.captureAndUploadScreenshot(page, workflowId, 'bing_search_results');
    if (onLogUpdate && bingScreenshot) {
      await onLogUpdate('Bing Search completed, captured page viewport', { screenshotUrl: bingScreenshot });
    }

    await this.humanScroll(page, 400);

    const results: SearchResult[] = [];
    const resultElements = page.locator('li.b_algo');
    const bingCount = await resultElements.count();
    logger.debug(`Found Bing search results count: ${bingCount}`);

    for (let i = 0; i < bingCount; i++) {
      const item = resultElements.nth(i);
      const titleAnchor = item.locator('h2 a');
      if ((await titleAnchor.count()) === 0) continue;

      const title = (await titleAnchor.first().textContent({ timeout: 2000 }).catch(() => '')) || '';
      const href = (await titleAnchor.first().getAttribute('href', { timeout: 2000 }).catch(() => '')) || '';
      const url = this.decodeBingUrl(href);
      if (!url || !url.startsWith('http') || url.includes('google.com') || url.includes('bing.com')) continue;

      const descLoc = item.locator('.b_caption p, .b_snippet, p');
      const description = (await descLoc.count()) > 0 ? (await descLoc.first().textContent({ timeout: 2000 }).catch(() => '')) || '' : '';

      results.push({ title: title.trim(), url: url.trim(), description: description.trim() });
    }
    return results;
  }

  /**
   * Bing sometimes wraps outbound links in a redirect carrying a base64 `u` param.
   */
  private decodeBingUrl(href: string): string {
    if (!href) return '';
    try {
      const u = new URL(href).searchParams.get('u');
      if (u && u.startsWith('a1')) {
        const decoded = Buffer.from(u.slice(2), 'base64').toString('utf8');
        if (decoded.startsWith('http')) return decoded;
      }
    } catch {
      // Ignore parse errors and fall back to the raw href.
    }
    return href;
  }

  /**
   * Mojeek provider.
   */
  private async searchViaMojeek(
    query: string,
    workflowId: string,
    page: Page,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<SearchResult[]> {
    logger.info(`Searching Mojeek for query: "${query}" (ClubBot-style)`);
    if (onLogUpdate) {
      await onLogUpdate('Initiating Mojeek Search (ClubBot-style)', { query });
    }

    await page.goto('https://www.mojeek.com', { waitUntil: 'domcontentloaded' });
    await this.humanDelay(1000, 2000);

    // Solve any Cloudflare challenges
    await this.handleCloudflareChallenge(page, onLogUpdate);

    const searchInputSelector = 'input[name="q"]';
    await page.waitForSelector(searchInputSelector, { state: 'visible', timeout: 10000 });
    await this.humanType(page, searchInputSelector, query);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForSelector('ul.results-standard li', { state: 'attached', timeout: 10000 }).catch(() => null);
    await this.humanDelay(1500, 2500);

    const ss = await this.captureAndUploadScreenshot(page, workflowId, 'mojeek_search_results');
    if (onLogUpdate && ss) {
      await onLogUpdate('Mojeek Search completed, captured page viewport', { screenshotUrl: ss });
    }

    await this.humanScroll(page, 300);

    const results: SearchResult[] = [];
    const items = page.locator('ul.results-standard li');
    const count = await items.count();
    logger.debug(`Found Mojeek search results count: ${count}`);

    for (let i = 0; i < count; i++) {
      const li = items.nth(i);
      const titleAnchor = li.locator('h2 a.title, h2 a');
      if ((await titleAnchor.count()) === 0) continue;

      const title = (await titleAnchor.first().textContent()) || '';
      const url = (await titleAnchor.first().getAttribute('href')) || '';
      if (!url.startsWith('http') || url.includes('mojeek.com')) continue;

      const snippet = li.locator('p.s');
      const description = (await snippet.count()) > 0 ? (await snippet.first().textContent()) || '' : '';

      results.push({ title: title.trim(), url: url.trim(), description: description.trim() });
    }
    return results;
  }

  /**
   * Identifies common cookie/privacy/consent overlay dialog elements and clicks them
   */
  private async handleCookieBanners(
    page: Page,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<void> {
    try {
      const selectors = [
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("Agree")',
        'button:has-text("Allow")',
        'button:has-text("Consent")',
        'button:has-text("Got it")',
        'a:has-text("Accept")',
        'a:has-text("Agree")',
        '[id*="cookie"] button',
        '[class*="cookie"] button',
        '[id*="consent"] button',
        '[class*="consent"] button',
        '#onetrust-accept-btn-handler',
        '#cookie-accept',
        '.cookie-consent-accept',
        'button[class*="accept"]',
        'button[id*="accept"]'
      ];

      for (const selector of selectors) {
        const locator = page.locator(selector);
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
          const element = locator.nth(i);
          if (await element.isVisible().catch(() => false)) {
            logger.info(`Bypassing consent banner: clicking element matching "${selector}"`);
            if (onLogUpdate) {
              await onLogUpdate(`Bypassing cookie consent barrier: clicking "${selector}"`);
            }
            await element.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500); // Allow banner to disappear
            return;
          }
        }
      }
    } catch (err: any) {
      logger.debug(`Bypass popups warning: ${err.message}`);
    }
  }

  /**
   * Detects and attempts to solve Cloudflare / Turnstile bot verification challenges
   */
  private async handleCloudflareChallenge(
    page: Page,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<boolean> {
    try {
      const title = await page.title().catch(() => '');
      const content = await page.content().catch(() => '');
      const isChallenge = 
        title.includes('Just a moment...') || 
        title.includes('Attention Required') ||
        content.includes('cloudflare-challenge') ||
        content.includes('checking to see if you\'re a bot') ||
        content.includes('Verify you are human');

      if (!isChallenge) return false;

      logger.info('🛡️ Cloudflare verification wall detected. Starting bypass routine...');
      if (onLogUpdate) {
        await onLogUpdate('Cloudflare verification challenge detected. Starting natural bypass routine...');
      }

      // 1. Wait a bit. Passive checks often clear on their own within a few seconds.
      for (let i = 0; i < 3; i++) {
        await this.humanDelay(1500, 2500);
        const currentTitle = await page.title().catch(() => '');
        if (!currentTitle.includes('Just a moment...') && !currentTitle.includes('Attention Required')) {
          logger.info('✅ Cloudflare passive check passed automatically!');
          if (onLogUpdate) {
            await onLogUpdate('Cloudflare check cleared without intervention.');
          }
          return true;
        }
      }

      // 2. Look for the challenge iframe (Turnstile)
      const frames = page.frames();
      let challengeFrame = null;
      for (const frame of frames) {
        const url = frame.url();
        if (url.includes('challenges.cloudflare.com') || url.includes('turnstile')) {
          challengeFrame = frame;
          break;
        }
      }

      if (challengeFrame) {
        logger.info('Found Cloudflare Turnstile challenge iframe. Attempting to click checkbox...');
        if (onLogUpdate) {
          await onLogUpdate('Locating verification checkbox inside challenge frame...');
        }

        const checkboxSelector = 'input[type="checkbox"], #challenge-stage, .ctp-checkbox-label';
        const checkbox = challengeFrame.locator(checkboxSelector).first();
        
        if (await checkbox.isVisible().catch(() => false)) {
          const iframeElement = await page.locator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]').first();
          const iframeBox = await iframeElement.boundingBox();
          
          if (iframeBox) {
            const clickX = iframeBox.x + iframeBox.width / 2;
            const clickY = iframeBox.y + iframeBox.height / 2;
            
            await this.humanMove(page, clickX, clickY);
            await this.humanDelay(300, 700);
            await page.mouse.click(clickX, clickY);
            logger.info('Clicked Turnstile verification target.');
            if (onLogUpdate) {
              await onLogUpdate('Clicked Turnstile verification checkbox.');
            }
            
            await this.humanDelay(3000, 5000);
            return true;
          }
        }
      }

      // 3. Fallback: simulate minor mouse movements and scroll to trigger human presence detection
      await this.humanScroll(page, 150);
      await this.humanDelay(1000, 2000);
      
      return false;
    } catch (err: any) {
      logger.debug(`Error in Cloudflare solver: ${err.message}`);
      return false;
    }
  }

  /**
   * Discovers internal subpage links from the current page
   */
  private async discoverSubpages(page: Page, baseUrl: string): Promise<string[]> {
    try {
      const links = await page.evaluate((base) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const foundUrls: string[] = [];
        try {
          const baseDomain = new URL(base).hostname;
          anchors.forEach((a) => {
            const href = a.getAttribute('href');
            if (!href) return;
            try {
              const absUrl = new URL(href, base).toString();
              const parsed = new URL(absUrl);
              // Keep internal links on same domain
              if (parsed.hostname === baseDomain) {
                parsed.hash = '';
                parsed.search = '';
                foundUrls.push(parsed.toString());
              }
            } catch {}
          });
        } catch {}
        return foundUrls;
      }, baseUrl);

      const uniqueLinks = Array.from(new Set(links));
      const subpages: string[] = [];
      const keywords = ['about', 'team', 'company', 'who-we-are', 'contact', 'get-in-touch', 'pricing', 'plan', 'careers', 'jobs'];

      for (const link of uniqueLinks) {
        if (link === baseUrl || link === `${baseUrl}/`) continue;
        try {
          const parsed = new URL(link);
          const path = parsed.pathname.toLowerCase();
          
          const hasKeyword = keywords.some(kw => path.includes(kw));
          if (hasKeyword) {
            subpages.push(link);
          }
        } catch {}
      }

      return subpages;
    } catch (err) {
      logger.warn(`Failed to discover subpages: ${err}`);
      return [];
    }
  }

  public async scrapeWebsiteText(
    url: string,
    workflowId: string,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<{ title: string; bodyText: string; metadata: Record<string, string>; error?: string }> {
    try {
      logger.info(`Scraping target website contents via Playwright: ${url}`);
      if (onLogUpdate) {
        await onLogUpdate(`Navigating to target domain via browser: ${url}`);
      }

      const { context, page } = await this.createPage();
      try {
        // Navigate with generous loading timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await this.humanDelay(1000, 2000); // Brief settle time for JS loaders

        // Solve any Cloudflare challenges
        await this.handleCloudflareChallenge(page, onLogUpdate);

        // Dismiss cookie banners & popups
        await this.handleCookieBanners(page, onLogUpdate);

        // Screenshot web view
        const screenshot = await this.captureAndUploadScreenshot(page, workflowId, `scrape_${url.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}`);

        // Extract document title
        const homeTitle = (await page.title()) || '';

        // Pull document metadata tags
        const metadata: Record<string, string> = { screenshotUrl: screenshot || '' };
        
        const metaDescription = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
        if (metaDescription) metadata.description = metaDescription;

        const metaKeywords = await page.locator('meta[name="keywords"]').getAttribute('content').catch(() => null);
        if (metaKeywords) metadata.keywords = metaKeywords;

        // Extract heading scopes to understand hierarchy
        const headings: string[] = [];
        const h1Count = await page.locator('h1').count();
        for (let i = 0; i < Math.min(h1Count, 5); i++) {
          const text = await page.locator('h1').nth(i).innerText().catch(() => '');
          if (text.trim()) headings.push(`H1: ${text.trim()}`);
        }
        
        const h2Count = await page.locator('h2').count();
        for (let i = 0; i < Math.min(h2Count, 8); i++) {
          const text = await page.locator('h2').nth(i).innerText().catch(() => '');
          if (text.trim()) headings.push(`H2: ${text.trim()}`);
        }
        metadata.headings = headings.join(' | ');

        // Discovered links/contacts storage
        const accumulatedEmails = new Set<string>();
        let linkedinUrl = '';
        let twitterUrl = '';
        let githubUrl = '';

        // Helper to extract contacts from DOM
        const extractContacts = async () => {
          const contactData = await page.evaluate(() => {
            const data = {
              emails: [] as string[],
              linkedin: null as string | null,
              twitter: null as string | null,
              github: null as string | null,
            };

            try {
              const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
              const matches = document.body.innerHTML.match(emailRegex);
              if (matches) {
                const unique = Array.from(new Set(matches));
                const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.css', '.js', '.png@', '.jpg@'];
                data.emails = unique.filter((e) => {
                  const el = e.toLowerCase();
                  return !exts.some((ext) => el.endsWith(ext)) && e.includes('.') && e.length > 5;
                });
              }
            } catch {}

            try {
              const anchors = document.querySelectorAll('a[href]');
              anchors.forEach((a) => {
                const href = a.getAttribute('href') || '';
                const normalized = href.toLowerCase();
                if (normalized.includes('linkedin.com/in/') || normalized.includes('linkedin.com/company/')) {
                  data.linkedin = href;
                } else if (normalized.includes('twitter.com/') || normalized.includes('x.com/')) {
                  data.twitter = href;
                } else if (normalized.includes('github.com/')) {
                  data.github = href;
                } else if (normalized.startsWith('mailto:')) {
                  const email = href.replace(/mailto:/i, '').split('?')[0].trim();
                  if (email) data.emails.push(email);
                }
              });
            } catch {}

            data.emails = Array.from(new Set(data.emails));
            return data;
          });

          contactData.emails.forEach(e => accumulatedEmails.add(e));
          if (contactData.linkedin) linkedinUrl = contactData.linkedin;
          if (contactData.twitter) twitterUrl = contactData.twitter;
          if (contactData.github) githubUrl = contactData.github;
        };

        // Extract contacts from homepage
        await extractContacts();

        // Discover subpages before deleting tags
        const subpageUrls = await this.discoverSubpages(page, url);
        if (onLogUpdate && subpageUrls.length > 0) {
          const routes = subpageUrls.map(u => {
            try { return new URL(u).pathname; } catch { return u; }
          });
          await onLogUpdate(`Discovered internal subpages: ${routes.join(', ')}`);
        }

        // Get homepage body text
        const homeBodyText = await page.evaluate(() => {
          const junkTags = document.querySelectorAll('script, style, svg, iframe, noscript, footer, nav');
          junkTags.forEach((tag) => tag.remove());
          return document.body.innerText || '';
        });

        const cleanTexts: string[] = [];
        cleanTexts.push(`--- Homepage content ---\nTitle: ${homeTitle}\n\n${homeBodyText.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim()}`);

        // Navigate up to 2 discovered high-value subpages
        const maxSubpages = 2;
        let subpagesVisited = 0;
        
        // Prioritize subpages by relevance keywords
        const sortedSubpages = subpageUrls.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const getScore = (str: string) => {
            if (str.includes('contact')) return 3;
            if (str.includes('about')) return 2;
            if (str.includes('team')) return 2;
            if (str.includes('pricing')) return 1;
            return 0;
          };
          return getScore(bLower) - getScore(aLower);
        });

        const titles = [homeTitle];

        for (const subpageUrl of sortedSubpages) {
          if (subpagesVisited >= maxSubpages) break;
          let subPath = subpageUrl;
          try { subPath = new URL(subpageUrl).pathname; } catch {}
          
          try {
            logger.info(`Agent navigating to subpage: ${subpageUrl}`);
            if (onLogUpdate) {
              await onLogUpdate(`Inspecting subpage: ${subPath}`);
            }

            // Navigate with a tighter timeout
            await page.goto(subpageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await this.humanDelay(1000, 2000);

            // Solve any Cloudflare challenges
            await this.handleCloudflareChallenge(page, onLogUpdate);

            // Dismiss cookie consent on subpage
            await this.handleCookieBanners(page, onLogUpdate);

            // Scroll down to load dynamic content
            await this.humanScroll(page, 400);

            // Capture screenshot for visual audit
            const subpageScreenshot = await this.captureAndUploadScreenshot(
              page,
              workflowId,
              `scrape_sub_${subPath.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}`
            );
            if (onLogUpdate && subpageScreenshot) {
              await onLogUpdate(`Inspected subpage "${subPath}" successfully, captured browser view.`, { screenshotUrl: subpageScreenshot });
            }

            const subpageTitle = (await page.title()) || '';
            if (subpageTitle && !titles.includes(subpageTitle)) {
              titles.push(subpageTitle);
            }

            // Extract contacts
            await extractContacts();

            // Extract subpage text
            const subpageBodyText = await page.evaluate(() => {
              const junkTags = document.querySelectorAll('script, style, svg, iframe, noscript, footer, nav');
              junkTags.forEach((tag) => tag.remove());
              return document.body.innerText || '';
            });

            const cleanSubText = subpageBodyText.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
            cleanTexts.push(`--- Subpage content: ${subPath} ---\nTitle: ${subpageTitle}\n\n${cleanSubText}`);
            
            subpagesVisited++;
          } catch (subpageError: any) {
            logger.warn(`Failed to scrape subpage ${subpageUrl}: ${subpageError.message}`);
            if (onLogUpdate) {
              await onLogUpdate(`Warning: Could not fully inspect subpage "${subPath}": ${subpageError.message}`);
            }
          }
        }

        // Save contacts to metadata
        if (accumulatedEmails.size > 0) {
          metadata.emails = Array.from(accumulatedEmails).join(', ');
        }
        if (linkedinUrl) metadata.linkedin = linkedinUrl;
        if (twitterUrl) metadata.twitter = twitterUrl;
        if (githubUrl) metadata.github = githubUrl;

        const combinedText = cleanTexts.join('\n\n');
        const truncatedText = combinedText.slice(0, 16000);

        logger.info(`Finished agent website exploration for ${url}. Visited homepage + ${subpagesVisited} subpages. Extracted ${truncatedText.length} character blocks.`);
        if (onLogUpdate) {
          await onLogUpdate(`Completed deep website inspection. Combined contents size: ${truncatedText.length} characters.`);
        }

        return {
          title: titles.join(' | '),
          bodyText: truncatedText,
          metadata,
        };
      } finally {
        await page.close();
        await context.close();
      }
    } catch (playwrightError: any) {
      logger.error(`Playwright scraping failed for ${url}: ${playwrightError.message}`);
      return {
        title: '',
        bodyText: '',
        metadata: {},
        error: `Playwright error: ${playwrightError.message}`,
      };
    }
  }
  /**
   * Deep Research Tool: Navigates to a target URL, applies Set-of-Mark visual grounding,
   * captures a visual telemetry snapshot, discovers key subpages (/pricing, /docs, /team),
   * and extracts clean visible text.
   */
  public async navigateAndGroundWithSoM(
    url: string,
    workflowId: string,
    onLogUpdate?: (message: string, meta?: any) => Promise<void>
  ): Promise<{
    title: string;
    bodyText: string;
    screenshotUrl: string | null;
    marks: InteractiveElement[];
    subpages: string[];
    metadata: Record<string, string>;
    error?: string;
  }> {
    try {
      logger.info(`🌐 Deep Research Agent navigating to: ${url}`);
      if (onLogUpdate) {
        await onLogUpdate(`Navigating and applying Set-of-Mark visual grounding: ${url}`);
      }

      const { context, page } = await this.createPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await this.humanDelay(800, 1500);

        await this.handleCloudflareChallenge(page, onLogUpdate);
        await this.handleCookieBanners(page, onLogUpdate);

        // Inject Set-of-Mark visual tags onto interactive elements
        const marks = await SetOfMarkGrounder.injectSetOfMarks(page);

        // Capture visual snapshot with SoM badges
        const screenshotUrl = await this.captureAndUploadScreenshot(
          page,
          workflowId,
          `som_${url.replace(/[^a-z0-9]/gi, '_').slice(0, 35)}`
        );

        // Remove overlay badges before text extraction
        await SetOfMarkGrounder.removeSetOfMarks(page);

        const title = (await page.title()) || '';

        // Extract metadata tags
        const metaDesc = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
        const metadata: Record<string, string> = {
          description: metaDesc || '',
          url,
        };

        // Discover relevant deep research subpages (e.g. /pricing, /about, /team, /docs, /company)
        const subpages = await page.evaluate((currentOrigin) => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          const discovered: string[] = [];
          const keywords = ['about', 'team', 'pricing', 'docs', 'product', 'company', 'customers', 'case-study', 'research'];

          for (const a of links) {
            try {
              const href = (a as HTMLAnchorElement).href;
              const linkUrl = new URL(href);
              if (linkUrl.origin === currentOrigin && !discovered.includes(href)) {
                const lower = href.toLowerCase();
                if (keywords.some((k) => lower.includes(k))) {
                  discovered.push(href);
                }
              }
            } catch {}
          }
          return discovered.slice(0, 8);
        }, new URL(url).origin).catch(() => []);

        // Extract clean body text
        const bodyText = await page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          const killSelectors = ['script', 'style', 'noscript', 'svg', 'iframe', 'footer'];
          killSelectors.forEach((sel) => clone.querySelectorAll(sel).forEach((el) => el.remove()));
          return (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 15000);
        });

        if (onLogUpdate) {
          await onLogUpdate(`Visual grounding complete. Extracted ${marks.length} interactive elements, ${subpages.length} subpages, ${bodyText.length} text chars.`, {
            screenshotUrl,
            marksCount: marks.length,
            subpages,
          });
        }

        return {
          title,
          bodyText,
          screenshotUrl,
          marks,
          subpages,
          metadata,
        };
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    } catch (err: any) {
      logger.warn(`SoM navigation error on ${url}: ${err.message}`);
      return {
        title: '',
        bodyText: '',
        screenshotUrl: null,
        marks: [],
        subpages: [],
        metadata: {},
        error: err.message,
      };
    }
  }
}

export const browserService = new BrowserService();
export default browserService;
