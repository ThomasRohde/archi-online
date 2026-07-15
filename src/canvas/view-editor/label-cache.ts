import type { LabelEvaluationResult } from '../../model/label-expression';
import type { ModelState } from '../../model/types';

type LabelEvaluator = (
  model: ModelState,
  objectId: string,
  expression?: string,
) => LabelEvaluationResult;

const cache = new WeakMap<ModelState, Map<string, LabelEvaluationResult>>();

export function evaluateCachedLabelExpression(
  model: ModelState,
  objectId: string,
  expression: string,
  evaluate: LabelEvaluator,
): LabelEvaluationResult {
  let modelCache = cache.get(model);
  if (!modelCache) {
    modelCache = new Map();
    cache.set(model, modelCache);
  }
  const key = `${objectId}\u0000${expression}`;
  const cached = modelCache.get(key);
  if (cached) return cached;
  const result = evaluate(model, objectId, expression);
  modelCache.set(key, result);
  return result;
}
