// SPDX-License-Identifier: MIT
// Copyright (c) 2020-2024 The Pybricks Authors

import {
    SagaGenerator,
    actionChannel,
    call,
    delay,
    getContext,
    put,
    race,
    select,
    take,
    takeEvery,
} from 'typed-redux-saga/macro';
import { alertsShowAlert } from '../alerts/actions';
import { didFailToWrite, didWrite, write } from '../ble-nordic-uart-service/actions';
import { nordicUartSafeTxCharLength } from '../ble-nordic-uart-service/protocol';
import {
    didFailToSendCommand,
    didReceiveStatusReport,
    didReceiveWriteStdout,
    didSendCommand,
    sendLegacyStartReplCommand,
    sendLegacyStartUserProgramCommand,
    sendStartUserProgramCommand,
    sendStopUserProgramCommand,
    sendWriteStdinCommand,
    sendWriteUserProgramMetaCommand,
    sendWriteUserRamCommand,
} from '../ble-pybricks-service/actions';
import {
    BuiltinProgramId,
    FileFormat,
    Status,
    statusToFlag,
} from '../ble-pybricks-service/protocol';
import { editorGetValue } from '../editor/sagaLib';
import {
    compile,
    didCompile,
    didFailToCompile,
    mpyCompileMulti6,
    mpyDidCompileMulti6,
    mpyDidFailToCompileMulti6,
} from '../mpy/actions';
import { RootState } from '../reducers';
import { defined, ensureError } from '../utils';
import { xor8 } from '../utils/math';
import {
    checksum,
    didFailToFinishDownload,
    didFinishDownload,
    didProgressDownload,
    didStartDownload,
    downloadAndRun,
    hubDidFailToStartRepl,
    hubDidFailToStartTelemetryMonitor,
    hubDidFailToStopUserProgram,
    hubDidStartRepl,
    hubDidStartTelemetryMonitor,
    hubDidStopUserProgram,
    hubStartRepl,
    hubStartTelemetryMonitor,
    hubStopUserProgram,
} from './actions';
import { HubRuntimeState } from './reducers';

const downloadChunkSize = 100;
const stdinCommandOverhead = 1;
let telemetryMonitorStartInFlight = false;
let telemetryMonitorActive = false;
let telemetryAutoStartPaused = false;
let telemetryStdoutBuffer = '';
const telemetryMonitorProgram = `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port
from pybricks.tools import wait

hub = PrimeHub()
ports = [Port.A, Port.B, Port.C, Port.D, Port.E, Port.F]
motors = []

for port in ports:
    try:
        motors.append(Motor(port))
    except OSError:
        motors.append(None)

while True:
    pitch, roll = hub.imu.tilt()
    print("CAPTICLIENT_TELEMETRY imu {} {} {}".format(
        int(pitch),
        int(roll),
        int(hub.imu.heading()),
    ))

    for index, motor in enumerate(motors):
        if motor:
            print("CAPTICLIENT_TELEMETRY motor {} {}".format(
                index,
                int(motor.angle()),
            ))

    wait(250)
`;

function* waitForWrite(id: number): SagaGenerator<{
    didWrite: ReturnType<typeof didWrite> | undefined;
    didFailToWrite: ReturnType<typeof didFailToWrite> | undefined;
}> {
    return yield* race({
        didWrite: take(didWrite.when((a) => a.id === id)),
        didFailToWrite: take(didFailToWrite.when((a) => a.id === id)),
    });
}

