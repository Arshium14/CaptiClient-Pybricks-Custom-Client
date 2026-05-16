// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import './ai.scss';
import {
    Button,
    Classes,
    Dialog,
    FormGroup,
    InputGroup,
    TextArea,
} from '@blueprintjs/core';
import { KeyEnter, SendMessage } from '@blueprintjs/icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from '../reducers';
import pybricksDocsUrl from './docs/pybricks-v3.6.1.txt';
import {
    AiEditorCodePayload,
    AiOpenWithPromptPayload,
    aiOpenWithPromptEvent,
    insertCodeInEditor,
    requestEditorCode,
} from './events';

type ChatMessage = Readonly<{
    role: 'user' | 'model';
    text: string;
}>;

type StoredApiKey = Readonly<{
    id: string;
    label: string;
    value: string;
    cooldownUntil?: number;
}>;

type GeminiResponse = {
    candidates?: {
        content?: {
            parts?: { text?: string }[];
        };
        groundingMetadata?: {
            groundingChunks?: {
                web?: {
                    uri?: string;
                    title?: string;
                };
            }[];
        };
    }[];
    error?: {
        code?: number;
        message?: string;
        status?: string;
        details?: {
            '@type'?: string;
            retryDelay?: string;
        }[];
    };
};

const model = 'gemini-3-flash-preview';
const apiKeyStorageKey = 'capticlient.ai.geminiApiKey';
const apiKeysStorageKey = 'capticlient.ai.geminiApiKeys';
const activeKeyStorageKey = 'capticlient.ai.activeGeminiApiKey';
const helperPrompt =
    'You are Jerry AI, a friendly Pybricks MicroPython coding assistant. ' +
    'Use Gemini 3 Flash. For Pybricks MicroPython APIs, classes, methods, imports, and coding patterns, treat the provided Pybricks v3.6.1 documentation excerpts as your main source of truth. ' +
    'Do not invent Pybricks APIs that are not supported by those excerpts. If the excerpts do not contain enough Pybricks-specific information, say that the Pybricks v3.6.1 PDF excerpts do not include enough information. ' +
    'For non-Pybricks context, such as a song name, timing idea, melody inspiration, public facts, or general robotics explanation, you may use Google Search grounding or your general knowledge. ' +
    'When outside information influences the answer, prefer grounded web information and mention sources when available. ' +
    'Help the user generate, explain, and debug Pybricks MicroPython code. ' +
    'Give practical code examples when the excerpts support them, keep answers concise, and call out risky code clearly.';

let docsTextPromise: Promise<string> | undefined;
let docsChunksPromise: Promise<string[]> | undefined;

function loadDocsText(): Promise<string> {
    docsTextPromise ??= fetch(pybricksDocsUrl).then((response) => {
        if (!response.ok) {
            throw new Error('Could not load the Pybricks v3.6.1 PDF text.');
        }

        return response.text();
    });

    return docsTextPromise;
}

