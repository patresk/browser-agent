import { Page } from 'puppeteer';

export const LINK_ATTRIBUTE = 'browser-agent-link-text';
export const SELECT_ATTRIBUTE = 'browser-agent-select-fields';
export const INPUT_TEXT_ATTRIBUTE = 'browser-agent-input-fields';
export const SCROLLABLE_AREA_ATTRIBUTE = 'browser-agent-scrollable-area';
export const LABEL_ATTRIBUTE = 'browser-agent-label';

async function annotateLinks(page: Page) {
  await page.evaluate((attribute) => {
    // Clear previous attributes
    document.querySelectorAll(`[${attribute}]`).forEach((e) => {
      e.removeAttribute(attribute);
    });

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

    // Render an element in the top left corner of the element
    function renderLabel(element: Element, label: string) {
      const labelElement = document.createElement('div');
      labelElement.innerText = label;
      labelElement.style.position = 'absolute';
      labelElement.style.backgroundColor = '#FF0000';
      labelElement.style.color = 'black';
      labelElement.style.fontSize = '11px';
      labelElement.style.padding = '0px';
      labelElement.style.paddingLeft = '2px';
      labelElement.style.paddingRight = '2px';
      labelElement.style.zIndex = '999999999999999999999';
      labelElement.style.border = '1px solid black';
      labelElement.style.fontFamily = 'monospace';
      labelElement.style.lineHeight = '1';
      labelElement.setAttribute('browser-agent-label', 'true');

      // Position the label near the top-left corner of the element
      const rect = element.getBoundingClientRect();
      labelElement.style.top = `${rect.top + window.scrollY - 11}px`;
      labelElement.style.left = `${rect.left + window.scrollX}px`;

      document.body.appendChild(labelElement);
    }

    const elements = document.querySelectorAll(
      'a, button, [role=button], [role=treeitem]',
    );

    elements.forEach((element, index) => {
      const position = element.getBoundingClientRect();

      if (
        position.width > 5 &&
        position.height > 5 &&
        isElementVisible(element)
      ) {
        (element as HTMLElement).style.setProperty(
          'border',
          '1px solid #FF0000',
          'important',
        );
        // @ts-expect-error FIXME
        const linkText = element.textContent.replace(/[^\p{L}\p{N} ]/gu, '');
        const ariaLabel = element.getAttribute('aria-label');
        const label = ariaLabel ?? linkText;
        element.setAttribute(attribute, ariaLabel ?? linkText);
        renderLabel(element, index.toString());
      }
    });
  }, LINK_ATTRIBUTE);
}

async function annotateSelects(page: Page) {
  const options = await page.evaluate((attribute) => {
    // Clear previous attributes
    document.querySelectorAll(`[${attribute}]`).forEach((e) => {
      e.removeAttribute(attribute);
    });

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

    // Render an element in the top left corner of the element
    function renderLabel(element: Element, label: string) {
      const labelElement = document.createElement('div');
      labelElement.innerText = label;
      labelElement.style.position = 'absolute';
      labelElement.style.backgroundColor = '#FF0000';
      labelElement.style.color = 'black';
      labelElement.style.fontSize = '11px';
      labelElement.style.padding = '0px';
      labelElement.style.paddingLeft = '4px';
      labelElement.style.paddingRight = '4px';
      labelElement.style.zIndex = '999999999999999999999';
      labelElement.style.border = '1px solid black';
      labelElement.style.fontFamily = 'monospace';
      labelElement.style.lineHeight = '1';
      labelElement.setAttribute('browser-agent-label', 'true');

      // Position the label near the top-left corner of the element
      const rect = element.getBoundingClientRect();
      labelElement.style.top = `${rect.top + window.scrollY - 11}px`;
      labelElement.style.left = `${rect.left + window.scrollX}px`;

      document.body.appendChild(labelElement);
    }

    const elements = document.querySelectorAll('select');
    const selectOptions: Array<{ id: string; options: string[] }> = [];

    elements.forEach((element, index) => {
      const position = element.getBoundingClientRect();

      if (
        position.width > 5 &&
        position.height > 5 &&
        isElementVisible(element)
      ) {
        const selectText = element.options[element.selectedIndex]?.text ?? '';
        const ariaLabel = element.getAttribute('aria-label');
        element.style.border = '1px solid #007BFF !important';
        const label = ariaLabel ?? selectText;
        element.setAttribute(attribute, label);

        // Get all possible values of the select
        const options = Array.from(element.options).map(
          (option) => option.text,
        );
        selectOptions.push({ id: selectText, options });
        renderLabel(element, index.toString());
      }
    });
    return selectOptions;
  }, SELECT_ATTRIBUTE);

  return options;
}