function* handleLegacyDownloadAndRun(
    action: ReturnType<typeof downloadAndRun>,
): Generator {
    const script = yield* editorGetValue();

    yield* put(
        compile(
            script,
            action.fileFormat === FileFormat.Mpy5 ? 5 : 6,
            // no-unicode option was removed in MPY ABI v6
            action.fileFormat === FileFormat.Mpy5 ? ['-mno-unicode'] : [],
        ),
    );

    const { mpy, mpyFail } = yield* race({
        mpy: take(didCompile),
        mpyFail: take(didFailToCompile),
    });

    if (mpyFail) {
        return;
    }

    defined(mpy);

    // let everyone know the runtime is busy loading the program
    yield* put(didStartDownload());

    // TODO: show compiled size in UI?
    if (process.env.NODE_ENV !== 'test') {
        console.log(`Downloading ${mpy.data.byteLength} bytes`);
    }

    const checksumChannel = yield* actionChannel(checksum);

    const nextMessageId = yield* getContext<() => number>('nextMessageId');

    // first send payload size as big-endian 32-bit integer
    const sizeBuf = new Uint8Array(4);
    const sizeView = new DataView(sizeBuf.buffer);
    sizeView.setUint32(0, mpy.data.byteLength, true);
    const writeAction = yield* put(write(nextMessageId(), sizeBuf));
    const { didFailToWrite } = yield* waitForWrite(writeAction.id);

    if (didFailToWrite) {
        yield* put(didFailToFinishDownload());
        return;
    }

    const { checksumAction, checksumTimeout } = yield* race({
        checksumAction: take(checksumChannel),
        checksumTimeout: delay(1000),
    });

    if (checksumTimeout) {
        console.error(`timeout waiting for checksum`);
        yield* put(didFailToFinishDownload());
        return;
    }

    defined(checksumAction);

    if (checksumAction.checksum !== (0xff ^ xor8(sizeBuf))) {
        console.error(
            `bad checksum ${checksumAction.checksum} vs ${0xff ^ xor8(sizeBuf)}`,
        );
        yield* put(didFailToFinishDownload());
        return;
    }

    // Then send payload in 100 byte chunks waiting for checksum after
    // each chunk
    for (let i = 0; i < mpy.data.byteLength; i += downloadChunkSize) {
        // need to subscribe to checksum before writing to prevent race condition
        const chunk = mpy.data.slice(i, i + downloadChunkSize);

        // we can actually only write 20 bytes at a time
        for (let j = 0; j < chunk.length; j += nordicUartSafeTxCharLength) {
            yield* put(didProgressDownload((i + j) / mpy.data.byteLength));
            const writeAction = yield* put(
                write(nextMessageId(), chunk.slice(j, j + nordicUartSafeTxCharLength)),
            );
            const { didFailToWrite } = yield* waitForWrite(writeAction.id);

            if (didFailToWrite) {
                yield* put(didFailToFinishDownload());
                return;
            }
        }

        const { checksumAction, checksumTimeout } = yield* race({
            checksumAction: take(checksumChannel),
            checksumTimeout: delay(1000),
        });

        if (checksumTimeout) {
            console.error(`timeout waiting for checksum`);
            yield* put(didFailToFinishDownload());
            return;
        }

        defined(checksumAction);

        if (checksumAction.checksum !== (0xff ^ xor8(chunk))) {
            console.error(
                `bad checksum ${checksumAction.checksum} vs ${0xff ^ xor8(chunk)}`,
            );
            yield* put(didFailToFinishDownload());
            return;
        }
    }

    // let everyone know the runtime is done loading the program
    yield* put(didFinishDownload());
}

