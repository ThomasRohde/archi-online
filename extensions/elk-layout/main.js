app.extension({
  id: 'examples.elk-layout',
  name: 'ELK Layout',
  version: '1.2.1'
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

async function readOptions() {
  var stored = (await app.storage.get('options')) || {};
  return {
    scope: knownValue(config.options.scope, stored.scope, config.defaults.scope),
    direction: knownValue(config.options.direction, stored.direction, config.defaults.direction),
    edgeRouting: knownValue(config.options.edgeRouting, stored.edgeRouting, config.defaults.edgeRouting),
    nodeSpacing: clamp(
      stored.nodeSpacing,
      config.defaults.nodeSpacing,
      config.limits.nodeSpacing.min,
      config.limits.nodeSpacing.max
    ),
    layerSpacing: clamp(
      stored.layerSpacing,
      config.defaults.layerSpacing,
      config.limits.layerSpacing.min,
      config.limits.layerSpacing.max
    )
  };
}

async function writeOptions(options) {
  await app.storage.set('options', options);
}

async function lastResult() {
  return (await app.storage.get('lastResult')) || null;
}

function statusText(result) {
  if (
    !result ||
    typeof result.nodeCount !== 'number' ||
    typeof result.connectionCount !== 'number' ||
    typeof result.elapsedMs !== 'number' ||
    typeof result.scope !== 'string'
  ) {
    return 'No layout has been applied yet.';
  }
  return 'Laid out ' + result.nodeCount + ' nodes and ' + result.connectionCount
    + ' connections in ' + Math.round(result.elapsedMs) + ' ms using ' + result.scope + ' scope.';
}

async function applyLayout(options) {
  var cleanOptions = options || await readOptions();
  await writeOptions(cleanOptions);
  var result = await app.layout.elk(cleanOptions);
  await app.storage.set('lastResult', result);
  await renderPanel();
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

function addSelect(container, labelText, value, values, onChange) {
  var row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gap = '4px';
  row.style.alignContent = 'start';
  row.style.gridAutoRows = 'max-content';
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
  container.appendChild(row);
}

function addNumber(container, labelText, value, min, max, onChange) {
  var row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gap = '4px';
  row.style.alignContent = 'start';
  row.style.gridAutoRows = 'max-content';
  addLabel(row, labelText);

  var input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.height = '32px';
  input.style.font = 'inherit';
  input.onchange = function () {
    onChange(clamp(Number(input.value), value, min, max));
  };
  row.appendChild(input);
  container.appendChild(row);
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
  titleStrong.textContent = 'ELK Layout';
  var titleDetail = document.createElement('span');
  titleDetail.style.color = 'GrayText';
  titleDetail.textContent = 'Layer selected objects or the whole active view.';
  title.appendChild(titleStrong);
  title.appendChild(document.createElement('br'));
  title.appendChild(titleDetail);
  panel.appendChild(title);

  addSelect(panel, 'Scope', options.scope, config.options.scope, function (value) {
    options.scope = value;
    void writeOptions(options);
  });
  addSelect(panel, 'Direction', options.direction, config.options.direction, function (value) {
    options.direction = value;
    void writeOptions(options);
  });
  addSelect(panel, 'Edge routing', options.edgeRouting, config.options.edgeRouting, function (value) {
    options.edgeRouting = value;
    void writeOptions(options);
  });
  addNumber(
    panel,
    'Node spacing',
    options.nodeSpacing,
    config.limits.nodeSpacing.min,
    config.limits.nodeSpacing.max,
    function (value) {
      options.nodeSpacing = value;
      void writeOptions(options);
    }
  );
  addNumber(
    panel,
    'Layer spacing',
    options.layerSpacing,
    config.limits.layerSpacing.min,
    config.limits.layerSpacing.max,
    function (value) {
      options.layerSpacing = value;
      void writeOptions(options);
    }
  );

  var buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.gap = '8px';
  buttons.style.alignItems = 'center';

  var apply = document.createElement('button');
  apply.textContent = 'Apply';
  apply.style.height = '32px';
  apply.onclick = function () {
    // Apply the live in-memory options. Reading them back from storage here races
    // the input's change handler (which persists on blur as this button is pressed),
    // and applyLayout would then write the stale values back, discarding whatever was
    // just typed. The closure's options object is already current.
    applyLayout(options).catch(function (error) {
      return app.dialogs.info('ELK layout failed', error && error.message ? error.message : String(error));
    });
  };
  buttons.appendChild(apply);

  var reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.style.height = '32px';
  reset.onclick = function () {
    writeOptions(config.defaults).then(renderPanel);
  };
  buttons.appendChild(reset);
  panel.appendChild(buttons);

  var status = document.createElement('div');
  status.style.border = '1px solid ButtonBorder';
  status.style.borderRadius = '4px';
  status.style.padding = '8px';
  status.style.background = 'Canvas';
  status.textContent = statusText(await lastResult());
  panel.appendChild(status);
}

app.commands.register('examples.elk-layout.apply', {
  title: 'Apply ELK layout',
  description: 'Run ELK layered layout on the active view or selected diagram objects.',
  run: async function () {
    return applyLayout(await readOptions()).then(function (result) {
      return app.dialogs.info('ELK layout', statusText(result));
    });
  }
});

app.commands.register('examples.elk-layout.open', {
  title: 'Open ELK layout panel',
  run: function () {
    app.panels.show('examples.elk-layout.panel');
  }
});

app.menus.addItem('extensions.menu', {
  id: 'examples.elk-layout.menu.open',
  label: 'ELK layout...',
  command: 'examples.elk-layout.open'
});

app.menus.addItem('view.context', {
  id: 'examples.elk-layout.view.apply',
  label: 'Layout view with ELK',
  command: 'examples.elk-layout.apply'
});

app.menus.addItem('selection.context', {
  id: 'examples.elk-layout.selection.apply',
  label: 'Layout selection with ELK',
  command: 'examples.elk-layout.apply'
});

app.panels.register('examples.elk-layout.panel', {
  title: 'ELK Layout',
  render: function (container) {
    panel = container;
    void renderPanel();
    return function () {
      panel = null;
    };
  }
});
