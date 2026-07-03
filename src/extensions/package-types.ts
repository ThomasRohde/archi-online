export interface StaticCommandContribution {
  id: string;
  title: string;
  description?: string;
}

export interface StaticMenuContribution {
  id: string;
  label: string;
  command: string;
  location: string;
}

export interface StaticToolbarContribution {
  id: string;
  label: string;
  command: string;
}

export interface StaticPanelContribution {
  id: string;
  title: string;
}

export interface StaticEventContribution {
  name: string;
}

export interface ExtensionManifestV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  contributes?: {
    commands?: StaticCommandContribution[];
    menus?: StaticMenuContribution[];
    toolbar?: StaticToolbarContribution[];
    panels?: StaticPanelContribution[];
    events?: StaticEventContribution[];
  };
}

export interface InstalledPackageFile {
  mediaType?: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

export interface InstalledExtensionPackage {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  manifest: ExtensionManifestV2;
  files: Record<string, InstalledPackageFile>;
  installedAt: number;
  updatedAt: number;
}

export interface ExtensionPackageInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  files: string[];
  installedAt: number;
  updatedAt: number;
}