function* handleDownloadAndRun(action: ReturnType<typeof downloadAndRun>): Generator {
    telemetryAutoStartPaused = true;
    telemetryMonitorActive = false;
    telemetryMonitorStartInFlight = false;

    if (action.useLegacyDownload) {
        try {
            yield* stopRunningProgramBeforeDownload();
            yield* handleLegacyDownloadAndRun(action);
        } finally {
            telemetryAutoStartPaused = false;
        }
        return;
    }

    try {
        yield* stopRunningProgramBeforeDownload();

        // TODO: should everything before didStartDownload be in try block?

        if (action.fileFormat !== FileFormat.MultiMpy6) {
            // TODO: show error message?
            throw new Error('unsupported file format');
        }

        // REVISIT: these are not valid if hub is not connected
        const chunkSize = (yield* select((s: RootState) => s.hub.maxBleWriteSize)) - 5;
        const maxUserProgramSize = yield* select(
            (s: RootState) => s.hub.maxUserProgramSize,
        );

        yield* put(mpyCompileMulti6());

        const { didCompile, didFailToCompile } = yield* race({
            didCompile: take(mpyDidCompileMulti6),
            didFailToCompile: take(mpyDidFailToCompileMulti6),
        });

        if (didFailToCompile) {
            yield* put(
                alertsShowAlert(
                    'mpy',
                    'compilerError',
                    {
                        error: didFailToCompile.error,
                    },
                    'mpy.compilerError',
                ),
            );
            return;
        }

        defined(didCompile);

        if (process.env.NODE_ENV !== 'test') {
            console.log(`Downloading ${didCompile.file.size} bytes`);
        }

        if (didCompile.file.size > maxUserProgramSize) {
            yield* put(
                alertsShowAlert('hub', 'userProgramSize', {
                    actual: didCompile.file.size,
                    max: maxUserProgramSize,
                }),
            );
            return;
        }

        // let everyone know the runtime is busy loading the program
        yield* put(didStartDownload());

        const nextMessageId = yield* getContext<() => number>('nextMessageId');

        const writeUserMetaMessageId = nextMessageId();

        // write size of 0 to invalidate any existing user program
        yield* put(sendWriteUserProgramMetaCommand(writeUserMetaMessageId, 0));

        const { didFailToSend } = yield* race({
            didSend: take(didSendCommand.when((a) => a.id === writeUserMetaMessageId)),
            didFailToSend: take(
                didFailToSendCommand.when((a) => a.id === writeUserMetaMessageId),
            ),
        });

        if (didFailToSend) {
            throw didFailToSend.error;
        }

        for (let i = 0; i < didCompile.file.size; i += chunkSize) {
            yield* put(didProgressDownload(i / didCompile.file.size));

            const writeUserRamMessageId = nextMessageId();

            const data = yield* call(() =>
                didCompile.file.slice(i, i + chunkSize).arrayBuffer(),
            );

            yield* put(sendWriteUserRamCommand(writeUserRamMessageId, i, data));

            const { didFailToSend } = yield* race({
                didSend: take(
                    didSendCommand.when((a) => a.id === writeUserRamMessageId),
                ),
                didFailToSend: take(
                    didFailToSendCommand.when((a) => a.id === writeUserRamMessageId),
                ),
            });

            if (didFailToSend) {
                throw didFailToSend.error;
            }
        }

        yield* put(didProgressDownload(1));

        const writeUserMetaMessageId2 = nextMessageId();

        yield* put(
            sendWriteUserProgramMetaCommand(
                writeUserMetaMessageId2,
                didCompile.file.size,
            ),
        );

        const { didFailToSend2 } = yield* race({
            didSend2: take(
                didSendCommand.when((a) => a.id === writeUserMetaMessageId2),
            ),
            didFailToSend2: take(
                didFailToSendCommand.when((a) => a.id === writeUserMetaMessageId2),
            ),
        });

        if (didFailToSend2) {
            throw didFailToSend2.error;
        }

        yield* put(didFinishDownload());

        const startUserProgramId = nextMessageId();
        if (action.useLegacyStartUserProgram) {
            yield* put(sendLegacyStartUserProgramCommand(startUserProgramId));
        } else {
            yield* put(sendStartUserProgramCommand(startUserProgramId, action.slot));
        }

        const { didFailToStart } = yield* race({
            didStart: take(didSendCommand.when((a) => a.id === startUserProgramId)),
            didFailToStart: take(
                didFailToSendCommand.when((a) => a.id === startUserProgramId),
            ),
        });

        if (didFailToStart) {
            throw didFailToStart.error;
        }
    } catch (err) {
        // istanbul ignore if
        if (process.env.NODE_ENV !== 'test') {
            console.error(err);
        }

        if (err instanceof DOMException && err.name === 'NetworkError') {
            yield* put(alertsShowAlert('ble', 'disconnected'));
        } else {
            yield* put(
                alertsShowAlert('alerts', 'unexpectedError', {
                    error: ensureError(err),
                }),
            );
        }

        yield* put(didFailToFinishDownload());
    } finally {
        telemetryAutoStartPaused = false;
    }
}

// SPACE, SPACE, SPACE, SPACE
const legacyNusStartReplCommand = new Uint8Array([0x20, 0x20, 0x20, 0x20]);

