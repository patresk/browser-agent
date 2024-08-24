import { Page } from 'puppeteer';

async function highlightLinks(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[gpt-link-text]').forEach((e) => {
      e.removeAttribute('gpt-link-text');
    });
  });

  const elements = await page.$$('a, button, [role=button], [role=treeitem]');

  elements.forEach(async (e) => {
    await page.evaluate((e) => {
      // NOTE: these function must be defined in the page context
      function isStyleVisible(el: Element) {
        const style = window.getComputedStyle(el);
        return (
          style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      function isElementInViewport(el: Element) {
        const rect = el.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <=
            (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <=
            (window.innerWidth || document.documentElement.clientWidth)
        );
      }

      function isElementVisible(el: Element) {
        if (!el) return false; // Element does not exist

        // Check if the element is visible style-wise
        if (!isStyleVisible(el)) {
          return false;
        }

        // Traverse up the DOM and check if any ancestor element is hidden
        let parent = el;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          // @ts-expect-error FIXME
          parent = parent.parentElement;
        }

        // Finally, check if the element is within the viewport
        return isElementInViewport(el);
      }

      // @ts-expect-error FIXME
      e.style.border = '1px solid red';

      const position = e.getBoundingClientRect();

      if (position.width > 5 && position.height > 5 && isElementVisible(e)) {
        // @ts-expect-error FIXME
        const link_text = e.textContent.replace(/[^a-zA-Z0-9 ]/g, '');

        const ariaLabel = e.getAttribute('aria-label');
        console.log('ariaLabel', ariaLabel);
        e.setAttribute('gpt-link-text', ariaLabel ?? link_text);
      }
    }, e);
  });
}

async function highlightInputFields(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[gpt-input-fields]').forEach((e) => {
      e.removeAttribute('gpt-input-fields');
    });
  });

  const elements = await page.$$('input, textarea');

  elements.forEach(async (e) => {
    await page.evaluate((e) => {
      // NOTE: these function must be defined in the page context
      function isStyleVisible(el: Element) {
        const style = window.getComputedStyle(el);
        return (
          style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      function isElementInViewport(el: Element) {
        const rect = el.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <=
            (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <=
            (window.innerWidth || document.documentElement.clientWidth)
        );
      }

      function isElementVisible(el: Element) {
        if (!el) return false; // Element does not exist

        // Check if the element is visible style-wise
        if (!isStyleVisible(el)) {
          return false;
        }

        // Traverse up the DOM and check if any ancestor element is hidden
        let parent = el;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          // @ts-expect-error FIXME
          parent = parent.parentElement;
        }

        // Finally, check if the element is within the viewport
        return isElementInViewport(el);
      }

      e.style.border = '1px solid yellow';
      const position = e.getBoundingClientRect();

      if (position.width > 5 && position.height > 5 && isElementVisible(e)) {
        const input_text = e.placeholder ?? e.value;
        const ariaLabel = e.getAttribute('aria-label');
        e.setAttribute('gpt-input-fields', ariaLabel ?? input_text);
      }
    }, e);
  });
}

export async function annotateAndTakeScreenshot(page: Page) {
  await highlightLinks(page);
  await highlightInputFields(page);

  await page.screenshot({
    path: 'screenshot.jpg',
    fullPage: true,
  });
}
