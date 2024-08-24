import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai';
import readline from 'readline';
import fs from 'fs';
import { Page } from 'puppeteer';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { annotateAndTakeScreenshot } from './annotation';

require('dotenv/config');

puppeteer.use(StealthPlugin());

const openai = new OpenAI();

const timeout = 5000;

async function imageToBase64(image_file: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    fs.readFile(image_file, (err, data) => {
      if (err) {
        console.error('Error reading the file:', err);
        reject();
        return;
      }

      const base64Data = data.toString('base64');
      const dataURI = `data:image/jpeg;base64,${base64Data}`;
      resolve(dataURI);
    });
  });
}

async function input(text: string) {
  let the_prompt;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await (async () => {
    return new Promise((resolve) => {
      rl.question(text, (prompt) => {
        the_prompt = prompt;
        rl.close();
        resolve(undefined);
      });
    });
  })();

  return the_prompt;
}

async function sleep(milliseconds: number) {
  return await new Promise((r, _) => {
    setTimeout(() => {
      r(undefined);
    }, milliseconds);
  });
}

// @ts-expect-error FIXME
async function waitForEvent(page: Page, event) {
  return page.evaluate((event) => {
    return new Promise((r, _) => {
      document.addEventListener(event, function (e) {
        r(undefined);
      });
    });
  }, event);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    // executablePath: '',
    // userDataDir: '',
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1200,
    height: 1200,
    deviceScaleFactor: 1,
  });

  const messages: Array<ChatCompletionMessageParam> = [
    {
      role: 'system',
      content: `You are a website crawler that tests websites and web apps. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on.
            
            The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.
            The text fields are highlighted in yellow in the screenshot. 

            You can go to a specific URL by answering with the following JSON format:
            {"url": "url goes here"}

            You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
            {"click": "Text in link"}

            You can type into text fields by returning text to type and specifying by answering with the following JSON format:
            {"type": "Text in the input", "value": "Text to type"}

            Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

            If the user provides a direct URL, go to that one. Do not make up links`,
    },
  ];

  console.log('GPT: How can I assist you today?');
  const prompt = await input('You: ');
  console.log('Prompt:', prompt);

  messages.push({
    role: 'user',
    content: prompt as unknown as string,
  });

  let url;
  let screenshotTaken = false;

  while (true) {
    if (url) {
      console.log('Crawling ' + url);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeout,
      });

      await Promise.race([waitForEvent(page, 'load'), sleep(timeout)]);

      await annotateAndTakeScreenshot(page);

      screenshotTaken = true;
      url = null;
    }

    if (screenshotTaken) {
      const base64_image = await imageToBase64('screenshot.jpg');

      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url' as const,
            image_url: {
              url: base64_image,
            },
          },
          {
            type: 'text' as const,
            text: 'Here\'s the screenshot of the website you are on right now. You can click on links with {"click": "Link text"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user\'s question, you can respond normally.',
          },
        ],
      });

      screenshotTaken = false;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: messages,
    });

    console.log('response', response);

    const message = response.choices[0].message;
    const chatGPTResponse = message.content;

    messages.push({
      role: 'assistant',
      content: chatGPTResponse,
    });

    console.log('GPT: ' + chatGPTResponse);

    if (chatGPTResponse?.indexOf('{"click": "') !== -1) {
      // @ts-expect-error FIXME
      let parts = chatGPTResponse.split('{"click": "');
      parts = parts[1].split('"}');
      const link_text = parts[0].replace(/[^a-zA-Z0-9 ]/g, '');

      console.log('Clicking on ' + link_text);

      try {
        const elements = await page.$$('[gpt-link-text]');

        let partial;
        let exact;

        for (const element of elements) {
          const attributeValue = await element.evaluate((el) =>
            el.getAttribute('gpt-link-text'),
          );

          if (attributeValue?.includes(link_text)) {
            partial = element;
          }

          if (attributeValue === link_text) {
            exact = element;
          }
        }

        if (exact || partial) {
          // TODO: handle case when the link does not navigate to a new page
          const [response] = await Promise.all([
            page
              .waitForNavigation({ waitUntil: 'domcontentloaded' })
              .catch((e) =>
                console.log('Navigation timeout/error:', e.message),
              ),
            // @ts-expect-error FIXME
            (exact || partial).click(),
          ]);

          // Additional checks can be done here, like validating the response or URL
          await Promise.race([waitForEvent(page, 'load'), sleep(timeout)]);

          await annotateAndTakeScreenshot(page);

          screenshotTaken = true;
        } else {
          throw new Error("Can't find link");
        }
      } catch (error) {
        console.log('ERROR: Clicking failed', error);

        messages.push({
          role: 'user',
          content: 'ERROR: I was unable to click that element',
        });
      }

      continue;
    } else if (chatGPTResponse.indexOf('{"url": "') !== -1) {
      let parts = chatGPTResponse.split('{"url": "');
      parts = parts[1].split('"}');
      url = parts[0];

      continue;
    } else if (chatGPTResponse.indexOf('{"type": "') !== -1) {
      const jsonMatch = chatGPTResponse.match(/{.*}/);
      if (jsonMatch) {
        const jsonObject = JSON.parse(jsonMatch[0]);
        const input = jsonObject.type;
        const value = jsonObject.value;
        console.log(`Typing ${value} into ${input}...`);

        const elements = await page.$$('[gpt-input-fields]');
        let partial;
        let exact;

        for (const element of elements) {
          const attributeValue = await element.evaluate((el) =>
            el.getAttribute('gpt-input-fields'),
          );

          if (attributeValue?.includes(input)) {
            partial = element;
          }

          if (attributeValue === input) {
            exact = element;
          }
        }

        if (exact || partial) {
          (exact || partial)?.type(value);

          await annotateAndTakeScreenshot(page);

          screenshotTaken = true;
        } else {
          throw new Error("Can't find input field");
        }
      } else {
        throw new Error('Unable to parse JSON type response from LLM');
      }
    }

    const prompt = (await input('You: ')) as unknown as string;

    messages.push({
      role: 'user',
      content: prompt,
    });
  }
})();
