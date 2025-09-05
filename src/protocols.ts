/**
 * Tauri 版本的协议处理模块
 * 基于提供的 protocols.js 适配到前端环境
 */

/**
 * Event type definitions, corresponding to protobuf generated event types
 */
export const EventType = {
  // Default event, used when no events are needed
  None: 0,

  // Connection events (1-99)
  StartConnection: 1,
  FinishConnection: 2,
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,

  // Session events (100-199)
  StartSession: 100,
  CancelSession: 101,
  FinishSession: 102,
  SessionStarted: 150,
  SessionCanceled: 151,
  SessionFinished: 152,
  SessionFailed: 153,
  UsageResponse: 154,

  // General events (200-299)
  TaskRequest: 200,
  UpdateConfig: 201,
  AudioMuted: 250,

  // TTS events (300-399)
  SayHello: 300,
  TTSSentenceStart: 350,
  TTSSentenceEnd: 351,
  TTSResponse: 352,
  TTSEnded: 359,
  PodcastRoundStart: 360,
  PodcastRoundResponse: 361,
  PodcastRoundEnd: 362,
  PodcastEnd: 363,

  // ASR events (450-499)
  ASRInfo: 450,
  ASRResponse: 451,
  ASREnded: 459,

  // Chat events (500-599)
  ChatTTSText: 500,
  ChatResponse: 550,
  ChatEnded: 559,

  // Subtitle events (650-699)
  SourceSubtitleStart: 650,
  SourceSubtitleResponse: 651,
  SourceSubtitleEnd: 652,
  TranslationSubtitleStart: 653,
  TranslationSubtitleResponse: 654,
  TranslationSubtitleEnd: 655,
};

/**
 * Message protocol related definitions
 */
export const MsgType = {
  Invalid: 0,
  FullClientRequest: 0b1,
  AudioOnlyClient: 0b10,
  FullServerResponse: 0b1001,
  AudioOnlyServer: 0b1011,
  FrontEndResultServer: 0b1100,
  Error: 0b1111,
};

export const MsgTypeServerACK = MsgType.AudioOnlyServer;

export const MsgTypeFlagBits = {
  NoSeq: 0,
  PositiveSeq: 0b1,
  LastNoSeq: 0b10,
  NegativeSeq: 0b11,
  WithEvent: 0b100,
};

export const VersionBits = {
  Version1: 1,
  Version2: 2,
  Version3: 3,
  Version4: 4,
};

export const HeaderSizeBits = {
  HeaderSize4: 1,
  HeaderSize8: 2,
  HeaderSize12: 3,
  HeaderSize16: 4,
};

export const SerializationBits = {
  Raw: 0,
  JSON: 0b1,
  Thrift: 0b11,
  Custom: 0b1111,
};

export const CompressionBits = {
  None: 0,
  Gzip: 0b1,
  Custom: 0b1111,
};

export interface Message {
  type: number;
  flag: number;
  version: number;
  headerSize: number;
  serialization: number;
  compression: number;
  payload: Uint8Array;
  event?: number;
  sessionId?: string;
  connectId?: string;
  sequence?: number;
  errorCode?: number;
  toString(): string;
}

export function getEventTypeName(eventType: number): string {
  return Object.keys(EventType).find(key => EventType[key as keyof typeof EventType] === eventType) || `invalid event type: ${eventType}`;
}

export function getMsgTypeName(msgType: number): string {
  return Object.keys(MsgType).find(key => MsgType[key as keyof typeof MsgType] === msgType) || `invalid message type: ${msgType}`;
}

/**
 * Convert Message object to a readable string representation
 */
