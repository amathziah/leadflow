import { Page } from 'playwright';
import logger from '../utils/logger.js';

export interface InteractiveElement {
  id: number;
  tag: string;
  text: string;
  ariaLabel: string;
  href?: string;
  role?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Set-of-Mark (SoM) Visual & Accessibility Grounding Engine.
 * Overlays high-contrast numbered badges onto interactive DOM elements,
 * allowing multimodal models (and visual human-in-the-loop telemetry)
 * to ground actions directly to viewport coordinates and element tags.
 */
export class SetOfMarkGrounder {
  private static SOM_CONTAINER_ID = '__leadflow_som_overlay__';

  /**
   * Identifies all interactive elements on the page, injects numbered visual badges,
   * and returns element descriptors.
   */
  public static async injectSetOfMarks(page: Page): Promise<InteractiveElement[]> {
    try {
      const elements: InteractiveElement[] = await page.evaluate((containerId) => {
        // Clean up any existing overlay
        const existing = document.getElementById(containerId);
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = containerId;
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '999999';
        document.body.appendChild(container);

        const candidates = Array.from(
          document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], nav a, header a, .btn')
        );

        const marks: any[] = [];
        let idCounter = 1;

        for (const el of candidates) {
          const rect = el.getBoundingClientRect();
          // Filter invisible, tiny, or off-screen elements
          if (rect.width < 14 || rect.height < 14 || rect.top < 0 || rect.top > window.innerHeight) {
            continue;
          }
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            continue;
          }

          const currentId = idCounter++;
          if (currentId > 60) break; // Limit marks to top 60 elements to keep viewport clean

          // Create badge
          const badge = document.createElement('div');
          badge.textContent = `[${currentId}]`;
          badge.style.position = 'absolute';
          badge.style.left = `${Math.max(0, rect.left)}px`;
          badge.style.top = `${Math.max(0, rect.top)}px`;
          badge.style.backgroundColor = '#6366f1';
          badge.style.color = '#ffffff';
          badge.style.fontSize = '11px';
          badge.style.fontWeight = 'bold';
          badge.style.fontFamily = 'monospace';
          badge.style.padding = '1px 4px';
          badge.style.borderRadius = '3px';
          badge.style.border = '1px solid #ffffff';
          badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.4)';
          badge.style.pointerEvents = 'none';
          badge.style.lineHeight = '14px';

          // Bounding box border
          const box = document.createElement('div');
          box.style.position = 'absolute';
          box.style.left = `${rect.left}px`;
          box.style.top = `${rect.top}px`;
          box.style.width = `${rect.width}px`;
          box.style.height = `${rect.height}px`;
          box.style.border = '1.5px solid rgba(99, 102, 241, 0.7)';
          box.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
          box.style.borderRadius = '2px';
          box.style.pointerEvents = 'none';

          container.appendChild(box);
          container.appendChild(badge);

          const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
          const ariaLabel = el.getAttribute('aria-label') || '';
          const href = (el as HTMLAnchorElement).href || undefined;

          marks.push({
            id: currentId,
            tag: el.tagName.toLowerCase(),
            text,
            ariaLabel,
            href,
            role: el.getAttribute('role') || undefined,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        }

        return marks;
      }, this.SOM_CONTAINER_ID);

      logger.debug(`🎯 Set-of-Mark Grounding: Injected ${elements.length} visual badges onto page`);
      return elements;
    } catch (error: any) {
      logger.warn(`Set-of-Mark grounding injection warning: ${error.message}`);
      return [];
    }
  }

  /**
   * Cleans up the Set-of-Mark badge container from the DOM
   */
  public static async removeSetOfMarks(page: Page): Promise<void> {
    try {
      await page.evaluate((containerId) => {
        const existing = document.getElementById(containerId);
        if (existing) existing.remove();
      }, this.SOM_CONTAINER_ID);
    } catch (error: any) {
      // Non-critical cleanup
    }
  }
}
