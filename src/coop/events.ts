// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

export const coopRoomChangedEvent = 'capticlient.coop.roomChanged';
export const coopDisplayNameStorageKey = 'capticlient.coop.displayName';

export type CoopRoomPayload = Readonly<{
    roomId?: string;
    programId?: string;
}>;

export function getCoopRoomId(): string {
    return new URLSearchParams(window.location.search).get('coop') ?? '';
}

export function getCoopProgramId(): string {
    return new URLSearchParams(window.location.search).get('program') ?? '';
}

export function getCoopDisplayName(): string {
    return localStorage.getItem(coopDisplayNameStorageKey)?.trim() || 'Guest';
}

export function getCoopProgramFilePath(
    roomId: string,
    programId: string,
    programName: string,
): string {
    const safeName = programName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Program';
    return `Co-op ${roomId} - ${safeName} [${programId}].py`;
}

export function isCoopProgramFilePath(
    path: string | undefined,
    roomId: string,
    programId: string,
): boolean {
    return (
        path !== undefined &&
        path.startsWith(`Co-op ${roomId} - `) &&
        path.endsWith(` [${programId}].py`)
    );
}

export function setCoopRoomInUrl(
    roomId: string | undefined,
    programId = getCoopProgramId(),
): void {
    const url = new URL(window.location.href);

    if (roomId) {
        url.searchParams.set('coop', roomId);
    } else {
        url.searchParams.delete('coop');
        url.searchParams.delete('program');
    }

    if (roomId && programId) {
        url.searchParams.set('program', programId);
    } else {
        url.searchParams.delete('program');
    }

    window.history.replaceState(null, '', url);
    window.dispatchEvent(
        new CustomEvent<CoopRoomPayload>(coopRoomChangedEvent, {
            detail: { roomId, programId: roomId ? programId : undefined },
        }),
    );
}

export function getCoopServerUrl(): string {
    const configuredUrl = process.env.REACT_APP_COOP_WEBSOCKET_URL;

    if (configuredUrl) {
        return configuredUrl;
    }

    return 'ws://localhost:1234';
}

export function getCoopHttpUrl(): string {
    const serverUrl = new URL(getCoopServerUrl());
    serverUrl.protocol = serverUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return serverUrl.toString().replace(/\/$/, '');
}

export function getCoopColor(name: string): string {
    const colors = [
        '#338e7f',
        '#5f7cdb',
        '#c061cb',
        '#d9822b',
        '#d33d3d',
        '#6f8f32',
        '#8f6dd3',
    ];
    const hash = Array.from(name).reduce(
        (sum, character) => sum + character.charCodeAt(0),
        0,
    );

    return colors[hash % colors.length];
}
