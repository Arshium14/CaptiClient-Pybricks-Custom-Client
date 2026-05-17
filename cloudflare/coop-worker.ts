import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

type Env = Readonly<{
    COOP_ROOMS: DurableObjectNamespace;
}>;

type RoomProgram = Readonly<{
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}>;

type RoomDoc = Readonly<{
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    loaded: Promise<void>;
}>;

type AwarenessUpdate = Readonly<{
    added: number[];
    updated: number[];
    removed: number[];
}>;

type SocketAttachment = Readonly<{
    programId: string;
}>;

function binaryMessage(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createProgramId(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Content-Type', 'application/json');

    return new Response(JSON.stringify(value), { ...init, headers });
}

function optionsResponse(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
    });
}

function textResponse(value: string, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Content-Type', 'text/plain');

    return new Response(value, { ...init, headers });
}

function parseRoomProgramPath(pathname: string): { roomId: string; programId: string } {
    const roomName = decodeURIComponent(pathname.replace(/^\/+/, ''));
    const match = roomName.match(/^capticlient:([^:]+):program:([^:]+)$/);

    if (!match) {
        throw new Error('Invalid co-op room path.');
    }

    return { roomId: match[1].toUpperCase(), programId: match[2].toUpperCase() };
}

function getRoomStub(env: Env, roomId: string): DurableObjectStub {
    const id = env.COOP_ROOMS.idFromName(roomId.toUpperCase());
    return env.COOP_ROOMS.get(id);
}

async function routeToRoom(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const programMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/programs$/);

    if (programMatch) {
        return getRoomStub(env, decodeURIComponent(programMatch[1])).fetch(request);
    }

    if (request.headers.get('Upgrade') === 'websocket') {
        const { roomId } = parseRoomProgramPath(url.pathname);
        return getRoomStub(env, roomId).fetch(request);
    }

    return textResponse('Pybricks Code Cloudflare co-op worker is running.\n');
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return optionsResponse();
        }

        try {
            return await routeToRoom(request, env);
        } catch (error) {
            return jsonResponse(
                { error: error instanceof Error ? error.message : 'Unknown error' },
                { status: 400 },
            );
        }
    },
};

export class CoopRoom {
    private readonly state: DurableObjectState;
    private readonly docs = new Map<string, RoomDoc>();

    public constructor(state: DurableObjectState) {
        this.state = state;
    }

