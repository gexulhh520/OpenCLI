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

        // Try to use nativeType first for better multi-line text support
        let useNativeType = false;
        try {
            if (typeof page.nativeType === 'function') {
                // Focus the composer first
                await page.evaluate(`(() => {
                    const composer = Array.from(document.querySelectorAll('.ql-editor[contenteditable="true"], .ql-editor, [contenteditable="true"]'))
                        .find(node => {
                            if (!(node instanceof HTMLElement)) return false;
                            const rect = node.getBoundingClientRect();
                            const style = window.getComputedStyle(node);
                            return rect.width > 0 && rect.height > 0
                                && style.display !== 'none'
                                && style.visibility !== 'hidden';
                        });
                    if (composer instanceof HTMLElement) {
                        composer.focus();
                        composer.textContent = '';
                    }
                })()`);
                await page.nativeType(prompt);
                useNativeType = true;
            }
        } catch (e) {
            // nativeType failed, will fall back to sendYuanbaoMessage
            useNativeType = false;
        }

        // If nativeType succeeded, just trigger the send action
        // Otherwise, use the original sendYuanbaoMessage which includes text insertion
        let send;
        if (useNativeType) {
            send = await page.evaluate(`(async () => {
                const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const isVisible = (node) => {
                    if (!(node instanceof HTMLElement)) return false;
                    const rect = node.getBoundingClientRect();
                    const style = window.getComputedStyle(node);
                    return rect.width > 0 && rect.height > 0
                        && style.display !== 'none'
                        && style.visibility !== 'hidden';
                };

                const findEnabledSubmit = () => Array.from(document.querySelectorAll('a[class*="send-btn"], button[class*="send-btn"]'))
                    .find((node) => {
                        if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
                        const className = typeof node.className === 'string' ? node.className : '';
                        return !className.includes('send-btn--disabled') && !className.includes('disabled');
                    });

                let submit = null;
                const deadline = Date.now() + 3_000;
                while (Date.now() < deadline) {
                    submit = findEnabledSubmit();
                    if (submit) break;
                    await waitFor(150);
                }

                if (submit instanceof HTMLElement) {
                    submit.click();
                    return { ok: true, action: 'click' };
                }

                const composer = Array.from(document.querySelectorAll('.ql-editor[contenteditable="true"], .ql-editor, [contenteditable="true"]'))
                    .find(isVisible);
                if (composer instanceof HTMLElement) {
                    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    composer.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                }
                return { ok: true, action: 'enter' };
            })()`);
        } else {
            send = await sendYuanbaoMessage(page, prompt);
        }

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
