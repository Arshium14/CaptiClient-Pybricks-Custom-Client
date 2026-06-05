// SPDX-License-Identifier: MIT
// Copyright (c) 2020-2026 The Pybricks Authors

import './editor.scss';
import {
    Button,
    Classes,
    ContextMenu,
    HTMLSelect,
    Menu,
    MenuDivider,
    MenuItem,
    OverlayLifecycleProps,
    ResizeSensor,
    Tab,
    TabId,
    Tabs,
    Text,
} from '@blueprintjs/core';
import { Blank, Clipboard, Cross, Duplicate, Redo, Undo } from '@blueprintjs/icons';
import classNames from 'classnames';
import * as monaco from 'monaco-editor';
import tomorrowNightEightiesTheme from 'monaco-themes/themes/Tomorrow-Night-Eighties.json';
import xcodeTheme from 'monaco-themes/themes/Xcode_default.json';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useId } from 'react-aria';
import { useDispatch } from 'react-redux';
import { useEffectOnce, useTernaryDarkMode } from 'usehooks-ts';
import {
    AiEditorCodeRequestPayload,
    AiInsertCodePayload,
    aiInsertCodeEvent,
    aiRequestEditorCodeEvent,
} from '../ai/events';
import { CoopStatusUpdate, startCoopSession } from '../coop/collaboration';
import {
    CoopRoomPayload,
    coopRoomChangedEvent,
    getCoopProgramId,
    getCoopRoomId,
    isCoopProgramFilePath,
} from '../coop/events';
import { UUID } from '../fileStorage';
import { useFileStoragePath } from '../fileStorage/hooks';
import { compile } from '../mpy/actions';
import { useSelector } from '../reducers';
import { isMacOS } from '../utils/os';
import Welcome from './Welcome';
import { editorActivateFile, editorCloseFile } from './actions';
import { useI18n } from './i18n';
import * as pybricksMicroPython from './pybricksMicroPython';
import { pybricksMicroPythonId } from './pybricksMicroPython';
import { UntitledHintContribution } from './untitledHint';

monaco.languages.register({ id: pybricksMicroPythonId });

const toDispose = new Array<monaco.IDisposable>();
toDispose.push(
    monaco.languages.setLanguageConfiguration(
        pybricksMicroPythonId,
        pybricksMicroPython.conf,
    ),
    monaco.languages.setMonarchTokensProvider(
        pybricksMicroPythonId,
        pybricksMicroPython.language,
    ),
    monaco.languages.registerCompletionItemProvider(
        pybricksMicroPythonId,
        pybricksMicroPython.templateSnippetCompletions,
    ),
);

// https://webpack.js.org/api/hot-module-replacement/
// istanbul ignore if: only used for development
if (module.hot) {
    module.hot.dispose(() => {
        toDispose.forEach((s) => s.dispose());
    });
}

const editorThemeStorageKey = 'capticlient.editor.palette';
const pybricksDefaultPaletteId = 'pybricks-default';
const pybricksDefaultLightId = 'pybricks-default-light';
const pybricksDefaultDarkId = 'pybricks-default-dark';

monaco.editor.defineTheme(
    pybricksDefaultLightId,
    xcodeTheme as monaco.editor.IStandaloneThemeData,
);
monaco.editor.defineTheme(
    pybricksDefaultDarkId,
    tomorrowNightEightiesTheme as monaco.editor.IStandaloneThemeData,
);

type EditorPalette = Readonly<{
    id: string;
    label: string;
    light: PaletteColors;
    dark: PaletteColors;
}>;

type PaletteColors = Readonly<{
    background: string;
    foreground: string;
    keyword: string;
    module: string;
    function: string;
    constant: string;
    number: string;
    string: string;
    escape: string;
    comment: string;
    lineNumber: string;
    activeLineNumber: string;
    selection: string;
    inactiveSelection: string;
    lineHighlight: string;
    indent: string;
    ruler: string;
    bracket1: string;
    bracket2: string;
    bracket3: string;
}>;

