import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
    YUANBAO_DOMAIN,
    authRequired,
    ensureYuanbaoPage,
    hasLoginGate,
    normalizeBooleanFlag,
    sendYuanbaoMessage,
    startNewYuanbaoChat,
} from './shared.js';

function resolveFilePath(filePath) {
    if (filePath.startsWith('~/')) {
        return path.join(os.homedir(), filePath.slice(2));
    }
    return path.resolve(filePath);
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

cli({
    site: 'yuanbao',
    name: 'send',
    access: 'write',
    description: 'Fire-and-forget: send a prompt to Yuanbao without waiting for the reply',
    domain: YUANBAO_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    siteSession: 'persistent',
    navigateBefore: false,
    args: [
        { name: 'prompt', positional: true, required: false, help: 'Prompt to send to Yuanbao' },
        { name: 'file-prompt', help: 'Path to a text file containing the prompt' },
        { name: 'new', type: 'boolean', default: false, help: 'Start a new chat before sending' },
    ],
    columns: ['Status', 'Prompt'],
    func: async (page, kwargs) => {
        let prompt;
        if (kwargs['file-prompt']) {
            prompt = readPromptFromFile(kwargs['file-prompt']);
        } else if (kwargs.prompt) {
            prompt = String(kwargs.prompt || '').trim();
        } else {
            throw new ArgumentError(
                'yuanbao send requires either a prompt argument or --file-prompt',
                'Example: opencli yuanbao send "hello"  OR  opencli yuanbao send --file-prompt ./prompt.txt'
            );
        }
        if (!prompt) throw new ArgumentError('prompt', 'is required');
        const startFresh = normalizeBooleanFlag(kwargs.new, false);

        await ensureYuanbaoPage(page);
        if (await hasLoginGate(page)) {
            throw authRequired('Yuanbao opened a login gate before sending the prompt.');
        }
        if (startFresh) {
            const action = await startNewYuanbaoChat(page);
            if (action === 'blocked') {
                throw authRequired('Yuanbao opened a login gate while starting a new chat.');
            }
        }
        const send = await sendYuanbaoMessage(page, prompt);
        if (!send?.ok) {
            if (await hasLoginGate(page)) {
                throw authRequired('Yuanbao opened a login gate instead of accepting the prompt.');
            }
            throw new CommandExecutionError(
                send?.reason || 'Failed to send Yuanbao prompt',
                send?.detail
                    ? `Detail: ${send.detail}`
                    : 'Make sure the Yuanbao chat composer is visible and not in a disabled state.',
            );
        }
        return [{ Status: 'sent', Prompt: prompt }];
    },
});
