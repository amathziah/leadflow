import browserService from '../src/browser/browserService.js';
import { env } from '../src/config/env.js';
import logger from '../src/utils/logger.js';

// Keep reference to original fetch
const originalFetch = globalThis.fetch;

async function runTest() {
  try {
    logger.info('🧪 Testing Perplexity Search API integration branch...');

    // 1. Mock Serper Key
    env.SERPER_API_KEY = 'mock-serper-key';

    // Mock fetch for Serper
    globalThis.fetch = async (url: any, options: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://google.serper.dev/search') {
        logger.info('   [Mock]: Intercepted Serper.dev request');
        return {
          ok: true,
          json: async () => ({
            organic: [
              { title: 'Mock Serper Result 1', link: 'https://mockserper1.com', snippet: 'Serper description 1' },
              { title: 'Mock Serper Result 2', link: 'https://mockserper2.com', snippet: 'Serper description 2' }
            ]
          })
        } as any;
      }
      return originalFetch(url, options);
    };

    const results = await browserService.searchGoogle('test query', 'test-workflow');
    logger.info(`✨ Retrieved ${results.length} results from mock Serper:`);
    results.forEach(r => logger.info(`   - ${r.title} (${r.url}): ${r.description}`));

    if (results[0].title !== 'Mock Serper Result 1') {
      throw new Error('Serper integration parsing failed');
    }

    // 2. Mock Tavily Key (and disable Serper to hit Tavily branch)
    env.SERPER_API_KEY = '';
    env.TAVILY_API_KEY = 'mock-tavily-key';

    globalThis.fetch = async (url: any, options: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://api.tavily.com/search') {
        logger.info('   [Mock]: Intercepted Tavily request');
        return {
          ok: true,
          json: async () => ({
            results: [
              { title: 'Mock Tavily Result 1', url: 'https://mocktavily1.com', content: 'Tavily description 1' }
            ]
          })
        } as any;
      }
      return originalFetch(url, options);
    };

    const tavilyResults = await browserService.searchGoogle('test query', 'test-workflow');
    logger.info(`✨ Retrieved ${tavilyResults.length} results from mock Tavily:`);
    tavilyResults.forEach(r => logger.info(`   - ${r.title} (${r.url}): ${r.description}`));

    if (tavilyResults[0].title !== 'Mock Tavily Result 1') {
      throw new Error('Tavily integration parsing failed');
    }

    // 3. Test Jina Reader scraping fallback
    logger.info('🧪 Testing Jina Reader scraping fallback...');
    env.TAVILY_API_KEY = ''; // Reset

    globalThis.fetch = async (url: any, options: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.startsWith('https://r.jina.ai/')) {
        logger.info('   [Mock]: Intercepted Jina Reader request');
        return {
          ok: true,
          text: async () => `Title: Mock Jina Title\nURL Source: https://mockopenai.com\n\nMarkdown Content:\nSome page content showing info@mockopenai.com and linkedin.com/company/mockopenai`
        } as any;
      }
      return originalFetch(url, options);
    };

    // We scrape an invalid domain so Playwright throws, hitting the Jina Reader fallback
    const scraped = await browserService.scrapeWebsiteText('https://invalid-domain-to-trigger-playwright-fail.com', 'test-workflow');
    logger.info('✨ Scrape result from Jina fallback:');
    logger.info(`   - Title: "${scraped.title}"`);
    logger.info(`   - Text snippet: "${scraped.bodyText}"`);
    logger.info(`   - Emails: "${scraped.metadata.emails}"`);
    logger.info(`   - LinkedIn: "${scraped.metadata.linkedin}"`);

    if (scraped.title !== 'Mock Jina Title' || !scraped.metadata.emails?.includes('info@mockopenai.com')) {
      throw new Error('Jina Reader fallback parsing failed');
    }

    logger.info('🎉 All Perplexity search and reader API tests passed!');
  } finally {
    // Restore fetch
    globalThis.fetch = originalFetch;
    await browserService.shutdown();
  }
}

runTest().catch(err => {
  logger.error('💥 Mock test failed:', err);
  process.exit(1);
});
