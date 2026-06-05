// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import 'react-splitter-layout/lib/index.css';
import './spike-prime.scss';
import { Button, Classes, InputGroup, Spinner } from '@blueprintjs/core';
import {
    ChevronRight,
    Cross,
    Document,
    FloppyDisk,
    Fullscreen,
    Home,
    Menu,
    Minus,
    More,
    Plus,
    Search,
    Th,
    Trash,
} from '@blueprintjs/icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import SplitterLayout from 'react-splitter-layout';
import { useTernaryDarkMode } from 'usehooks-ts';
import AiAssistant from '../ai/AiAssistant';
import { Toolbar as UtilsToolbar } from '../components/toolbar/Toolbar';
import { editorCloseFile } from '../editor/actions';
import { explorerUserActivateFile } from '../explorer/actions';
import { FileMetadata } from '../fileStorage';
import { fileStorageWriteFile } from '../fileStorage/actions';
import { useFileStorageMetadata } from '../fileStorage/hooks';
import DfuWindowsDriverInstallDialog from '../firmware/dfuWindowsDriverInstallDialog/DfuWindowsDriverInstallDialog';
import { InstallPybricksDialog } from '../firmware/installPybricksDialog/InstallPybricksDialog';
import RestoreOfficialDialog from '../firmware/restoreOfficialDialog/RestoreOfficialDialog';
import { useSelector } from '../reducers';
import StatusBar from '../status-bar/StatusBar';
import BluetoothButton from '../toolbar/buttons/bluetooth/BluetoothButton';
import ReplButton from '../toolbar/buttons/repl/ReplButton';
import RunButton from '../toolbar/buttons/run/RunButton';
import StopButton from '../toolbar/buttons/stop/StopButton';
import UsbButton from '../toolbar/buttons/usb/UsbButton';
import Tour from '../tour/Tour';

const noFiles: readonly FileMetadata[] = [];
const starterCode = `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port, Direction, Color
from pybricks.tools import wait

hub = PrimeHub()
left_motor = Motor(Port.A, Direction.COUNTERCLOCKWISE)
right_motor = Motor(Port.B)

hub.light.on(Color.GREEN)
left_motor.run_angle(500, 360)
right_motor.run_angle(500, 360)
wait(500)
hub.light.off()
`;

const docsSections = [
    'Getting Started',
    'Pybricks Hubs',
    'Powered Up Devices',
    'Parameters',
    'Tools',
    'Robotics',
    'I/O Devices',
    'Media',
    'NXT Devices',
] as const;

const docsContent: Record<(typeof docsSections)[number], readonly string[]> = {
    'Getting Started': [
        'Install Pybricks firmware on a compatible hub, connect by USB or Bluetooth, then run MicroPython code directly on the hub.',
        'Programs use imports from pybricks.hubs, pybricks.pupdevices, pybricks.parameters, and pybricks.tools.',
    ],
    'Pybricks Hubs': [
        'PrimeHub gives access to the light, speaker, IMU, display, buttons, battery, and system controls.',
    ],
    'Powered Up Devices': [
        'Use Motor, ColorSensor, UltrasonicSensor, ForceSensor, and other Powered Up devices from pybricks.pupdevices.',
    ],
    Parameters: [
        'Port, Direction, Stop, Color, Button, Icon, and Side are shared parameter enums used throughout Pybricks APIs.',
    ],
    Tools: [
        'wait, StopWatch, DataLog, Matrix, multitask, and run_task support timing, data, and async program structure.',
    ],
    Robotics: [
        'DriveBase combines two motors into a robot drivetrain with straight, turn, drive, and settings helpers.',
    ],
    'I/O Devices': [
        'Control LUMP devices and hubs with lower-level I/O APIs when you need direct device access.',
    ],
    Media: [
        'Use built-in sounds, images, fonts, and icons for hub feedback where supported.',
    ],
    'NXT Devices': [
        'Pybricks includes support for selected NXT motors and sensors on compatible ports.',
    ],
};

