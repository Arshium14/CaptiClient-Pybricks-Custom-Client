'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

const host = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '1234', 10);
const docs = new Map();
const roomPrograms = new Map();

function createProgramId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function getPrograms(roomId) {
  const existing = roomPrograms.get(roomId);

  if (existing) {
    return existing;
  }

  const programs = [];
  roomPrograms.set(roomId, programs);
  return programs;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(value));
}

async function handleApiRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/programs$/);

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, null);
    return true;
  }

  if (!match) {
    return false;
  }

  const roomId = decodeURIComponent(match[1]).trim().toUpperCase();
  const programs = getPrograms(roomId);

  if (request.method === 'GET') {
    sendJson(response, 200, programs);
    return true;
  }

  if (request.method === 'POST') {
    const body = await readRequestBody(request);
    const data = body ? JSON.parse(body) : {};
    const now = Date.now();
    const program = {
      id: createProgramId(),
      name: String(data.name || `Program ${programs.length + 1}`).slice(0, 80),
      createdAt: now,
      updatedAt: now,
    };

    programs.push(program);
    sendJson(response, 201, program);
    return true;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
  return true;
}

function getDoc(roomName) {
  const existing = docs.get(roomName);

  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const sockets = new Set();
  const room = { doc, awareness, sockets };

  awareness.setLocalState(null);
  docs.set(roomName, room);

  doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder();

    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(room, encoding.toUint8Array(encoder), origin);
  });

  awareness.on('update', ({ added, updated, removed }, origin) => {
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
    broadcast(room, encoding.toUint8Array(encoder), origin);
  });

  return room;
}

function broadcast(room, message, origin) {
  for (const socket of room.sockets) {
    if (socket !== origin && socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

function send(socket, encoder) {
  if (encoding.length(encoder) > 1 && socket.readyState === socket.OPEN) {
    socket.send(encoding.toUint8Array(encoder));
  }
}

function handleMessage(room, socket, message) {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(new Uint8Array(message));
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);
    send(socket, encoder);
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
    send(socket, encoder);
  }
}

function getRoomName(request) {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathname = url.pathname.replace(/^\/+/, '');

  return decodeURIComponent(pathname || 'default');
}

const server = http.createServer((request, response) => {
  handleApiRequest(request, response)
    .then(handled => {
      if (handled) {
        return;
      }

      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('Pybricks Code co-op WebSocket server is running.\n');
    })
    .catch(error => {
      sendJson(response, 500, { error: error.message });
    });
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket, request) => {
  const room = getDoc(getRoomName(request));
  const encoder = encoding.createEncoder();

  room.sockets.add(socket);
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  send(socket, encoder);

  const awarenessStates = Array.from(room.awareness.getStates().keys());

  if (awarenessStates.length > 0) {
    const awarenessEncoder = encoding.createEncoder();

    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, awarenessStates),
    );
    send(socket, awarenessEncoder);
  }

  socket.on('message', message => handleMessage(room, socket, message));
  socket.on('close', () => {
    room.sockets.delete(socket);
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(room.awareness.getStates().keys()),
      socket,
    );
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, webSocket => {
    wss.emit('connection', webSocket, request);
  });
});

server.listen(port, host, () => {
  console.log(`Pybricks Code co-op WebSocket server running at ws://${host}:${port}`);
});
