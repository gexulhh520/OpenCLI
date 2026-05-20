import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import {
    CHATGPT_DOMAIN,
    CHATGPT_URL,
    ensureChatGPTComposer,
    ensureOnChatGPT,
    normalizeBooleanFlag,
    requireNonEmptyPrompt,
    sendChatGPTMessage,
    startNewChat,
} from './utils.js';

function resolveFilePath(filePath) {
    const pathStr = Array.isArray(filePath) ? filePath[0] : String(filePath ?? '');
    if (pathStr.startsWith('~/')) {
        return path.join(os.homedir(), pathStr.slice(2));
    }
    return path.resolve(pathStr);
}

function readPromptFromFile(filePath) {
    const resolvedPath = resolveFilePath(filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new ArgumentError(`File not found: ${filePath}`);
    }
    try {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        return content.trim();
    } catch (err) {
        throw new ArgumentError(`Failed to read file: ${filePath}`, err instanceof Error ? err.message : String(err));
    }
}

export const sendCommand = cli({
    site: 'chatgpt',
    name: 'send',
    access: 'write',
    description: 'Send a prompt to ChatGPT web without waiting for the response',
    domain: CHATGPT_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    siteSession: 'persistent',
    navigateBefore: false,
    args: [
        { name: 'prompt', positional: true, required: false, help: 'Prompt to send' },
        { name: 'file-prompt', help: 'Path to a text file containing the prompt' },
        { name: 'new', type: 'boolean', default: false, help: 'Start a new chat before sending' },
    ],
    columns: ['Status', 'InjectedText'],
    func: async (page, kwargs) => {
        let prompt;
        if (kwargs['file-prompt']) {
            prompt = readPromptFromFile(kwargs['file-prompt']);
        } else if (kwargs.prompt) {
            prompt = requireNonEmptyPrompt(kwargs.prompt, 'chatgpt send');
        } else {
            throw new ArgumentError(
                'chatgpt send requires either a prompt argument or --file-prompt',
                'Example: opencli chatgpt send "hello"  OR  opencli chatgpt send --file-prompt ./prompt.txt'
            );
        }

        if (normalizeBooleanFlag(kwargs.new)) {
            await startNewChat(page);
        } else {
            await ensureOnChatGPT(page);
        }
        // startNewChat / ensureOnChatGPT now wait for the composer selector
        // after navigating, so the previous standalone 2 s settle is redundant.
        await ensureChatGPTComposer(page, 'ChatGPT send requires a logged-in ChatGPT session with a visible composer.');

        const sent = await sendChatGPTMessage(page, prompt);
        if (!sent) {
            throw new CommandExecutionError('Failed to send message to ChatGPT', `Open ${CHATGPT_URL} and verify the composer is ready.`);
        }
        return [{ Status: 'Success', InjectedText: prompt }];
    },
});
