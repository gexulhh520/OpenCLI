import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { CLAUDE_DOMAIN, CLAUDE_URL, COMPOSER_SELECTOR, ensureOnClaude, sendMessage, parseBoolFlag, withRetry, ensureClaudeComposer, requireNonEmptyPrompt } from './utils.js';

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
    site: 'claude',
    name: 'send',
    access: 'write',
    description: 'Send a prompt to Claude without waiting for the response',
    domain: CLAUDE_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    siteSession: 'persistent',
    navigateBefore: false,
    args: [
        { name: 'prompt', positional: true, required: false, help: 'Prompt to send' },
        { name: 'file-prompt', help: 'Path to a text file containing the prompt' },
        { name: 'new', type: 'boolean', default: false, help: 'Start a new chat before sending' },
    ],
    columns: ['Status', 'SubmittedBy', 'InjectedText'],

    func: async (page, kwargs) => {
        let prompt;
        if (kwargs['file-prompt']) {
            prompt = readPromptFromFile(kwargs['file-prompt']);
        } else if (kwargs.prompt) {
            prompt = requireNonEmptyPrompt(kwargs.prompt, 'claude send');
        } else {
            throw new ArgumentError(
                'claude send requires either a prompt argument or --file-prompt',
                'Example: opencli claude send "hello"  OR  opencli claude send --file-prompt ./prompt.txt'
            );
        }

        if (parseBoolFlag(kwargs.new)) {
            await page.goto(CLAUDE_URL);
            try {
                await page.wait({ selector: COMPOSER_SELECTOR, timeout: 8 });
            } catch {
                // Composer didn't mount; ensureClaudeComposer below surfaces a typed error.
            }
        } else {
            // ensureOnClaude now waits for the composer selector; the previous
            // post-nav 2 s settle is covered by that event-based wait.
            await ensureOnClaude(page);
        }
        await withRetry(() => ensureClaudeComposer(page, 'Claude send requires a visible composer on the current page.'));

        const sendResult = await withRetry(() => sendMessage(page, prompt));
        if (!sendResult?.ok) {
            throw new CommandExecutionError(sendResult?.reason || 'Failed to send message');
        }
        return [{
            Status: 'Success',
            SubmittedBy: sendResult.method || 'send-button',
            InjectedText: prompt,
        }];
    },
});
