import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteer from 'puppeteer-extra';
import { Browser, Page, TimeoutError } from 'puppeteer';
import {
  annotateAndTakeScreenshot,
  INPUT_TEXT_ATTRIBUTE,
  LINK_ATTRIBUTE,
  SCROLLABLE_AREA_ATTRIBUTE,
  SELECT_ATTRIBUTE,
} from './annotation';
import { sleep, waitForEvent } from './util';

const TIMEOUT = 5000;

puppeteer.use(StealthPlugin());

export async function createBrowserAgent() {
  const browser = await puppeteer.launch({
    headless: false,
    // executablePath: '',
    // userDataDir: '',
  });

  // Note that a page can change if a link that opens a new tab - we focus into that tab.
  const page = await browser.newPage();

  await page.setViewport({
    // 13" Mac screen
    width: 1440,
    height: 800,
    deviceScaleFactor: 1,
  });

  return new BrowserAgent(browser, page);
}

export class BrowserAgent {
  browser: Browser;
  currentPage: Page;

  private logs: Array<Buffer> = [];

  constructor(browser: Browser, currentPage: Page) {
    this.browser = browser;
    this.currentPage = currentPage;
  }

  public async getLogs() {
    return this.logs;
  }

  public async getPage() {
    return this.currentPage;
  }

  public annotateAndTakeScreenshot = async () => {
    const { screenshot, selectOptions } = await annotateAndTakeScreenshot(
      this.currentPage,
    );
    this.logs.push(screenshot);
    return { screenshot, selectOptions };
  };

  public async handleClickAction(action: { id: string }) {
    const link = action.id;

    console.log('Handling click action: ' + link);

    const elements = await this.currentPage.$$(`[${LINK_ATTRIBUTE}]`);

    let partial;
    let exact;

    for (const element of elements) {
      const attributeValue = await element.evaluate(
        (el, attribute) => el.getAttribute(attribute),
        LINK_ATTRIBUTE,
      );

      if (attributeValue?.includes(link)) {
        partial = element;
      }

      if (attributeValue === link) {
        exact = element;
      }
    }

    const elementToClick = exact || partial;

    if (elementToClick) {
      // Save target of original page to know that this was the opener:
      const pageTarget = this.currentPage.target();
      await elementToClick.click();

      // Clicking on a link might have opened a new page.
      // We have to check whether that's the case by waiting for target for a little bit
      console.log('Waiting whether the link has opened a new page...');

      try {
        const newTarget = await this.browser.waitForTarget(
          (target) => target.opener() === pageTarget,
          {
            // Let's wait 2 seconds after we assume no new page was opened
            // This is also fine for any dropdowns / animations to appear that might be caused by the click
            timeout: 2_000,
          },
        );
        // Cet the new page object:
        const newPage = await newTarget.page();

        // If the page was changed, let's wait until it loads
        if (newPage && newPage !== this.currentPage) {
          // Additional checks could be done here, like validating the response or URL
          await Promise.race([waitForEvent(newPage, 'load'), sleep(TIMEOUT)]);
        }

        if (newPage) {
          this.currentPage = newPage;
        }
      } catch (err) {
        // If the waitForTarget timed out, it means no new page was opened
        if (err instanceof TimeoutError) {
          //
        } else {
          throw err;
        }
      }

      return this.annotateAndTakeScreenshot();
    } else {
      console.error(`Can't click link "${link}"`);
      const availableLinkElements = [];
      for (const element of elements) {
        const attributeValue = await element.evaluate(
          (el, attribute) => el.getAttribute(attribute),
          LINK_ATTRIBUTE,
        );
        availableLinkElements.push(attributeValue);
      }
      console.error('Available links in the page: ', availableLinkElements);
      throw new Error("This link can't be clicked");
    }
  }

  public async handleUrlAction(action: { value: string }) {
    const url = action.value;

    console.log('Handling URL action: ' + url);

    await this.currentPage.goto(url, {
      waitUntil: 'networkidle0',
      timeout: TIMEOUT,
    });

    // Mobile.de fix
    await sleep(1000);

    // Catch
    await Promise.race([
      waitForEvent(this.currentPage, 'load'),
      sleep(TIMEOUT),
    ]);

    return this.annotateAndTakeScreenshot();
  }

  public async handleScrollAction(action: { id: string; value: string }) {
    const scrollableArea = action.id;
    const value = action.value;

    console.log(
      `Handle scroll action: scrolling ${value} px of ${scrollableArea}...`,
    );

    const elements = await this.currentPage.$$(
      `[${SCROLLABLE_AREA_ATTRIBUTE}]`,
    );
    let foundArea;

    for (const element of elements) {
      const attributeValue = await element.evaluate(
        (el, attribute) => el.getAttribute(attribute),
        SCROLLABLE_AREA_ATTRIBUTE,
      );

      // Sometimes, LLM return the identifier without i- prefix
      if (attributeValue?.includes(scrollableArea)) {
        foundArea = element;
      }
    }

    if (foundArea) {
      // TODO: scrollLeft
      foundArea.evaluate(
        (el, scrollAmount) => {
          el.scrollBy(0, scrollAmount);
        },
        parseInt(value, 10),
      );

      return this.annotateAndTakeScreenshot();
    } else {
      throw new Error("Can't find provided scroll area");
    }
  }

  public async handleTypeAction(action: { id: string; value: string }) {
    const input = action.id;
    const value = action.value;

    console.log(
      `Handling type action: typing "${value}" into input "${input}"...`,
    );

    const elements = await this.currentPage.$$(`[${INPUT_TEXT_ATTRIBUTE}]`);
    let partial;
    let exact;

    for (const element of elements) {
      const attributeValue = await element.evaluate(
        (el, attribute) => el.getAttribute(attribute),
        INPUT_TEXT_ATTRIBUTE,
      );

      if (attributeValue?.includes(input)) {
        partial = element;
      }

      if (attributeValue === input) {
        exact = element;
      }
    }

    const element = exact || partial;
    if (element) {
      element.type(value);
      return this.annotateAndTakeScreenshot();
    } else {
      throw new Error("Can't find input field");
    }
  }

  public async handleSelectAction(action: { id: string; value: string }) {
    const select = action.id;
    const value = action.value;

    console.log(
      `Handling select action: selecting "${value}" in "${select}"...`,
    );

    const elements = await this.currentPage.$$(`[${SELECT_ATTRIBUTE}]`);
    let partial;
    let exact;

    for (const element of elements) {
      const attributeValue = await element.evaluate(
        (el, attribute) => el.getAttribute(attribute),
        INPUT_TEXT_ATTRIBUTE,
      );

      if (attributeValue?.includes(select)) {
        partial = element;
      }

      if (attributeValue === select) {
        exact = element;
      }
    }

    const element = exact || partial;
    if (element) {
      await element.select(value);
      return this.annotateAndTakeScreenshot();
    } else {
      throw new Error("Can't find select field");
    }
  }
}
