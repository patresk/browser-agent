import { Page } from 'puppeteer';

export const LINK_ATTRIBUTE = 'gpt-link-text';

async function highlightLinks(page: Page) {
  await page.evaluate((attribute) => {
    document.querySelectorAll(`[${attribute}]`).forEach((e) => {
      e.removeAttribute(attribute);
    });
  }, LINK_ATTRIBUTE);

  const elements = await page.$$('a, button, [role=button], [role=treeitem]');

  elements.forEach(async (e) => {
    await page.evaluate(
      (e, attribute) => {
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
          e.setAttribute(attribute, ariaLabel ?? link_text);
        }
      },
      e,
      LINK_ATTRIBUTE,
    );
  });
}

export const INPUT_FIELD_ATTRIBUTE = 'gpt-input-fields';

async function highlightInputFields(page: Page) {
  await page.evaluate((attribute) => {
    document.querySelectorAll(`[${attribute}]`).forEach((e) => {
      e.removeAttribute(attribute);
    });
  }, INPUT_FIELD_ATTRIBUTE);

  const elements = await page.$$('input, textarea');

  elements.forEach(async (e) => {
    await page.evaluate(
      (e, attribute) => {
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
          e.setAttribute(attribute, ariaLabel ?? input_text);
        }
      },
      e,
      INPUT_FIELD_ATTRIBUTE,
    );
  });
}

export const SCROLLABLE_AREA_ATTRIBUTE = 'gpt-scrollable-area';

async function highlightScrollableAreas(page: Page) {
  // Clear previous attributes
  await page.evaluate((scrollableAreaAttribute) => {
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

    document.querySelectorAll(`[${scrollableAreaAttribute}]`).forEach((e) => {
      e.removeAttribute(scrollableAreaAttribute);
    });

    const elements = document.querySelectorAll('*');
    let index = 0;

    elements.forEach((el) => {
      const computedStyle = window.getComputedStyle(el);
      const overflowY = computedStyle.overflowY;
      const overflowX = computedStyle.overflowX;
      const isScrollableY =
        (overflowY === 'scroll' || overflowY === 'auto') &&
        el.scrollHeight - el.clientHeight > 1;
      const isScrollableX =
        (overflowX === 'scroll' || overflowX === 'auto') &&
        el.scrollWidth - el.clientWidth > 1;

      if ((isScrollableY || isScrollableX) && isElementVisible(el)) {
        (el as HTMLElement).style.border = '1px solid green';
        const areaLabel = `i-${index++}`;
        el.setAttribute(scrollableAreaAttribute, areaLabel);

        // Create a small text element to show the index
        const label = document.createElement('div');
        label.innerText = areaLabel;
        label.style.position = 'absolute';
        label.style.backgroundColor = 'green';
        label.style.color = 'white';
        label.style.fontSize = '11px';
        label.style.padding = '0px';
        label.style.zIndex = '9999';
        label.style.border = '1px solid black';
        label.style.fontFamily = 'monospace';

        // Position the label near the top-left corner of the element
        const rect = el.getBoundingClientRect();
        label.style.top = `${rect.top + window.scrollY}px`;
        label.style.left = `${rect.left + window.scrollX}px`;

        document.body.appendChild(label);
      }
    });
  }, SCROLLABLE_AREA_ATTRIBUTE);
}

export async function annotateAndTakeScreenshot(page: Page) {
  await highlightLinks(page);
  await highlightInputFields(page);
  await highlightScrollableAreas(page);

  await page.screenshot({
    path: 'screenshot.jpg',
    fullPage: true,
  });
}
