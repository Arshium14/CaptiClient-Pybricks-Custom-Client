declare class WebSocketPair {
    constructor();
    0: WebSocket;
    1: WebSocket;
}

interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {}

interface DurableObjectStub {
    fetch(request: Request): Promise<Response>;
}

interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
}

interface DurableObjectState {
    storage: DurableObjectStorage;
    acceptWebSocket(socket: WebSocket): void;
    getWebSockets(): WebSocket[];
}

interface ResponseInit {
    webSocket?: WebSocket;
}

interface WebSocket {
    accept(): void;
    serializeAttachment(value: unknown): void;
    deserializeAttachment(): unknown;
}
