// SPDX-License-Identifier: MIT

import classNames from 'classnames';
import React from 'react';
import { HubRuntimeState } from '../hub/reducers';
import { useSelector } from '../reducers';

const portLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

function formatDegrees(value?: number): string {
    return typeof value === 'number' ? `${Math.round(value)} deg` : '--';
}

const HubTelemetryStrip: React.FunctionComponent = () => {
    const telemetry = useSelector((s) => s.hub.telemetry);
    const runtime = useSelector((s) => s.hub.runtime);
    const hasTelemetry = telemetry.lastUpdated !== null;
    const connected = runtime !== HubRuntimeState.Disconnected;

    return (
        <div
            className="pb-toolbar-telemetry"
            aria-label="Hub telemetry"
            title={
                hasTelemetry
                    ? 'Live hub telemetry'
                    : connected
                      ? 'Telemetry starts automatically when the hub is idle'
                      : 'Connect a hub to view telemetry'
            }
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
        </div>
    );
};

export default HubTelemetryStrip;
