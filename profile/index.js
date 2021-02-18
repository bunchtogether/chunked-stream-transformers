
const crypto = require('crypto');
const {
  SerializeTransform,
  DeserializeTransform,
} = require('../dist');

async function run() {
  const memoryUsageStart = process.memoryUsage();
  const maxChunkSize = Math.ceil(1024 + Math.random() * 1024 * 1024);
  const serializeTransform = new SerializeTransform({ maxChunkSize });
  const deserializeTransform = new DeserializeTransform();
  let sentBytes = 0;
  let receivedBytes = 0;
  deserializeTransform.on('data', (buffer) => {
    receivedBytes += buffer.length;
  });
  serializeTransform.pipe(deserializeTransform);
  let start = Date.now();
  for (let i = 0; i < 100; i += 1) {
    const buffer = crypto.randomBytes(Math.ceil(1024 * 1024 * Math.random() * 512));
    sentBytes += buffer.length;
    serializeTransform.write(buffer);
    if(Math.random() < 0.2) {
      await deserializeTransform.onIdle();
      const seconds = (Date.now() - start) / 1000;
      console.log(` * Rate ${Math.round(100 * sentBytes / 1024 / 1024 / seconds) / 100} MB/s`);
      const memoryUsageCurrent = process.memoryUsage();
      console.log(` * Heap usage ${Math.round(100 * (memoryUsageCurrent.heapUsed - memoryUsageStart.heapUsed) / 1024 / 1024) / 100} MB`);
    }
  }
  await deserializeTransform.onIdle();
  serializeTransform.destroy();
  deserializeTransform.destroy();
  if(sentBytes !== receivedBytes) {
    throw new Error('Sent bytes does not match received bytes');
  }
  console.log(`Sent ${Math.round(100 * sentBytes / 1024 / 1024) / 100} MB`);
  const memoryUsageEnd = process.memoryUsage();
  for(const key of Object.keys(memoryUsageStart)) {
    console.log(`${key}: ${Math.round(100 * (memoryUsageEnd[key] - memoryUsageStart[key]) / 1024 / 1024) / 100} MB`);
  }
}

run();
