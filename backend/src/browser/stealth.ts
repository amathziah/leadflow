import { Page } from 'playwright';
import logger from '../utils/logger.js';

/**
 * Injects camouflage properties into the Playwright Page context
 * before any scripts on the target page execute.
 */
export const applyStealth = async (page: Page): Promise<void> => {
  try {
    await page.addInitScript(() => {
      // 1. Hide the navigator.webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // 2. Spoof the chrome property (missing in standard headless chrome)
      // @ts-ignore
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
      };

      // 3. Spoof languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // 4. Spoof plugins list (headless chrome typically has 0 plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            name: 'Chrome PDF Viewer',
          },
          {
            description: 'Compiler for PDF documents',
            filename: 'internal-pdf-compiler',
            name: 'Chrome PDF Compiler',
          },
        ],
      });

      // 5. Spoof permissions query results
      const originalQuery = window.navigator.permissions.query;
      // @ts-ignore
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? (Promise.resolve({ state: Notification.permission }) as any)
          : originalQuery(parameters);

      // 6. Spoof WebGL vendor and renderer
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // 37445 = UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        // 37446 = UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return 'Intel(R) Iris(TM) Plus Graphics 640';
        }
        return getParameter.call(this, parameter);
      };

      // 7. Spoof hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });

      // 8. Spoof device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      // 9. Fix iframe srcdoc and contentWindow/parent properties
      const originalCreateElement = document.createElement;
      document.createElement = function(tagName: string, options?: ElementCreationOptions) {
        const element = originalCreateElement.call(document, tagName, options);
        if (tagName.toLowerCase() === 'iframe') {
          try {
            Object.defineProperty(element, 'contentWindow', {
              get: () => {
                try {
                  return (element as HTMLIFrameElement).contentWindow;
                } catch {
                  return null;
                }
              }
            });
          } catch {}
        }
        return element;
      };
    });

    logger.debug('🕶️ Advanced Stealth scripts successfully injected into the page lifecycle');
  } catch (error: any) {
    logger.warn(`Could not apply stealth scripting overrides: ${error.message}`);
  }
};