const editorPalettes: readonly EditorPalette[] = [
    {
        id: pybricksDefaultPaletteId,
        label: 'Pybricks Default',
        light: {
            background: 'FFFFFF',
            foreground: '000000',
            keyword: 'A90D91',
            module: '1C00CF',
            function: '3F6E75',
            constant: '1C00CF',
            number: '1C00CF',
            string: 'C41A16',
            escape: 'C41A16',
            comment: '008000',
            lineNumber: '237893',
            activeLineNumber: '000000',
            selection: 'B5D5FF',
            inactiveSelection: 'B5D5FF66',
            lineHighlight: '00000000',
            indent: 'D3D3D3',
            ruler: 'D3D3D3',
            bracket1: '0431FA',
            bracket2: '319331',
            bracket3: '7B3814',
        },
        dark: {
            background: '2D2D2D',
            foreground: 'CCCCCC',
            keyword: 'CC99CC',
            module: '6699CC',
            function: 'F99157',
            constant: '99CC99',
            number: 'F99157',
            string: '99CC99',
            escape: 'F99157',
            comment: '999999',
            lineNumber: '999999',
            activeLineNumber: 'CCCCCC',
            selection: '515151',
            inactiveSelection: '51515188',
            lineHighlight: '393939',
            indent: '515151',
            ruler: '515151',
            bracket1: 'FFD700',
            bracket2: 'DA70D6',
            bracket3: '179FFF',
        },
    },
    {
        id: 'capticlient-mint',
        label: 'CaptiClient Mint',
        light: {
            background: 'F8FFF0',
            foreground: '594F4F',
            keyword: '45ADA8',
            module: '547980',
            function: '45ADA8',
            constant: '594F4F',
            number: '547980',
            string: '45ADA8',
            escape: '9DE0AD',
            comment: '547980',
            lineNumber: '8FA5A6',
            activeLineNumber: '45ADA8',
            selection: '9DE0AD66',
            inactiveSelection: '9DE0AD33',
            lineHighlight: 'E5FCC280',
            indent: '54798029',
            ruler: '5479802E',
            bracket1: '45ADA8',
            bracket2: '9DE0AD',
            bracket3: '594F4F',
        },
        dark: {
            background: '332D2D',
            foreground: 'E5FCC2',
            keyword: '9DE0AD',
            module: '45ADA8',
            function: '9DE0AD',
            constant: '9DE0AD',
            number: '9DE0AD',
            string: '45ADA8',
            escape: 'E5FCC2',
            comment: '9DE0AD',
            lineNumber: '91A5A2',
            activeLineNumber: '9DE0AD',
            selection: '45ADA866',
            inactiveSelection: '45ADA833',
            lineHighlight: '54798040',
            indent: '9DE0AD24',
            ruler: '9DE0AD26',
            bracket1: '9DE0AD',
            bracket2: '45ADA8',
            bracket3: 'E5FCC2',
        },
    },
    {
        id: 'harbor-sunset',
        label: 'Retro Sunset',
        light: {
            background: 'FBF8F2',
            foreground: '455054',
            keyword: 'D45769',
            module: '308695',
            function: '308695',
            constant: 'E69D45',
            number: 'E69D45',
            string: 'D45769',
            escape: 'E69D45',
            comment: '7F8A87',
            lineNumber: '9AA39F',
            activeLineNumber: '308695',
            selection: '3086954D',
            inactiveSelection: '30869526',
            lineHighlight: 'D4CFC966',
            indent: '45505424',
            ruler: '45505424',
            bracket1: 'D45769',
            bracket2: '308695',
            bracket3: 'E69D45',
        },
        dark: {
            background: '1E282B',
            foreground: 'D4CFC9',
            keyword: 'D45769',
            module: '55B5BF',
            function: '55B5BF',
            constant: 'E69D45',
            number: 'E69D45',
            string: 'E27987',
            escape: 'E69D45',
            comment: '95A19D',
            lineNumber: '748186',
            activeLineNumber: '55B5BF',
            selection: '30869566',
            inactiveSelection: '30869533',
            lineHighlight: '45505466',
            indent: 'D4CFC924',
            ruler: 'D4CFC924',
            bracket1: 'D45769',
            bracket2: '55B5BF',
            bracket3: 'E69D45',
        },
    },
    {
        id: 'arctic-current',
        label: 'Arctic Current',
        light: {
            background: 'F2FBFF',
            foreground: '015C92',
            keyword: '015C92',
            module: '2D82B5',
            function: '2D82B5',
            constant: 'FB6602',
            number: 'FB6602',
            string: '2D82B5',
            escape: 'FB6602',
            comment: '5AA3CC',
            lineNumber: '88CDF6',
            activeLineNumber: '015C92',
            selection: '88CDF666',
            inactiveSelection: '88CDF633',
            lineHighlight: 'BCE6FF66',
            indent: '2D82B52B',
            ruler: '015C9226',
            bracket1: '015C92',
            bracket2: '2D82B5',
            bracket3: 'FB6602',
        },
        dark: {
            background: '082A3F',
            foreground: 'BCE6FF',
            keyword: '88CDF6',
            module: '56A6D2',
            function: '88CDF6',
            constant: 'FB6602',
            number: 'FB6602',
            string: 'BCE6FF',
            escape: 'FB6602',
            comment: '78B7D6',
            lineNumber: '5A91B0',
            activeLineNumber: '88CDF6',
            selection: '2D82B566',
            inactiveSelection: '2D82B533',
            lineHighlight: '015C9252',
            indent: '88CDF626',
            ruler: '88CDF624',
            bracket1: '88CDF6',
            bracket2: 'BCE6FF',
            bracket3: 'FB6602',
        },
    },
    {
        id: 'sherbet-pop',
        label: 'Fiery Sunset',
        light: {
            background: 'FFF8EB',
            foreground: '44263A',
            keyword: 'C73866',
            module: 'FE676E',
            function: 'FD8F52',
            constant: 'FD8F52',
            number: 'FD8F52',
            string: 'FE676E',
            escape: 'FFBD71',
            comment: 'B97871',
            lineNumber: 'DDA18D',
            activeLineNumber: 'C73866',
            selection: 'FE676E55',
            inactiveSelection: 'FE676E2E',
            lineHighlight: 'FFDCA266',
            indent: 'C7386628',
            ruler: 'C7386624',
            bracket1: 'C73866',
            bracket2: 'FD8F52',
            bracket3: 'FFBD71',
        },
        dark: {
            background: '2C1624',
            foreground: 'FFDCA2',
            keyword: 'FE676E',
            module: 'C73866',
            function: 'FFBD71',
            constant: 'FD8F52',
            number: 'FD8F52',
            string: 'FFDCA2',
            escape: 'FFBD71',
            comment: 'D9908F',
            lineNumber: 'A66B74',
            activeLineNumber: 'FE676E',
            selection: 'C7386666',
            inactiveSelection: 'C7386633',
            lineHighlight: '6D2B4052',
            indent: 'FE676E26',
            ruler: 'FE676E24',
            bracket1: 'FE676E',
            bracket2: 'FD8F52',
            bracket3: 'FFDCA2',
        },
    },
    {
        id: 'sage-rose',
        label: 'Sage Rose',
        light: {
            background: 'FFF7F1',
            foreground: '4F5F54',
            keyword: 'AE6378',
            module: '79616F',
            function: 'D87F81',
            constant: 'EAB595',
            number: 'D87F81',
            string: 'AE6378',
            escape: 'EAB595',
            comment: '7E9680',
            lineNumber: '9CA99D',
            activeLineNumber: 'AE6378',
            selection: 'D87F8159',
            inactiveSelection: 'D87F812E',
            lineHighlight: 'EAB59542',
            indent: '79616F28',
            ruler: '79616F24',
            bracket1: '7E9680',
            bracket2: 'AE6378',
            bracket3: 'EAB595',
        },
        dark: {
            background: '241D22',
            foreground: 'EAB595',
            keyword: 'D87F81',
            module: 'AE6378',
            function: 'EAB595',
            constant: '7E9680',
            number: 'D87F81',
            string: 'EAB595',
            escape: 'D87F81',
            comment: '9FB69F',
            lineNumber: '87727D',
            activeLineNumber: 'D87F81',
            selection: 'AE637866',
            inactiveSelection: 'AE637833',
            lineHighlight: '79616F4D',
            indent: 'EAB59524',
            ruler: 'EAB59522',
            bracket1: '7E9680',
            bracket2: 'D87F81',
            bracket3: 'EAB595',
        },
    },
    {
        id: 'kodular-berry',
        label: 'Berry Burst',
        light: {
            background: 'FFF7FC',
            foreground: '2B193D',
            keyword: 'F72585',
            module: '7209B7',
            function: '4361EE',
            constant: '3A0CA3',
            number: '3A0CA3',
            string: '4CC9F0',
            escape: 'F9C74F',
            comment: '7D6B91',
            lineNumber: 'A895B7',
            activeLineNumber: 'F72585',
            selection: 'F7258560',
            inactiveSelection: 'F725852E',
            lineHighlight: 'FCE7F3',
            indent: '7209B72B',
            ruler: '7209B726',
            bracket1: 'F72585',
            bracket2: '7209B7',
            bracket3: '4361EE',
        },
        dark: {
            background: '1B1028',
            foreground: 'FCE7F3',
            keyword: 'F72585',
            module: 'B5179E',
            function: '4CC9F0',
            constant: 'C77DFF',
            number: 'C77DFF',
            string: '80FFDB',
            escape: 'F9C74F',
            comment: 'B8A4C7',
            lineNumber: '7F6898',
            activeLineNumber: 'F72585',
            selection: 'B5179E66',
            inactiveSelection: 'B5179E33',
            lineHighlight: '2B193D',
            indent: 'F7258526',
            ruler: 'F7258524',
            bracket1: 'F72585',
            bracket2: '4CC9F0',
            bracket3: 'C77DFF',
        },
    },
];

