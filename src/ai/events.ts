// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

export const aiOpenWithPromptEvent = 'capticlient.ai.openWithPrompt';
export const aiInsertCodeEvent = 'capticlient.ai.insertCode';
export const aiRequestEditorCodeEvent = 'capticlient.ai.requestEditorCode';

export type AiEditorCodePayload = Readonly<{
    code: string;
    fileName?: string;
}>;

export type AiOpenWithPromptPayload = Readonly<{
    prompt: string;
}>;

export type AiEditorCodeRequestPayload = Readonly<{
    respond: (payload: AiEditorCodePayload) => void;
}>;

export type AiInsertCodePayload = Readonly<{
    code: string;
}>;

export function openAiWithPrompt(prompt: string): void {
    window.dispatchEvent(
        new CustomEvent<AiOpenWithPromptPayload>(aiOpenWithPromptEvent, {
            detail: { prompt },
        }),
    );
}

export function insertCodeInEditor(code: string): void {
    window.dispatchEvent(
        new CustomEvent<AiInsertCodePayload>(aiInsertCodeEvent, {
            detail: { code },
        }),
    );
}

export function requestEditorCode(): Promise<AiEditorCodePayload | undefined> {
    return new Promise((resolve) => {
        let didResolve = false;
        const timeoutId = window.setTimeout(() => {
            if (!didResolve) {
                didResolve = true;
                resolve(undefined);
            }
        }, 250);

        window.dispatchEvent(
            new CustomEvent<AiEditorCodeRequestPayload>(aiRequestEditorCodeEvent, {
                detail: {
                    respond: (payload) => {
                        if (didResolve) {
                            return;
                        }

                        didResolve = true;
                        window.clearTimeout(timeoutId);
                        resolve(payload);
                    },
                },
            }),
        );
    });
}