function* handleHubStartRepl(action: ReturnType<typeof hubStartRepl>): Generator {
    const nextMessageId = yield* getContext<() => number>('nextMessageId');

    if (action.useLegacyDownload) {
        yield* put(write(nextMessageId(), legacyNusStartReplCommand));
        yield* put(hubDidStartRepl());
        return;
    }

    const id = nextMessageId();
    if (action.useLegacyStartUserProgram) {
        yield* put(sendLegacyStartReplCommand(id));
    } else {
        yield* put(sendStartUserProgramCommand(id, BuiltinProgramId.REPL));
    }

    const { didFailToSend } = yield* race({
        didSend: take(didSendCommand.when((a) => a.id === id)),
        didFailToSend: take(didFailToSendCommand.when((a) => a.id === id)),
    });

    if (didFailToSend) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(didFailToSend.error);
        }

        if (
            didFailToSend.error instanceof DOMException &&
            didFailToSend.error.name === 'NetworkError'
        ) {
            yield* put(alertsShowAlert('ble', 'disconnected'));
        } else {
            yield* put(
                alertsShowAlert('alerts', 'unexpectedError', {
                    error: didFailToSend.error,
                }),
            );
        }

        yield* put(hubDidFailToStartRepl());
        return;
    }

    yield* put(hubDidStartRepl());
}

function* stopRunningProgramBeforeDownload(): Generator {
    const runtime = yield* select((s: RootState) => s.hub.runtime);

    if (runtime !== HubRuntimeState.Running) {
        return;
    }

    const nextMessageId = yield* getContext<() => number>('nextMessageId');
    const id = nextMessageId();

    yield* put(sendStopUserProgramCommand(id));

    const { didFailToSend } = yield* race({
        didSend: take(didSendCommand.when((a) => a.id === id)),
        didFailToSend: take(didFailToSendCommand.when((a) => a.id === id)),
    });

    if (didFailToSend) {
        throw didFailToSend.error;
    }

    yield* race({
        didBecomeIdle: take(
            didReceiveStatusReport.when(
                (a) => !(a.statusFlags & statusToFlag(Status.UserProgramRunning)),
            ),
        ),
        timeout: delay(1000),
    });
}

function* canStartTelemetryMonitor(): SagaGenerator<boolean> {
    const { runtime } = yield* select((s: RootState) => s.hub);

    return (
        !telemetryAutoStartPaused &&
        runtime !== HubRuntimeState.Disconnected &&
        runtime !== HubRuntimeState.Loading &&
        runtime !== HubRuntimeState.Running &&
        runtime !== HubRuntimeState.StartingRepl &&
        runtime !== HubRuntimeState.StoppingUserProgram
    );
}

function handleTelemetryStatusReport(
    action: ReturnType<typeof didReceiveStatusReport>,
): void {
    if (action.statusFlags & statusToFlag(Status.UserProgramRunning)) {
        telemetryMonitorActive = false;
        telemetryMonitorStartInFlight = false;
    }
}

function* writeStdinText(value: string): Generator {
    const nextMessageId = yield* getContext<() => number>('nextMessageId');
    const data = new TextEncoder().encode(value);
    const { useLegacyStdio, maxBleWriteSize } = yield* select((s: RootState) => s.hub);

    if (useLegacyStdio) {
        for (let i = 0; i < data.length; i += nordicUartSafeTxCharLength) {
            const writeAction = yield* put(
                write(nextMessageId(), data.slice(i, i + nordicUartSafeTxCharLength)),
            );
            const { didFailToWrite } = yield* waitForWrite(writeAction.id);

            if (didFailToWrite) {
                throw didFailToWrite.error;
            }
        }

        return;
    }

    const chunkSize = Math.max(1, maxBleWriteSize - stdinCommandOverhead);

    for (let i = 0; i < data.length; i += chunkSize) {
        const id = nextMessageId();

        yield* put(sendWriteStdinCommand(id, data.slice(i, i + chunkSize)));

        const { didFailToSend } = yield* race({
            didSend: take(didSendCommand.when((a) => a.id === id)),
            didFailToSend: take(didFailToSendCommand.when((a) => a.id === id)),
        });

        if (didFailToSend) {
            throw didFailToSend.error;
        }
    }
}

