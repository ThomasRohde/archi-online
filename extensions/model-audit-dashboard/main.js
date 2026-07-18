app.extension({
  id: 'examples.model-audit-dashboard',
  name: 'Model Audit Dashboard',
  version: '1.9.2'
});

var auditRules = app.assets.json('data/audit-rules.json');
var auditIcon = app.assets.url('assets/audit.svg');
var auditPanel = null;

function collection(selector) {
  try {
    return $(selector);
  } catch {
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

function collectAudit() {
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

  return result;
}

async function auditModel() {
  var result = collectAudit();
  await app.storage.set('lastAudit', result);
  await renderAuditPanel();
  return result;
}

async function lastAudit() {
  return (await app.storage.get('lastAudit')) || collectAudit();
}

function statusColor(result) {
  if (result.warnings.length === 0) return '#1f7a4d';
  if (result.warnings.length < 3) return '#9a6700';
  return '#b02a2a';
}

async function renderAuditPanel() {
  if (!auditPanel) return;
  var result = await lastAudit();
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
  var titleStrong = document.createElement('strong');
  titleStrong.textContent = 'Model Audit';
  var titleDetail = document.createElement('span');
  titleDetail.style.color = '#666';
  titleDetail.textContent = 'Last run ' + result.time;
  title.appendChild(titleStrong);
  title.appendChild(document.createElement('br'));
  title.appendChild(titleDetail);

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
    var cellLabel = document.createElement('div');
    cellLabel.style.fontSize = '11px';
    cellLabel.style.color = '#666';
    cellLabel.textContent = entry[0];
    var cellValue = document.createElement('strong');
    cellValue.style.fontSize = '20px';
    cellValue.textContent = String(entry[1]);
    cell.appendChild(cellLabel);
    cell.appendChild(cellValue);
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
  button.onclick = function () {
    void auditModel();
  };
  auditPanel.appendChild(button);
}

app.commands.register('examples.model-audit-dashboard.run', {
  title: 'Run model audit',
  description: 'Count model content and store the latest audit result.',
  run: async function () {
    var result = await auditModel();
    return app.dialogs.info(
      'Model audit',
      result.warnings.length === 0
        ? 'No warnings. Concepts: ' + result.concepts + ', relationships: ' + result.relationships + '.'
        : result.warnings.join(' ')
    );
  }
});

app.commands.register('examples.model-audit-dashboard.open', {
  title: 'Open audit dashboard',
  run: function () {
    app.panels.show('examples.model-audit-dashboard.panel');
  }
});

app.toolbar.addButton({
  id: 'examples.model-audit-dashboard.toolbar',
  label: 'Audit',
  command: 'examples.model-audit-dashboard.open'
});

app.menus.addItem('extensions.menu', {
  id: 'examples.model-audit-dashboard.menu.run',
  label: 'Run model audit',
  command: 'examples.model-audit-dashboard.run'
});

app.panels.register('examples.model-audit-dashboard.panel', {
  title: 'Model Audit',
  render: function (container) {
    auditPanel = container;
    void renderAuditPanel();
    return function () {
      auditPanel = null;
    };
  }
});
