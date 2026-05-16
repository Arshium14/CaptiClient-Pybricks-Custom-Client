// SPDX-License-Identifier: MIT
// Copyright (c) 2020-2025 The Pybricks Authors

import { ButtonGroup } from '@blueprintjs/core';
import React, { useState } from 'react';
import { useId } from 'react-aria';
import AiAssistant from '../ai/AiAssistant';
import CaptiClientDialog from '../capticlient/CaptiClientDialog';
import { Toolbar as UtilsToolbar } from '../components/toolbar/Toolbar';
import BluetoothButton from './buttons/bluetooth/BluetoothButton';
import CaptiClientButton from './buttons/capticlient/CaptiClientButton';
import ReplButton from './buttons/repl/ReplButton';
import RunButton from './buttons/run/RunButton';
import SponsorButton from './buttons/sponsor/SponsorButton';
import StopButton from './buttons/stop/StopButton';
import UsbButton from './buttons/usb/UsbButton';
import { useI18n } from './i18n';

import './toolbar.scss';

// matches ID in tour component
const usbButtonId = 'pb-toolbar-usb-button';
const bluetoothButtonId = 'pb-toolbar-bluetooth-button';
const runButtonId = 'pb-toolbar-run-button';
const sponsorButtonId = 'pb-toolbar-sponsor-button';
const captiClientButtonId = 'pb-toolbar-capticlient-button';

const Toolbar: React.FunctionComponent = () => {
    const i18n = useI18n();
    const [isCaptiClientDialogOpen, setIsCaptiClientDialogOpen] = useState(false);
    const stopButtonId = useId();
    const replButtonId = useId();

    return (
        <>
            <UtilsToolbar
                aria-label={i18n.translate('label')}
                className="pb-toolbar"
                firstFocusableItemId={bluetoothButtonId}
            >
                <ButtonGroup className="pb-toolbar-group pb-align-left">
                    <UsbButton id={usbButtonId} />
                    <BluetoothButton id={bluetoothButtonId} />
                </ButtonGroup>
                <ButtonGroup className="pb-toolbar-group pb-align-left">
                    <RunButton id={runButtonId} />
                    <StopButton id={stopButtonId} />
                    <ReplButton id={replButtonId} />
                </ButtonGroup>
                <div className="pb-toolbar-wordmark" aria-hidden="true">
                    CAPTICLIENT
                </div>
                <AiAssistant />
                <ButtonGroup className="pb-toolbar-group pb-align-right">
                    <CaptiClientButton
                        id={captiClientButtonId}
                        onAction={() => setIsCaptiClientDialogOpen(true)}
                    />
                    <SponsorButton id={sponsorButtonId} />
                </ButtonGroup>
            </UtilsToolbar>
            <CaptiClientDialog
                isOpen={isCaptiClientDialogOpen}
                onClose={() => setIsCaptiClientDialogOpen(false)}
            />
        </>
    );
};

export default Toolbar;
