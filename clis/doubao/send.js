import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { DOUBAO_DOMAIN, sendDoubaoMessage } from './utils.js';

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
    site: 'doubao',
    name: 'send',
    access: 'write',
    description: 'Send a message to Doubao web chat',
    domain: DOUBAO_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    siteSession: 'persistent',
    navigateBefore: false,
    args: [
        { name: 'text', required: false, positional: true, help: 'Message to send' },
        { name: 'file-prompt', help: 'Path to a text file containing the prompt' },
    ],
    columns: ['Status', 'SubmittedBy', 'InjectedText'],
    func: async (page, kwargs) => {
        let text;
        if (kwargs['file-prompt']) {
            text = readPromptFromFile(kwargs['file-prompt']);
        } else if (kwargs.text) {
            text = kwargs.text;
        } else {
            throw new ArgumentError(
                'doubao send requires either a text argument or --file-prompt',
                'Example: opencli doubao send "hello"  OR  opencli doubao send --file-prompt ./prompt.txt'
            );
        }
        const submittedBy = await sendDoubaoMessage(page, text);
        return [{
                Status: 'Success',
                SubmittedBy: submittedBy,
                InjectedText: text,
            }];
    },
});
