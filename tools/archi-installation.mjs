import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const EDITOR_BUNDLE_ID = 'com.archimatetool.editor';

/** Read the editor version selected by this Archi product configuration. */
export async function readConfiguredArchiEditorVersion(archiHome) {
  const bundlesInfo = join(
    archiHome,
    'configuration',
    'org.eclipse.equinox.simpleconfigurator',
    'bundles.info',
  );
  const configured = (await readFile(bundlesInfo, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(','))
    .filter(([id]) => id === EDITOR_BUNDLE_ID);
  if (configured.length !== 1) {
    throw new Error(`Expected exactly one configured ${EDITOR_BUNDLE_ID} bundle, found ${configured.length}`);
  }
  const version = configured[0][1]?.trim();
  if (!version) throw new Error(`Configured ${EDITOR_BUNDLE_ID} bundle has no version`);
  return version;
}
