// SPDX-License-Identifier: MIT

export interface HubImuTelemetry {
    pitch: number;
    roll: number;
    heading: number;
}

export interface MotorTelemetry {
    angle: number;
    speed?: number;
    load?: number;
    isStalled?: boolean;
}

export interface HubTelemetryState {
    imu: HubImuTelemetry | null;
    motors: Record<string, MotorTelemetry>;
    lastUpdated: number | null;
    stdoutBuffer: string;
}

export type HubTelemetryEvent =
    | {
          type: 'imu';
          value: HubImuTelemetry;
      }
    | {
          type: 'motor';
          port: number;
          value: MotorTelemetry;
      };

export const initialHubTelemetryState: HubTelemetryState = {
    imu: null,
    motors: {},
    lastUpdated: null,
    stdoutBuffer: '',
};

export function parseHubTelemetryPayload(
    payload: ArrayBuffer,
): HubTelemetryEvent | null {
    const view = new DataView(payload);

    if (view.byteLength === 0) {
        return null;
    }

    const telemetryType = view.getUint8(0);

    switch (telemetryType) {
        case 0x12:
            if (view.byteLength < 7) {
                return null;
            }

            return {
                type: 'imu',
                value: {
                    pitch: view.getInt16(1, true),
                    roll: view.getInt16(3, true),
                    heading: view.getInt16(5, true),
                },
            };

        case 0x21:
            if (view.byteLength < 9) {
                return null;
            }

            return {
                type: 'motor',
                port: view.getUint8(1),
                value: {
                    angle: view.getInt16(2, true),
                    speed: view.getInt16(4, true),
                    load: view.getInt16(6, true),
                    isStalled: Boolean(view.getUint8(8)),
                },
            };

        default:
            return null;
    }
}

export function parseHubTelemetryTextLine(line: string): HubTelemetryEvent | null {
    const parts = line.trim().split(/\s+/);

    if (parts[0] !== 'CAPTICLIENT_TELEMETRY') {
        return null;
    }

    if (parts[1] === 'imu' && parts.length >= 5) {
        const pitch = Number(parts[2]);
        const roll = Number(parts[3]);
        const heading = Number(parts[4]);

        if ([pitch, roll, heading].some((value) => !Number.isFinite(value))) {
            return null;
        }

        return {
            type: 'imu',
            value: { pitch, roll, heading },
        };
    }

    if (parts[1] === 'motor' && parts.length >= 4) {
        const port = parsePort(parts[2]);
        const angle = Number(parts[3]);

        if (port === null || !Number.isFinite(angle)) {
            return null;
        }

        return {
            type: 'motor',
            port,
            value: { angle },
        };
    }

    return null;
}

function parsePort(value: string): number | null {
    const numericPort = Number(value);

    if (Number.isInteger(numericPort) && numericPort >= 0) {
        return numericPort;
    }

    const port = value.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);

    return port >= 0 && port <= 5 ? port : null;
}
