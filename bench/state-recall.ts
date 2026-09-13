/** A frozen public fixture, not a production corpus or an agent-behavior evaluation. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { HunchStore } from '../src/store/hunchStore.js';
import { hunchPaths } from '../src/core/paths.js';
import { writeFileAtomic } from '../src/core/io.js';
import { stateHash, type StateFacet } from '../src/core/stateContract.js';
import { readState, recordsState, subscribeState, writeState } from '../src/store/stateBinding.js';
import { evaluateRetrieval, type EvalMetrics } from '../src/eval/harness.js';
import { selectEmbedder, type Embedder } from '../src/store/embedder.js';

const scope = { kind: 'organization', id: 'state-recall-fixture' } as const;
const principal = { id: 'writer', kind: 'agent', grants: [scope] } as const;
const guest = { id: 'guest', kind: 'agent', grants: [scope] } as const;
const at = '2026-09-13T10:00:00Z';
const provenance = { source: 'agent_recorded', confidence: 0.9, evidence: ['Synthetic public recall fixture; not a real customer'] };
const external = (key: string, version = 'v1') => ({ system: 'fixture', object_type: 'case', object_key: key, version, content_hash: stateHash(key + version), observed_at: at });
type Golden = { kind: string; group: 'literal' | 'paraphrase'; query: string; expected: string[] };
type Saved = ReturnType<typeof writeState>;

export async function evaluateStateFixture(embedder?: Embedder) {
  const root = mkdtempSync(join(tmpdir(), 'hunch-state-recall-'));
  const previous = process.env.HUNCH_PRIVATE_DIR; delete process.env.HUNCH_PRIVATE_DIR;
  let store: HunchStore;
  try { store = new HunchStore(hunchPaths(root)); }
  finally { if (previous !== undefined) process.env.HUNCH_PRIVATE_DIR = previous; }
  try {
    store.json.ensureDirs();
    writeFileAtomic(join(hunchPaths(root).hunch, 'partition.json'), JSON.stringify(scope));
    const saved: Record<string, Saved> = {};
    let sequence = 0;
    const write = (key: string, facet: StateFacet, record: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const result = writeState(store, { schema: 'nuryel.state.write/1', scope, principal, facet, record,
        idempotency_key: `state-evaluation-${++sequence}`, ...extra }); saved[key] = result; return result;
    };
    const derived = (subject: string, content: string, version = 'v1') => ({ schema: 'nuryel.derived/1', scope, subject, content,
      content_hash: stateHash(content), dependencies: [{ kind: 'external', ref: external(subject, version) }],
      transform_version: 'state-recall/v1', computed_at: at, valid_to: null, state: 'current', provenance });
    write('entity', 'entities', { schema: 'nuryel.entity/1', id: 'customer:northside', kind: 'customer', name: 'Northside clinic',
      scope, refs: [external('clinic-7')], attributes: {}, lifecycle: 'active', created_at: at, updated_at: at, provenance });
    write('old', 'derived', derived('customer:northside', 'The clinic elevator remains broken. Schedule repair.'));
    write('clinic', 'derived', derived('customer:northside', 'The clinic elevator was repaired and passed its inspection.', 'v2'), { supersedes: saved.old!.record_id });
    write('billing', 'derived', derived('customer:billing', 'The invoice billing error was corrected and the customer was refunded.'));
    write('shipment', 'derived', derived('order:shipment', 'The shipment left the warehouse and was dispatched to the customer.'));
    for (const [key, subject, title] of [['report', 'customer:northside', 'Send the clinic inspection report'], ['reconcile', 'customer:billing', 'Complete invoice reconciliation']]) {
      write(key!, 'commitments', { schema: 'nuryel.commitment/1', scope, subject, title, owner: 'writer', due: '2099-01-01', status: 'open', valid_from: at, valid_to: null, provenance });
    }
    write('repair', 'receipts', { schema: 'nuryel.receipt/1', scope, actor: 'writer', action_kind: 'elevator_repair', target: external('clinic-7'),
      request_fingerprint: stateHash('repair'), state: 'verified', occurred_at: at, verified_at: at, invalidates: [], provenance });
    write('language', 'conventions', { schema: 'nuryel.convention/1', scope, key: 'communication.language', value: 'Use plain language in replies.',
      status: 'proposed', sources: [{ kind: 'external', ref: external('style') }], valid_from: at, valid_to: null, review_by: '2099-01-01T00:00:00Z', provenance });
    // Similar vocabulary on unrelated subjects makes this more than an empty-index smoke test.
    for (let n = 0; n < 24; n++) write(`distractor-${n}`, 'derived', derived(`archive:case-${n}`, `Archive case ${n}: clinic billing shipment report queued for review.`));
    const questions = JSON.parse(readFileSync(new URL('./state-golden-retrieval.json', import.meta.url), 'utf8')) as Golden[];
    const corpus = Object.entries(saved).map(([key, value]) => ({ key, id: value.record_id, hash: stateHash(store.resolve(value.record_id)!.record) }));
    const score = async (group: Golden['group'], model?: Embedder): Promise<EvalMetrics> => {
      const perCase: EvalMetrics['perCase'] = [];
      for (const c of questions.filter(c => c.group === group)) {
        const result = await evaluateRetrieval(store, [{ query: c.query, expected: c.expected.map(key => saved[key]!.record_id) }], { kind: c.kind, k: 3, embedder: model ?? null });
        perCase.push(...result.perCase);
      }
      return { n: perCase.length, k: 3, perCase, recallAtK: perCase.reduce((n, c) => n + c.recall, 0) / perCase.length,
        mrr: perCase.reduce((n, c) => n + c.rr, 0) / perCase.length, hitRate: perCase.filter(c => c.found).length / perCase.length };
    };
    store.reindex();
    const lexical = { literal: await score('literal'), paraphrase: await score('paraphrase') };
    let semantic: { status: 'not-run' | 'measured'; model?: string; literal?: EvalMetrics; paraphrase?: EvalMetrics } = { status: 'not-run' };
    if (embedder) {
      await store.embedAll(embedder);
      semantic = { status: 'measured', model: embedder.id, literal: await score('literal', embedder), paraphrase: await score('paraphrase', embedder) };
    }
    const failures: string[] = []; let checks = 0;
    const check = (label: string, pass: boolean) => { checks++; if (!pass) failures.push(label); };
    const read = (subject: string, who: unknown = principal) => readState(store, { schema: 'nuryel.state.read/1', scope, principal: who, subject });
    const current = (subject: string) => read(subject).response.state_of_record!.current.map(ref => ref.id);
    check('superseded summary excluded from current', !current('customer:northside').includes(saved.old!.record_id));
    check('current summary returned by external identity', current('case:clinic-7').includes(saved.clinic!.record_id));
    check('external key and entity identity agree', JSON.stringify(current('case:clinic-7')) === JSON.stringify(current('customer:northside')));
    write('clinic-stale', 'derived', { ...saved.clinic!.record, state: 'stale' }, { expected_version: saved.clinic!.record_hash, cause: { kind: 'external', ref: external('customer:northside', 'v3') } });
    check('explicit invalidation removes current answer', !current('customer:northside').includes(saved.clinic!.record_id));
    const observed = write('observation', 'derived', { ...derived('case:observation', 'An unverified opening-hours report.'), state: 'unknown' });
    check('unverified observation never becomes current', !current('case:observation').includes(observed.record_id));
    check('unverified observation stays available as observed', !!read('case:observation').response.state_of_record!.observed?.some(ref => ref.id === observed.record_id));
    const source = write('protected', 'derived', { ...derived('case:protected', 'Protected budget ceiling is 4100 units.'), visibility: { owner: 'writer', readers: ['guest'], writers: [] } });
    const dependent = write('dependent', 'derived', { ...derived('case:dependent', 'A derived budget answer'), dependencies: [{ kind: 'record', id: source.record_id, record_hash: source.record_hash }] });
    check('granted reader receives protected source', !!read('case:protected', guest).response.records?.[source.record_id]);
    check('granted reader receives dependent record', !!read('case:dependent', guest).response.records?.[dependent.record_id]);
    write('revoked', 'derived', { ...source.record, visibility: { owner: 'writer', readers: [], writers: [] } }, { expected_version: source.record_hash });
    check('revocation withholds source', !read('case:protected', guest).response.records?.[source.record_id]);
    check('revocation withholds dependent', !read('case:dependent', guest).response.records?.[dependent.record_id]);
    const records = recordsState(store, { schema: 'nuryel.state.records/1', scope, principal: guest, ids: [source.record_id, dependent.record_id] });
    check('exact lookup does not leak revoked records', Object.keys(records.records).length === 0 && records.missing.length === 2);
    const events = subscribeState(store, { schema: 'nuryel.state.subscribe/1', scope, principal: guest, after_seq: 0 });
    check('history does not leak revoked source', !events.events.some(event => event.record_id === source.record_id));
    try { read('case:protected', { ...guest, grants: [{ kind: 'user', id: 'outside' }] }); check('ungranted scope refused', false); }
    catch (error) { check('ungranted scope refused', (error as { code?: string }).code === 'outside-grants'); }
    return { schema: 'hunch.state-recall-evaluation/1', corpus: { origin: 'synthetic-public-fixture', records: corpus.length,
      content_hash: stateHash(corpus), questions_hash: stateHash(questions), runner_hash: stateHash(readFileSync(import.meta.url.startsWith('file:') ? new URL(import.meta.url) : import.meta.url, 'utf8')) }, lexical, semantic, invariants: { checks, failures },
      limits: ['No production corpus or independent user outcomes.', 'No live external source fetch; freshness is measured after explicit invalidation.',
        'Raw kind-scoped search is a trusted-store interface; permission checks exercise authenticated state reads, records and history.',
        'Fixture recall is not evidence that an agent acts from the returned state.'] };
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let model: Embedder | undefined;
  if (process.argv.includes('--semantic')) {
    const selected = await selectEmbedder();
    if (!selected || selected.id.startsWith('stub')) throw new Error('--semantic requires the real optional local embedder; no stub/fallback is scored');
    model = selected;
  }
  const report = await evaluateStateFixture(model);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  const output = JSON.stringify({ ...report, revision, dirty }, null, 2) + '\n';
  const destination = process.argv.indexOf('--output');
  if (destination !== -1) { if (!process.argv[destination + 1]) throw new Error('--output needs a path'); writeFileSync(resolve(process.argv[destination + 1]!), output); }
  else process.stdout.write(output);
  if (report.invariants.failures.length || report.lexical.literal.recallAtK < 1 || report.lexical.literal.mrr < 0.75) process.exitCode = 1;
}
