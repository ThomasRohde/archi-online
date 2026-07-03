import type { ExtensionCommand, ExtensionRegistrySnapshot } from './types';

export function menuCommandIds(snapshot: ExtensionRegistrySnapshot): Set<string> {
  const ids = new Set<string>();
  for (const items of Object.values(snapshot.menus)) {
    for (const item of items) ids.add(item.command);
  }
  return ids;
}

export function autoListedExtensionCommands(
  snapshot: ExtensionRegistrySnapshot,
): ExtensionCommand[] {
  const visibleInMenus = menuCommandIds(snapshot);
  return snapshot.commands.filter((command) => !visibleInMenus.has(command.id));
}