const defaultEditorPaletteId = 'capticlient-mint';

function editorThemeId(paletteId: string, isDark: boolean): string {
    if (paletteId === pybricksDefaultPaletteId) {
        return isDark ? pybricksDefaultDarkId : pybricksDefaultLightId;
    }

    return `capticlient-${paletteId}-${isDark ? 'dark' : 'light'}`;
}

function tokenRules(colors: PaletteColors): monaco.editor.ITokenThemeRule[] {
    return [
        { token: '', foreground: colors.foreground },
        { token: 'white', foreground: colors.foreground },
        { token: 'keyword', foreground: colors.keyword, fontStyle: 'bold' },
        { token: 'support.module', foreground: colors.module, fontStyle: 'bold' },
        { token: 'support.function', foreground: colors.function },
        { token: 'support.constant', foreground: colors.constant, fontStyle: 'bold' },
        { token: 'identifier', foreground: colors.foreground },
        { token: 'constant.numeric', foreground: colors.number },
        { token: 'constant.numeric.bin', foreground: colors.number },
        { token: 'constant.numeric.oct', foreground: colors.number },
        { token: 'constant.numeric.hex', foreground: colors.number },
        { token: 'string', foreground: colors.string, fontStyle: 'bold' },
        { token: 'string.escape', foreground: colors.escape, fontStyle: 'bold' },
        { token: 'comment', foreground: colors.comment, fontStyle: 'italic' },
        { token: 'delimiter', foreground: colors.foreground },
        { token: 'delimiter.curly', foreground: colors.foreground },
        { token: 'delimiter.bracket', foreground: colors.foreground },
        { token: 'delimiter.parenthesis', foreground: colors.foreground },
        { token: 'tag', foreground: colors.function },
    ];
}