const Editor = React.lazy(async () => {
    const [sagaModule, componentModule] = await Promise.all([
        import('../editor/sagas'),
        import('../editor/Editor'),
    ]);

    window.dispatchEvent(
        new CustomEvent('pb-lazy-saga', { detail: { saga: sagaModule.default } }),
    );

    return componentModule;
});

const Terminal = React.lazy(async () => {
    const [sagaModule, componentModule] = await Promise.all([
        import('../terminal/sagas'),
        import('../terminal/Terminal'),
    ]);

    window.dispatchEvent(
        new CustomEvent('pb-lazy-saga', { detail: { saga: sagaModule.default } }),
    );

    return componentModule;
});

function createShellFileName(files: readonly FileMetadata[]): string {
    const names = new Set(files.map((file) => file.path));

    for (let index = 1; index < 1000; index += 1) {
        const fileName = `Project ${index}.py`;

        if (!names.has(fileName)) {
            return fileName;
        }
    }

    return `Project ${Date.now()}.py`;
}

function sendEditorCommand(command: string): void {
    window.dispatchEvent(new CustomEvent('pb-editor-command', { detail: { command } }));
}

function setEditorFontSize(fontSize: number): void {
    window.dispatchEvent(
        new CustomEvent('pb-editor-font-size', { detail: { fontSize } }),
    );
}

type TopBarProps = Readonly<{
    activeFileName: string;
    isMenuOpen: boolean;
    onCloseProject: () => void;
    onCreateProject: () => void;
    onDuplicateProject: () => void;
    onHome: () => void;
    onSave: () => void;
    onToggleMenu: () => void;
}>;

const TopBar: React.FunctionComponent<TopBarProps> = ({
    activeFileName,
    isMenuOpen,
    onCloseProject,
    onCreateProject,
    onDuplicateProject,
    onHome,
    onSave,
    onToggleMenu,
}) => (
    <header className="pb-spike-topbar">
        <div className="pb-spike-top-left">
            <button type="button" aria-label="Home" onClick={onHome}>
                <Home />
            </button>
            <button type="button" aria-label="Save" onClick={onSave}>
                <FloppyDisk />
            </button>
            <div className="pb-spike-project-tab">
                <span>{activeFileName}</span>
                <button type="button" aria-label="Project menu" onClick={onToggleMenu}>
                    <More />
                </button>
                <button
                    type="button"
                    aria-label="Close project"
                    onClick={onCloseProject}
                >
                    <Cross />
                </button>
                {isMenuOpen && (
                    <div className="pb-spike-project-menu">
                        <button type="button" onClick={onDuplicateProject}>
                            Duplicate project
                        </button>
                        <button type="button" onClick={onCloseProject}>
                            Close project
                        </button>
                    </div>
                )}
            </div>
        </div>
        <button
            type="button"
            aria-label="New project"
            className="pb-spike-plus"
            onClick={onCreateProject}
        >
            <Plus />
        </button>
    </header>
);

const ConnectBubble: React.FunctionComponent = () => (
    <div className="pb-spike-connect">
        <UtilsToolbar
            aria-label="Connect hub"
            className="pb-spike-connect-toolbar"
            firstFocusableItemId="pb-spike-usb-button"
        >
            <UsbButton id="pb-spike-usb-button" />
            <BluetoothButton id="pb-spike-bluetooth-button" />
        </UtilsToolbar>
        <span>Connect</span>
    </div>
);

const KnowledgeBase: React.FunctionComponent<
    Readonly<{
        activeSection: (typeof docsSections)[number];
        isSearchOpen: boolean;
        onSelectSection: (section: (typeof docsSections)[number]) => void;
        onToggleSearch: () => void;
        onToggleSort: () => void;
        search: string;
        sections: readonly (typeof docsSections)[number][];
        setSearch: (value: string) => void;
    }>
