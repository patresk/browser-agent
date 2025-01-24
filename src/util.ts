import { Page } from 'puppeteer';
import fs from 'fs';
import readline from 'readline';

export class InvalidJsonResponseError extends Error {
  constructor(message = 'Invalid JSON response') {
    super(message);
    this.name = 'InvalidJsonResponseError';
  }
}

export function parseJsonResponse(jsonResponse: string): Record<string, any> {
  if (!jsonResponse) {
    throw new InvalidJsonResponseError('Empty JSON response');
  }

  const jsonMatch = jsonResponse.match(/{.*}/);
  if (!jsonMatch) {
    throw new InvalidJsonResponseError('No JSON object found in response');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new InvalidJsonResponseError(
      `Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }
}

export function sleep(milliseconds: number): Promise<void> {
  if (milliseconds < 0) {
    throw new Error('Sleep duration must be non-negative');
  }
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForEvent(page: Page, event: string): Promise<void> {
  if (!page) {
    throw new Error('Page object is required');
  }
  if (!event) {
    throw new Error('Event name is required');
  }

  return page.evaluate((eventName) => {
    return new Promise<void>((resolve) => {
      document.addEventListener(eventName, () => resolve());
    });
  }, event);
}

export async function imageToBase64(imagePath: string): Promise<string> {
  if (!imagePath) {
    throw new Error('Image path is required');
  }

  return new Promise((resolve, reject) => {
    fs.readFile(imagePath, (err, data) => {
      if (err) {
        console.error('Error reading image file:', err);
        reject(new Error(`Failed to read image file: ${err.message}`));
        return;
      }

      const base64Data = data.toString('base64');
      const mimeType = imagePath.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
      resolve(`data:${mimeType};base64,${base64Data}`);
    });
  });
}

export async function formatBase64(base64: string): Promise<string> {
  return `data:image/jpeg;base64,${base64}`;
}

export async function getCLIInput(prompt: string): Promise<string> {
  if (typeof prompt !== 'string') {
    throw new Error('Prompt must be a string');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
        rl.close();
      });
    });
  } finally {
    rl.close();
  }
}
