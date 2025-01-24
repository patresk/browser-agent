import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  formatBase64,
  getCLIInput,
  InvalidJsonResponseError,
  parseJsonResponse,
  sleep,
} from './util';
import { createBrowserAgent } from './BrowserAgent';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

require('dotenv/config');

interface ActionResult {
  screenshot: string;
  selectOptions: Array<{ id: string; options: string[] }> | null;
}

class BrowserAgentCLI {
  private browserAgent: Awaited<ReturnType<typeof createBrowserAgent>> | null;
  private openai: OpenAI;
  private messages: Array<ChatCompletionMessageParam>;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.openai = new OpenAI();
    this.messages = [
      {
        role: 'system',
        content: `
You are a website crawler that tests websites and web apps.
You will be given instructions on what to do by browsing.
You are connected to a web browser and you will be given the screenshot of the website you are on right now.
            
The links and buttons on the website will be highlighted in red.
The input fields (text, radio groups, checkboxes) are highlighted in yellow in the screenshot.
The select elements are highlighted in blue (#007BFF).
Scrollable areas are highlighted in green, with the identifier in the top left corner of the area. Reference that identifier when you want to scroll that specific scrollarea down.

Always read what is in the screenshot. Don't guess link names. 
If the user provides a direct URL, go to that one. Do not make up links

You can go to a specific URL by answering with the following JSON format:
{"action": "url", "value": "url goes here"}}

You can click links or buttons on the website by referencing the text inside of the link/button, by answering in the following JSON format:
{"action": "click", "id": "Text in link or identifier"}

You can type to text input fields by specifying text to type by answering in the following JSON format:
{"action": "type", "id": "Text in the input or identifier", "value": "Text to type"}

You can select a value from select by specifying the if and of the select and the value in the following JSON format:
{"action": "select", "id": "identifier of the select", "value": "value to select"}

You can scroll a specific area by answering in the following JSON format:
{"action": "scroll", "id": "identifier of the scrollable area", "value": "amount of pixels to scroll"}

Once you have found the answer to the user's question, you can answer with a regular message.
`,
      },
    ];
    this.browserAgent = null;
  }

  private async storeLogs(): Promise<void> {
    if (!this.browserAgent) return;

    const logs = await this.browserAgent.getLogs();
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }

    logs.forEach((log, index) => {
      const filePath = path.join(logsDir, `screenshot_${index + 1}.png`);
      fs.writeFileSync(filePath, log);
    });
  }

  private setupExitHandlers(): void {
    const exitHandler = async () => {
      await this.storeLogs();
      process.exit();
    };

    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
  }

  private async handleAction(parsedAction: any): Promise<ActionResult | null> {
    if (!this.browserAgent) return null;

    try {
      switch (parsedAction?.action) {
        case 'click':
          return await this.browserAgent.handleClickAction(parsedAction);
        case 'url':
          return await this.browserAgent.handleUrlAction(parsedAction);
        case 'type':
          return await this.browserAgent.handleTypeAction(parsedAction);
        case 'select':
          return await this.browserAgent.handleSelectAction(parsedAction);
        case 'scroll':
          return await this.browserAgent.handleScrollAction(parsedAction);
        default:
          console.warn('Unknown action:', parsedAction?.action);
          return null;
      }
    } catch (error) {
      console.error(`Error handling ${parsedAction?.action} action:`, error);
      return null;
    }
  }

  public async start(): Promise<void> {
    console.log('How can I assist you today?');
    const prompt = await getCLIInput('You: ');
    console.log('Your prompt:', prompt);

    this.messages.push({
      role: 'user',
      content: prompt as string,
    });

    const argv = await yargs(hideBin(process.argv))
      .option('timeout', {
        type: 'number',
        description: 'Browser operation timeout in milliseconds',
        default: 5000,
      })
      .option('viewport-width', {
        type: 'number',
        description: 'Browser viewport width',
        default: 1440,
      })
      .option('viewport-height', {
        type: 'number',
        description: 'Browser viewport height',
        default: 800,
      })
      .option('viewport-scale', {
        type: 'number',
        description: 'Browser viewport device scale factor',
        default: 1,
      })
      .parse();

    this.browserAgent = await createBrowserAgent({
      headless: false,
      timeout: argv.timeout,
      viewport: {
        width: argv.viewportWidth,
        height: argv.viewportHeight,
        deviceScaleFactor: argv.viewportScale,
      },
    });

    this.setupExitHandlers();

    let screenshotTaken: string | null = null;
    let selectOptions = null;

    while (true) {
      try {
        if (screenshotTaken) {
          const base64_image = await formatBase64(screenshotTaken);
          const metadataText =
            selectOptions !== null && selectOptions?.length > 0
              ? `\nSelect element on the page have following values:\n${selectOptions
                  ?.map(
                    (selectOption) =>
                      `${selectOption.id} = ${selectOption.options.join(', ')}\n`,
                  )
                  .join('')}`
              : '';

          this.messages.push({
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
                text: `Here's the screenshot of the website you are on right now. Find the user's answer or issue url, click, type, select or scroll commands.
                ${metadataText}
                If you find the answer to the user's question, you can respond normally.`,
              },
            ],
          });

          screenshotTaken = null;
        }

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 1024,
          messages: this.messages,
        });

        const message = response.choices[0].message;
        const chatGPTResponse = message.content;

        if (!chatGPTResponse) {
          console.error('Empty response from GPT');
          continue;
        }

        this.messages.push({
          role: 'assistant',
          content: chatGPTResponse,
        });

        console.log('GPT response: ' + chatGPTResponse);

        if (chatGPTResponse.includes('{"action": "')) {
          try {
            const parsedAction = parseJsonResponse(chatGPTResponse);
            const actionResult = await this.handleAction(parsedAction);
            if (actionResult) {
              screenshotTaken = actionResult.screenshot;
              selectOptions = actionResult.selectOptions;
            }
          } catch (err) {
            if (err instanceof InvalidJsonResponseError) {
              this.messages.push({
                role: 'user',
                content:
                  'Error: the JSON response you provided was invalid. Please provide a valid JSON response.',
              });
            } else {
              throw err;
            }
          }
        } else {
          const prompt = await getCLIInput('You: ');
          console.log('Your prompt:', prompt);

          this.messages.push({
            role: 'user',
            content: prompt as string,
          });
        }

        await sleep(1000); // Prevent rate limiting
      } catch (error) {
        console.error('Error in main loop', error);
        console.error('Terminating...');
        break;
      }
    }
  }
}

// Start the application
const cli = new BrowserAgentCLI();
cli.start().catch(console.error);
