app.extension({
  id: 'local.elk-layout',
  name: 'ELK Layout',
  version: '0.1.0'
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

function readOptions() {
  var stored = app.storage.get('options') || {};
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

function writeOptions(options) {
  app.storage.set('options', options);
}

function lastResult() {
  return app.storage.get('lastResult') || null;
}

function statusText(result) {
  if (!result) return 'No layout has been applied yet.';
  return 'Laid out ' + result.nodeCount + ' nodes and ' + result.connectionCount
    + ' connections in ' + Math.round(result.elapsedMs) + ' ms using ' + result.scope + ' scope.';
}

async function applyLayout(options) {
  var cleanOptions = options || readOptions();
  writeOptions(cleanOptions);
  var result = await app.layout.elk(cleanOptions);
  app.storage.set('lastResult', result);
  renderPanel();
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
  addLabel(row, labelText);

  var select = document.createElement('select');
  select.value = value;
  select.style.width = '100%';
  values.forEach(function (entry) {
    var option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    select.appendChild(option);
  });
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
  addLabel(row, labelText);

  var input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.style.width = '100%';
  input.onchange = function () {
    onChange(clamp(Number(input.value), value, min, max));
  };
  row.appendChild(input);
  container.appendChild(row);
}

function renderPanel() {
  if (!panel) return;
  var options = readOptions();
  panel.replaceChildren();
  panel.style.fontFamily = 'system-ui, sans-serif';
  panel.style.fontSize = '13px';
  panel.style.display = 'grid';
  panel.style.gap = '12px';

  var title = document.createElement('div');
  title.innerHTML = '<strong>ELK Layout</strong><br><span style="color:#666">Layer selected objects or the whole active view.</span>';
  panel.appendChild(title);

  addSelect(panel, 'Scope', options.scope, config.options.scope, function (value) {
    options.scope = value;
    writeOptions(options);
  });
  addSelect(panel, 'Direction', options.direction, config.options.direction, function (value) {
    options.direction = value;
    writeOptions(options);
  });
  addSelect(panel, 'Edge routing', options.edgeRouting, config.options.edgeRouting, function (value) {
    options.edgeRouting = value;
    writeOptions(options);
  });
  addNumber(
    panel,
    'Node spacing',
    options.nodeSpacing,
    config.limits.nodeSpacing.min,
    config.limits.nodeSpacing.max,
    function (value) {
      options.nodeSpacing = value;
      writeOptions(options);
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
      writeOptions(options);
    }
  );

  var buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.gap = '8px';

  var apply = document.createElement('button');
  apply.textContent = 'Apply';
  apply.onclick = function () {
    applyLayout(readOptions()).catch(function (error) {
      return app.dialogs.info('ELK layout failed', error && error.message ? error.message : String(error));
    });
  };
  buttons.appendChild(apply);

  var reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.onclick = function () {
    writeOptions(config.defaults);
    renderPanel();
  };
  buttons.appendChild(reset);
  panel.appendChild(buttons);

  var status = document.createElement('div');
  status.style.border = '1px solid #d8dee4';
  status.style.borderRadius = '4px';
  status.style.padding = '8px';
  status.style.background = '#f9fafb';
  status.textContent = statusText(lastResult());
  panel.appendChild(status);
}

app.commands.register('local.elk-layout.apply', {
  title: 'Apply ELK layout',
  description: 'Run ELK layered layout on the active view or selected diagram objects.',
  run: function () {
    return applyLayout(readOptions()).then(function (result) {
      return app.dialogs.info('ELK layout', statusText(result));
    });
  }
});

app.commands.register('local.elk-layout.open', {
  title: 'Open ELK layout panel',
  run: function () {
    app.panels.show('local.elk-layout.panel');
  }
});

app.menus.addItem('extensions.menu', {
  id: 'local.elk-layout.menu.open',
  label: 'ELK layout...',
  command: 'local.elk-layout.open'
});

app.menus.addItem('view.context', {
  id: 'local.elk-layout.view.apply',
  label: 'Layout view with ELK',
  command: 'local.elk-layout.apply'
});

app.menus.addItem('selection.context', {
  id: 'local.elk-layout.selection.apply',
  label: 'Layout selection with ELK',
  command: 'local.elk-layout.apply'
});

app.panels.register('local.elk-layout.panel', {
  title: 'ELK Layout',
  render: function (container) {
    panel = container;
    renderPanel();
    return function () {
      panel = null;
    };
  }
});
