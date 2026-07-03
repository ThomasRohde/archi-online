import { describe, expect, it } from 'vitest';
import { autoListedExtensionCommands } from '../src/extensions/command-visibility';
import { createExtensionRegistry } from '../src/extensions/registry';
import { extensionMenuItems } from '../src/ui/ContextMenu';

describe('extension UI command helpers', () => {
  it('passes context-menu trigger data into extension commands', () => {
    const registry = createExtensionRegistry();
    let seenTrigger: unknown;
    const trigger = {
      x: 10,
      y: 20,
      viewId: 'view-1',
      targetId: 'node-1',
      selectionIds: ['node-1'],
    };
    registry.registerCommand('local.context', {
      id: 'local.context.inspect',
      title: 'Inspect',
      run: (context) => {
        seenTrigger = context.trigger;
      },
    });
    registry.addMenuItem('local.context', 'view.context', {
      id: 'local.context.menu',
      label: 'Inspect',
      command: 'local.context.inspect',
    });

    extensionMenuItems('view.context', trigger, registry)[0].onClick?.();

    expect(seenTrigger).toEqual(trigger);
  });

  it('auto-lists only commands that are not already in any extension menu', () => {
    const registry = createExtensionRegistry();
    for (const id of ['local.visible.run', 'local.extension-menu.run', 'local.context.run']) {
      registry.registerCommand('local.visible', {
        id,
        title: id,
        run: () => undefined,
      });
    }
    registry.addMenuItem('local.visible', 'extensions.menu', {
      id: 'local.extension-menu.item',
      label: 'Extension menu',
      command: 'local.extension-menu.run',
    });
    registry.addMenuItem('local.visible', 'selection.context', {
      id: 'local.context.item',
      label: 'Context',
      command: 'local.context.run',
    });

    expect(autoListedExtensionCommands(registry.getSnapshot()).map((command) => command.id)).toEqual([
      'local.visible.run',
    ]);
  });
});
