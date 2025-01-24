import { createBrowserAgent } from '../BrowserAgent';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { sleep } from '../util';

(async () => {
  // NOTE: Testing pages for dev
  // const website = 'https://mobile.de';
  // const website = 'https://finance.yahoo.com/';
  const website = 'https://sme.sk';

  const browserAgent = await createBrowserAgent();
  const page = await browserAgent.getCurrentPage();

  await page.goto(website);

  // Close the cookie banner in the browser manually
  await sleep(5_000);

  const { screenshot, selectOptions } =
    await browserAgent.annotateAndTakeScreenshot();

  const screenshotPath = join(__dirname, 'dev-screenshot.png');
  writeFileSync(screenshotPath, screenshot, 'base64');

  console.log(`Screenshot saved to ${screenshotPath}`);
  console.log('Select options:', selectOptions);
})();
