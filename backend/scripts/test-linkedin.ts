import browserService from '../src/browser/browserService.js';
import logger from '../src/utils/logger.js';

async function testLinkedInScraping() {
  try {
    logger.info('🧪 Starting LinkedIn Scraping Integration Test...');
    
    // Initialize browser singleton
    await browserService.initialize();

    // LinkedIn profile to scrape (we can use a known profile or one that doesn't trigger log-out easily)
    const testUrl = 'https://www.linkedin.com/in/williamhgates';
    const mockWorkflowId = 'test-linkedin-workflow-123';

    logger.info(`🔍 Navigating and scraping profile: ${testUrl}`);
    const results = await browserService.scrapeLinkedInProfile(testUrl, mockWorkflowId, async (msg, meta) => {
      logger.info(`   [Telemetry]: ${msg} ${meta ? JSON.stringify(meta) : ''}`);
    });

    logger.info('✨ Scraping Completed. Results:');
    logger.info(`Name: "${results.name}"`);
    logger.info(`Headline: "${results.headline}"`);
    logger.info(`About: "${results.aboutText.slice(0, 150)}..."`);
    logger.info(`Experience Excerpt: "${results.experienceExcerpt.slice(0, 150)}..."`);
    if (results.error) {
      logger.warn(`❌ Encountered warning/error during scrape: ${results.error}`);
    } else {
      logger.info('✅ Successfully scraped LinkedIn profile!');
    }

  } catch (error) {
    logger.error('💥 Test script failed:', error);
  } finally {
    // Teardown
    await browserService.shutdown();
  }
}

testLinkedInScraping();
