// SPDX-License-Identifier: MIT

import classNames from 'classnames';
import React from 'react';
import { useDispatch } from 'react-redux';
import { hubStartTelemetryMonitor } from '../hub/actions';
import { HubRuntimeState } from '../hub/reducers';
import { useSelector } from '../reducers';

const portLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

function formatDegrees(value?: number): string {
    return typeof value === 'number' ? `${Math.round(value)} deg` : '--';
}

const HubTelemetryStrip: React.FunctionComponent = () => {
    const dispatch = useDispatch();
    const telemetry = useSelector((s) => s.hub.telemetry);
    const runtime = useSelector((s) => s.hub.runtime);
    const hasTelemetry = telemetry.lastUpdated !== null;
    const canStartTelemetry =
        runtime !== HubRuntimeState.Disconnected &&
        runtime !== HubRuntimeState.Loading &&
        runtime !== HubRuntimeState.Running &&
        runtime !== HubRuntimeState.StartingRepl &&
        runtime !== HubRuntimeState.StoppingUserProgram;
    const telemetryTitle = hasTelemetry
        ? 'Live hub telemetry'
        : runtime === HubRuntimeState.Disconnected
          ? 'Connect a hub to view telemetry'
          : canStartTelemetry
            ? 'Start telemetry when you want live hub values'
            : 'Stop the current program before starting telemetry';

    return (
        <div
            className="pb-toolbar-telemetry"
            aria-label="Hub telemetry"
            title={telemetryTitle}
        >
            <div className="pb-toolbar-telemetry-ports" aria-label="Motor angles">
                {portLabels.map((label, index) => {
                    const angle = telemetry.motors[index]?.angle;

                    return (
                        <span
                            className={classNames(
                                'pb-toolbar-telemetry-port',
                                typeof angle === 'number' &&
                                    'pb-toolbar-telemetry-port-active',
                            )}
                            key={label}
                        >
                            <span className="pb-toolbar-telemetry-port-label">
                                {label}
                            </span>
                            <span className="pb-toolbar-telemetry-port-value">
                                {formatDegrees(angle)}
                            </span>
                        </span>
                    );
                })}
            </div>
            <div className="pb-toolbar-telemetry-hub" aria-label="Hub IMU">
                <span className="pb-toolbar-telemetry-hub-icon" aria-hidden="true">
                    HUB
                </span>
                <div className="pb-toolbar-telemetry-hub-values">
                    <span className="pb-toolbar-telemetry-value">
                        <span className="pb-toolbar-telemetry-key">P</span>
                        {formatDegrees(telemetry.imu?.pitch)}
                    </span>
                    <span className="pb-toolbar-telemetry-value">
                        <span className="pb-toolbar-telemetry-key">R</span>
                        {formatDegrees(telemetry.imu?.roll)}
                    </span>
                    <span className="pb-toolbar-telemetry-value">
                        <span className="pb-toolbar-telemetry-key">H</span>
                        {formatDegrees(telemetry.imu?.heading)}
                    </span>
                </div>
            </div>
            <button
                className="pb-toolbar-telemetry-start"
                disabled={!canStartTelemetry}
                onClick={() => dispatch(hubStartTelemetryMonitor())}
                type="button"
            >
                {hasTelemetry ? 'Restart' : 'Start'}
            </button>
        </div>
    );
};

export default HubTelemetryStrip;