function defineEditorTheme(palette: EditorPalette, isDark: boolean): void {
    const colors = isDark ? palette.dark : palette.light;

    monaco.editor.defineTheme(editorThemeId(palette.id, isDark), {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: tokenRules(colors),
        colors: {
            'editor.background': `#${colors.background}`,
            'editor.foreground': `#${colors.foreground}`,
            'editorLineNumber.foreground': `#${colors.lineNumber}`,
            'editorLineNumber.activeForeground': `#${colors.activeLineNumber}`,
            'editorCursor.foreground': `#${colors.activeLineNumber}`,
            'editor.selectionBackground': `#${colors.selection}`,
            'editor.inactiveSelectionBackground': `#${colors.inactiveSelection}`,
            'editor.lineHighlightBackground': `#${colors.lineHighlight}`,
            'editorGutter.background': `#${colors.background}`,
            'editorIndentGuide.background': `#${colors.indent}`,
            'editorIndentGuide.activeBackground': `#${colors.activeLineNumber}`,
            'editorRuler.foreground': `#${colors.ruler}`,
            'editorBracketHighlight.foreground1': `#${colors.bracket1}`,
            'editorBracketHighlight.foreground2': `#${colors.bracket2}`,
            'editorBracketHighlight.foreground3': `#${colors.bracket3}`,
            'editorBracketHighlight.foreground4': `#${colors.bracket1}`,
            'editorBracketHighlight.foreground5': `#${colors.bracket2}`,
            'editorBracketHighlight.foreground6': `#${colors.bracket3}`,
            'editorBracketHighlight.unexpectedBracket.foreground': `#${colors.string}`,
        },
    });
}

editorPalettes.forEach((palette) => {
    if (palette.id === pybricksDefaultPaletteId) {
        return;
    }

    defineEditorTheme(palette, false);
    defineEditorTheme(palette, true);
});

function getStoredEditorPaletteId(): string {
    const storedPaletteId = localStorage.getItem(editorThemeStorageKey);

    if (storedPaletteId === 'kodular-ocean' || storedPaletteId === 'harbor-sunset') {
        return defaultEditorPaletteId;
    }

    return editorPalettes.some((palette) => palette.id === storedPaletteId)
        ? storedPaletteId ?? defaultEditorPaletteId
        : defaultEditorPaletteId;
}

