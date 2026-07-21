app.extension({
  id: 'examples.event-log-console',
  name: 'Event Log Console',
  version: '1.11.0'
});

var config = app.assets.json('data/events.json');
var panel = null;

async function readEvents() {
  return (await app.storage.get('events')) || [];
}

function simplify(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function recordEvent(name, payload) {
  var entry = {
    name: name,
    time: new Date().toISOString(),
    payload: simplify(payload)
  };
  await app.storage.set('events', [entry].concat(await readEvents()).slice(0, config.limit));
  await renderPanel();
}

async function renderPanel() {
  if (!panel) return;
  var events = await readEvents();
  panel.replaceChildren();
  panel.style.fontFamily = 'system-ui, sans-serif';
  panel.style.fontSize = '13px';

  var bar = document.createElement('div');
  bar.style.display = 'flex';
  bar.style.justifyContent = 'space-between';
  bar.style.alignItems = 'center';
  bar.style.marginBottom = '8px';

  var title = document.createElement('strong');
  title.textContent = 'Event Log';

  var clear = document.createElement('button');
  clear.textContent = 'Clear';
  clear.onclick = function () {
    app.commands.run('examples.event-log-console.clear');
  };

  bar.appendChild(title);
  bar.appendChild(clear);
  panel.appendChild(bar);

  if (events.length === 0) {
    var empty = document.createElement('div');
    empty.style.color = '#666';
    empty.textContent = 'No events captured yet.';
    panel.appendChild(empty);
    return;
  }

  events.forEach(function (event) {
    var row = document.createElement('div');
    row.style.borderBottom = '1px solid #e6e8eb';
    row.style.padding = '6px 0';
    var name = document.createElement('strong');
    name.textContent = event.name;
    var time = document.createElement('span');
    time.style.color = '#666';
    time.textContent = ' ' + event.time;
    var payload = document.createElement('code');
    payload.style.whiteSpace = 'pre-wrap';
    payload.textContent = event.payload;
    row.appendChild(name);
    row.appendChild(time);
    row.appendChild(document.createElement('br'));
    row.appendChild(payload);
    panel.appendChild(row);
  });
}

config.events.forEach(function (name) {
  app.events.on(name, function (payload) {
    return recordEvent(name, payload);
  });
});

app.commands.register('examples.event-log-console.open', {
  title: 'Open event log',
  run: function () {
    app.panels.show('examples.event-log-console.panel');
  }
});

app.commands.register('examples.event-log-console.clear', {
  title: 'Clear event log',
  run: async function () {
    await app.storage.set('events', []);
    await renderPanel();
  }
});

app.menus.addItem('extensions.menu', {
  id: 'examples.event-log-console.menu.open',
  label: 'Open event log',
  command: 'examples.event-log-console.open'
});

app.toolbar.addButton({
  id: 'examples.event-log-console.toolbar',
  label: 'Events',
  command: 'examples.event-log-console.open'
});

app.panels.register('examples.event-log-console.panel', {
  title: 'Event Log',
  render: function (container) {
    panel = container;
    void renderPanel();
    return function () {
      panel = null;
    };
  }
});
