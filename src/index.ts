import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai';
import readline from 'readline';
import fs from 'fs';
import { Page, TimeoutError } from 'puppeteer';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  annotateAndTakeScreenshot,
  INPUT_FIELD_ATTRIBUTE,
  LINK_ATTRIBUTE,
  SCROLLABLE_AREA_ATTRIBUTE,
} from './annotation';

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

class InvalidJsonResponseError extends Error {}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    // executablePath: '',
    // userDataDir: '',
  });

  // This can change if a link that is opened opens a new tab - we automatically focus into that tab.
  let currentPage = await browser.newPage();

  await currentPage.setViewport({
    width: 1200,
    height: 800,
    deviceScaleFactor: 1,
  });

  const messages: Array<ChatCompletionMessageParam> = [
    {
      role: 'system',
      content: `You are a website crawler that tests websites and web apps. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on.
            
            The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.
            The text fields are highlighted in yellow in the screenshot.
            Scrollable areas are highlighted in green in the screenshot, with the identifier in the top left corner of the area. Reference that identifier when scrolling the area.

            You can go to a specific URL by answering with the following JSON format:
            {"url": "url goes here"}

            You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
            {"click": "Text in link"}

            You can type into text fields by returning text to type and specifying by answering with the following JSON format:
            {"type": "Text in the input", "value": "Text to type"}

            You can scroll a specific area by answering in the following JSON format:
            {"scroll": "identifier of the scrollable area", "value": "amount of pixels to scroll"}

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

  let screenshotTaken = false;

  async function handleClickAction(chatGPTResponse: string) {
    const jsonObject = parseJsonResponse(chatGPTResponse);
    const link = jsonObject.click;

    console.log('Clicking on ' + link);

    const elements = await currentPage.$$(`[${LINK_ATTRIBUTE}]`);

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
      const pageTarget = currentPage.target();
      await elementToClick.click();

      // Clicking on a link might have opened a new page.
      // We have to check whether that's the case by waiting for target for a little bit
      console.log('Waiting for target');

      try {
        const newTarget = await browser.waitForTarget(
          (target) => target.opener() === pageTarget,
          {
            // Let's wait 2 seconds after we assume no new page was opened
            // This is also fine for any dropdowns / animations to appear that might be caused by the click
            timeout: 2_000,
          },
        );
        // Cet the new page object:
        const newPage = await newTarget.page();
        if (newPage) {
          currentPage = newPage;
        }
      } catch (err) {
        // If the waitForTarget timed out, it means no new page was opened
        if (err instanceof TimeoutError) {
          //
        } else {
          throw err;
        }
      }

      // Additional checks can be done here, like validating the response or URL
      await Promise.race([waitForEvent(currentPage, 'load'), sleep(timeout)]);

      await annotateAndTakeScreenshot(currentPage);
      screenshotTaken = true;
    } else {
      throw new Error("Can't find link");
    }
  }

  async function handleUrlAction(chatGPTResponse: string) {
    const jsonObject = parseJsonResponse(chatGPTResponse);
    const url = jsonObject.url;

    console.log('Crawling ' + url);

    await currentPage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeout,
    });

    await Promise.race([waitForEvent(currentPage, 'load'), sleep(timeout)]);

    await annotateAndTakeScreenshot(currentPage);
    screenshotTaken = true;
  }

  function parseJsonResponse(jsonResponse: string) {
    const jsonMatch = jsonResponse.match(/{.*}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        throw new InvalidJsonResponseError();
      }
    } else {
      throw new InvalidJsonResponseError();
    }
  }

  async function handleTypeAction(chatGPTResponse: string) {
    const jsonObject = parseJsonResponse(chatGPTResponse);
    const input = jsonObject.type;
    const value = jsonObject.value;

    console.log(`Typing ${value} into ${input}...`);

    const elements = await currentPage.$$(`[${INPUT_FIELD_ATTRIBUTE}]`);
    let partial;
    let exact;

    for (const element of elements) {
      const attributeValue = await element.evaluate(
        (el, attribute) => el.getAttribute(attribute),
        INPUT_FIELD_ATTRIBUTE,
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
      await annotateAndTakeScreenshot(currentPage);
      screenshotTaken = true;
    } else {
      throw new Error("Can't find input field");
    }
  }

  async function handleScrollAction(chatGPTResponse: string) {
    const jsonObject = parseJsonResponse(chatGPTResponse);
    const scrollableArea = jsonObject.scroll;
    const value = jsonObject.value; // NOTE: we could fallback to one height of the scrollable area here

    console.log(`Scrolling ${value} px of ${scrollableArea}...`);

    const elements = await currentPage.$$(`[${SCROLLABLE_AREA_ATTRIBUTE}]`);
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

      await annotateAndTakeScreenshot(currentPage);
      screenshotTaken = true;
    } else {
      throw new Error("Can't find provided scroll area");
    }
  }

  while (true) {
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

    console.log('Response:', response);

    const message = response.choices[0].message;
    const chatGPTResponse = message.content;

    messages.push({
      role: 'assistant',
      content: chatGPTResponse,
    });

    console.log('GPT: ' + chatGPTResponse);

    // Handle actions from the LLM
    if (
      chatGPTResponse?.indexOf('{"click": "') !== -1 ||
      chatGPTResponse?.indexOf('{"click":"') !== -1
    ) {
      try {
        await handleClickAction(chatGPTResponse as string);
      } catch (error) {
        console.log('Error clicking the element:', error);

        if (error instanceof InvalidJsonResponseError) {
          messages.push({
            role: 'user',
            content:
              'The json you provided was invalid. Please provide a valid JSON response.',
          });
        } else {
          messages.push({
            role: 'user',
            content: 'Error: I was unable to click on that element.',
          });
        }
      }
    } else if (
      chatGPTResponse.indexOf('{"url": "') !== -1 ||
      chatGPTResponse.indexOf('{"url":"') !== -1
    ) {
      await handleUrlAction(chatGPTResponse as string);
    } else if (chatGPTResponse.indexOf('{"type": "') !== -1) {
      try {
        await handleTypeAction(chatGPTResponse as string);
      } catch (error) {
        console.log('Error typing into the input:', error);

        if (error instanceof InvalidJsonResponseError) {
          messages.push({
            role: 'user',
            content:
              'The json you provided was invalid. Please provide a valid JSON response.',
          });
        } else {
          messages.push({
            role: 'user',
            content:
              'Error: I was unable to typo into that input field. Because it does not exist. Please provide a different input field.',
          });
        }
      }
    } else if (chatGPTResponse.indexOf('{"scroll": "') !== -1) {
      try {
        await handleScrollAction(chatGPTResponse as string);
      } catch (error) {
        console.log('Error scrolling an area:', error);

        if (error instanceof InvalidJsonResponseError) {
          messages.push({
            role: 'user',
            content:
              'The json you provided was invalid. Please provide a valid JSON response.',
          });
        } else {
          messages.push({
            role: 'user',
            content:
              'Error: I was unable to scroll that area because it does not exist. Please provide a different scroll area.',
          });
        }
      }
    }

    const prompt = (await input('You: ')) as unknown as string;

    messages.push({
      role: 'user',
      content: prompt,
    });
  }
})();
