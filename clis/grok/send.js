import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
    GROK_DOMAIN,
    authRequired,
    ensureOnGrok,
    isLoggedIn,
    normalizeBooleanFlag,
    sendMessage,
    startNewChat,
} from './utils.js';

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
    site: 'grok',
    name: 'send',
    access: 'write',
    description: 'Fire-and-forget: send a prompt to Grok without waiting for the reply',
    domain: GROK_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    siteSession: 'persistent',
    navigateBefore: false,
    args: [
        { name: 'prompt', required: false, positional: true, help: 'Prompt to send to Grok' },
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
                'grok send requires either a prompt argument or --file-prompt',
                'Example: opencli grok send "hello"  OR  opencli grok send --file-prompt ./prompt.txt'
            );
        }
        if (!prompt) throw new ArgumentError('prompt', 'is required');
        const startFresh = normalizeBooleanFlag(kwargs.new, false);

        await ensureOnGrok(page);
        if (startFresh) {
            await startNewChat(page);
        }

        const send = await sendMessage(page, prompt);
        if (!send?.ok) {
            // If the composer is missing, the most likely cause is that the
            // signed-in session expired (Grok then renders a sign-in CTA in
            // place of the composer). Surface that as AuthRequiredError so
            // agents can prompt for re-auth instead of treating it as a
            // generic execution failure.
            if (!(await isLoggedIn(page))) throw authRequired();
            throw new CommandExecutionError(send?.reason || 'Failed to send Grok prompt');
        }
        return [{ Status: 'sent', Prompt: prompt }];
    },
});