export function messageToString(msg: Message): string {
  const eventStr = msg.event !== undefined ? getEventTypeName(msg.event) : 'NoEvent';
  const typeStr = getMsgTypeName(msg.type);

  switch (msg.type) {
    case MsgType.AudioOnlyServer:
    case MsgType.AudioOnlyClient:
      if (msg.flag === MsgTypeFlagBits.PositiveSeq || msg.flag === MsgTypeFlagBits.NegativeSeq) {
        return `MsgType: ${typeStr}, EventType: ${eventStr}, Sequence: ${msg.sequence}, PayloadSize: ${msg.payload.length}`;
      }
      return `MsgType: ${typeStr}, EventType: ${eventStr}, PayloadSize: ${msg.payload.length}`;

    case MsgType.Error:
      return `MsgType: ${typeStr}, EventType: ${eventStr}, ErrorCode: ${msg.errorCode}, Payload: ${new TextDecoder().decode(msg.payload)}`;

    default:
      if (msg.flag === MsgTypeFlagBits.PositiveSeq || msg.flag === MsgTypeFlagBits.NegativeSeq) {
        return `MsgType: ${typeStr}, EventType: ${eventStr}, Sequence: ${msg.sequence}, Payload: ${new TextDecoder().decode(msg.payload)}`;
      }
      return `MsgType: ${typeStr}, EventType: ${eventStr}, Payload: ${new TextDecoder().decode(msg.payload)}`;
  }
}

export function createMessage(msgType: number, flag: number): Message {
  const msg: Message = {
    type: msgType,
    flag: flag,
    version: VersionBits.Version1,
    headerSize: HeaderSizeBits.HeaderSize4,
    serialization: SerializationBits.JSON,
    compression: CompressionBits.None,
    payload: new Uint8Array(0),
    toString: function () {
      return messageToString(this);
    },
  };

  return msg;
}

/**
 * Message serialization
 */
export function marshalMessage(msg: Message): Uint8Array {
  const buffers: Uint8Array[] = [];

  // Build base header
  const headerSize = 4 * msg.headerSize;
  const header = new Uint8Array(headerSize);

  header[0] = (msg.version << 4) | msg.headerSize;
  header[1] = (msg.type << 4) | msg.flag;
  header[2] = (msg.serialization << 4) | msg.compression;

  buffers.push(header);

  // Write fields based on message type and flags
  const writers = getWriters(msg);
  for (const writer of writers) {
    const data = writer(msg);
    if (data) buffers.push(data);
  }

  // Merge all buffers
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result;
}

/**
 * Message deserialization
 */
export function unmarshalMessage(data: Uint8Array): Message {
  if (data.length < 3) {
    throw new Error(`data too short: expected at least 3 bytes, got ${data.length}`);
  }

  let offset = 0;

  // Read base header
  const versionAndHeaderSize = data[offset++];
  const typeAndFlag = data[offset++];
  const serializationAndCompression = data[offset++];

  const msg: Message = {
    version: (versionAndHeaderSize >> 4),
    headerSize: (versionAndHeaderSize & 0b00001111),
    type: (typeAndFlag >> 4),
    flag: (typeAndFlag & 0b00001111),
    serialization: (serializationAndCompression >> 4),
    compression: (serializationAndCompression & 0b00001111),
    payload: new Uint8Array(0),
    toString: function () {
      return messageToString(this);
    },
  };

  // Skip remaining header bytes
  offset = 4 * msg.headerSize;

  // Read fields based on message type and flags
  const readers = getReaders(msg);
  for (const reader of readers) {
    offset = reader(msg, data, offset);
  }

  return msg;
}

// Internal helper functions for serialization/deserialization
function getWriters(msg: Message): Array<(msg: Message) => Uint8Array | null> {
  const writers: Array<(msg: Message) => Uint8Array | null> = [];

  if (msg.flag === MsgTypeFlagBits.WithEvent) {
    writers.push(writeEvent, writeSessionId);
  }

  switch (msg.type) {
    case MsgType.AudioOnlyClient:
    case MsgType.AudioOnlyServer:
    case MsgType.FrontEndResultServer:
    case MsgType.FullClientRequest:
    case MsgType.FullServerResponse:
      if (msg.flag === MsgTypeFlagBits.PositiveSeq || msg.flag === MsgTypeFlagBits.NegativeSeq) {
        writers.push(writeSequence);
      }
      break;
    case MsgType.Error:
      writers.push(writeErrorCode);
      break;
    default:
      throw new Error(`unsupported message type: ${msg.type}`);
  }

  writers.push(writePayload);
  return writers;
}

