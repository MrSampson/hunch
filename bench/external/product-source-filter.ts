/** Frozen rejected experiment: remove non-product-looking paths before the
 * adaptive correction diagnostic. Kept outside production for reproducibility.
 */
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

const NON_PRODUCT_PATH = /(?:^|\/)(?:docs?|documentation|examples?|playgrounds?|fixtures?|__fixtures__|benchmarks?|scripts?|tooling|scratch)(?:\/|$)|(?:^|\/)scratch\.[cm]?[jt]sx?$|\.config\.[cm]?[jt]sx?$|\.d\.ts$/i;

export function diagnoseWithProductSourceFilter(
  issue: string,
  sources: ContractAxisOwnerSource[],
  limit = 5,
) {
  const product = sources.filter((source) => !NON_PRODUCT_PATH.test(source.path));
  return diagnoseIssueCorrectionStage(issue, product.length ? product : sources, limit);
}
