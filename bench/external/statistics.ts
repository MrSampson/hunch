export interface Interval { low: number; high: number }

export interface TaskCluster {
  task: string;
  a: number[];
  c: number[];
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
}

export function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function wilson(successes: number, total: number, z = 1.959963984540054): Interval {
  if (!total) return { low: Number.NaN, high: Number.NaN };
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return { low: center - radius, high: center + radius };
}

function choose(n: number, k: number): number {
  const bounded = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= bounded; i++) result = result * (n - bounded + i) / i;
  return result;
}

export function exactMcNemar(aWins: number, cWins: number): number {
  const discordant = aWins + cWins;
  if (!discordant) return 1;
  const tail = Math.min(aWins, cWins);
  let cumulative = 0;
  for (let k = 0; k <= tail; k++) cumulative += choose(discordant, k) / 2 ** discordant;
  return Math.min(1, 2 * cumulative);
}

function quantileNearestRank(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[index]!;
}

/** Task-cluster bootstrap: repeated model runs stay inside their task cluster. */
export function clusterBootstrapDifference(
  clusters: TaskCluster[],
  iterations = 20_000,
  seed = 0x5eed1234,
): Interval {
  if (!clusters.length || iterations < 1) return { low: Number.NaN, high: Number.NaN };
  let state = seed >>> 0;
  const random = (): number => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const effects: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sampledA: number[] = [];
    const sampledC: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[Math.floor(random() * clusters.length)]!;
      sampledA.push(...cluster.a);
      sampledC.push(...cluster.c);
    }
    effects.push(mean(sampledC) - mean(sampledA));
  }
  return { low: quantileNearestRank(effects, 0.025), high: quantileNearestRank(effects, 0.975) };
}
