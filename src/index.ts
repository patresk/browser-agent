import OpenAI from 'openai';

import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  bufferToBase64,
  getCLIInput,
  InvalidJsonResponseError,
  parseJsonResponse,
} from './util';
import { createBrowserAgent } from './BrowserAgent';
import fs from 'fs';
import path from 'path';

require('dotenv/config');

const openai = new OpenAI();

(async () => {
  const messages: Array<ChatCompletionMessageParam> = [
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

  console.log('How can I assist you today?');
  const prompt = await getCLIInput('You: ');
  console.log('Your prompt:', prompt);

  messages.push({
    role: 'user',
    content: prompt as unknown as string,
  });

  const browserAgent = await createBrowserAgent();

  async function storeLogs() {
    const logs = await browserAgent.getLogs();
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }

    logs.forEach((log, index) => {
      const filePath = path.join(logsDir, `screenshot_${index + 1}.png`);
      fs.writeFileSync(filePath, log);
    });
  }

  process.on('SIGINT', async () => {
    console.log('SIGINT');
    await storeLogs();
    process.exit();
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM');
    await storeLogs();
    process.exit();
  });

  let screenshotTaken: Buffer | null = null;
  let selectOptions = null;

  while (true) {
    if (screenshotTaken) {
      const base64_image = await bufferToBase64(screenshotTaken);

      let metadataText =
        selectOptions &&
        selectOptions.length > 0 &&
        `
Select element on the page have following values:
${selectOptions?.map((selectOption) => {
  return `${selectOption.id} = ${selectOption.options.join(', ')}\n`;
})}
`;

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
            text: `Here\'s the screenshot of the website you are on right now. Find the user's answer or issue url, click, type, select or scroll commands.

            ${metadataText}
            
            If you find the answer to the user\'s question, you can respond normally.`,
          },
        ],
      });

      screenshotTaken = null;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: messages,
    });

    const message = response.choices[0].message;
    const chatGPTResponse = message.content;

    messages.push({
      role: 'assistant',
      content: chatGPTResponse,
    });

    console.log('GPT response: ' + chatGPTResponse);

    // Handle actions from the LLM
    if (
      chatGPTResponse?.includes('{"action": "') ||
      chatGPTResponse?.includes('{"action": "')
    ) {
      let parsedAction;
      try {
        parsedAction = parseJsonResponse(chatGPTResponse);
      } catch (err) {
        if (err instanceof InvalidJsonResponseError) {
          messages.push({
            role: 'user',
            content:
              'Error: the JSON response you provided was invalid. Please provide a valid JSON response.',
          });
        } else {
          throw err;
        }
      }

      switch (parsedAction?.action) {
        case 'click': {
          try {
            const actionResult =
              await browserAgent.handleClickAction(parsedAction);
            screenshotTaken = actionResult.screenshot;
            selectOptions = actionResult.selectOptions;
          } catch (error) {
            console.log('Error clicking the element:', error);

            messages.push({
              role: 'user',
              content:
                'Error: I was unable to click that element. Can you try a different one? After the second attempt, just provide an explanation what went wrong.',
            });
          }
          break;
        }
        case 'url': {
          try {
            const actionResult =
              await browserAgent.handleUrlAction(parsedAction);
            screenshotTaken = actionResult.screenshot;
            selectOptions = actionResult.selectOptions;
          } catch (err) {
            console.error('Error handling URL action:', err);

            messages.push({
              role: 'user',
              content:
                'Error: I was unable to visit that URL. Provide a different url.',
            });
          }
          break;
        }
        case 'type': {
          try {
            const actionResult =
              await browserAgent.handleUrlAction(parsedAction);
            screenshotTaken = actionResult.screenshot;
            selectOptions = actionResult.selectOptions;
          } catch (error) {
            console.log('Error typing into the input:', error);

            messages.push({
              role: 'user',
              content:
                'Error: I was unable to typo into that input field. Because it does not exist. Please provide a different input field.',
            });
          }
          break;
        }
        case 'select': {
          try {
            const actionResult =
              await browserAgent.handleSelectAction(parsedAction);
            screenshotTaken = actionResult.screenshot;
            selectOptions = actionResult.selectOptions;
          } catch (error) {
            console.log('Error selecting an option:', error);

            messages.push({
              role: 'user',
              content:
                'Error: I was unable to select that option because it does not exist. Please provide a different option.',
            });
          }
          break;
        }
        case 'scroll': {
          try {
            const actionResult =
              await browserAgent.handleUrlAction(parsedAction);
            screenshotTaken = actionResult.screenshot;
            selectOptions = actionResult.selectOptions;
          } catch (error) {
            console.log('Error scrolling an area:', error);
            messages.push({
              role: 'user',
              content:
                'Error: I was unable to scroll that scroll area. Please provide a different scroll area.',
            });
          }
        }
      }
    } else {
      await storeLogs();

      // Break the cycle. We've obviously were not able to handle the response
      const prompt = (await getCLIInput('You: ')) as unknown as string;

      messages.push({
        role: 'user',
        content: prompt,
      });
    }
  }
})();
