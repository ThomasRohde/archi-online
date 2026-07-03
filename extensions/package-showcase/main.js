app.extension({
  id: 'local.package-showcase',
  name: 'Package Showcase',
  version: '0.1.0'
});

var manifest = app.manifest.get();
var packageInfo = app.extension.package();
var readme = app.assets.text('README.md');
var showcase = app.assets.json('data/showcase.json');
var imageUrl = app.assets.url('assets/showcase.svg');

app.commands.register('local.package-showcase.info', {
  title: 'Show package info',
  run: function () {
    return app.dialogs.info(
      manifest.name,
      'Version ' + manifest.version + ' with ' + packageInfo.files.length + ' packaged files.'
    );
  }
});

app.commands.register('local.package-showcase.open', {
  title: 'Open package showcase',
  run: function () {
    app.panels.show('local.package-showcase.panel');
  }
});

app.menus.addItem('extensions.menu', {
  id: 'local.package-showcase.menu.info',
  label: 'Show package info',
  command: 'local.package-showcase.info'
});

app.toolbar.addButton({
  id: 'local.package-showcase.toolbar',
  label: 'Package',
  command: 'local.package-showcase.open'
});

app.panels.register('local.package-showcase.panel', {
  title: 'Package Showcase',
  render: function (container) {
    container.replaceChildren();
    container.style.fontFamily = 'system-ui, sans-serif';
    container.style.fontSize = '13px';

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '12px';

    var img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    img.width = 64;
    img.height = 48;

    var title = document.createElement('div');
    title.innerHTML = '<strong>' + manifest.name + '</strong><br><span style="color:#666">' + manifest.description + '</span>';

    header.appendChild(img);
    header.appendChild(title);
    container.appendChild(header);

    var meta = document.createElement('pre');
    meta.style.whiteSpace = 'pre-wrap';
    meta.style.background = '#f9fafb';
    meta.style.border = '1px solid #d8dee4';
    meta.style.borderRadius = '4px';
    meta.style.padding = '8px';
    meta.textContent = JSON.stringify({
      manifest: manifest,
      package: packageInfo,
      capabilities: showcase.capabilities
    }, null, 2);
    container.appendChild(meta);

    var doc = document.createElement('div');
    doc.style.borderLeft = '4px solid ' + showcase.accent;
    doc.style.padding = '4px 8px';
    doc.textContent = readme.split('\n').slice(0, 3).join(' ');
    container.appendChild(doc);
  }
});
