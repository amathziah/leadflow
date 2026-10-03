import { Page } from 'playwright';
import logger from '../utils/logger.js';

/**
 * Applies baseline page configuration before any script on the target page runs.
 *
 * This deliberately contains no fingerprint spoofing or bot-detection evasion.
 * We identify the crawler honestly via the User-Agent (set on the browser
 * context) and only normalise locale/timezone so that extracted content is
 * stable and reproducible across machines and CI runs.
 */
export const configurePage = async (page: Page): Promise<void> => {
  try {
    // Keep rendered content deterministic: a page that localises dates, prices
    // or number formats should render the same way for every run, otherwise
    // extraction diffs are noise rather than signal.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    logger.debug('Baseline page configuration applied (locale normalisation)');
  } catch (error: any) {
    logger.warn(`Could not apply page configuration: ${error.message}`);
  }
};
