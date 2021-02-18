// @flow

const expect = require('expect');
const crypto = require('crypto');
const { Readable } = require('stream');
const {
  ChunkTimeoutError,
  ChunkIncompleteError,
  SerializeTransform,
  DeserializeTransform,
} = require('../src');

describe('Chunked Stream Transformers', () => {
  test('Serializes and deserializes a readable stream into consistently sized chunks', async () => {
    const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
    const serializeTransform = new SerializeTransform({ maxChunkSize });
    const deserializeTransform = new DeserializeTransform();
    const buffer = crypto.randomBytes(Math.ceil(maxChunkSize * 1000 * Math.random()));

    // $FlowFixMe
    const stream = Readable.from(buffer);

    const result = await new Promise((resolve, reject) => {
      serializeTransform.on('data', (data) => {
        if (data.length > maxChunkSize) {
          reject(new Error(`Chunk size of ${data.length} is greater than provided 'maxChunkSize' parameter`));
        }
      });
      deserializeTransform.on('data', resolve);
      serializeTransform.pipe(deserializeTransform);
      stream.pipe(serializeTransform);
    });

    expect(result.equals(buffer)).toEqual(true);
  });

  test('Reorders chunks', async () => {
    const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
    const serializeTransform = new SerializeTransform({ maxChunkSize });
    const deserializeTransform = new DeserializeTransform();
    const buffer = crypto.randomBytes(Math.ceil(maxChunkSize * 1000 * Math.random()));

    // $FlowFixMe
    const stream = Readable.from(buffer);

    const result = await new Promise((resolve, reject) => {
      deserializeTransform.on('data', resolve);

      serializeTransform.on('data', (data) => {
        setTimeout(() => {
          deserializeTransform.write(data);
        }, Math.random() * 100);
      });

      deserializeTransform.on('error', (error) => {
        reject(error);
      });

      deserializeTransform.on('idle', () => {
        deserializeTransform.end();
      });

      serializeTransform.on('error', (error) => {
        deserializeTransform.destroy(error);
        reject(error);
      });

      stream.pipe(serializeTransform);
    });

    expect(result.equals(buffer)).toEqual(true);
  });

  test('Emits errors if chunks time out', async () => {
    const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
    const serializeTransform = new SerializeTransform({ maxChunkSize });
    const deserializeTransform = new DeserializeTransform();
    const buffer = crypto.randomBytes(Math.ceil(maxChunkSize * 1000 * Math.random()));

    // $FlowFixMe
    const stream = Readable.from(buffer);

    const resultPromise = new Promise((resolve, reject) => {
      let initialChunk = true;
      serializeTransform.on('data', (data) => {
        if (!initialChunk) {
          return;
        }
        initialChunk = false;
        deserializeTransform.write(data);
      });

      deserializeTransform.on('error', (error) => {
        reject(error);
      });

      stream.pipe(serializeTransform);
    });

    await expect(resultPromise).rejects.toThrow(ChunkTimeoutError);
  });

  test('Emits errors if the stream is ended before chunks are completed', async () => {
    const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
    const serializeTransform = new SerializeTransform({ maxChunkSize });
    const deserializeTransform = new DeserializeTransform();
    const buffer = crypto.randomBytes(Math.ceil(maxChunkSize * 1000 * Math.random()));

    // $FlowFixMe
    const stream = Readable.from(buffer);

    const resultPromise = new Promise((resolve, reject) => {
      let initialChunk = true;
      serializeTransform.on('data', (data) => {
        if (!initialChunk) {
          deserializeTransform.end();
        }
        initialChunk = false;
        deserializeTransform.write(data);
      });

      deserializeTransform.on('error', (error) => {
        reject(error);
      });

      stream.pipe(serializeTransform);
    });

    await expect(resultPromise).rejects.toThrow(ChunkIncompleteError);
  });

  test('Discards chunk delivered more than once', async () => {
    const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
    const serializeTransform = new SerializeTransform({ maxChunkSize });
    const deserializeTransform = new DeserializeTransform();
    const buffer = crypto.randomBytes(Math.ceil(maxChunkSize * 1000 * Math.random()));

    let redundantChunksReceived = 0;
    let redundantChunksSent = 0;

    deserializeTransform.on('redundantchunk', () => {
      redundantChunksReceived += 1;
    });

    // $FlowFixMe
    const stream = Readable.from(buffer);

    const result = await new Promise((resolve, reject) => {
      deserializeTransform.on('data', resolve);

      serializeTransform.on('data', (data) => {
        setTimeout(() => {
          deserializeTransform.write(data);
        }, Math.random() * 100);
        if (Math.random() > 0.25) {
          setTimeout(() => {
            redundantChunksSent += 1;
            deserializeTransform.write(data);
          }, 100 + Math.random() * 100);
        }
      });

      deserializeTransform.on('idle', () => {
        deserializeTransform.end();
      });

      deserializeTransform.on('error', (error) => {
        reject(error);
      });

      serializeTransform.on('error', (error) => {
        deserializeTransform.destroy(error);
        reject(error);
      });

      stream.pipe(serializeTransform);
    });

    expect(redundantChunksReceived).toEqual(redundantChunksSent);

    expect(result.equals(buffer)).toEqual(true);
  });


  test('Emits active and idle events, resolves onActive and onIdle promises', async () => {
    const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
    const serializeTransform = new SerializeTransform({ maxChunkSize });
    const deserializeTransform = new DeserializeTransform();
    const buffer = crypto.randomBytes(maxChunkSize * 10 + Math.round(Math.random() * maxChunkSize * 10));

    // $FlowFixMe
    const stream = Readable.from(buffer);

    let isActive = deserializeTransform.active;

    deserializeTransform.on('active', () => {
      isActive = true;
    });

    deserializeTransform.on('idle', () => {
      isActive = false;
    });

    expect(isActive).toEqual(false);


    await expect(deserializeTransform.onIdle()).resolves.toBeUndefined();

    let onActivePromiseResolved = false;

    deserializeTransform.onActive().then(() => {
      onActivePromiseResolved = true;
    });

    let onIdlePromiseResolved = false;

    let chunkCount = 0;

    await new Promise((resolve, reject) => {
      deserializeTransform.on('data', () => {
        setImmediate(() => {
          // Wait a tick for the onIdle() promise to resolve
          resolve();
        });
      });

      serializeTransform.on('data', (data) => {
        if (chunkCount === 0) {
          expect(isActive).toEqual(false);
        } else if (chunkCount === 1) {
          deserializeTransform.onIdle().then(() => {
            onIdlePromiseResolved = true;
          });
          expect(isActive).toEqual(true);
        }
        chunkCount += 1;
        deserializeTransform.write(data);
      });

      deserializeTransform.on('idle', () => {
        deserializeTransform.end();
      });

      deserializeTransform.on('error', (error) => {
        reject(error);
      });

      serializeTransform.on('error', (error) => {
        deserializeTransform.destroy(error);
        reject(error);
      });

      stream.pipe(serializeTransform);
    });

    expect(onActivePromiseResolved).toEqual(true);
    expect(onIdlePromiseResolved).toEqual(true);
  });
});

