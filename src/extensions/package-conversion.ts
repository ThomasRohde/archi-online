import type { InstalledExtensionPackage } from './package-types';

export function nonSourcePackageFiles(pkg: InstalledExtensionPackage): string[] {
  const main = pkg.manifest.main;
  return Object.keys(pkg.files)
    .filter((path) => path !== 'manifest.json' && path !== main)
    .sort();
}

export function packageConversionWarning(pkg: InstalledExtensionPackage): string {
  const extraFiles = nonSourcePackageFiles(pkg);
  if (extraFiles.length === 0) {
    return `Convert "${pkg.name}" into an editable local source extension?`;
  }
  const fileWord = extraFiles.length === 1 ? 'file' : 'files';
  return `Convert "${pkg.name}" into an editable local source extension? ${extraFiles.length} bundled ${fileWord} will be lost, and app.assets.* calls will stop working.`;
}

export function packageImportWarning(pkg: InstalledExtensionPackage, replacing: boolean): string {
  const action = replacing
    ? `Replace the existing "${pkg.id}" extension in this browser profile?`
    : `Install "${pkg.name}" in this browser profile?`;
  return `${action} Extensions run with full access to your models and browser profile. Only install files you trust.`;
}
