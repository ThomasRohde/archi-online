app.extension({
  id: 'local.selection-workbench',
  name: 'Selection Workbench',
  version: '0.1.0'
});

var help = app.assets.json('data/help.json');
var panel = null;

function readHistory() {
  return app.storage.get('history') || [];
}

function writeHistory(history) {
  app.storage.set('history', history.slice(0, help.historyLimit));
}

function recordSelection(source, ids) {
  var cleanIds = Array.isArray(ids) ? ids.slice(0, 20) : [];
  var item = {
    time: new Date().toISOString(),
    source: source || 'unknown',
    ids: cleanIds
  };
  writeHistory([item].concat(readHistory()));
  app.storage.set('lastSelection', item);
  renderPanel();
}

function contextIds(context) {
  return context && Array.isArray(context.selectionIds) ? context.selectionIds : [];
}

function describeIds(ids) {
  if (!ids || ids.length === 0) return help.empty;
  return ids.length + ' selected: ' + ids.join(', ');
}

function renderPanel() {
  if (!panel) return;
  var history = readHistory();
  var latest = app.storage.get('lastSelection');
  panel.replaceChildren();
  panel.style.fontFamily = 'system-ui, sans-serif';
  panel.style.fontSize = '13px';

  var title = document.createElement('h3');
  title.textContent = 'Selection Workbench';
  title.style.margin = '0 0 8px';
  panel.appendChild(title);

  var summary = document.createElement('div');
  summary.style.padding = '8px';
  summary.style.border = '1px solid #d8dee4';
  summary.style.borderRadius = '4px';
  summary.style.background = '#f9fafb';
  summary.textContent = latest ? describeIds(latest.ids) : help.empty;
  panel.appendChild(summary);

  var listTitle = document.createElement('div');
  listTitle.textContent = 'Recent selection events';
  listTitle.style.margin = '12px 0 6px';
  listTitle.style.fontWeight = '600';
  panel.appendChild(listTitle);

  var list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gap = '6px';
  history.forEach(function (entry) {
    var row = document.createElement('div');
    row.style.borderBottom = '1px solid #e6e8eb';
    row.style.paddingBottom = '5px';
    row.innerHTML = '<strong>' + entry.source + '</strong> <span style="color:#666">' + entry.time + '</span><br><code>' + entry.ids.join(', ') + '</code>';
    list.appendChild(row);
  });
  if (history.length === 0) {
    var empty = document.createElement('div');
    empty.style.color = '#666';
    empty.textContent = help.selected;
    list.appendChild(empty);
  }
  panel.appendChild(list);
}

app.events.on('selection.changed', function (payload) {
  recordSelection(payload && payload.source, payload && payload.ids);
});

app.commands.register('local.selection-workbench.describe', {
  title: 'Describe current selection',
  run: function (context) {
    var ids = contextIds(context);
    recordSelection('command', ids);
    return app.dialogs.info('Selection', describeIds(ids));
  }
});

app.commands.register('local.selection-workbench.open', {
  title: 'Open selection workbench',
  run: function () {
    app.panels.show('local.selection-workbench.panel');
  }
});

app.menus.addItem('selection.context', {
  id: 'local.selection-workbench.selection.describe',
  label: 'Describe selection',
  command: 'local.selection-workbench.describe'
});

app.menus.addItem('model-tree.context', {
  id: 'local.selection-workbench.tree.describe',
  label: 'Describe tree item',
  command: 'local.selection-workbench.describe'
});

app.toolbar.addButton({
  id: 'local.selection-workbench.toolbar',
  label: 'Selection',
  command: 'local.selection-workbench.open'
});

app.panels.register('local.selection-workbench.panel', {
  title: 'Selection Workbench',
  render: function (container) {
    panel = container;
    renderPanel();
    return function () {
      panel = null;
    };
  }
});
