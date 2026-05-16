// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import './home.scss';
import { Button, InputGroup } from '@blueprintjs/core';
import { Document, Link, Plus } from '@blueprintjs/icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
    coopDisplayNameStorageKey,
    getCoopHttpUrl,
    getCoopProgramFilePath,
    getCoopProgramId,
    getCoopRoomId,
    setCoopRoomInUrl,
} from '../coop/events';
import { editorActivateFile } from '../editor/actions';
import { explorerCreateNewFile, explorerUserActivateFile } from '../explorer/actions';
import NewFileWizard from '../explorer/newFileWizard/NewFileWizard';
import { FileMetadata, UUID } from '../fileStorage';
import { fileStorageWriteFile } from '../fileStorage/actions';
import { useFileStorageMetadata } from '../fileStorage/hooks';
import { useSelector } from '../reducers';

const noFiles: readonly FileMetadata[] = [];
type CoopRoom = Readonly<{
    id: string;
    displayName: string;
}>;
type CoopProgram = Readonly<{
    id: string;
    name: string;
    updatedAt: number;
}>;

function createRoomId(): string {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);

    return Array.from(bytes)
        .map((byte) => byte.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 8)
        .toUpperCase();
}

function getRoomLink(roomId: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set('coop', roomId);
    url.searchParams.delete('program');
    return url.toString();
}

function getRoomProgramLink(roomId: string, programId: string): string {
    const url = new URL(getRoomLink(roomId));
    url.searchParams.set('program', programId);
    return url.toString();
}

async function fetchRoomPrograms(roomId: string): Promise<CoopProgram[]> {
    const response = await fetch(
        `${getCoopHttpUrl()}/api/rooms/${encodeURIComponent(roomId)}/programs`,
    );

    if (!response.ok) {
        throw new Error(`Could not load room programs (${response.status})`);
    }

    return (await response.json()) as CoopProgram[];
}

async function createRoomProgram(roomId: string, name: string): Promise<CoopProgram> {
    const response = await fetch(
        `${getCoopHttpUrl()}/api/rooms/${encodeURIComponent(roomId)}/programs`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        },
    );

    if (!response.ok) {
        throw new Error(`Could not create room program (${response.status})`);
    }

    return (await response.json()) as CoopProgram;
}

const HomeFileButton: React.FunctionComponent<{ file: FileMetadata }> = ({ file }) => {
    const dispatch = useDispatch();
    const handleClick = useCallback(
        () => dispatch(explorerUserActivateFile(file.path, file.uuid)),
        [dispatch, file],
    );

    return (
        <button className="pb-home-file" type="button" onClick={handleClick}>
            <Document />
            <span>{file.path}</span>
        </button>
    );
};

const EmptyList: React.FunctionComponent<{ text: string }> = ({ text }) => (
    <div className="pb-home-empty">{text}</div>
);

const FileSection: React.FunctionComponent<{
    title: string;
    files: readonly FileMetadata[];
    empty: string;
}> = ({ title, files, empty }) => (
    <section className="pb-home-section">
        <h2>{title}</h2>
        <div className="pb-home-list">
            {files.length === 0 ? (
                <EmptyList text={empty} />
            ) : (
                files.map((file) => <HomeFileButton key={file.uuid} file={file} />)
            )}
        </div>
    </section>
);

