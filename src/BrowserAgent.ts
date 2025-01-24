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

const DEFAULT_OPTIONS = {
  timeout: 5000,
  viewport: {
    width: 1440, // 13" Mac screen
    height: 800,
    deviceScaleFactor: 1,
  },
};

puppeteer.use(StealthPlugin());

interface BrowserAgentOptions {
  headless?: boolean;
  executablePath?: string;
  userDataDir?: string;
  timeout?: number;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
}

interface ActionResult {
  screenshot: string;
  selectOptions: Array<{ id: string; options: string[] }> | null;
}

export async function createBrowserAgent(
  options: BrowserAgentOptions = {},
): Promise<BrowserAgent> {
  const browser = await puppeteer.launch({
    headless: options.headless ?? false,
    executablePath: options.executablePath,
    userDataDir: options.userDataDir,
  });

  const page = await browser.newPage();
  await page.setViewport(options.viewport ?? DEFAULT_OPTIONS.viewport);

  return new BrowserAgent(
    browser,
    page,
    options.timeout ?? DEFAULT_OPTIONS.timeout,
  );
}

export class BrowserAgent {
  private readonly browser: Browser;
  private currentPage: Page;
  private readonly logs: string[] = [];
  private readonly timeout: number;

  constructor(browser: Browser, currentPage: Page, timeout: number) {
    this.browser = browser;
    this.currentPage = currentPage;
    this.timeout = timeout;
  }

  public async getLogs(): Promise<string[]> {
    return [...this.logs];
  }

  public async getCurrentPage(): Promise<Page> {
    return this.currentPage;
  }

  private async findElementByAttribute(
    attribute: string,
    value: string,
  ): Promise<any | null> {
    const elements = await this.currentPage.$$(`[${attribute}]`);
    let partial = null;
    let exact = null;

    for (const element of elements) {
      const attributeValue = await element.evaluate(
        (el, attr) => el.getAttribute(attr),
        attribute,
      );

      if (attributeValue?.includes(value)) {
        partial = element;
      }

      if (attributeValue === value) {
        exact = element;
      }
    }

    return exact || partial;
  }

  private async handleNewPageOpening(pageTarget: any): Promise<void> {
    try {
      const newTarget = await this.browser.waitForTarget(
        (target) => target.opener() === pageTarget,
        { timeout: this.timeout },
      );

      const newPage = await newTarget.page();
      if (newPage && newPage !== this.currentPage) {
        await Promise.race([
          waitForEvent(newPage, 'load'),
          sleep(this.timeout),
        ]);
        this.currentPage = newPage;
      }
    } catch (err) {
      if (!(err instanceof TimeoutError)) {
        throw err;
      }
    }
  }

  public async annotateAndTakeScreenshot(): Promise<ActionResult> {
    const { screenshot, selectOptions } = await annotateAndTakeScreenshot(
      this.currentPage,
    );
    this.logs.push(screenshot);
    return { screenshot, selectOptions };
  }

  public async handleClickAction(action: {
    id: string;
  }): Promise<ActionResult> {
    const { id } = action;
    console.log('Handling click action:', id);

    const element = await this.findElementByAttribute(LINK_ATTRIBUTE, id);
    if (!element) {
      throw new Error(`Cannot find clickable element with text "${id}"`);
    }

    const pageTarget = this.currentPage.target();
    await element.click();
    await this.handleNewPageOpening(pageTarget);

    return this.annotateAndTakeScreenshot();
  }

  public async handleUrlAction(action: {
    value: string;
  }): Promise<ActionResult> {
    const { value: url } = action;
    console.log('Handling URL action:', url);

    try {
      await this.currentPage.goto(url, {
        waitUntil: 'networkidle0',
        timeout: this.timeout,
      });

      await sleep(1000); // Wait for any dynamic content
      await Promise.race([
        waitForEvent(this.currentPage, 'load'),
        sleep(this.timeout),
      ]);

      return this.annotateAndTakeScreenshot();
    } catch (error) {
      throw new Error(
        `Failed to navigate to URL "${url}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  public async handleTypeAction(action: {
    id: string;
    value: string;
  }): Promise<ActionResult> {
    const { id, value } = action;
    console.log('Handling type action:', { id, value });

    const element = await this.findElementByAttribute(INPUT_TEXT_ATTRIBUTE, id);
    if (!element) {
      throw new Error(`Cannot find input element with identifier "${id}"`);
    }

    await element.type(value);
    return this.annotateAndTakeScreenshot();
  }

  public async handleSelectAction(action: {
    id: string;
    value: string;
  }): Promise<ActionResult> {
    const { id, value } = action;
    console.log('Handling select action:', { id, value });

    const element = await this.findElementByAttribute(SELECT_ATTRIBUTE, id);
    if (!element) {
      throw new Error(`Cannot find select element with identifier "${id}"`);
    }

    await element.select(value);
    return this.annotateAndTakeScreenshot();
  }

  public async handleScrollAction(action: {
    id: string;
    value: string;
  }): Promise<ActionResult> {
    const { id, value } = action;
    console.log('Handling scroll action:', { id, value: `${value}px` });

    const element = await this.findElementByAttribute(
      SCROLLABLE_AREA_ATTRIBUTE,
      id,
    );
    if (!element) {
      throw new Error(`Cannot find scrollable area with identifier "${id}"`);
    }

    const scrollAmount = parseInt(value, 10);
    if (isNaN(scrollAmount)) {
      throw new Error('Invalid scroll value: must be a number');
    }

    await element.evaluate(
      (el: Element, amount: number) => el.scrollBy(0, amount),
      scrollAmount,
    );

    return this.annotateAndTakeScreenshot();
  }

  public async close(): Promise<void> {
    await this.browser.close();
  }
}
