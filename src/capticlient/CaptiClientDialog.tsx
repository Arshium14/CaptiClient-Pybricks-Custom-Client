// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import { Classes, Dialog } from '@blueprintjs/core';
import { InfoSign } from '@blueprintjs/icons';
import classNames from 'classnames';
import React from 'react';
import ExternalLinkIcon from '../components/ExternalLinkIcon';

type CaptiClientDialogProps = Readonly<{
    isOpen: boolean;
    onClose: () => void;
}>;

const CaptiClientDialog: React.FunctionComponent<CaptiClientDialogProps> = ({
    isOpen,
    onClose,
}) => (
    <Dialog
        className="pb-capticlient-dialog"
        title="About CaptiClient"
        icon={<InfoSign />}
        isOpen={isOpen}
        onClose={onClose}
    >
        <div className={classNames(Classes.DIALOG_BODY, Classes.RUNNING_TEXT)}>
            <h4>What CaptiClient is</h4>
            <p>
                CaptiClient is a customized learning and collaboration interface built
                from the open-source Pybricks Code app. It keeps the Pybricks
                MicroPython workflow, then adds a restyled interface, Home, room-based
                co-op programs, Jerry AI, and hosted co-op deployment support.
            </p>

            <h4>Relationship to Pybricks</h4>
            <p>
                CaptiClient is not an official Pybricks product and is not sponsored,
                authorized, or endorsed by the Pybricks project. Pybricks firmware,
                documentation, APIs, names, and original app code remain the work of
                their respective authors and maintainers.
            </p>

            <h4>License and notices</h4>
            <p>
                Pybricks Code is distributed under the MIT License. CaptiClient keeps
                the required copyright and license notices from the original project.
                The software is provided as-is, without warranty, under the terms of
                that license.
            </p>

            <h4>Where to go</h4>
            <p>
                Use{' '}
                <a href="https://pybricks.com" target="_blank" rel="noopener">
                    pybricks.com
                </a>
                <ExternalLinkIcon /> and the official Pybricks repositories for upstream
                firmware, documentation, and support. Use CaptiClient-specific channels
                for changes to this customized interface.
            </p>
        </div>
    </Dialog>
);

export default CaptiClientDialog;
