app.extension({
  id: 'local.model-audit-dashboard',
  name: 'Model Audit Dashboard',
  version: '0.1.0'
});

var auditRules = app.assets.json('data/audit-rules.json');
var auditIcon = app.assets.url('assets/audit.svg');
var auditPanel = null;

function collection(selector) {
  try {
    return $(selector);
  } catch (error) {
    return null;
  }
}

function count(selector) {
  var found = collection(selector);
  return found ? found.size() : 0;
}

function namesMissing(selector) {
  var found = collection(selector);
  if (!found) return 0;
  return found.toArray().filter(function (item) {
    return !item.name || !String(item.name).trim();
  }).length;
}

function documentationSample(selector) {
  var found = collection(selector);
  if (!found) return 0;
  return found.toArray().filter(function (item) {
    return item.documentation && String(item.documentation).trim();
  }).length;
}

function auditModel() {
  var result = {
    time: new Date().toISOString(),
    concepts: count('element'),
    relationships: count('relationship'),
    views: count('view'),
    unnamedConcepts: namesMissing('element'),
    documentedConcepts: documentationSample('element'),
    warnings: []
  };

  if (result.views < auditRules.minimumViews) {
    result.warnings.push('No ArchiMate views found.');
  }
  if (auditRules.warnWhenNoRelationships && result.concepts > 1 && result.relationships === 0) {
    result.warnings.push('Multiple concepts exist but no relationships are present.');
  }
  if (auditRules.warnWhenUnnamedConcepts && result.unnamedConcepts > 0) {
    result.warnings.push(result.unnamedConcepts + ' concepts have empty names.');
  }

  app.storage.set('lastAudit', result);
  renderAuditPanel();
  return result;
}

function lastAudit() {
  return app.storage.get('lastAudit') || auditModel();
}

function statusColor(result) {
  if (result.warnings.length === 0) return '#1f7a4d';
  if (result.warnings.length < 3) return '#9a6700';
  return '#b02a2a';
}

function renderAuditPanel() {
  if (!auditPanel) return;
  var result = lastAudit();
  auditPanel.replaceChildren();
  auditPanel.style.fontFamily = 'system-ui, sans-serif';
  auditPanel.style.fontSize = '13px';

  var header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '10px';
  header.style.marginBottom = '12px';

  var img = document.createElement('img');
  img.src = auditIcon;
  img.alt = '';
  img.width = 42;
  img.height = 42;

  var title = document.createElement('div');
  title.innerHTML = '<strong>Model Audit</strong><br><span style="color:#666">Last run ' + result.time + '</span>';

  header.appendChild(img);
  header.appendChild(title);
  auditPanel.appendChild(header);

  var grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  grid.style.gap = '8px';
  [
    ['Concepts', result.concepts],
    ['Relationships', result.relationships],
    ['Views', result.views],
    ['Documented concepts', result.documentedConcepts]
  ].forEach(function (entry) {
    var cell = document.createElement('div');
    cell.style.border = '1px solid #d8dee4';
    cell.style.borderRadius = '4px';
    cell.style.padding = '8px';
    cell.innerHTML = '<div style="font-size:11px;color:#666">' + entry[0] + '</div><strong style="font-size:20px">' + entry[1] + '</strong>';
    grid.appendChild(cell);
  });
  auditPanel.appendChild(grid);

  var status = document.createElement('div');
  status.style.marginTop = '12px';
  status.style.borderLeft = '4px solid ' + statusColor(result);
  status.style.padding = '6px 8px';
  status.style.background = '#f9fafb';
  status.textContent = result.warnings.length === 0 ? 'No audit warnings.' : result.warnings.join(' ');
  auditPanel.appendChild(status);

  var button = document.createElement('button');
  button.textContent = 'Run again';
  button.style.marginTop = '12px';
  button.onclick = auditModel;
  auditPanel.appendChild(button);
}

app.commands.register('local.model-audit-dashboard.run', {
  title: 'Run model audit',
  description: 'Count model content and store the latest audit result.',
  run: function () {
    var result = auditModel();
    return app.dialogs.info(
      'Model audit',
      result.warnings.length === 0
        ? 'No warnings. Concepts: ' + result.concepts + ', relationships: ' + result.relationships + '.'
        : result.warnings.join(' ')
    );
  }
});

app.commands.register('local.model-audit-dashboard.open', {
  title: 'Open audit dashboard',
  run: function () {
    app.panels.show('local.model-audit-dashboard.panel');
  }
});

app.toolbar.addButton({
  id: 'local.model-audit-dashboard.toolbar',
  label: 'Audit',
  command: 'local.model-audit-dashboard.open'
});

app.menus.addItem('extensions.menu', {
  id: 'local.model-audit-dashboard.menu.run',
  label: 'Run model audit',
  command: 'local.model-audit-dashboard.run'
});

app.panels.register('local.model-audit-dashboard.panel', {
  title: 'Model Audit',
  render: function (container) {
    auditPanel = container;
    renderAuditPanel();
    return function () {
      auditPanel = null;
    };
  }
});