> = ({
    activeSection,
    isSearchOpen,
    onSelectSection,
    onToggleSearch,
    onToggleSort,
    search,
    sections,
    setSearch,
}) => (
    <aside className="pb-spike-knowledge" aria-label="Knowledge Base">
        <div className="pb-spike-knowledge-title">
            <Document />
            <strong>Knowledge Base</strong>
        </div>
        <div className="pb-spike-knowledge-tools">
            {isSearchOpen && (
                <InputGroup
                    small
                    value={search}
                    placeholder="Search docs"
                    onChange={(event) => setSearch(event.currentTarget.value)}
                />
            )}
            <button type="button" aria-label="Search docs" onClick={onToggleSearch}>
                <Search />
            </button>
            <button type="button" aria-label="Sort docs" onClick={onToggleSort}>
                | z
            </button>
        </div>
        <nav aria-label="Pybricks documentation sections">
            {sections.map((section) => (
                <button
                    type="button"
                    key={section}
                    className={section === activeSection ? 'pb-active' : undefined}
                    onClick={() => onSelectSection(section)}
                >
                    <span>{section}</span>
                    <ChevronRight />
                </button>
            ))}
        </nav>
        <section className="pb-spike-doc-detail">
            <h2>{activeSection}</h2>
            {docsContent[activeSection].map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
            ))}
        </section>
    </aside>
);

const StarterCodePreview: React.FunctionComponent<{ fontSize: number }> = ({
    fontSize,
}) => {
    const activeFile = useSelector((s) => s.editor.activeFileUuid);

    if (activeFile) {
        return null;
    }

    return (
        <pre
            className="pb-spike-starter-code"
            aria-label="Pybricks starter code"
            style={{ fontSize }}
        >
            {starterCode}
        </pre>
    );
};

const LibraryPanel: React.FunctionComponent<{
    files: readonly FileMetadata[];
    onOpenFile: (file: FileMetadata) => void;
}> = ({ files, onOpenFile }) => (
    <div className="pb-spike-library-panel">
        <strong>Pybricks Libraries</strong>
        {docsSections.map((section) => (
            <button type="button" key={section}>
                {section}
            </button>
        ))}
        <strong>Projects</strong>
        {files.length === 0 ? (
            <span>No saved projects yet.</span>
        ) : (
            files.slice(0, 6).map((file) => (
                <button type="button" key={file.uuid} onClick={() => onOpenFile(file)}>
                    {file.path}
                </button>
            ))
        )}
    </div>
);

const BottomControls: React.FunctionComponent<
    Readonly<{
        files: readonly FileMetadata[];
        isLibraryOpen: boolean;
        onBack: () => void;
        onFullscreen: () => void;
        onOpenFile: (file: FileMetadata) => void;
        onRedo: () => void;
        onToggleLibrary: () => void;
        onUndo: () => void;
        onZoomIn: () => void;
        onZoomOut: () => void;
    }>
> = ({
    files,
    isLibraryOpen,
    onBack,
    onFullscreen,
    onOpenFile,
    onRedo,
    onToggleLibrary,
    onUndo,
    onZoomIn,
    onZoomOut,
}) => (
    <div className="pb-spike-bottom-controls">
        <div className="pb-spike-view-tools">
            <button type="button" aria-label="Fullscreen" onClick={onFullscreen}>
                <Fullscreen />
            </button>
            <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
                <Minus />
            </button>
            <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
                <Plus />
            </button>
            <span />
            <button
                type="button"
                aria-label="Undo"
                className="pb-muted"
                onClick={onUndo}
            >
                U
            </button>
            <button
                type="button"
                aria-label="Redo"
                className="pb-muted"
                onClick={onRedo}
            >
                R
            </button>
            <span />
            <button
                type="button"
                aria-label="Back"
                className="pb-muted"
                onClick={onBack}
            >
                &lt;
            </button>
        </div>
        <div className="pb-spike-run-dock">
            {isLibraryOpen && <LibraryPanel files={files} onOpenFile={onOpenFile} />}
            <button
                type="button"
                aria-label="Libraries"
                className="pb-spike-library"
                onClick={onToggleLibrary}
            >
                <Th />
                <ChevronRight />
            </button>
            <UtilsToolbar
                aria-label="Program controls"
                className="pb-spike-run-controls"
                firstFocusableItemId="pb-spike-stop-button"
            >
                <StopButton id="pb-spike-stop-button" />
                <RunButton id="pb-spike-run-button" />
                <ReplButton id="pb-spike-repl-button" />
                <AiAssistant />
            </UtilsToolbar>
        </div>
    </div>
);