async function annotateTextInputs(page: Page) {
  await page.evaluate((attribute) => {
    // Clear previous attributes
    document.querySelectorAll(`[${attribute}]`).forEach((e) => {
      e.removeAttribute(attribute);
    });

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

    // Render an element in the top left corner of the element
    function renderLabel(element: Element, label: string) {
      const labelElement = document.createElement('div');
      labelElement.innerText = label;
      labelElement.style.position = 'absolute';
      labelElement.style.backgroundColor = '#FFFF00';
      labelElement.style.color = 'black';
      labelElement.style.fontSize = '11px';
      labelElement.style.padding = '0px';
      labelElement.style.paddingLeft = '4px';
      labelElement.style.paddingRight = '4px';
      labelElement.style.zIndex = '999999999999999999999';
      labelElement.style.border = '1px solid black';
      labelElement.style.fontFamily = 'monospace';
      labelElement.style.lineHeight = '1';
      labelElement.setAttribute('browser-agent-label', 'true');

      // Position the label near the top-left corner of the element
      const rect = element.getBoundingClientRect();
      labelElement.style.top = `${rect.top + window.scrollY - 11}px`;
      labelElement.style.left = `${rect.left + window.scrollX}px`;

      document.body.appendChild(labelElement);
    }

    const elements = document.querySelectorAll('input[type=text], textarea');

    elements.forEach((element, index) => {
      const position = element.getBoundingClientRect();

      if (
        position.width > 5 &&
        position.height > 5 &&
        isElementVisible(element)
      ) {
        const inputText =
          (element as HTMLInputElement).placeholder ??
          (element as HTMLInputElement).value;
        const ariaLabel = element.getAttribute('aria-label');
        // TODO: Find the closest form label
        (element as HTMLElement).style.setProperty(
          'border',
          '1px solid yellow',
          'important',
        );
        const label = ariaLabel ?? inputText;
        element.setAttribute(attribute, label);
        // Render the label in the top left corner
        renderLabel(element, index.toString());
      }
    });
  }, INPUT_TEXT_ATTRIBUTE);
}

async function annotateScrollableAreas(page: Page) {
  await page.evaluate((scrollableAreaAttribute) => {
    // Clear previous attributes
    document.querySelectorAll(`[${scrollableAreaAttribute}]`).forEach((e) => {
      e.removeAttribute(scrollableAreaAttribute);
    });

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

    // Render an element in the top left corner of the element
    function renderLabel(element: Element, label: string) {
      const labelElement = document.createElement('div');
      labelElement.innerText = label;
      labelElement.style.position = 'absolute';
      labelElement.style.backgroundColor = '#39FF14';
      labelElement.style.color = 'black';
      labelElement.style.fontSize = '11px';
      labelElement.style.padding = '0px';
      labelElement.style.paddingLeft = '4px';
      labelElement.style.paddingRight = '4px';
      labelElement.style.zIndex = '999999999999999999999';
      labelElement.style.border = '1px solid black';
      labelElement.style.fontFamily = 'monospace';
      labelElement.style.lineHeight = '1';
      labelElement.setAttribute('browser-agent-label', 'true');

      // Position the label near the top-left corner of the element
      const rect = element.getBoundingClientRect();
      labelElement.style.top = `${rect.top + window.scrollY - 11}px`;
      labelElement.style.left = `${rect.left + window.scrollX}px`;

      document.body.appendChild(labelElement);
    }

    const elements = document.querySelectorAll('*');

    elements.forEach((element, index) => {
      const computedStyle = window.getComputedStyle(element);
      const overflowY = computedStyle.overflowY;
      const overflowX = computedStyle.overflowX;
      const isScrollableY =
        (overflowY === 'scroll' || overflowY === 'auto') &&
        element.scrollHeight - element.clientHeight > 1;
      const isScrollableX =
        (overflowX === 'scroll' || overflowX === 'auto') &&
        element.scrollWidth - element.clientWidth > 1;

      if ((isScrollableY || isScrollableX) && isElementVisible(element)) {
        (element as HTMLElement).style.setProperty(
          'border',
          '1px solid #39FF14',
          'important',
        );
        const areaLabel = index.toString();
        element.setAttribute(scrollableAreaAttribute, areaLabel);

        renderLabel(element, areaLabel);
      }
    });
  }, SCROLLABLE_AREA_ATTRIBUTE);
}

// Removes existing labels from the page
async function clearLabels(page: Page) {
  await page.evaluate((attribute) => {
    document.querySelectorAll(`[${attribute}]`).forEach((e) => {
      e.remove();
    });
  }, LABEL_ATTRIBUTE);
}

export async function annotateAndTakeScreenshot(page: Page) {
  await clearLabels(page);

  await annotateLinks(page);
  await annotateTextInputs(page);
  const selectOptions = await annotateSelects(page);
  await annotateScrollableAreas(page);

  const screenshot = await page.screenshot({
    path: 'screenshot.jpg',
    fullPage: true,
  });

  return { screenshot: Buffer.from(screenshot), selectOptions };
}
