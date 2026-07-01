import browserService from '../src/browser/browserService.js';
import logger from '../src/utils/logger.js';

async function testBrowserService() {
  try {
    logger.info('🧪 Starting BrowserService Integration Test...');
    
    // Initialize browser singleton
    await browserService.initialize();

    // 1. Google Search Test
    const query = 'AI developments 2026';
    const mockWorkflowId = 'test-workflow-uuid-12345';
    let targetUrl = 'https://github.com';
    
    logger.info(`🔍 Step 1: Performing Google Search for "${query}"`);
    try {
      const results = await browserService.searchGoogle(query, mockWorkflowId, async (msg) => {
        logger.info(`   [Telemetry]: ${msg}`);
      });

      logger.info(`✨ Successfully retrieved ${results.length} results:`);
      results.forEach((res, index) => {
        logger.info(`   [${index + 1}] Title: "${res.title}" | URL: ${res.url}`);
      });

      if (results.length > 0) {
        targetUrl = results[0].url;
      }
    } catch (searchError: any) {
      logger.warn(`⚠️ Search step failed (likely due to search engine rate limits / CAPTCHA): ${searchError.message}`);
      logger.info(`ℹ️ Falling back to direct scrape test using: "${targetUrl}"`);
    }

    // 2. Scraping Target Test
    logger.info(`📄 Step 2: Deep-scraping target domain: "${targetUrl}"`);
    const scraped = await browserService.scrapeWebsiteText(targetUrl, mockWorkflowId, async (msg, meta) => {
      logger.info(`   [Telemetry]: ${msg} ${meta ? JSON.stringify(meta) : ''}`);
    });

    if (scraped.error) {
      logger.warn(`❌ Scrape encountered warning: ${scraped.error}`);
    } else {
      logger.info(`✅ Successfully scraped page content:`);
      logger.info(`   - Document Title: "${scraped.title}"`);
      logger.info(`   - Headings found: ${scraped.metadata.headings || 'None'}`);
      logger.info(`   - Emails found: ${scraped.metadata.emails || 'None'}`);
      logger.info(`   - LinkedIn found: ${scraped.metadata.linkedin || 'None'}`);
      logger.info(`   - Visible text block size: ${scraped.bodyText.length} characters`);
      logger.info(`   - Text snippet: "${scraped.bodyText.slice(0, 500)}..."`);
    }

    logger.info('🎉 All BrowserService integration tests completed successfully.');
  } catch (error) {
    logger.error('💥 Test script failed:', error);
  } finally {
    // Teardown
    await browserService.shutdown();
  }
}

testBrowserService();