type EditorContextMenuItemProps = Readonly<{
    /** The menu item label. */
    label: string;
    /** The menu item icon. */
    icon: JSX.Element;
    /** The keyboard shortcut that triggers the same action. */
    keyboardShortcut: string;
    /** Controls the menu item disabled state. */
    disabled: boolean;
    /** A reference to the editor. */
    editor: monaco.editor.IStandaloneCodeEditor | undefined;
    /** The action handler ID passed to the editor.trigger() method. */
    editorAction: string;
}>;

const EditorContextMenuItem: React.FunctionComponent<EditorContextMenuItemProps> = ({
    label,
    icon,
    keyboardShortcut,
    disabled,
    editor,
    editorAction,
}) => {
    const labelId = useId();

    return (
        <MenuItem
            role="menuitem"
            aria-labelledby={labelId}
            text={<span id={labelId}>{label}</span>}
            icon={icon}
            label={keyboardShortcut}
            disabled={disabled}
            onClick={() => {
                // have to focus first or the trigger won't work
                editor?.focus();
                editor?.trigger(null, editorAction, null);
            }}
        />
    );
};

type EditorContextMenuProps = {
    /** The editor. */
    editor: monaco.editor.IStandaloneCodeEditor | undefined;
};

const EditorContextMenu: React.FunctionComponent<EditorContextMenuProps> = ({
    editor,
}) => {
    const i18n = useI18n();
    const selection = editor?.getSelection();
    const hasSelection = selection && !selection.isEmpty();

    const model = editor?.getModel();
    const canUndo = model && model.canUndo();
    const canRedo = model && model.canRedo();

    return (
        <Menu aria-label={i18n.translate('contextMenu.label')} role="menu">
            <EditorContextMenuItem
                label={i18n.translate('copy')}
                icon={<Duplicate />}
                keyboardShortcut={isMacOS() ? 'Cmd-C' : 'Ctrl-C'}
                disabled={!hasSelection}
                editor={editor}
                editorAction="editor.action.clipboardCopyAction"
            />
            <EditorContextMenuItem
                label={i18n.translate('paste')}
                icon={<Clipboard />}
                keyboardShortcut={isMacOS() ? 'Cmd-V' : 'Ctrl-V'}
                disabled={!model}
                editor={editor}
                editorAction="editor.action.clipboardPasteAction"
            />
            <EditorContextMenuItem
                label={i18n.translate('selectAll')}
                icon={<Blank />}
                keyboardShortcut={isMacOS() ? 'Cmd-A' : 'Ctrl-A'}
                disabled={!model}
                editor={editor}
                editorAction="editor.action.selectAll"
            />
            <MenuDivider />
            <EditorContextMenuItem
                label={i18n.translate('undo')}
                icon={<Undo />}
                keyboardShortcut={isMacOS() ? 'Cmd-Z' : 'Ctrl-Z'}
                disabled={!canUndo}
                editor={editor}
                editorAction="undo"
            />
            <EditorContextMenuItem
                label={i18n.translate('redo')}
                icon={<Redo />}
                keyboardShortcut={isMacOS() ? 'Cmd-Shift-Z' : 'Ctrl-Shift-Z'}
                disabled={!canRedo}
                editor={editor}
                editorAction="redo"
            />
        </Menu>
    );
};

type FileNameProps = {
    /** The DOM ID. */
    id: string;
    /** The file UUID. */
    uuid: UUID;
    /** Called when the file name changes. */
    onNameChanged: () => void;
};

const TabLabel: React.FunctionComponent<FileNameProps> = ({
    id,
    uuid,
    onNameChanged,
}) => {
    const fileName = useFileStoragePath(uuid);

    useEffect(() => {
        onNameChanged?.();
    }, [fileName, onNameChanged]);

    return (
        <Text tagName="span" id={id} ellipsize={true}>
            {fileName}
        </Text>
    );
};

type TabCloseButtonProps = {
    /** The file UUID. */
    uuid: UUID;
};

const TabCloseButton: React.FunctionComponent<TabCloseButtonProps> = ({ uuid }) => {
    const fileName = useFileStoragePath(uuid) ?? '';
    const dispatch = useDispatch();
    const i18n = useI18n();

    return (
        <Button
            title={i18n.translate('closeFile.tooltip', {
                fileName,
            })}
            minimal={true}
            small={true}
            icon={<Cross />}
            // tabs are closed with delete button by keyboard, so
            // don't focus the close button
            tabIndex={-1}
            onFocus={(e) => e.preventDefault()}
            onClick={(e) => {
                dispatch(editorCloseFile(uuid));
                // prevent triggering Tabs onChange
                e.stopPropagation();
            }}
        />
    );
};