function chunkDocs(docsText: string): string[] {
    const pageChunks = docsText
        .split(/\n(?=--- Page \d+ ---)/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
    const chunks: string[] = [];

    for (const pageChunk of pageChunks) {
        for (let start = 0; start < pageChunk.length; start += 1400) {
            chunks.push(pageChunk.slice(start, start + 1800));
        }
    }

    return chunks;
}

function loadDocsChunks(): Promise<string[]> {
    docsChunksPromise ??= loadDocsText().then(chunkDocs);
    return docsChunksPromise;
}

function queryTerms(query: string): string[] {
    return Array.from(
        new Set(
            query
                .toLowerCase()
                .match(/[a-z][a-z0-9_]{2,}/g)
                ?.filter(
                    (term) =>
                        ![
                            'the',
                            'and',
                            'for',
                            'with',
                            'that',
                            'this',
                            'code',
                            'program',
                            'pybricks',
                        ].includes(term),
                ) ?? [],
        ),
    );
}

async function getDocsContext(query: string): Promise<string> {
    const docsChunks = await loadDocsChunks();
    const terms = queryTerms(query);

    if (terms.length === 0) {
        return docsChunks.slice(0, 4).join('\n\n');
    }

    return docsChunks
        .map((chunk) => {
            const lower = chunk.toLowerCase();
            const score = terms.reduce((sum, term) => {
                const matches = lower.match(new RegExp(`\\b${term}\\b`, 'g'));
                return sum + (matches?.length ?? 0);
            }, 0);

            return { chunk, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 7)
        .map((item) => item.chunk)
        .join('\n\n');
}

function maskKey(key: string): string {
    return key.length <= 8 ? 'API key' : `...${key.slice(-6)}`;
}

function createStoredKey(value: string, index: number): StoredApiKey {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label: `Key ${index + 1} ${maskKey(value)}`,
        value,
    };
}

function loadApiKeys(): StoredApiKey[] {
    const storedKeys = localStorage.getItem(apiKeysStorageKey);

    if (storedKeys) {
        try {
            const parsed = JSON.parse(storedKeys) as StoredApiKey[];
            if (Array.isArray(parsed)) {
                return parsed.filter((key) => key.value?.trim());
            }
        } catch {
            // Ignore malformed local storage and fall back to the legacy key.
        }
    }

    const legacyKey = localStorage.getItem(apiKeyStorageKey)?.trim();
    return legacyKey ? [createStoredKey(legacyKey, 0)] : [];
}

function saveApiKeys(keys: readonly StoredApiKey[]): void {
    localStorage.setItem(apiKeysStorageKey, JSON.stringify(keys));
}

function parseRetryDelayMs(data: GeminiResponse): number {
    const retryDelay = data.error?.details?.find(
        (detail) => detail['@type']?.endsWith('RetryInfo'),
    )?.retryDelay;

    if (retryDelay?.endsWith('s')) {
        const seconds = Number.parseFloat(retryDelay.slice(0, -1));
        if (Number.isFinite(seconds)) {
            return seconds * 1000;
        }
    }

    const messageDelay = data.error?.message?.match(/retry in ([\d.]+)s/i)?.[1];
    if (messageDelay) {
        const seconds = Number.parseFloat(messageDelay);
        if (Number.isFinite(seconds)) {
            return seconds * 1000;
        }
    }

    return 60_000;
}

function isRateLimited(response: Response, data: GeminiResponse): boolean {
    return response.status === 429 || data.error?.status === 'RESOURCE_EXHAUSTED';
}

function addGroundingSources(answer: string, data: GeminiResponse): string {
    const sources =
        data.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((chunk) => chunk.web)
            .filter((web): web is { uri: string; title?: string } =>
                Boolean(web?.uri),
            ) ?? [];

    const uniqueSources = Array.from(
        new Map(sources.map((source) => [source.uri, source])).values(),
    ).slice(0, 4);

    if (uniqueSources.length === 0) {
        return answer;
    }

    return `${answer}\n\nSources:\n${uniqueSources
        .map((source, index) =>
            source.title
                ? `${index + 1}. ${source.title} - ${source.uri}`
                : `${index + 1}. ${source.uri}`,
        )
        .join('\n')}`;
}

function extractInsertableCode(text: string): string {
    return (
        text.match(/```(?:python|py|micropython)?\s*\n([\s\S]*?)```/i)?.[1] ?? text
    ).trim();
}

const AiAssistant: React.FunctionComponent = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [apiKeys, setApiKeys] = useState<StoredApiKey[]>(() => loadApiKeys());
    const [activeKeyId, setActiveKeyId] = useState(
        () => localStorage.getItem(activeKeyStorageKey) ?? '',
    );
    const [apiKeyDraft, setApiKeyDraft] = useState('');
    const [draft, setDraft] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'model',
            text: 'Ask me to generate Pybricks code, explain an error, or debug a program.',
        },
    ]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string>();
    const [now, setNow] = useState(() => Date.now());
    const [attachedEditorCode, setAttachedEditorCode] = useState<AiEditorCodePayload>();
    const activeFileUuid = useSelector((s) => s.editor.activeFileUuid);

    const usableKeys = useMemo(
        () => apiKeys.filter((key) => (key.cooldownUntil ?? 0) <= now),
        [apiKeys, now],
    );
    const canSend = usableKeys.length > 0 && draft.trim() !== '' && !isSending;

    const geminiContents = useMemo(
        () =>
            messages
                .filter((message) => message.text.trim() !== '')
                .map((message) => ({
                    role: message.role,
                    parts: [{ text: message.text }],
                })),
        [messages],
    );

    const updateApiKeys = useCallback(
        (nextKeys: StoredApiKey[]) => {
            setApiKeys(nextKeys);
            saveApiKeys(nextKeys);
        },
        [setApiKeys],
    );

    useEffect(() => {
        const nextCooldownUntil = apiKeys
            .map((key) => key.cooldownUntil ?? 0)
            .filter((cooldownUntil) => cooldownUntil > now)
            .sort((a, b) => a - b)[0];

        if (!nextCooldownUntil) {
            return undefined;
        }

        const timeoutId = window.setTimeout(
            () => setNow(Date.now()),
            Math.max(nextCooldownUntil - now, 1000),
        );

        return () => window.clearTimeout(timeoutId);
    }, [apiKeys, now]);

    useEffect(() => {
        const handleOpenWithPrompt = (event: Event): void => {
            const { prompt } = (event as CustomEvent<AiOpenWithPromptPayload>).detail;
            setDraft((current) => (current ? `${current}\n\n${prompt}` : prompt));
            setIsOpen(true);
        };

        window.addEventListener(aiOpenWithPromptEvent, handleOpenWithPrompt);
        return () =>
            window.removeEventListener(aiOpenWithPromptEvent, handleOpenWithPrompt);
    }, []);

    const handleAddApiKey = useCallback(() => {
        const value = apiKeyDraft.trim();
        if (!value || apiKeys.some((key) => key.value === value)) {
            setApiKeyDraft('');
            return;
        }

        const nextKeys = [...apiKeys, createStoredKey(value, apiKeys.length)];
        updateApiKeys(nextKeys);
        setActiveKeyId(nextKeys.at(-1)?.id ?? '');
        localStorage.setItem(activeKeyStorageKey, nextKeys.at(-1)?.id ?? '');
        setApiKeyDraft('');
    }, [apiKeyDraft, apiKeys, updateApiKeys]);

    const handleRemoveApiKey = useCallback(
        (id: string) => {
            const nextKeys = apiKeys.filter((key) => key.id !== id);
            updateApiKeys(nextKeys);

            if (activeKeyId === id) {
                const nextActiveId = nextKeys[0]?.id ?? '';
                setActiveKeyId(nextActiveId);
                localStorage.setItem(activeKeyStorageKey, nextActiveId);
            }
        },
        [activeKeyId, apiKeys, updateApiKeys],
    );

    const handleSelectApiKey = useCallback((id: string) => {
        setActiveKeyId(id);
        localStorage.setItem(activeKeyStorageKey, id);
    }, []);

    const markKeyCoolingDown = useCallback(
        (id: string, cooldownUntil: number) => {
            setApiKeys((currentKeys) => {
                const nextKeys = currentKeys.map((key) =>
                    key.id === id ? { ...key, cooldownUntil } : key,
                );
                saveApiKeys(nextKeys);
                return nextKeys;
            });
        },
        [setApiKeys],
    );

    const handleUseCurrentCode = useCallback(async () => {
        const payload = await requestEditorCode();

        if (!payload) {
            setError('Open a program first so Jerry can read the current code.');
            return;
        }

        setAttachedEditorCode(payload);
        setError(undefined);
    }, []);

    const handleInsertCode = useCallback(
        (text: string) => {
            if (!activeFileUuid) {
                setError('Open a program first so Jerry can insert code.');
                return;
            }

            const code = extractInsertableCode(text);
            if (!code) {
                setError('Jerry did not return code that can be inserted.');
                return;
            }

            insertCodeInEditor(code);
            setError(undefined);
            setIsOpen(false);
        },
        [activeFileUuid],
    );

    const send = useCallback(async () => {
        if (!canSend) {
            return;
        }

        const userMessage: ChatMessage = { role: 'user', text: draft.trim() };
        setDraft('');
        setError(undefined);
        setIsSending(true);
        setMessages((current) => [...current, userMessage]);

        const orderedKeys = [
            ...usableKeys.filter((key) => key.id === activeKeyId),
            ...usableKeys.filter((key) => key.id !== activeKeyId),
        ];

        try {
            let lastRateLimitMessage = '';
            const attachedCodeContext = attachedEditorCode
                ? `Current editor file${
                      attachedEditorCode.fileName
                          ? ` (${attachedEditorCode.fileName})`
                          : ''
                  }:\n\`\`\`python\n${attachedEditorCode.code}\n\`\`\``
                : '';
            const docsContext = await getDocsContext(
                `${userMessage.text}\n${attachedCodeContext}`,
            );

            for (const key of orderedKeys) {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': key.value,
                        },
                        body: JSON.stringify({
                            contents: [
                                {
                                    role: 'user',
                                    parts: [
                                        {
                                            text:
                                                `${helperPrompt}\n\n` +
                                                'Pybricks v3.6.1 documentation PDF excerpts:\n' +
                                                `${
                                                    docsContext ||
                                                    'No matching excerpts found.'
                                                }`,
                                        },
                                    ],
                                },
                                ...geminiContents,
                                ...(attachedCodeContext
                                    ? [
                                          {
                                              role: 'user',
                                              parts: [{ text: attachedCodeContext }],
                                          },
                                      ]
                                    : []),
                                {
                                    role: 'user',
                                    parts: [{ text: userMessage.text }],
                                },
                            ],
                            tools: [{ google_search: {} }],
                            generationConfig: {
                                thinkingConfig: {
                                    thinkingLevel: 'low',
                                },
                            },
                        }),
                    },
                );

                const data = (await response.json()) as GeminiResponse;

                if (isRateLimited(response, data)) {
                    const cooldownUntil = Date.now() + parseRetryDelayMs(data);
                    markKeyCoolingDown(key.id, cooldownUntil);
                    setNow(Date.now());
                    lastRateLimitMessage =
                        data.error?.message ?? 'A Gemini key hit its rate limit.';
                    continue;
                }

                if (!response.ok) {
                    throw new Error(data.error?.message ?? response.statusText);
                }

                const answer =
                    data.candidates?.[0]?.content?.parts
                        ?.map((part) => part.text)
                        .filter((text): text is string => Boolean(text))
                        .join('\n')
                        .trim() || 'I did not get a text answer back.';

                setMessages((current) => [
                    ...current,
                    { role: 'model', text: addGroundingSources(answer, data) },
                ]);
                handleSelectApiKey(key.id);
                return;
            }

            throw new Error(
                lastRateLimitMessage ||
                    'All saved Gemini API keys are cooling down from rate limits.',
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'AI request failed.');
        } finally {
            setIsSending(false);
        }
    }, [
        activeKeyId,
        attachedEditorCode,
        canSend,
        draft,
        geminiContents,
        handleSelectApiKey,
        markKeyCoolingDown,
        usableKeys,
    ]);

    const handleKeyDown = useCallback<React.KeyboardEventHandler<HTMLTextAreaElement>>(
        (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send();
            }
        },
        [send],
    );

    return (
        <>
            <Button
                id="pb-toolbar-ai-button"
                className="pb-ai-open-button"
                icon={<KeyEnter />}
                intent="primary"
                title="AI coding helper"
                onClick={() => setIsOpen(true)}
            >
                AI
            </Button>
            <Dialog
                className="pb-ai-dialog"
                title="Jerry AI"
                icon={<KeyEnter />}
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
            >
                <div className={Classes.DIALOG_BODY}>
                    <FormGroup label="Gemini API keys">
                        <div className="pb-ai-key-add">
                            <InputGroup
                                type="password"
                                value={apiKeyDraft}
                                placeholder="Paste a Gemini API key"
                                onChange={(event) =>
                                    setApiKeyDraft(event.currentTarget.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        handleAddApiKey();
                                    }
                                }}
                            />
                            <Button onClick={handleAddApiKey}>Add</Button>
                        </div>
                        <div className="pb-ai-key-list">
                            {apiKeys.length === 0 ? (
                                <div className="pb-ai-key-empty">
                                    Add one or more keys to start chatting.
                                </div>
                            ) : (
                                apiKeys.map((key) => {
                                    const cooldownMs = (key.cooldownUntil ?? 0) - now;
                                    const isCoolingDown = cooldownMs > 0;

                                    return (
                                        <div className="pb-ai-key-row" key={key.id}>
                                            <button
                                                className={
                                                    key.id === activeKeyId
                                                        ? 'pb-ai-key-chip pb-active'
                                                        : 'pb-ai-key-chip'
                                                }
                                                type="button"
                                                onClick={() =>
                                                    handleSelectApiKey(key.id)
                                                }
                                            >
                                                <span>{key.label}</span>
                                                {isCoolingDown && (
                                                    <small>
                                                        retry in{' '}
                                                        {Math.ceil(cooldownMs / 1000)}s
                                                    </small>
                                                )}
                                            </button>
                                            <Button
                                                minimal
                                                small
                                                onClick={() =>
                                                    handleRemoveApiKey(key.id)
                                                }
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </FormGroup>
                    <div className="pb-ai-messages" aria-live="polite">
                        {messages.map((message, index) => (
                            <div
                                className={`pb-ai-message pb-ai-message-${message.role}`}
                                key={`${message.role}-${index}`}
                            >
                                <div className="pb-ai-message-text">{message.text}</div>
                                {message.role === 'model' && index > 0 && (
                                    <div className="pb-ai-message-actions">
                                        <Button
                                            small
                                            minimal
                                            disabled={!activeFileUuid}
                                            onClick={() =>
                                                handleInsertCode(message.text)
                                            }
                                        >
                                            Insert in editor
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {error && <div className="pb-ai-error">{error}</div>}
                    </div>
                    <FormGroup label="Ask for code help">
                        <div className="pb-ai-context-row">
                            <Button small onClick={() => void handleUseCurrentCode()}>
                                Use Current Code
                            </Button>
                            {attachedEditorCode && (
                                <div className="pb-ai-context-chip">
                                    <span>
                                        {attachedEditorCode.fileName ?? 'Current code'}
                                    </span>
                                    <Button
                                        minimal
                                        small
                                        onClick={() => setAttachedEditorCode(undefined)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            )}
                        </div>
                        <TextArea
                            fill
                            growVertically
                            value={draft}
                            placeholder="Generate a Pybricks drive-base program..."
                            onChange={(event) => setDraft(event.currentTarget.value)}
                            onKeyDown={handleKeyDown}
                        />
                    </FormGroup>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={() => setMessages([])}>Clear</Button>
                        <Button
                            intent="primary"
                            icon={<SendMessage />}
                            loading={isSending}
                            disabled={!canSend}
                            onClick={() => void send()}
                        >
                            Send
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
};

export default AiAssistant;
