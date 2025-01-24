import { Page } from 'puppeteer';

export const LINK_ATTRIBUTE = 'browser-agent-link-text';
export const SELECT_ATTRIBUTE = 'browser-agent-select-fields';
export const INPUT_TEXT_ATTRIBUTE = 'browser-agent-input-fields';
export const SCROLLABLE_AREA_ATTRIBUTE = 'browser-agent-scrollable-area';
export const LABEL_ATTRIBUTE = 'browser-agent-label';

interface SelectOption {
  id: string;
  options: string[];
}

interface AnnotationResult {
  screenshot: string;
  selectOptions: SelectOption[] | null;
}

interface ElementStyle {
  position: 'absolute';
  backgroundColor: string;
  color: string;
  fontSize: string;
  padding: string;
  paddingLeft: string;
  paddingRight: string;
  zIndex: string;
  border: string;
  fontFamily: string;
  lineHeight: string;
  top: string;
  left: string;
}

async function annotateLinks(page: Page): Promise<void> {
  await page.evaluate(
    (attribute, labelAttribute) => {
      const createLabelStyle = (
        rect: DOMRect,
        scrollY: number,
        scrollX: number,
      ): ElementStyle => ({
        position: 'absolute',
        backgroundColor: '#FF0000',
        color: 'black',
        fontSize: '11px',
        padding: '0px',
        paddingLeft: '2px',
        paddingRight: '2px',
        zIndex: '999999999999999999999',
        border: '1px solid black',
        fontFamily: 'monospace',
        lineHeight: '1',
        top: `${rect.top + scrollY - 11}px`,
        left: `${rect.left + scrollX}px`,
      });

      function isStyleVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        return (
          style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      function isElementInViewport(el: Element): boolean {
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

      function isElementVisible(el: Element | null): boolean {
        if (!el) return false;

        if (!isStyleVisible(el)) {
          return false;
        }

        let parent = el.parentElement;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          parent = parent.parentElement;
        }

        return isElementInViewport(el);
      }

      function renderLabel(element: Element, label: string): void {
        const labelElement = document.createElement('div');
        labelElement.innerText = label;

        const rect = element.getBoundingClientRect();
        const style = createLabelStyle(rect, window.scrollY, window.scrollX);
        Object.assign(labelElement.style, style);

        labelElement.setAttribute(labelAttribute, 'true');
        document.body.appendChild(labelElement);
      }

      // Clear previous attributes
      document.querySelectorAll(`[${attribute}]`).forEach((e) => {
        e.removeAttribute(attribute);
      });

      const elements = document.querySelectorAll<HTMLElement>(
        'a, button, [role=button], [role=treeitem]',
      );

      elements.forEach((element, index) => {
        const position = element.getBoundingClientRect();

        if (
          position.width > 5 &&
          position.height > 5 &&
          isElementVisible(element)
        ) {
          element.style.setProperty('border', '1px solid #FF0000', 'important');

          const linkText =
            element.textContent?.replace(/[^\p{L}\p{N} ]/gu, '') || '';
          const ariaLabel = element.getAttribute('aria-label');
          const label = ariaLabel ?? linkText;

          element.setAttribute(attribute, label);
          renderLabel(element, index.toString());
        }
      });
    },
    LINK_ATTRIBUTE,
    LABEL_ATTRIBUTE,
  );
}

async function annotateSelects(page: Page): Promise<SelectOption[]> {
  return page.evaluate(
    (attribute, labelAttribute) => {
      const createLabelStyle = (
        rect: DOMRect,
        scrollY: number,
        scrollX: number,
      ): ElementStyle => ({
        position: 'absolute',
        backgroundColor: '#FF0000',
        color: 'black',
        fontSize: '11px',
        padding: '0px',
        paddingLeft: '2px',
        paddingRight: '2px',
        zIndex: '999999999999999999999',
        border: '1px solid black',
        fontFamily: 'monospace',
        lineHeight: '1',
        top: `${rect.top + scrollY - 11}px`,
        left: `${rect.left + scrollX}px`,
      });

      function isStyleVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        return (
          style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      function isElementInViewport(el: Element): boolean {
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

      function isElementVisible(el: Element | null): boolean {
        if (!el) return false;

        if (!isStyleVisible(el)) {
          return false;
        }

        let parent = el.parentElement;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          parent = parent.parentElement;
        }

        return isElementInViewport(el);
      }

      function renderLabel(element: Element, label: string): void {
        const labelElement = document.createElement('div');
        labelElement.innerText = label;

        const rect = element.getBoundingClientRect();
        const style = createLabelStyle(rect, window.scrollY, window.scrollX);
        Object.assign(labelElement.style, style);

        labelElement.setAttribute(labelAttribute, 'true');
        document.body.appendChild(labelElement);
      }

      // Clear previous attributes
      document.querySelectorAll(`[${attribute}]`).forEach((e) => {
        e.removeAttribute(attribute);
      });

      const elements = document.querySelectorAll<HTMLSelectElement>('select');
      const selectOptions: SelectOption[] = [];

      elements.forEach((element, index) => {
        const position = element.getBoundingClientRect();

        if (
          position.width > 5 &&
          position.height > 5 &&
          isElementVisible(element)
        ) {
          element.style.setProperty('border', '1px solid #007BFF', 'important');
          element.style.setProperty(
            'background-color',
            '#007BFF22',
            'important',
          );

          const options = Array.from(element.options).map(
            (option) => option.value,
          );
          const id = `s-${index}`;

          element.setAttribute(attribute, id);
          selectOptions.push({ id, options });
          renderLabel(element, id);
        }
      });

      return selectOptions;
    },
    SELECT_ATTRIBUTE,
    LABEL_ATTRIBUTE,
  );
}

async function annotateTextInputs(page: Page): Promise<void> {
  await page.evaluate(
    (attribute, labelAttribute) => {
      const createLabelStyle = (
        rect: DOMRect,
        scrollY: number,
        scrollX: number,
      ): ElementStyle => ({
        position: 'absolute',
        backgroundColor: '#FF0000',
        color: 'black',
        fontSize: '11px',
        padding: '0px',
        paddingLeft: '2px',
        paddingRight: '2px',
        zIndex: '999999999999999999999',
        border: '1px solid black',
        fontFamily: 'monospace',
        lineHeight: '1',
        top: `${rect.top + scrollY - 11}px`,
        left: `${rect.left + scrollX}px`,
      });

      function isStyleVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        return (
          style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      function isElementInViewport(el: Element): boolean {
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

      function isElementVisible(el: Element | null): boolean {
        if (!el) return false;

        if (!isStyleVisible(el)) {
          return false;
        }

        let parent = el.parentElement;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          parent = parent.parentElement;
        }

        return isElementInViewport(el);
      }

      function renderLabel(element: Element, label: string): void {
        const labelElement = document.createElement('div');
        labelElement.innerText = label;

        const rect = element.getBoundingClientRect();
        const style = createLabelStyle(rect, window.scrollY, window.scrollX);
        Object.assign(labelElement.style, style);

        labelElement.setAttribute(labelAttribute, 'true');
        document.body.appendChild(labelElement);
      }

      // Clear previous attributes
      document.querySelectorAll(`[${attribute}]`).forEach((e) => {
        e.removeAttribute(attribute);
      });

      const elements = document.querySelectorAll<HTMLElement>(
        'input[type=text], input[type=search], input[type=number], input[type=email], input[type=tel], input[type=url], input[type=password], textarea',
      );

      elements.forEach((element, index) => {
        const position = element.getBoundingClientRect();

        if (
          position.width > 5 &&
          position.height > 5 &&
          isElementVisible(element)
        ) {
          element.style.setProperty('border', '1px solid #FFD700', 'important');
          element.style.setProperty(
            'background-color',
            '#FFD70022',
            'important',
          );

          const id = `i-${index}`;
          element.setAttribute(attribute, id);
          renderLabel(element, id);
        }
      });
    },
    INPUT_TEXT_ATTRIBUTE,
    LABEL_ATTRIBUTE,
  );
}

async function annotateScrollableAreas(page: Page): Promise<void> {
  await page.evaluate(
    (attribute, labelAttribute) => {
      const createLabelStyle = (
        rect: DOMRect,
        scrollY: number,
        scrollX: number,
      ): ElementStyle => ({
        position: 'absolute',
        backgroundColor: '#FF0000',
        color: 'black',
        fontSize: '11px',
        padding: '0px',
        paddingLeft: '2px',
        paddingRight: '2px',
        zIndex: '999999999999999999999',
        border: '1px solid black',
        fontFamily: 'monospace',
        lineHeight: '1',
        top: `${rect.top + scrollY - 11}px`,
        left: `${rect.left + scrollX}px`,
      });

      function isStyleVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        return (
          style.width !== '0' &&
          style.height !== '0' &&
          style.opacity !== '0' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }

      function isElementInViewport(el: Element): boolean {
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

      function isElementVisible(el: Element | null): boolean {
        if (!el) return false;

        if (!isStyleVisible(el)) {
          return false;
        }

        let parent = el.parentElement;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          parent = parent.parentElement;
        }

        return isElementInViewport(el);
      }

      function renderLabel(element: Element, label: string): void {
        const labelElement = document.createElement('div');
        labelElement.innerText = label;

        const rect = element.getBoundingClientRect();
        const style = createLabelStyle(rect, window.scrollY, window.scrollX);
        Object.assign(labelElement.style, style);

        labelElement.setAttribute(labelAttribute, 'true');
        document.body.appendChild(labelElement);
      }

      function isScrollable(element: HTMLElement): boolean {
        const style = window.getComputedStyle(element);
        const hasScroll =
          style.overflow === 'auto' ||
          style.overflow === 'scroll' ||
          style.overflowY === 'auto' ||
          style.overflowY === 'scroll';
        return hasScroll && element.scrollHeight > element.clientHeight;
      }

      // Clear previous attributes
      document.querySelectorAll(`[${attribute}]`).forEach((e) => {
        e.removeAttribute(attribute);
      });

      const elements = document.querySelectorAll<HTMLElement>('*');

      elements.forEach((element, index) => {
        if (isScrollable(element) && isElementVisible(element)) {
          element.style.setProperty('border', '1px solid #00FF00', 'important');
          element.style.setProperty(
            'background-color',
            '#00FF0022',
            'important',
          );

          const id = `sa-${index}`;
          element.setAttribute(attribute, id);
          renderLabel(element, id);
        }
      });
    },
    SCROLLABLE_AREA_ATTRIBUTE,
    LABEL_ATTRIBUTE,
  );
}

async function clearLabels(page: Page): Promise<void> {
  await page.evaluate((attribute) => {
    document.querySelectorAll(`[${attribute}]`).forEach((e) => e.remove());
  }, LABEL_ATTRIBUTE);
}

export async function annotateAndTakeScreenshot(
  page: Page,
): Promise<AnnotationResult> {
  await clearLabels(page);
  await annotateLinks(page);
  const selectOptions = await annotateSelects(page);
  await annotateTextInputs(page);
  await annotateScrollableAreas(page);

  const screenshot = await page.screenshot({ encoding: 'base64' });
  return {
    screenshot,
    selectOptions: selectOptions.length > 0 ? selectOptions : null,
  };
}