    public async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return optionsResponse();
        }

        if (request.headers.get('Upgrade') === 'websocket') {
            return this.handleWebSocket(request);
        }

        const programMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/programs$/);

        if (programMatch) {
            return this.handlePrograms(request);
        }

        return textResponse('Pybricks Code co-op room is running.\n');
    }

    public async webSocketMessage(
        socket: WebSocket,
        message: string | ArrayBuffer,
    ): Promise<void> {
        if (typeof message === 'string') {
            return;
        }

        const attachment = socket.deserializeAttachment() as SocketAttachment;
        const room = this.getDoc(attachment.programId);
        await room.loaded;
        this.handleYjsMessage(room, socket, new Uint8Array(message));
    }

    public async webSocketClose(socket: WebSocket): Promise<void> {
        const attachment = socket.deserializeAttachment() as
            | SocketAttachment
            | undefined;

        if (!attachment) {
            return;
        }

        const room = this.docs.get(attachment.programId);

        if (!room) {
            return;
        }

        awarenessProtocol.removeAwarenessStates(
            room.awareness,
            Array.from(room.awareness.getStates().keys()),
            socket,
        );
    }

    private async handlePrograms(request: Request): Promise<Response> {
        const programs = await this.getPrograms();

        if (request.method === 'GET') {
            return jsonResponse(programs);
        }

        if (request.method === 'POST') {
            const data = (await request.json().catch(() => ({}))) as { name?: unknown };
            const now = Date.now();
            const program = {
                id: createProgramId(),
                name: String(data.name || `Program ${programs.length + 1}`).slice(
                    0,
                    80,
                ),
                createdAt: now,
                updatedAt: now,
            };

            programs.push(program);
            await this.state.storage.put('programs', programs);

            return jsonResponse(program, { status: 201 });
        }

        return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
    }

    private handleWebSocket(request: Request): Response {
        const { programId } = parseRoomProgramPath(new URL(request.url).pathname);
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        server.serializeAttachment({ programId });
        this.state.acceptWebSocket(server);
        this.sendInitialSync(server, programId).catch((error) => {
            server.close(1011, error instanceof Error ? error.message : 'Sync failed');
        });

        return new Response(null, { status: 101, webSocket: client });
    }

    private getDoc(programId: string): RoomDoc {
        const existing = this.docs.get(programId);

        if (existing) {
            return existing;
        }

        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        const room = {
            doc,
            awareness,
            loaded: this.loadDoc(programId, doc),
        };

        awareness.setLocalState(null);
        this.docs.set(programId, room);

        doc.on('update', (update: Uint8Array, origin: unknown) => {
            const encoder = encoding.createEncoder();

            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeUpdate(encoder, update);
            this.broadcast(
                programId,
                binaryMessage(encoding.toUint8Array(encoder)),
                origin,
            );
            this.persistDoc(programId, doc).catch((error) => {
                console.error('Failed to persist Yjs doc', error);
            });
        });

        awareness.on(
            'update',
            ({ added, updated, removed }: AwarenessUpdate, origin: unknown) => {
                const changedClients = added.concat(updated, removed);

                if (changedClients.length === 0) {
                    return;
                }

                const encoder = encoding.createEncoder();

                encoding.writeVarUint(encoder, messageAwareness);
                encoding.writeVarUint8Array(
                    encoder,
                    awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
                );
                this.broadcast(
                    programId,
                    binaryMessage(encoding.toUint8Array(encoder)),
                    origin,
                );
            },
        );

        return room;
    }

    private async loadDoc(programId: string, doc: Y.Doc): Promise<void> {
        const update = await this.state.storage.get<ArrayBuffer>(`doc:${programId}`);

        if (update) {
            Y.applyUpdate(doc, new Uint8Array(update), this);
        }
    }

    private async persistDoc(programId: string, doc: Y.Doc): Promise<void> {
        await this.state.storage.put(
            `doc:${programId}`,
            binaryMessage(Y.encodeStateAsUpdate(doc)),
        );
    }

    private async getPrograms(): Promise<RoomProgram[]> {
        return (await this.state.storage.get<RoomProgram[]>('programs')) ?? [];
    }

    private async sendInitialSync(socket: WebSocket, programId: string): Promise<void> {
        const room = this.getDoc(programId);
        await room.loaded;

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeSyncStep1(encoder, room.doc);
        this.send(socket, encoder);

        const awarenessStates = Array.from(room.awareness.getStates().keys());

        if (awarenessStates.length > 0) {
            const awarenessEncoder = encoding.createEncoder();

            encoding.writeVarUint(awarenessEncoder, messageAwareness);
            encoding.writeVarUint8Array(
                awarenessEncoder,
                awarenessProtocol.encodeAwarenessUpdate(
                    room.awareness,
                    awarenessStates,
                ),
            );
            this.send(socket, awarenessEncoder);
        }
    }

    private handleYjsMessage(
        room: RoomDoc,
        socket: WebSocket,
        message: Uint8Array,
    ): void {
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === messageSync) {
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);
            this.send(socket, encoder);
            return;
        }

        if (messageType === messageAwareness) {
            awarenessProtocol.applyAwarenessUpdate(
                room.awareness,
                decoding.readVarUint8Array(decoder),
                socket,
            );
            return;
        }

        if (messageType === messageQueryAwareness) {
            encoding.writeVarUint(encoder, messageAwareness);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(
                    room.awareness,
                    Array.from(room.awareness.getStates().keys()),
                ),
            );
            this.send(socket, encoder);
        }
    }

    private broadcast(programId: string, message: ArrayBuffer, origin: unknown): void {
        for (const socket of this.state.getWebSockets()) {
            const attachment = socket.deserializeAttachment() as
                | SocketAttachment
                | undefined;

            if (
                socket !== origin &&
                attachment?.programId === programId &&
                socket.readyState === WebSocket.OPEN
            ) {
                socket.send(message);
            }
        }
    }

    private send(socket: WebSocket, encoder: encoding.Encoder): void {
        if (encoding.length(encoder) > 1 && socket.readyState === WebSocket.OPEN) {
            socket.send(binaryMessage(encoding.toUint8Array(encoder)));
        }
    }
}