type EditorTabsProps = Readonly<{
    /** Called when the selected tab changes. */
    onChange?: () => void;
}>;

const EditorTabs: React.FunctionComponent<EditorTabsProps> = ({ onChange }) => {
    const openFiles = useSelector((s) => s.editor.openFileUuids);
    const activeFile = useSelector((s) => s.editor.activeFileUuid);
    const dispatch = useDispatch();

    const handleChange = useCallback(
        (newTabId: TabId) => {
            dispatch(editorActivateFile(newTabId as UUID));
            onChange?.();
        },
        [dispatch, onChange],
    );

    const labelId = useId();

    // close tab when delete key is pressed
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, uuid: UUID) => {
            if (e.key === 'Delete') {
                dispatch(editorCloseFile(uuid));
                e.preventDefault();
                e.stopPropagation();
            }
        },
        [dispatch],
    );

    // close tab when middle-clicked
    // NB: this has to be on mouse up event to prevent middle-click paste on Linux
    const handleMouseUp = useCallback(
        (e: React.MouseEvent, uuid: UUID) => {
            if (e.button === 1) {
                dispatch(editorCloseFile(uuid));
                e.preventDefault();
                e.stopPropagation();
            }
        },
        [dispatch],
    );

    const tabsRef = useRef<Tabs>(null);

    // HACK: call private Tabs method to fix selection indicator animation when
    // a file is renamed
    const handleNameChanged = useCallback(() => {
        tabsRef.current?.['moveSelectionIndicator']();
    }, [tabsRef]);

    const i18n = useI18n();

    useEffect(() => {
        // @ts-expect-error: using private property
        const tablist: HTMLDivElement = tabsRef.current?.tablistElement;

        // istanbul-ignore-if: should not happen
        if (!tablist) {
            return;
        }

        tablist.setAttribute('aria-label', i18n.translate('tablist.label'));
    }, [i18n]);

    return (
        <Tabs
            className="pb-editor-tablist"
            selectedTabId={activeFile || undefined}
            ref={tabsRef}
            onChange={handleChange}
        >
            {openFiles.map((uuid) => (
                <Tab
                    className="pb-editor-tablist-tab"
                    aria-labelledby={`${labelId}.${uuid}`}
                    key={uuid}
                    id={uuid}
                    onKeyDown={(e) => handleKeyDown(e, uuid)}
                    onMouseUp={(e) => handleMouseUp(e, uuid)}
                >
                    <TabLabel
                        id={`${labelId}.${uuid}`}
                        uuid={uuid}
                        onNameChanged={handleNameChanged}
                    />
                    <TabCloseButton uuid={uuid} />
                </Tab>
            ))}
        </Tabs>
    );
};

type EditorPaletteSelectProps = Readonly<{
    paletteId: string;
    onChange: (paletteId: string) => void;
}>;

const EditorPaletteSelect: React.FunctionComponent<EditorPaletteSelectProps> = ({
    paletteId,
    onChange,
}) => {
    return (
        <div className="pb-editor-palette">
            <HTMLSelect
                aria-label="Editor color palette"
                minimal={true}
                value={paletteId}
                onChange={(event) => onChange(event.currentTarget.value)}
            >
                {editorPalettes.map((palette) => (
                    <option key={palette.id} value={palette.id}>
                        {palette.label}
                    </option>
                ))}
            </HTMLSelect>
        </div>
    );
};

const CoopBar: React.FunctionComponent<
    Readonly<{ roomId: string; update: CoopStatusUpdate }>
> = ({ roomId, update }) => (
    <div className={`pb-editor-coop-bar pb-${update.status}`}>
        <div>
            <strong>Co-op {roomId}</strong>
            <span>{update.status}</span>
        </div>
        <div className="pb-editor-coop-users">
            {update.users.map((user) => (
                <span
                    key={user.clientId}
                    style={
                        { '--pb-coop-user-color': user.color } as React.CSSProperties
                    }
                >
                    {user.name}
                </span>
            ))}
        </div>
    </div>
);

/**
 * Wrapper around useEffect() hook that uses {@link maybeEditor}.
 * @param maybeEditor The editor or undefined if the editor is not mounted.
 * @param callback The callback to call when editor is defined and when {@link deps} change.
 * @param deps Additional dependencies used in the {@link callback}.
 */