const SpikeConsole: React.FunctionComponent<{
    clearKey: number;
    isOpen: boolean;
    onClear: () => void;
    onToggle: () => void;
}> = ({ clearKey, isOpen, onClear, onToggle }) => (
    <aside className="pb-spike-console" aria-label="Console">
        <div className="pb-spike-console-tab">
            <span className="pb-spike-console-icon" aria-hidden="true">
                &gt;_
            </span>
            <strong>Console</strong>
            <Button
                minimal
                small
                icon={<Trash />}
                aria-label="Clear console"
                onClick={onClear}
            />
        </div>
        <button
            type="button"
            className="pb-spike-console-handle"
            onClick={onToggle}
            aria-label={isOpen ? 'Collapse console' : 'Expand console'}
        >
            <Menu />
        </button>
        {isOpen && (
            <React.Suspense fallback={<Spinner className="pb-spike-fill" />}>
                <Terminal key={clearKey} />
            </React.Suspense>
        )}
    </aside>
);

const SpikePrimeApp: React.FunctionComponent = () => {
    const dispatch = useDispatch();
    const { isDarkMode } = useTernaryDarkMode();
    const files = useFileStorageMetadata() ?? noFiles;
    const activeFile = useSelector((s) => s.editor.activeFileUuid);
    const [consoleClearKey, setConsoleClearKey] = useState(0);
    const [consoleOpen, setConsoleOpen] = useState(true);
    const [docsSection, setDocsSection] =
        useState<(typeof docsSections)[number]>('Getting Started');
    const [fontSize, setFontSize] = useState(14);
    const [isDocsAscending, setIsDocsAscending] = useState(true);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [pendingOpenPath, setPendingOpenPath] = useState<string>();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');

    const activeFileName = useMemo(() => {
        const file = files.find((candidate) => candidate.uuid === activeFile);

        return file?.path ?? 'Project 1*';
    }, [activeFile, files]);

    const filteredSections = useMemo(() => {
        const query = search.trim().toLowerCase();
        const sections = query
            ? docsSections.filter((section) => section.toLowerCase().includes(query))
            : [...docsSections];

        return isDocsAscending ? sections : [...sections].reverse();
    }, [isDocsAscending, search]);

    const openFile = useCallback(
        (file: FileMetadata) => {
            dispatch(explorerUserActivateFile(file.path, file.uuid));
            setStatus(`Opened ${file.path}.`);
        },
        [dispatch],
    );

    const createProject = useCallback(() => {
        const fileName = createShellFileName(files);

        setPendingOpenPath(fileName);
        dispatch(fileStorageWriteFile(fileName, starterCode));
        setStatus(`Created ${fileName}.`);
    }, [dispatch, files]);

    useEffect(() => {
        if (!pendingOpenPath) {
            return;
        }

        const file = files.find((candidate) => candidate.path === pendingOpenPath);

        if (file) {
            openFile(file);
            setPendingOpenPath(undefined);
        }
    }, [files, openFile, pendingOpenPath]);

    const duplicateProject = useCallback(() => {
        const fileName = createShellFileName(files);

        setPendingOpenPath(fileName);
        dispatch(fileStorageWriteFile(fileName, starterCode));
        setIsProjectMenuOpen(false);
        setStatus(`Duplicated ${activeFileName} as ${fileName}.`);
    }, [activeFileName, dispatch, files]);

    const closeProject = useCallback(() => {
        if (activeFile) {
            dispatch(editorCloseFile(activeFile));
            setStatus(`Closed ${activeFileName}.`);
        } else {
            setStatus('No project is open.');
        }

        setIsProjectMenuOpen(false);
    }, [activeFile, activeFileName, dispatch]);

    const zoom = useCallback(
        (delta: number) => {
            const nextFontSize = Math.min(24, Math.max(10, fontSize + delta));

            setFontSize(nextFontSize);
            setEditorFontSize(nextFontSize);
            setStatus(`Editor zoom set to ${nextFontSize}px.`);
        },
        [fontSize],
    );

    useEffect(() => {
        if (!isDarkMode) {
            return;
        }

        document.body.classList.add(Classes.DARK);
        return () => document.body.classList.remove(Classes.DARK);
    }, [isDarkMode]);

    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            if (e.ctrlKey && ['d', 'n', 's', 'w'].includes(e.key)) {
                e.preventDefault();
            }
        };

        addEventListener('keydown', listener);
        return () => removeEventListener('keydown', listener);
    }, []);

    return (
        <div className="pb-spike-app" onContextMenu={(e) => e.preventDefault()}>
            <TopBar
                activeFileName={activeFileName}
                isMenuOpen={isProjectMenuOpen}
                onCloseProject={closeProject}
                onCreateProject={createProject}
                onDuplicateProject={duplicateProject}
                onHome={() => {
                    window.location.href = '/';
                }}
                onSave={() => setStatus('Saved. Pybricks files auto-save locally.')}
                onToggleMenu={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
            />
            <main className="pb-spike-stage" aria-label="SPIKE-style Pybricks editor">
                <ConnectBubble />
                <div className="pb-spike-editor-pane">
                    <React.Suspense fallback={<Spinner className="pb-spike-fill" />}>
                        <Editor />
                    </React.Suspense>
                    <StarterCodePreview fontSize={fontSize} />
                </div>
                <KnowledgeBase
                    activeSection={docsSection}
                    isSearchOpen={isSearchOpen}
                    onSelectSection={(section) => {
                        setDocsSection(section);
                        setStatus(`Opened ${section}.`);
                    }}
                    onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
                    onToggleSort={() => setIsDocsAscending(!isDocsAscending)}
                    search={search}
                    sections={filteredSections}
                    setSearch={setSearch}
                />
                <SplitterLayout
                    vertical={true}
                    percentage={true}
                    secondaryInitialSize={consoleOpen ? 25 : 7}
                >
                    <div className="pb-spike-stage-spacer" />
                    <SpikeConsole
                        clearKey={consoleClearKey}
                        isOpen={consoleOpen}
                        onClear={() => {
                            window.dispatchEvent(new Event('pb-terminal-clear'));
                            setConsoleClearKey((key) => key + 1);
                            setStatus('Console cleared.');
                        }}
                        onToggle={() => setConsoleOpen(!consoleOpen)}
                    />
                </SplitterLayout>
            </main>
            {status && <div className="pb-spike-status">{status}</div>}
            <BottomControls
                files={files}
                isLibraryOpen={isLibraryOpen}
                onBack={() => {
                    setIsLibraryOpen(false);
                    setIsSearchOpen(false);
                    sendEditorCommand('focus');
                    setStatus('Returned to the editor.');
                }}
                onFullscreen={() => {
                    document.documentElement.requestFullscreen?.();
                    setStatus('Fullscreen requested.');
                }}
                onOpenFile={openFile}
                onRedo={() => {
                    sendEditorCommand('redo');
                    setStatus('Redo sent to editor.');
                }}
                onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
                onUndo={() => {
                    sendEditorCommand('undo');
                    setStatus('Undo sent to editor.');
                }}
                onZoomIn={() => zoom(1)}
                onZoomOut={() => zoom(-1)}
            />
            <StatusBar />
            <Tour />
            <DfuWindowsDriverInstallDialog />
            <InstallPybricksDialog />
            <RestoreOfficialDialog />
        </div>
    );
};

export default SpikePrimeApp;
