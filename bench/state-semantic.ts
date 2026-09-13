/** Optional reproducible CPU measurement; no model request is sent to a hosted API. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { evaluateStateFixture } from './state-recall.js';
import type { Embedder } from '../src/store/embedder.js';

const model = 'Xenova/all-MiniLM-L6-v2';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const runtimeArg = process.argv.indexOf('--runtime');
const runtime = runtimeArg === -1 ? '@huggingface/transformers' : pathToFileURL(resolve(process.argv[runtimeArg + 1]!)).href;
const { pipeline, env } = await import(runtime);
const extractor = await pipeline('feature-extraction', model, { revision, dtype: 'fp32', device: 'cpu' });
const embedder: Embedder = {
  id: `${model}@${revision}:fp32`, dim: 384,
  async embed(texts) {
    const result = await extractor(texts, { pooling: 'mean', normalize: true });
    return texts.map((_, i) => new Float32Array(result.data.slice(i * 384, (i + 1) * 384)));
  },
};
try {
  const report = await evaluateStateFixture(embedder);
  const result = { ...report, model: { name: model, revision, dtype: 'fp32', pooling: 'mean', normalized: true, runtime: env.version },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() };
  const output = JSON.stringify(result, null, 2) + '\n';
  const destination = process.argv.indexOf('--output');
  if (destination === -1) process.stdout.write(output);
  else { if (!process.argv[destination + 1]) throw new Error('--output needs a path'); writeFileSync(resolve(process.argv[destination + 1]!), output); }
  if (report.invariants.failures.length) process.exitCode = 1;
} finally { await extractor.dispose(); }