const CoopSection: React.FunctionComponent<{
    files: readonly FileMetadata[];
    openFileUuids: readonly UUID[];
}> = ({ files, openFileUuids }) => {
    const dispatch = useDispatch();
    const [displayName, setDisplayName] = useState(
        () => localStorage.getItem(coopDisplayNameStorageKey) ?? '',
    );
    const [joinCode, setJoinCode] = useState(() => getCoopRoomId());
    const [programId, setProgramId] = useState(() => getCoopProgramId());
    const [programName, setProgramName] = useState('Program 1');
    const [programs, setPrograms] = useState<CoopProgram[]>([]);
    const [pendingOpen, setPendingOpen] = useState<
        Readonly<{ path: string; program: CoopProgram }> | undefined
    >();
    const [room, setRoom] = useState<CoopRoom | undefined>(() => {
        const roomId = getCoopRoomId();
        const savedName = localStorage.getItem(coopDisplayNameStorageKey) ?? '';

        return roomId ? { id: roomId, displayName: savedName } : undefined;
    });
    const [status, setStatus] = useState('');

    const refreshPrograms = useCallback(async (roomId: string) => {
        const nextPrograms = await fetchRoomPrograms(roomId);
        setPrograms(nextPrograms);
        return nextPrograms;
    }, []);

    const saveName = useCallback((name: string) => {
        localStorage.setItem(coopDisplayNameStorageKey, name);
        setDisplayName(name);
    }, []);

    const activateRoom = useCallback(
        (roomId: string) => {
            const normalizedRoomId = roomId.trim().toUpperCase();

            if (!normalizedRoomId) {
                setStatus('Enter a room code first.');
                return;
            }

            const name = displayName.trim() || 'Guest';
            saveName(name);
            setJoinCode(normalizedRoomId);
            setRoom({ id: normalizedRoomId, displayName: name });
            setCoopRoomInUrl(normalizedRoomId, programId);
            setStatus('Room ready. Share the invite link to bring teammates in.');
        },
        [displayName, programId, saveName],
    );

    const handleStartRoom = useCallback(() => {
        activateRoom(createRoomId());
    }, [activateRoom]);

    const handleJoinRoom = useCallback(() => {
        activateRoom(joinCode);
    }, [activateRoom, joinCode]);

    const handleCopyLink = useCallback(async () => {
        if (!room) {
            return;
        }

        await navigator.clipboard.writeText(
            programId ? getRoomProgramLink(room.id, programId) : getRoomLink(room.id),
        );
        setStatus('Invite link copied.');
    }, [programId, room]);

    const handleCreateProgram = useCallback(async () => {
        if (!room) {
            setStatus('Join or start a room first.');
            return;
        }

        try {
            const program = await createRoomProgram(
                room.id,
                programName.trim() || `Program ${programs.length + 1}`,
            );
            const path = getCoopProgramFilePath(room.id, program.id, program.name);

            setProgramName(`Program ${programs.length + 2}`);
            setPrograms(await refreshPrograms(room.id));
            setPendingOpen({ path, program });
            dispatch(fileStorageWriteFile(path, ''));
            setStatus(`Opening room program "${program.name}".`);
        } catch (err) {
            setStatus(err instanceof Error ? err.message : 'Could not create program.');
        }
    }, [dispatch, programName, programs.length, refreshPrograms, room]);

    const handleSelectProgram = useCallback(
        (program: CoopProgram) => {
            if (!room) {
                return;
            }

            const path = getCoopProgramFilePath(room.id, program.id, program.name);
            const existingFile = files.find((file) => file.path === path);
            const isAlreadyOpen =
                existingFile && openFileUuids.includes(existingFile.uuid);

            setPendingOpen({ path, program });

            if (isAlreadyOpen) {
                dispatch(editorActivateFile(existingFile.uuid));
            } else {
                dispatch(fileStorageWriteFile(path, ''));
            }

            setStatus(`Opening room program "${program.name}".`);
        },
        [dispatch, files, openFileUuids, room],
    );

    const handleLeaveRoom = useCallback(() => {
        setRoom(undefined);
        setJoinCode('');
        setProgramId('');
        setPrograms([]);
        setPendingOpen(undefined);
        setCoopRoomInUrl(undefined);
        setStatus('Left the co-op room.');
    }, []);

    useEffect(() => {
        if (!room) {
            return undefined;
        }

        let canceled = false;
        const refresh = async (): Promise<void> => {
            try {
                const nextPrograms = await fetchRoomPrograms(room.id);

                if (!canceled) {
                    setPrograms(nextPrograms);
                }
            } catch (err) {
                if (!canceled) {
                    setStatus(
                        err instanceof Error
                            ? err.message
                            : 'Could not load room programs.',
                    );
                }
            }
        };
        const intervalId = window.setInterval(refresh, 3000);

        refresh();

        return () => {
            canceled = true;
            window.clearInterval(intervalId);
        };
    }, [refreshPrograms, room]);

    useEffect(() => {
        if (!pendingOpen || !room) {
            return;
        }

        const file = files.find((candidate) => candidate.path === pendingOpen.path);

        if (file) {
            setProgramId(pendingOpen.program.id);
            setCoopRoomInUrl(room.id, pendingOpen.program.id);
            dispatch(editorActivateFile(file.uuid));
            setPendingOpen(undefined);
            setStatus(`Room program "${pendingOpen.program.name}" is active.`);
        }
    }, [dispatch, files, pendingOpen, room]);

    return (
        <section className="pb-home-section pb-home-coop">
            <h2>Co-op Room</h2>
            <div id="pb-home-coop-panel" className="pb-home-coop-panel">
                <div className="pb-home-coop-fields">
                    <InputGroup
                        value={displayName}
                        placeholder="Display name"
                        onChange={(event) => saveName(event.currentTarget.value)}
                    />
                    <InputGroup
                        value={joinCode}
                        placeholder="Room code"
                        onChange={(event) =>
                            setJoinCode(event.currentTarget.value.toUpperCase())
                        }
                    />
                </div>
                <div className="pb-home-coop-actions">
                    <Button intent="primary" onClick={handleStartRoom}>
                        Start Room
                    </Button>
                    <Button onClick={handleJoinRoom}>Join Room</Button>
                </div>
                {room && (
                    <>
                        <div className="pb-home-coop-active">
                            <div>
                                <span>Room</span>
                                <strong>{room.id}</strong>
                                <small>{room.displayName}</small>
                            </div>
                            <div className="pb-home-coop-active-actions">
                                <Button small icon={<Link />} onClick={handleCopyLink}>
                                    Copy Invite
                                </Button>
                                <Button small minimal onClick={handleLeaveRoom}>
                                    Leave
                                </Button>
                            </div>
                        </div>
                        <div className="pb-home-coop-programs">
                            <div className="pb-home-coop-fields">
                                <InputGroup
                                    value={programName}
                                    placeholder="Room program name"
                                    onChange={(event) =>
                                        setProgramName(event.currentTarget.value)
                                    }
                                />
                                <Button
                                    id="pb-home-new-room-program-button"
                                    onClick={handleCreateProgram}
                                >
                                    New Room Program
                                </Button>
                            </div>
                            {programs.length === 0 ? (
                                <EmptyList text="Create a room program to sync saved room code." />
                            ) : (
                                <div className="pb-home-list">
                                    {programs.map((program) => (
                                        <button
                                            key={program.id}
                                            className="pb-home-file"
                                            type="button"
                                            onClick={() => handleSelectProgram(program)}
                                        >
                                            <Document />
                                            <span>
                                                {program.name}
                                                {program.id === programId
                                                    ? ' (open)'
                                                    : ''}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
                <p>
                    {programId
                        ? 'The selected room program opens like a file and syncs live edits and cursors. '
                        : 'Create or select a room program to open it like a shared file. '}
                    Teammates on other devices need the same WebSocket server.
                </p>
                {room && programId && (
                    <div className="pb-home-coop-active-actions">
                        <Button
                            small
                            onClick={async () => {
                                setPrograms(await refreshPrograms(room.id));
                                setStatus('Room programs refreshed.');
                            }}
                        >
                            Refresh Programs
                        </Button>
                        <Button
                            small
                            icon={<Link />}
                            onClick={async () => {
                                await navigator.clipboard.writeText(
                                    getRoomProgramLink(room.id, programId),
                                );
                                setStatus('Program invite link copied.');
                            }}
                        >
                            Copy Program Link
                        </Button>
                    </div>
                )}
                {status && <div className="pb-home-coop-status">{status}</div>}
            </div>
        </section>
    );
};

const Home: React.FunctionComponent = () => {
    const dispatch = useDispatch();
    const files = useFileStorageMetadata() ?? noFiles;
    const openFileUuids = useSelector((s) => s.editor.openFileUuids);

    const filesByUuid = useMemo(
        () => new Map<UUID, FileMetadata>(files.map((file) => [file.uuid, file])),
        [files],
    );

    const recentFiles = useMemo(
        () =>
            [...openFileUuids]
                .reverse()
                .map((uuid) => filesByUuid.get(uuid))
                .filter((file): file is FileMetadata => file !== undefined)
                .slice(0, 4),
        [filesByUuid, openFileUuids],
    );

    const savedFiles = useMemo(() => files.slice(0, 8), [files]);

    return (
        <div className="pb-home">
            <div className="pb-home-header">
                <div>
                    <h1>Home</h1>
                    <p>Recent and saved programs</p>
                </div>
                <Button
                    id="pb-home-new-file-button"
                    icon={<Plus />}
                    intent="primary"
                    onClick={() => dispatch(explorerCreateNewFile())}
                >
                    New
                </Button>
            </div>
            <FileSection
                title="Recent"
                files={recentFiles}
                empty="Open a program and it will show up here."
            />
            <CoopSection files={files} openFileUuids={openFileUuids} />
            <FileSection
                title="Saved Programs"
                files={savedFiles}
                empty="Create or import a program to get started."
            />
            <NewFileWizard />
        </div>
    );
};

export default Home;
