# Chunked Stream Transformers

[![CircleCI](https://circleci.com/gh/bunchtogether/chunked-stream-transformers.svg?style=svg)](https://circleci.com/gh/bunchtogether/chunked-stream-transformers) [![npm version](https://badge.fury.io/js/%40bunchtogether%2Fchunked-stream-transformers.svg)](https://badge.fury.io/js/%40bunchtogether%2Fchunked-stream-transformers)

[``SerializeTransform``](https://github.com/bunchtogether/chunked-stream-transformers#serializetransform) transforms large binary chunks into small chunks limited to a maximum size. [``DeserializeTransform``](https://github.com/bunchtogether/chunked-stream-transformers#deserializetransform) reassembles the small chunks to recreate the original large chunks.

The protocol implementation is conceptually similar to [Real-time Transport Protocol (RTP)](https://en.wikipedia.org/wiki/Real-time_Transport_Protocol).

Useful for distributed systems where messages may arrive out of order.

Extends the Node.js [Transform](https://nodejs.org/api/stream.html#stream_class_stream_transform) and can be used with any stream. No dependencies.

If you encounter an issue, fork the repository, [write tests demonstrating](https://github.com/bunchtogether/chunked-stream-transformers/tree/master/tests) the issue, and create a [pull request](https://github.com/bunchtogether/chunked-stream-transformers).

```js
const crypto = require('crypto');
const { 
  SerializeTransform, 
  DeserializeTransform, 
  ChunkTimeoutError, 
  ChunkIncompleteError 
} = require('@bunchtogether/chunked-stream-transformers');

const serializeTransform = new SerializeTransform({
  maxChunkSize: 1024 // bytes
});

const deserializeTransform = new DeserializeTransform({
  timeout: 1000 // ms
});

// 10 MB buffer
const originalBuffer = crypto.randomBytes(10 * 1024 * 1024);

// The serialize transform will chunk to "maxChunkSize"
// inclusive of a 12 byte header used for chunk reordering
serializeTransform.on('data', (chunk) => {
  // Chunks may be sent out of order
  setTimeout(() => {
    deserializeTransform.write(chunk);
  }, Math.random() * 100);
});

// The deserialize transform will reorder the chunks
// and recreate the original buffer
deserializeTransform.on('data', (receivedBuffer) => {
  originalBuffer.equals(receivedBuffer); // true
});

serializeTransform.write(originalBuffer);

deserializeTransform.onIdle().then(() => {
  // Resolves immediately if no writes are active
  // or when all writes are complete
});

deserializeTransform.onActive().then(() => {
  // Resolves immediately if writes are active
  // or when a write begins
});

// Active event is emitted when all chunks start
deserializeTransform.on('active', () => {
  
});

// Idle event is emitted when all chunks have been completed
deserializeTransform.on('idle', () => {
  deserializeTransform.end(); // Safe to close the stream
});

deserializeTransform.on('error', (error) => {
  if(error instanceof ChunkTimeoutError) {
    // One of the writes timed out
  } else if(error instanceof ChunkIncompleteError) {
    // The transform was closed while a write was in progress
  }
});

```

## Install

`yarn add @bunchtogether/chunked-stream-transformers`

## API

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

#### Table of Contents

-   [ChunkTimeoutError](#chunktimeouterror)
-   [ChunkIncompleteError](#chunkincompleteerror)
-   [SerializeTransform](#serializetransform)
    -   [Parameters](#parameters)
-   [DeserializeTransform](#deserializetransform)
    -   [Parameters](#parameters-1)
    -   [bytesRemaining](#bytesremaining)
    -   [onIdle](#onidle)
    -   [onActive](#onactive)

### ChunkTimeoutError

**Extends Error**

Emitted by DeserializeTransform streams when the time after the last
byte in a chunk received exeeds the 'timeout' parameter

### ChunkIncompleteError

**Extends Error**

Emitted by DeserializeTransform streams that are ended while chunks are
in progress

### SerializeTransform

**Extends Transform**

Ingests data of any size, emits consistently sized chunks containing
a 12 byte header used by DeserializeTransform to reconstruct the original
stream

#### Parameters

-   `options` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** Transform stream options, see [Node.js documentation](https://nodejs.org/api/stream.html#stream_class_stream_transform) for full documentation (optional, default `{maxChunkSize:1316}`)
    -   `options.maxChunkSize` **[number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)** Maximum size in bytes of emitted chunks, including a 12 byte header. (optional, default `1316`)

### DeserializeTransform

**Extends Transform**

Ingests consistently sized chunks generated by SerializeTransform
and emits the original, larger chunks

#### Parameters

-   `options` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** Transform stream options, see [Node.js documentation](https://nodejs.org/api/stream.html#stream_class_stream_transform) for full documentation (optional, default `{timeout:5000}`)
    -   `options.timeout` **[number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)** Maximum size in bytes of emitted chunks, including a 12 byte header. (optional, default `5000`)

#### bytesRemaining

Bytes remaining from active chunks

Type: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)

Returns **[number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)** 

#### onIdle

Resolves when all chunks have completed

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;void>** 

#### onActive

Resolves when chunks are initially received

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;void>** 
