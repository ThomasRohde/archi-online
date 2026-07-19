app.extension({
  id: 'examples.capability-map',
  name: 'Capability Map',
  version: '1.9.2'
});

var config = app.assets.json('data/defaults.json');
var panel = null;

function knownValue(options, value, fallback) {
  return options.some(function (option) {
    return option.value === value;
  }) ? value : fallback;
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function clamp(value, fallback, min, max) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readOptions() {
  var stored = (await app.storage.get('options')) || {};
  return {
    mode: knownValue(config.options.mode, stored.mode, config.defaults.mode),
    sort: knownValue(config.options.sort, stored.sort, config.defaults.sort),
    depth: clamp(stored.depth, config.defaults.depth, config.limits.depth.min, config.limits.depth.max),
    leafWidth: clamp(stored.leafWidth, config.defaults.leafWidth, config.limits.leafWidth.min, config.limits.leafWidth.max),
    leafHeight: clamp(stored.leafHeight, config.defaults.leafHeight, config.limits.leafHeight.min, config.limits.leafHeight.max),
    padding: clamp(stored.padding, config.defaults.padding, config.limits.padding.min, config.limits.padding.max),
    gutter: clamp(stored.gutter, config.defaults.gutter, config.limits.gutter.min, config.limits.gutter.max),
    targetAspect: clamp(stored.targetAspect, config.defaults.targetAspect, config.limits.targetAspect.min, config.limits.targetAspect.max),
    weightProperty: textValue(stored.weightProperty),
    heatmapProperty: textValue(stored.heatmapProperty),
    levelFills: textValue(stored.levelFills)
  };
}

async function writeOptions(options) {
  await app.storage.set('options', options);
}

function layoutFrom(options) {
  return {
    mode: options.mode,
    sort: options.sort,
    leafWidth: options.leafWidth,
    leafHeight: options.leafHeight,
    padding: options.padding,
    gutter: options.gutter,
    targetAspect: options.targetAspect
  };
}

function styleFrom(options) {
  if (!options.levelFills) return undefined;
  var fills = options.levelFills.split(',').map(function (entry) {
    return entry.trim();
  }).filter(function (entry) {
    return entry.length > 0;
  });
  return fills.length > 0 ? { levelFills: fills } : undefined;
}

function mapOptionsFrom(options) {
  return {
    depth: options.depth > 0 ? options.depth : undefined,
    weightProperty: options.weightProperty || undefined,
    layout: layoutFrom(options),
    style: styleFrom(options)
  };
}

/**
 * Fire-and-forget dialog: the command result must not wait on the user
 * dismissing an informational dialog (that would hold the extension
 * invocation lease on the model store open).
 */
function info(title, message) {
  void app.dialogs.info(title, message);
}

function rootIdsFrom(context) {
  var trigger = context && context.trigger;
  var candidates;
  if (trigger && typeof trigger.targetId === 'string') {
    var selection = Array.isArray(trigger.selectionIds) ? trigger.selectionIds : [];
    candidates = selection.indexOf(trigger.targetId) >= 0 ? selection : [trigger.targetId];
  } else {
    candidates = (context && context.selectionIds) || [];
  }
  return candidates.filter(function (id) {
    return $('#' + id).is('element');
  });
}

async function generateFrom(context) {
  var roots = rootIdsFrom(context);
  if (roots.length === 0) {
    info('Capability map', 'Select one or more elements (for example root capabilities) first.');
    return undefined;
  }
  var options = await readOptions();
  var mapOptions = mapOptionsFrom(options);
  var rootName = $('#' + roots[0]).first().name;
  var view = model.createPackedView({
    roots: roots,
    name: roots.length === 1 ? rootName + ' — Capability Map' : 'Capability Map',
    depth: mapOptions.depth,
    weightProperty: mapOptions.weightProperty,
    layout: mapOptions.layout,
    style: mapOptions.style
  });
  var count = view.nodes({ recursive: true }).length;
  info('Capability map', 'Created "' + view.name + '" with ' + count + ' capabilities.');
  return { viewId: view.id, nodeCount: count };
}

async function repack() {
  var view = app.views.active();
  if (!view) {
    info('Capability map', 'Open a view first.');
    return undefined;
  }
  var options = await readOptions();
  var scope = app.selection.visuals();
  var result = view.layoutPacked({
    mode: options.mode,
    sort: 'none',
    leafWidth: options.leafWidth,
    leafHeight: options.leafHeight,
    padding: options.padding,
    gutter: options.gutter,
    targetAspect: options.targetAspect,
    weightProperty: options.weightProperty || undefined,
    scope: scope.length > 0 ? scope : undefined
  });
  if (result.nodeCount === 0) {
    info('Capability map', 'No element nodes to repack in this view.');
  } else {
    info('Capability map', 'Repacked ' + result.nodeCount + ' nodes.');
  }
  return result;
}

async function sync() {
  var view = app.views.active();
  if (!view) {
    info('Capability map', 'Open a capability map view first.');
    return undefined;
  }
  var options = await readOptions();
  var result = view.syncPacked(mapOptionsFrom(options));
  info(
    'Capability map',
    'Added ' + result.added + ', removed ' + result.removed
      + ', reparented ' + result.reparented + '.'
  );
  return result;
}

async function heatmap() {
  var view = app.views.active();
  if (!view) {
    info('Capability map', 'Open a capability map view first.');
    return undefined;
  }
  var options = await readOptions();
  var property = options.heatmapProperty
    || window.prompt('Element property to color by (e.g. maturity):');
  if (!property) return undefined;
  var result = view.applyHeatmap({
    property: property,
    missingColor: '#dddddd'
  });
  if (result.painted === 0) {
    info('Capability map', 'No elements in this view carry the property "' + property + '".');
  } else {
    info(
      'Capability map',
      'Painted ' + result.painted + ' nodes (' + result.missing + ' without a value).'
    );
  }
  return result;
}

function addLabel(container, text) {
  var label = document.createElement('label');
  label.textContent = text;
  label.style.fontWeight = '600';
  label.style.fontSize = '12px';
  container.appendChild(label);
  return label;
}

function addRow(container) {
  var row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gap = '4px';
  row.style.alignContent = 'start';
  row.style.gridAutoRows = 'max-content';
  container.appendChild(row);
  return row;
}

function addSelect(container, labelText, value, values, onChange) {
  var row = addRow(container);
  addLabel(row, labelText);
  var select = document.createElement('select');
  select.style.width = '100%';
  select.style.boxSizing = 'border-box';
  select.style.height = '32px';
  select.style.font = 'inherit';
  values.forEach(function (entry) {
    var option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    select.appendChild(option);
  });
  select.value = value;
  select.onchange = function () {
    onChange(select.value);
  };
  row.appendChild(select);
}

function addNumber(container, labelText, value, limits, step, onChange) {
  var row = addRow(container);
  addLabel(row, labelText);
  var input = document.createElement('input');
  input.type = 'number';
  input.min = String(limits.min);
  input.max = String(limits.max);
  input.step = String(step);
  input.value = String(value);
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.height = '32px';
  input.style.font = 'inherit';
  input.onchange = function () {
    onChange(clamp(Number(input.value), value, limits.min, limits.max));
  };
  row.appendChild(input);
}

function addText(container, labelText, value, placeholder, onChange) {
  var row = addRow(container);
  addLabel(row, labelText);
  var input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.height = '32px';
  input.style.font = 'inherit';
  input.onchange = function () {
    onChange(input.value.trim());
  };
  row.appendChild(input);
}

function addButton(container, label, onClick) {
  var button = document.createElement('button');
  button.textContent = label;
  button.style.height = '32px';
  button.onclick = function () {
    Promise.resolve(onClick()).catch(function (error) {
      return info('Capability map failed', error && error.message ? error.message : String(error));
    });
  };
  container.appendChild(button);
  return button;
}

async function renderPanel() {
  if (!panel) return;
  var options = await readOptions();
  panel.replaceChildren();
  panel.style.fontFamily = 'system-ui, sans-serif';
  panel.style.fontSize = '13px';
  panel.style.display = 'grid';
  panel.style.gap = '12px';
  panel.style.alignContent = 'start';
  panel.style.gridAutoRows = 'max-content';
  panel.style.width = '100%';
  panel.style.maxWidth = '520px';
  panel.style.boxSizing = 'border-box';

  var title = document.createElement('div');
  var titleStrong = document.createElement('strong');
  titleStrong.textContent = 'Capability Map';
  var titleDetail = document.createElement('span');
  titleDetail.style.color = 'GrayText';
  titleDetail.textContent = 'Packed nested rectangles from composition/aggregation hierarchies.';
  title.appendChild(titleStrong);
  title.appendChild(document.createElement('br'));
  title.appendChild(titleDetail);
  panel.appendChild(title);

  addSelect(panel, 'Layout mode', options.mode, config.options.mode, function (value) {
    options.mode = value;
    void writeOptions(options);
  });
  addSelect(panel, 'Sort siblings', options.sort, config.options.sort, function (value) {
    options.sort = value;
    void writeOptions(options);
  });
  addNumber(panel, 'Depth limit (0 = unlimited)', options.depth, config.limits.depth, 1, function (value) {
    options.depth = value;
    void writeOptions(options);
  });
  addNumber(panel, 'Leaf width', options.leafWidth, config.limits.leafWidth, 1, function (value) {
    options.leafWidth = value;
    void writeOptions(options);
  });
  addNumber(panel, 'Leaf height', options.leafHeight, config.limits.leafHeight, 1, function (value) {
    options.leafHeight = value;
    void writeOptions(options);
  });
  addNumber(panel, 'Padding', options.padding, config.limits.padding, 1, function (value) {
    options.padding = value;
    void writeOptions(options);
  });
  addNumber(panel, 'Gutter', options.gutter, config.limits.gutter, 1, function (value) {
    options.gutter = value;
    void writeOptions(options);
  });
  addNumber(panel, 'Target aspect (W/H)', options.targetAspect, config.limits.targetAspect, 0.1, function (value) {
    options.targetAspect = value;
    void writeOptions(options);
  });
  addText(panel, 'Weight property (treemap)', options.weightProperty, 'e.g. headcount', function (value) {
    options.weightProperty = value;
    void writeOptions(options);
  });
  addText(panel, 'Heat-map property', options.heatmapProperty, 'e.g. maturity', function (value) {
    options.heatmapProperty = value;
    void writeOptions(options);
  });
  addText(panel, 'Level fills (comma-separated, empty = derived)', options.levelFills, '#f5deaa, #f8e8c4, ...', function (value) {
    options.levelFills = value;
    void writeOptions(options);
  });

  var buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.gap = '8px';
  buttons.style.flexWrap = 'wrap';
  buttons.style.alignItems = 'center';
  addButton(buttons, 'Generate from selection', function () {
    return writeOptions(options).then(function () {
      return app.commands.run('examples.capability-map.generate');
    });
  });
  addButton(buttons, 'Repack view', function () {
    return writeOptions(options).then(function () {
      return app.commands.run('examples.capability-map.repack');
    });
  });
  addButton(buttons, 'Sync view', function () {
    return writeOptions(options).then(function () {
      return app.commands.run('examples.capability-map.sync');
    });
  });
  addButton(buttons, 'Heat map', function () {
    return writeOptions(options).then(function () {
      return app.commands.run('examples.capability-map.heatmap');
    });
  });
  addButton(buttons, 'Reset', function () {
    return writeOptions(config.defaults).then(renderPanel);
  });
  panel.appendChild(buttons);
}

app.commands.register('examples.capability-map.generate', {
  title: 'Generate capability map',
  description: 'Create a packed capability-map view from the selected root element(s).',
  run: function (context) {
    return generateFrom(context);
  }
});

app.commands.register('examples.capability-map.repack', {
  title: 'Repack capability map',
  description: 'Repack the active view (or selected containers) into a packed layout.',
  run: function () {
    return repack();
  }
});

app.commands.register('examples.capability-map.sync', {
  title: 'Sync capability map with model',
  description: 'Add new children, remove stale ones, reparent, and repack the active view.',
  run: function () {
    return sync();
  }
});

app.commands.register('examples.capability-map.heatmap', {
  title: 'Apply capability heat map',
  description: 'Color capabilities from an element property and add a bucket legend.',
  run: function () {
    return heatmap();
  }
});

app.commands.register('examples.capability-map.open', {
  title: 'Open capability map panel',
  run: function () {
    app.panels.show('examples.capability-map.panel');
  }
});

app.menus.addItem('extensions.menu', {
  id: 'examples.capability-map.menu.open',
  label: 'Capability map...',
  command: 'examples.capability-map.open'
});

app.menus.addItem('model-tree.context', {
  id: 'examples.capability-map.tree.generate',
  label: 'Generate capability map',
  command: 'examples.capability-map.generate'
});

app.menus.addItem('view.context', {
  id: 'examples.capability-map.view.repack',
  label: 'Repack capability map',
  command: 'examples.capability-map.repack'
});

app.menus.addItem('view.context', {
  id: 'examples.capability-map.view.sync',
  label: 'Sync capability map with model',
  command: 'examples.capability-map.sync'
});

app.menus.addItem('view.context', {
  id: 'examples.capability-map.view.heatmap',
  label: 'Apply capability heat map',
  command: 'examples.capability-map.heatmap'
});

app.menus.addItem('selection.context', {
  id: 'examples.capability-map.selection.repack',
  label: 'Repack selected capabilities',
  command: 'examples.capability-map.repack'
});

app.panels.register('examples.capability-map.panel', {
  title: 'Capability Map',
  render: function (container) {
    panel = container;
    void renderPanel();
    return function () {
      panel = null;
    };
  }
});