function* waitForStdoutText(text: string, timeoutMs = 5000): Generator {
    const decoder = new TextDecoder();
    let output = '';

    for (;;) {
        const { action, timeout } = yield* race({
            action: take(didReceiveWriteStdout),
            timeout: delay(timeoutMs),
        });

        if (timeout) {
            throw new Error(`Timed out waiting for ${text}`);
        }

        defined(action);
        output += decoder.decode(action.payload, { stream: true });

        if (output.includes(text)) {
            return;
        }
    }
}

function* handleTelemetryPlaceholderStdout(
    action: ReturnType<typeof didReceiveWriteStdout>,
): Generator {
    telemetryStdoutBuffer += new TextDecoder().decode(action.payload, { stream: true });

    if (!telemetryStdoutBuffer.includes('\n')) {
        return;
    }

    const lines = telemetryStdoutBuffer.split(/\r?\n/);
    telemetryStdoutBuffer = lines.pop() ?? '';

    if (lines.some((line) => line.trim() === 'Port View Placeholder')) {
        telemetryMonitorActive = false;
        telemetryMonitorStartInFlight = false;
        yield* put(hubStopUserProgram());
    }
}

function* handleStartTelemetryMonitor(): Generator {
    if (telemetryMonitorStartInFlight || telemetryMonitorActive) {
        return;
    }

    if (!(yield* canStartTelemetryMonitor())) {
        return;
    }

    telemetryMonitorStartInFlight = true;

    try {
        const { useLegacyDownload, useLegacyStartUserProgram } = yield* select(
            (s: RootState) => s.hub,
        );

        yield* put(hubStartRepl(useLegacyDownload, useLegacyStartUserProgram));

        const { didFail } = yield* race({
            didStart: take(hubDidStartRepl),
            didFail: take(hubDidFailToStartRepl),
        });

        if (didFail) {
            throw new Error('Failed to start REPL');
        }

        yield* waitForStdoutText('>>> ');
        yield* writeStdinText('\x05');
        yield* waitForStdoutText('===');
        yield* writeStdinText(telemetryMonitorProgram);
        yield* delay(100);
        yield* writeStdinText('\x04');
        telemetryMonitorActive = true;
        yield* put(hubDidStartTelemetryMonitor());
    } catch (err) {
        const error = ensureError(err);

        if (process.env.NODE_ENV !== 'test') {
            console.error(error);
        }

        yield* put(hubDidFailToStartTelemetryMonitor(error));
    } finally {
        telemetryMonitorStartInFlight = false;
    }
}

function* handleStopUserProgram(): Generator {
    const nextMessageId = yield* getContext<() => number>('nextMessageId');
    const id = nextMessageId();
    yield* put(sendStopUserProgramCommand(id));
    // REVISIT: may want to disable button while attempting to send command
    // this would mean didSendStop() and didFailToSendStop() actions here
    const { didFailToSend } = yield* race({
        didSend: take(didSendCommand.when((a) => a.id === id)),
        didFailToSend: take(didFailToSendCommand.when((a) => a.id === id)),
    });

    if (didFailToSend) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(didFailToSend.error);
        }

        if (
            didFailToSend.error instanceof DOMException &&
            didFailToSend.error.name === 'NetworkError'
        ) {
            yield* put(alertsShowAlert('ble', 'disconnected'));
        } else {
            yield* put(
                alertsShowAlert('alerts', 'unexpectedError', {
                    error: didFailToSend.error,
                }),
            );
        }

        yield* put(hubDidFailToStopUserProgram());
        return;
    }

    yield* put(hubDidStopUserProgram());
}

export default function* (): Generator {
    yield* takeEvery(downloadAndRun, handleDownloadAndRun);
    yield* takeEvery(hubStartRepl, handleHubStartRepl);
    yield* takeEvery(didReceiveStatusReport, handleTelemetryStatusReport);
    yield* takeEvery(didReceiveWriteStdout, handleTelemetryPlaceholderStdout);
    yield* takeEvery(hubStartTelemetryMonitor, handleStartTelemetryMonitor);
    yield* takeEvery(hubStopUserProgram, handleStopUserProgram);
}