function getReaders(msg: Message): Array<(msg: Message, data: Uint8Array, offset: number) => number> {
  const readers: Array<(msg: Message, data: Uint8Array, offset: number) => number> = [];

  switch (msg.type) {
    case MsgType.AudioOnlyClient:
    case MsgType.AudioOnlyServer:
    case MsgType.FrontEndResultServer:
    case MsgType.FullClientRequest:
    case MsgType.FullServerResponse:
      if (msg.flag === MsgTypeFlagBits.PositiveSeq || msg.flag === MsgTypeFlagBits.NegativeSeq) {
        readers.push(readSequence);
      }
      break;
    case MsgType.Error:
      readers.push(readErrorCode);
      break;
    default:
      throw new Error(`unsupported message type: ${msg.type}`);
  }

  if (msg.flag === MsgTypeFlagBits.WithEvent) {
    readers.push(readEvent, readSessionId, readConnectId);
  }

  readers.push(readPayload);
  return readers;
}

// Writer functions
function writeEvent(msg: Message): Uint8Array | null {
  if (msg.event === undefined) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setInt32(0, msg.event, false);
  return new Uint8Array(buffer);
}

function writeSessionId(msg: Message): Uint8Array | null {
  if (msg.event === undefined) return null;

  switch (msg.event) {
    case EventType.StartConnection:
    case EventType.FinishConnection:
    case EventType.ConnectionStarted:
    case EventType.ConnectionFailed:
      return null;
  }

  const sessionId = msg.sessionId || '';
  const sessionIdBytes = new TextEncoder().encode(sessionId);
  const sizeBuffer = new ArrayBuffer(4);
  const sizeView = new DataView(sizeBuffer);
  sizeView.setUint32(0, sessionIdBytes.length, false);

  const result = new Uint8Array(4 + sessionIdBytes.length);
  result.set(new Uint8Array(sizeBuffer), 0);
  result.set(sessionIdBytes, 4);

  return result;
}

function writeSequence(msg: Message): Uint8Array | null {
  if (msg.sequence === undefined) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setInt32(0, msg.sequence, false);
  return new Uint8Array(buffer);
}

function writeErrorCode(msg: Message): Uint8Array | null {
  if (msg.errorCode === undefined) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, msg.errorCode, false);
  return new Uint8Array(buffer);
}

function writePayload(msg: Message): Uint8Array {
  const payloadSize = msg.payload.length;
  const sizeBuffer = new ArrayBuffer(4);
  const sizeView = new DataView(sizeBuffer);
  sizeView.setUint32(0, payloadSize, false);

  const result = new Uint8Array(4 + payloadSize);
  result.set(new Uint8Array(sizeBuffer), 0);
  result.set(msg.payload, 4);

  return result;
}

// Reader functions
function readEvent(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for event');
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  msg.event = view.getInt32(0, false);
  return offset + 4;
}

function readSessionId(msg: Message, data: Uint8Array, offset: number): number {
  if (msg.event === undefined) return offset;

  switch (msg.event) {
    case EventType.StartConnection:
    case EventType.FinishConnection:
    case EventType.ConnectionStarted:
    case EventType.ConnectionFailed:
    case EventType.ConnectionFinished:
      return offset;
  }

  if (offset + 4 > data.length) {
    throw new Error('insufficient data for session ID size');
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for session ID');
    }
    msg.sessionId = new TextDecoder().decode(data.slice(offset, offset + size));
    offset += size;
  }

  return offset;
}

function readConnectId(msg: Message, data: Uint8Array, offset: number): number {
  if (msg.event === undefined) return offset;

  switch (msg.event) {
    case EventType.ConnectionStarted:
    case EventType.ConnectionFailed:
    case EventType.ConnectionFinished:
      break;
    default:
      return offset;
  }

  if (offset + 4 > data.length) {
    throw new Error('insufficient data for connect ID size');
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for connect ID');
    }
    msg.connectId = new TextDecoder().decode(data.slice(offset, offset + size));
    offset += size;
  }

  return offset;
}

function readSequence(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for sequence');
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  msg.sequence = view.getInt32(0, false);
  return offset + 4;
}

function readErrorCode(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for error code');
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  msg.errorCode = view.getUint32(0, false);
  return offset + 4;
}

function readPayload(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for payload size');
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for payload');
    }
    msg.payload = data.slice(offset, offset + size);
    offset += size;
  }

  return offset;
}