function useEditor(
    maybeEditor: monaco.editor.IStandaloneCodeEditor | undefined,
    callback: (
        editor: monaco.editor.IStandaloneCodeEditor,
    ) => ReturnType<React.EffectCallback>,
    deps: React.DependencyList,
): void {
    useEffect(() => {
        if (!maybeEditor) {
            return;
        }

        return callback(maybeEditor);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [maybeEditor, callback, ...deps]);
}

/**
 * Hook for adding actions to the editor.
 * @param maybeEditor The editor or undefined if the editor is not mounted.
 * @param createAction A callback to create a new action.
 * @param deps Additional dependencies used in {@link createAction}.
 */
function useEditorAction(
    maybeEditor: monaco.editor.IStandaloneCodeEditor | undefined,
    createAction: () => monaco.editor.IActionDescriptor,
    deps: React.DependencyList,
): void {
    useEditor(
        maybeEditor,
        (editor) => {
            const subscription = editor.addAction(createAction());
            return () => subscription.dispose();
        },
        deps,
    );
}

const Editor: React.FunctionComponent = () => {
    const dispatch = useDispatch();

    const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();
    const [coopRoomId, setCoopRoomId] = useState(() => getCoopRoomId());
    const [coopProgramId, setCoopProgramId] = useState(() => getCoopProgramId());
    const [coopUpdate, setCoopUpdate] = useState<CoopStatusUpdate>();
    const [editorPaletteId, setEditorPaletteId] = useState(getStoredEditorPaletteId);
    const { isDarkMode } = useTernaryDarkMode();

    const i18n = useI18n();

    useEffect(() => {
        monaco.editor.setTheme(editorThemeId(editorPaletteId, isDarkMode));
        monaco.editor.remeasureFonts();
        localStorage.setItem(editorThemeStorageKey, editorPaletteId);
    }, [editorPaletteId, isDarkMode]);

    useEditor(
        editor,
        (editor) => {
            const contrib = new UntitledHintContribution(
                editor,
                i18n.translate('placeholder'),
            );
            return () => contrib.dispose();
        },
        [i18n],
    );

    useEditorAction(
        editor,
        () => ({
            id: 'pybricks.action.check',
            label: i18n.translate('check'),
            run: (e) => {
                // for checking, use the most recent compiler
                dispatch(compile(e.getValue(), 6, []));
            },
            keybindings: [monaco.KeyCode.F2],
        }),
        [i18n, dispatch],
    );

    useEditorAction(
        editor,
        () => ({
            id: 'pybricks.action.save',
            label: 'Unused',
            run: () => {
                // We already automatically save the file after every change,
                // so CTRL+S is ignored
                console.debug('Ctrl-S ignored');
            },
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        }),
        [],
    );

    const popoverProps = useMemo<OverlayLifecycleProps>(
        () => ({
            onOpened: (e) => {
                // a11y: focus the first item in the menu when the menu opens
                const menuItems = e.getElementsByClassName(Classes.MENU_ITEM);

                const firstItem = menuItems.item(0);

                // istanbul ignore if: should not be reachable
                if (!(firstItem instanceof HTMLElement)) {
                    console.error(`bug: firstItem is not an HTMLElement: ${firstItem}`);
                    return;
                }

                firstItem.focus();
            },
            onClosed: () => editor?.focus(),
        }),
        [editor],
    );

    const editorRef = useRef<HTMLDivElement>(null);

    useEffectOnce(() => {
        // istanbul ignore if: should never happen
        if (!editorRef.current) {
            console.error('no editorRef!');
            return;
        }

        const monacoEditor = monaco.editor.create(editorRef.current, {
            model: null,
            fontFamily: '"Google Sans Code", Consolas, monospace',
            fontSize: 18,
            minimap: { enabled: false },
            contextmenu: false,
            rulers: [80],
            lineNumbersMinChars: 4,
            wordBasedSuggestions: 'off',
            selectionClipboard: false, // don't copy selection on Linux
        });

        monacoEditor.focus();
        setEditor(monacoEditor);

        return () => {
            setEditor(undefined);
            monacoEditor.dispose();
        };
    });

    const isEmpty = useSelector((s) => s.editor.openFileUuids.length === 0);
    const { activeFileUuid } = useSelector((s) => s.editor);
    const fileName = useFileStoragePath(activeFileUuid ?? ('' as UUID));

    useEffect(() => {
        if (!editor || isEmpty) {
            return undefined;
        }

        const handle = requestAnimationFrame(() => {
            editor.layout();
            editor.render(true);
        });

        return () => cancelAnimationFrame(handle);
    }, [activeFileUuid, editor, editorPaletteId, isDarkMode, isEmpty]);

    useEffect(() => {
        const handleRoomChanged = (event: Event): void => {
            const payload = (event as CustomEvent<CoopRoomPayload>).detail;

            setCoopRoomId(payload.roomId ?? getCoopRoomId());
            setCoopProgramId(payload.programId ?? getCoopProgramId());
        };

        window.addEventListener(coopRoomChangedEvent, handleRoomChanged);
        window.addEventListener('popstate', handleRoomChanged);

        return () => {
            window.removeEventListener(coopRoomChangedEvent, handleRoomChanged);
            window.removeEventListener('popstate', handleRoomChanged);
        };
    }, []);

    useEffect(() => {
        const model = editor?.getModel();

        if (
            !editor ||
            !model ||
            !activeFileUuid ||
            model.uri.path !== activeFileUuid ||
            !coopRoomId ||
            !coopProgramId ||
            !isCoopProgramFilePath(fileName, coopRoomId, coopProgramId)
        ) {
            setCoopUpdate(undefined);
            return undefined;
        }

        setCoopUpdate({
            status: 'connecting',
            users: [],
        });

        const session = startCoopSession(
            coopRoomId,
            coopProgramId,
            editor,
            model,
            setCoopUpdate,
        );

        return () => session.destroy();
    }, [activeFileUuid, coopProgramId, coopRoomId, editor, fileName]);

    useEffect(() => {
        if (!editor) {
            return undefined;
        }

        const handleShellCommand = (event: Event): void => {
            const { command } = (event as CustomEvent<{ command: string }>).detail;

            editor.focus();

            switch (command) {
                case 'undo':
                    editor.trigger('spike-prime-shell', 'undo', null);
                    break;
                case 'redo':
                    editor.trigger('spike-prime-shell', 'redo', null);
                    break;
                case 'focus':
                    editor.focus();
                    break;
                default:
                    break;
            }
        };

        const handleShellFontSize = (event: Event): void => {
            const { fontSize } = (event as CustomEvent<{ fontSize: number }>).detail;

            editor.updateOptions({ fontSize });
        };

        window.addEventListener('pb-editor-command', handleShellCommand);
        window.addEventListener('pb-editor-font-size', handleShellFontSize);
        return () => {
            window.removeEventListener('pb-editor-command', handleShellCommand);
            window.removeEventListener('pb-editor-font-size', handleShellFontSize);
        };
    }, [editor]);

    useEffect(() => {
        if (!editor) {
            return undefined;
        }

        const handleCodeRequest = (event: Event): void => {
            if (!editor.getModel()) {
                return;
            }

            const { respond } = (event as CustomEvent<AiEditorCodeRequestPayload>)
                .detail;
            respond({ code: editor.getValue(), fileName });
        };
        const handleInsertCode = (event: Event): void => {
            const model = editor.getModel();

            if (!model) {
                return;
            }

            const { code } = (event as CustomEvent<AiInsertCodePayload>).detail;
            editor.executeEdits('jerry-ai', [
                {
                    range: editor.getSelection() ?? model.getFullModelRange(),
                    text: code,
                    forceMoveMarkers: true,
                },
            ]);
            editor.focus();
        };

        window.addEventListener(aiRequestEditorCodeEvent, handleCodeRequest);
        window.addEventListener(aiInsertCodeEvent, handleInsertCode);
        return () => {
            window.removeEventListener(aiRequestEditorCodeEvent, handleCodeRequest);
            window.removeEventListener(aiInsertCodeEvent, handleInsertCode);
        };
    }, [editor, fileName]);

    return (
        <div className={classNames('pb-editor', isEmpty && 'pb-empty')}>
            <EditorTabs onChange={() => editor?.focus()} />
            {!isEmpty && (
                <EditorPaletteSelect
                    paletteId={editorPaletteId}
                    onChange={setEditorPaletteId}
                />
            )}
            {coopRoomId && coopUpdate && (
                <CoopBar roomId={coopRoomId} update={coopUpdate} />
            )}
            <ResizeSensor onResize={() => editor?.layout()}>
                <ContextMenu
                    className={classNames('pb-editor-tabpanel', isEmpty && 'pb-empty')}
                    role="tabpanel"
                    aria-label={isEmpty ? i18n.translate('welcome') : fileName}
                    // NB: we have to create a new context menu each time it is
                    // shown in order to get some state, like canUndo and canRedo
                    // that don't have events to monitor changes.
                    content={() => <EditorContextMenu editor={editor} />}
                    popoverProps={popoverProps}
                >
                    <Welcome isVisible={isEmpty} />
                    <div className="pb-editor-monaco" ref={editorRef} />
                </ContextMenu>
            </ResizeSensor>
        </div>
    );
};

export default Editor;
