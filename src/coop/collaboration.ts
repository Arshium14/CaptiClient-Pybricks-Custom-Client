// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import type * as monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { getCoopColor, getCoopDisplayName, getCoopServerUrl } from './events';

export type CoopStatus = 'connecting' | 'connected' | 'disconnected';

export type CoopUser = Readonly<{
    clientId: number;
    name: string;
    color: string;
}>;

export type CoopStatusUpdate = Readonly<{
    status: CoopStatus;
    users: readonly CoopUser[];
}>;

export type CoopSession = Readonly<{
    destroy: () => void;
}>;

type AwarenessUserState = Readonly<{
    user?: {
        name?: string;
        color?: string;
    };
}>;

function getRoomName(roomId: string, programId: string): string {
    return `capticlient:${roomId}:program:${programId}`;
}

function getUsers(provider: WebsocketProvider): CoopUser[] {
    return Array.from(provider.awareness.getStates())
        .map(([clientId, state]) => {
            const user = (state as AwarenessUserState).user;

            return {
                clientId,
                name: user?.name || 'Guest',
                color: user?.color || getCoopColor(user?.name || 'Guest'),
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function startCoopSession(
    roomId: string,
    programId: string,
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    onUpdate: (update: CoopStatusUpdate) => void,
): CoopSession {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(
        getCoopServerUrl(),
        getRoomName(roomId, programId),
        doc,
    );
    const ytext = doc.getText('code');
    const name = getCoopDisplayName();
    let binding: MonacoBinding | undefined;
    let status: CoopStatus = 'connecting';

    provider.awareness.setLocalStateField('user', {
        name,
        color: getCoopColor(name),
    });

    const emitUpdate = (): void => {
        onUpdate({ status, users: getUsers(provider) });
    };

    const bindModel = (): void => {
        if (binding) {
            return;
        }

        binding = new MonacoBinding(
            ytext,
            model,
            new Set([editor]),
            provider.awareness,
        );
    };

    const handleStatus = (event: { status: CoopStatus }): void => {
        status = event.status;
        emitUpdate();

        if (event.status === 'connected') {
            bindModel();
        }
    };

    const handleSync = (): void => {
        bindModel();
        emitUpdate();
    };

    const bindTimeoutId = window.setTimeout(bindModel, 1200);

    provider.on('status', handleStatus);
    provider.on('sync', handleSync);
    provider.awareness.on('change', emitUpdate);
    emitUpdate();

    return {
        destroy: () => {
            window.clearTimeout(bindTimeoutId);
            binding?.destroy();
            provider.awareness.off('change', emitUpdate);
            provider.off('sync', handleSync);
            provider.off('status', handleStatus);
            provider.destroy();
            doc.destroy();
        },
    };
}
