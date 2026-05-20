import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import {
    QIANWEN_DOMAIN,
    authRequired,
    dismissLoginModal,
    ensureOnQianwen,
    hasLoginGate,
    normalizeBooleanFlag,
    sendMessage,
    setFeatureToggle,
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
    site: 'qwen',
    name: 'send',
    access: 'write',
    description: 'Fire-and-forget: send a prompt to Qianwen without waiting for the reply',
    domain: QIANWEN_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    siteSession: 'persistent',
    navigateBefore: false,
    args: [
        { name: 'prompt', required: false, positional: true, help: 'Prompt to send to Qianwen' },
        { name: 'file-prompt', help: 'Path to a text file containing the prompt' },
        { name: 'new', type: 'boolean', default: false, help: 'Start a new chat before sending' },
        { name: 'think', type: 'boolean', default: false, help: 'Enable 深度思考 (DeepThink)' },
        { name: 'research', type: 'boolean', default: false, help: 'Enable 深度研究 (DeepResearch)' },
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
                'qwen send requires either a prompt argument or --file-prompt',
                'Example: opencli qwen send "hello"  OR  opencli qwen send --file-prompt ./prompt.txt'
            );
        }
        if (!prompt) throw new ArgumentError('prompt is required');
        const startFresh = normalizeBooleanFlag(kwargs.new, false);
        const useThink = normalizeBooleanFlag(kwargs.think, false);
        const useResearch = normalizeBooleanFlag(kwargs.research, false);

        await ensureOnQianwen(page);
        await dismissLoginModal(page);
        if (startFresh) {
            await startNewChat(page);
            await dismissLoginModal(page);
        }
        if (useThink) await setFeatureToggle(page, 'think', true);
        if (useResearch) await setFeatureToggle(page, 'research', true);

        const send = await sendMessage(page, prompt);
        if (!send?.ok) {
            if (await hasLoginGate(page)) throw authRequired();
            throw new CommandExecutionError(send?.reason || 'Failed to send Qianwen prompt');
        }
        return [{ Status: 'sent', Prompt: prompt }];
    },
});
