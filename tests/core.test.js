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

describe.skip('Chunked Stream Transformers', () => {
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

      let serializeTransformFinished = false;
      let pendingWrites = 0;

      serializeTransform.on('data', (data) => {
        pendingWrites += 1;
        setTimeout(() => {
          deserializeTransform.write(data);
          pendingWrites -= 1;
          if (serializeTransformFinished && pendingWrites === 0) {
            deserializeTransform.end();
          }
        }, Math.random() * 100);
      });

      serializeTransform.on('finish', () => {
        serializeTransformFinished = true;
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
});

