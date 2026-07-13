/** Run every cleanup action and return all failures without short-circuiting. */
export async function settlePhase2Cleanup(actions) {
  const results = await Promise.allSettled(
    actions.map((action) => Promise.resolve().then(action)),
  );
  return results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
}

/** Re-throw one failure directly and retain every cause when several failed. */
export function throwPhase2Failures(failures, message) {
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, message);
}
