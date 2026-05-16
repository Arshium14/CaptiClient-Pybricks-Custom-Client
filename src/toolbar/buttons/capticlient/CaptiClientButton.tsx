// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import React from 'react';
import ActionButton, { ActionButtonProps } from '../../ActionButton';
import icon from './icon.svg';

type CaptiClientButtonProps = Pick<ActionButtonProps, 'id'> &
    Readonly<{
        onAction: () => void;
    }>;

const CaptiClientButton: React.FunctionComponent<CaptiClientButtonProps> = ({
    id,
    onAction,
}) => (
    <ActionButton
        id={id}
        label="About CaptiClient"
        tooltip="Learn what CaptiClient is and how it relates to Pybricks."
        icon={icon}
        onAction={onAction}
    />
);

export default CaptiClientButton;
