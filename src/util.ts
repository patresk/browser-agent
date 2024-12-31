import { Page } from 'puppeteer';
import fs from 'fs';

import readline from 'readline';

export class InvalidJsonResponseError extends Error {}

export function parseJsonResponse(jsonResponse: string) {
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

export async function sleep(milliseconds: number) {
  return await new Promise((r, _) => {
    setTimeout(() => {
      r(undefined);
    }, milliseconds);
  });
}

export async function waitForEvent(page: Page, event: any) {
  return page.evaluate((event) => {
    return new Promise((r, _) => {
      document.addEventListener(event, function (e) {
        r(undefined);
      });
    });
  }, event);
}

export async function imageToBase64(image_file: string): Promise<string> {
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

export async function bufferToBase64(buffer: Buffer): Promise<string> {
  const base64Data = buffer.toString('base64');
  const dataURI = `data:image/jpeg;base64,${base64Data}`;
  return dataURI;
}

export async function getCLIInput(text: string) {
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
