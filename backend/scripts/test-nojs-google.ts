import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-infobars',
    ]
  });

  const context = await browser.newContext({
    javaScriptEnabled: false, // Disable JS
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const page = await context.newPage();
  try {
    console.log('Navigating to Google Search (No JS)...');
    await page.goto('https://www.google.com/search?q=AI+developments+2026&hl=en&gl=us', { waitUntil: 'commit' });
    console.log('Waiting 5 seconds for page to settle...');
    await page.waitForTimeout(5000);
    
    const html = await page.content();
    fs.writeFileSync('/Users/amathziah/lead-flow/backend/scratch_nojs_google.html', html);
    console.log('HTML saved to /Users/amathziah/lead-flow/backend/scratch_nojs_google.html');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();
