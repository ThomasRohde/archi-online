import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Rebuild the frozen Desktop golden from its authored source, require exact
 * Desktop output bytes, then check both ends against the independent contract.
 */
export async function verifyFrozenDesktopSource({
  sourcePath,
  goldenPath,
  candidatePath,
  saveWithDesktop,
  verifySemantics,
}) {
  await saveWithDesktop(sourcePath, candidatePath);
  const [sourceBytes, candidateBytes, goldenBytes] = await Promise.all([
    readFile(sourcePath),
    readFile(candidatePath),
    readFile(goldenPath),
  ]);
  if (!candidateBytes.equals(goldenBytes)) {
    throw new Error(
      `Desktop output from the authored source differs from the frozen Desktop golden: `
      + `${digest(candidateBytes)} != ${digest(goldenBytes)}`,
    );
  }
  await verifySemantics(new Uint8Array(sourceBytes), 'Desktop-authored source semantics');
  await verifySemantics(new Uint8Array(candidateBytes), 'Frozen Desktop golden semantics');
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
