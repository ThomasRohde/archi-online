/* global $, app, document, model */

var EXTENSION_ID = 'local.example.archi-online-tool';
var PANEL_ID = EXTENSION_ID + '.panel';

app.extension({
  id: EXTENSION_ID,
  name: 'Archi Online Tool',
  version: '0.1.0'
});

function currentSummary() {
  if (!app.model.current()) return null;
  return {
    modelName: model.name || '(unnamed)',
    elements: $('element').size(),
    relationships: $('relationship').size(),
    views: $('view').size()
  };
}

function renderSummary(container, summary) {
  var heading = document.createElement('strong');
  heading.textContent = summary.modelName;

  var details = document.createElement('p');
  details.textContent =
    String(summary.elements) + ' elements, ' +
    String(summary.relationships) + ' relationships, ' +
    String(summary.views) + ' views';

  container.replaceChildren(heading, details);
}

app.commands.register(EXTENSION_ID + '.summarize', {
  title: 'Summarize active model',
  description: 'Count elements, relationships, and views.',
  run: async function () {
    var summary = currentSummary();
    if (!summary) {
      await app.dialogs.info(
        'Archi Online Tool',
        'Open or create a model, then run the command again.'
      );
      return null;
    }
    await app.storage.set('lastSummary', summary);
    app.panels.show(PANEL_ID);
    return summary;
  }
});

app.menus.addItem('extensions.menu', {
  id: EXTENSION_ID + '.menu.summarize',
  label: 'Summarize active model',
  command: EXTENSION_ID + '.summarize'
});

app.panels.register(PANEL_ID, {
  title: 'Model Summary',
  render: async function (container) {
    var current = currentSummary();
    if (!current) {
      var empty = document.createElement('p');
      empty.textContent = 'No model is open.';
      container.replaceChildren(empty);
      return;
    }
    var stored = await app.storage.get('lastSummary');
    renderSummary(container, stored || current);
  }
});
