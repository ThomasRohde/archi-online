/* global document, window */
(function () {
  'use strict';

  var booted = false;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function dataAttribute(node, name) {
    node.setAttribute('data-' + name, '');
    return node;
  }

  function actionButton(label, className, action) {
    var node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function reportError(host, message) {
    var error = dataAttribute(element('section', 'report-error'), 'report-error');
    error.appendChild(element('h1', '', 'This report cannot be opened'));
    error.appendChild(element('p', '', message));
    host.replaceChildren(error);
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isStringArray(value) {
    return Array.isArray(value) && value.every(function (item) { return typeof item === 'string'; });
  }

  function hasValidProperties(target) {
    return Array.isArray(target.properties) && target.properties.every(function (property) {
      return isRecord(property)
        && typeof property.key === 'string'
        && typeof property.value === 'string';
    });
  }

  function hasValidBase(target, kind) {
    return isRecord(target)
      && target.kind === kind
      && typeof target.id === 'string'
      && typeof target.name === 'string'
      && typeof target.documentation === 'string'
      && hasValidProperties(target);
  }

  function hasValidCounts(counts) {
    return isRecord(counts) && ['folders', 'elements', 'relationships', 'views']
      .every(function (key) { return Number.isFinite(counts[key]) && counts[key] >= 0; });
  }

  function hasValidAnalysis(analysis) {
    return isRecord(analysis)
      && isStringArray(analysis.relationshipIds)
      && isStringArray(analysis.viewIds);
  }

  function hasValidReportShape(data) {
    if (!isRecord(data) || !hasValidBase(data.model, 'model')) return false;
    if (!isStringArray(data.model.rootFolderIds) || !hasValidCounts(data.model.counts)) return false;
    if (data.initialViewId !== undefined && typeof data.initialViewId !== 'string') return false;
    if (!Array.isArray(data.folders)
      || !Array.isArray(data.elements)
      || !Array.isArray(data.relationships)
      || !Array.isArray(data.views)
      || !isRecord(data.analysis)) return false;
    if (!data.folders.every(function (folder) {
      return hasValidBase(folder, 'folder')
        && (folder.parentId === null || typeof folder.parentId === 'string')
        && isStringArray(folder.folderIds)
        && isStringArray(folder.itemIds);
    })) return false;
    if (!data.elements.every(function (item) {
      return hasValidBase(item, 'element') && typeof item.folderId === 'string';
    })) return false;
    if (!data.relationships.every(function (item) {
      return hasValidBase(item, 'relationship')
        && typeof item.folderId === 'string'
        && typeof item.sourceId === 'string'
        && typeof item.targetId === 'string';
    })) return false;
    if (!data.views.every(function (item) {
      return hasValidBase(item, 'view')
        && typeof item.folderId === 'string'
        && typeof item.svgPath === 'string';
    })) return false;
    return data.elements.concat(data.relationships).every(function (item) {
      return hasValidAnalysis(data.analysis[item.id]);
    });
  }

  function boot() {
    if (booted) return;
    booted = true;
    var host = document.getElementById('report-app');
    if (!host) return;
    var data = window.__ARCHI_STATIC_REPORT__;
    if (!data) {
      reportError(host, 'Report data is unavailable. Keep report-data.js beside index.html.');
      return;
    }
    if (data.schemaVersion !== 1) {
      reportError(host, 'This report schema is not supported by this report viewer.');
      return;
    }
    if (!hasValidReportShape(data)) {
      reportError(host, 'Report data is corrupt or incomplete. Re-export the report from Archi Online.');
      return;
    }

    document.title = data.model.name + ' — Archi Online report';

    var objectIndex = new Map();
    var renderedHash;
    objectIndex.set(data.model.id, data.model);
    data.folders.concat(data.elements, data.relationships, data.views).forEach(function (object) {
      objectIndex.set(object.id, object);
    });

    var shell = dataAttribute(element('div', 'report-shell'), 'report-shell');
    var navigation = element('nav', 'report-navigation');
    navigation.setAttribute('aria-label', 'Model navigation');
    var eyebrow = element('div', 'report-eyebrow', 'ARCHITECTURE REPORT');
    var title = dataAttribute(element('h1', 'report-title', data.model.name), 'report-title');
    var search = element('input', 'report-search');
    search.type = 'search';
    search.placeholder = 'Search the model';
    search.setAttribute('aria-label', 'Search report');
    var tree = dataAttribute(element('div', 'report-tree'), 'report-tree');
    navigation.append(eyebrow, title, search, tree);

    var main = element('main', 'report-main');
    var status = dataAttribute(element('div', 'report-status'), 'report-status');
    status.setAttribute('role', 'status');
    var contentTitle = dataAttribute(element('h2', 'report-content-title'), 'content-title');
    var content = dataAttribute(element('div', 'report-content'), 'report-content');
    main.append(status, contentTitle, content);

    var details = element('aside', 'report-details');
    details.setAttribute('aria-label', 'Object details');
    var detailName = dataAttribute(element('h2', 'report-detail-name'), 'detail-name');
    var detailBody = dataAttribute(element('div', 'report-detail-body'), 'detail-body');
    details.append(detailName, detailBody);
    shell.append(navigation, main, details);
    host.replaceChildren(shell);

    function fallbackTarget() {
      return objectIndex.get(data.initialViewId) || data.model;
    }

    function routeTarget() {
      var hash = window.location.hash;
      if (!hash) return fallbackTarget();
      var match = /^#(view|object)\/(.+)$/.exec(hash);
      if (!match) return undefined;
      var id;
      try {
        id = decodeURIComponent(match[2]);
      } catch {
        return undefined;
      }
      var target = objectIndex.get(id);
      if (!target || (match[1] === 'view' && target.kind !== 'view')) return undefined;
      return target;
    }

    function renderProperties(properties) {
      var list = element('dl', 'report-properties');
      properties.forEach(function (property) {
        list.append(
          element('dt', '', property.key),
          element('dd', '', property.value),
        );
      });
      return list;
    }

    function displayName(target) {
      return target.name || target.typeLabel || 'Untitled';
    }

    function routeFor(target) {
      var kind = target.kind === 'view' ? 'view' : 'object';
      return '#' + kind + '/' + encodeURIComponent(target.id);
    }

    function navigate(target) {
      var route = routeFor(target);
      if (window.location.hash === route) {
        renderRoute();
      } else {
        window.location.hash = route;
        renderRoute();
      }
    }

    function linkButton(target, className, attribute, value) {
      var node = actionButton(displayName(target), className, function () {
        navigate(target);
      });
      if (attribute) node.setAttribute('data-' + attribute, value || target.id);
      return node;
    }

    function appendDetailField(parent, label, value) {
      if (!value) return;
      var field = element('div', 'report-detail-field');
      field.append(element('span', 'report-detail-label', label), element('strong', '', value));
      parent.appendChild(field);
    }

    function renderLinkSection(parent, heading, targets, attribute) {
      if (!targets.length) return;
      var section = element('section', 'report-link-section');
      section.appendChild(element('h3', '', heading));
      targets.forEach(function (target) {
        section.appendChild(linkButton(target, 'report-object-link', attribute, target.id));
      });
      parent.appendChild(section);
    }

    function renderFolderContents(folder) {
      var targets = folder.folderIds.concat(folder.itemIds)
        .map(function (id) { return objectIndex.get(id); })
        .filter(Boolean);
      if (!targets.length) {
        content.appendChild(element('p', 'report-empty', 'This folder is empty.'));
        return;
      }
      var list = element('div', 'report-object-list');
      targets.forEach(function (target) {
        list.appendChild(linkButton(target, 'report-object-link'));
      });
      content.appendChild(list);
    }

    function renderModelCounts() {
      var counts = element('dl', 'report-counts');
      [
        ['Folders', data.model.counts.folders],
        ['Elements', data.model.counts.elements],
        ['Relationships', data.model.counts.relationships],
        ['Views', data.model.counts.views],
      ].forEach(function (entry) {
        counts.append(element('dt', '', entry[0]), element('dd', '', String(entry[1])));
      });
      content.appendChild(counts);
    }

    function renderRelationshipDetails(target) {
      var source = objectIndex.get(target.sourceId);
      var relationshipTarget = objectIndex.get(target.targetId);
      if (source) {
        var sourceRow = element('div', 'report-endpoint');
        sourceRow.append(
          element('span', 'report-detail-label', 'Source'),
          linkButton(source, 'report-object-link', 'endpoint', 'source'),
        );
        detailBody.appendChild(sourceRow);
      }
      if (relationshipTarget) {
        var targetRow = element('div', 'report-endpoint');
        targetRow.append(
          element('span', 'report-detail-label', 'Target'),
          linkButton(relationshipTarget, 'report-object-link', 'endpoint', 'target'),
        );
        detailBody.appendChild(targetRow);
      }
    }

    function renderAnalysis(target) {
      var analysis = data.analysis[target.id];
      if (!analysis) return;
      renderLinkSection(
        detailBody,
        'Model relations',
        analysis.relationshipIds.map(function (id) { return objectIndex.get(id); }).filter(Boolean),
        'analysis-relationship',
      );
      renderLinkSection(
        detailBody,
        'Used in views',
        analysis.viewIds.map(function (id) { return objectIndex.get(id); }).filter(Boolean),
        'analysis-view',
      );
    }

    function renderView(target) {
      var viewport = dataAttribute(element('div', 'report-view-viewport is-fit'), 'view-viewport');
      var image = dataAttribute(element('img', 'report-view-image'), 'active-view');
      image.src = target.svgPath;
      image.alt = target.name || 'Architecture view';
      var hud = element('div', 'report-view-hud');
      var zoom = 1;
      var fitMode = true;

      function updateZoom() {
        viewport.classList.toggle('is-fit', fitMode);
        viewport.style.setProperty('--report-zoom', String(zoom));
        actual.textContent = Math.round(zoom * 100) + '%';
      }

      function changeZoom(factor) {
        fitMode = false;
        zoom = Math.min(4, Math.max(0.2, zoom * factor));
        updateZoom();
      }

      var zoomOut = actionButton('−', 'report-hud-button', function () { changeZoom(1 / 1.2); });
      zoomOut.setAttribute('aria-label', 'Zoom out');
      var actual = actionButton('100%', 'report-hud-percentage', function () {
        fitMode = false;
        zoom = 1;
        updateZoom();
      });
      actual.setAttribute('aria-label', 'Actual size');
      var zoomIn = actionButton('+', 'report-hud-button', function () { changeZoom(1.2); });
      zoomIn.setAttribute('aria-label', 'Zoom in');
      var fit = actionButton('Fit', 'report-hud-fit', function () {
        fitMode = true;
        zoom = 1;
        updateZoom();
      });
      fit.setAttribute('aria-label', 'Fit view');
      hud.append(zoomOut, actual, zoomIn, fit);
      image.addEventListener('error', function () {
        image.hidden = true;
        var error = dataAttribute(
          element('p', 'report-view-error', 'This view could not be loaded. Keep its SVG file beside the report assets.'),
          'view-error',
        );
        viewport.appendChild(error);
      }, { once: true });
      viewport.append(image, hud);
      content.appendChild(viewport);
      updateZoom();
    }

    function renderTarget(target) {
      content.replaceChildren();
      detailBody.replaceChildren();
      contentTitle.textContent = displayName(target);
      detailName.textContent = displayName(target);
      if (target.kind === 'view') {
        renderView(target);
      } else if (target.kind === 'folder') {
        renderFolderContents(target);
      } else if (target.kind === 'model') {
        content.appendChild(element('p', 'report-summary-copy', target.documentation || 'No documentation.'));
        renderModelCounts();
      } else {
        content.appendChild(element('p', 'report-summary-copy', target.documentation || 'No documentation.'));
      }
      appendDetailField(detailBody, 'Type', target.typeLabel);
      appendDetailField(detailBody, 'Specialization', target.specialization);
      appendDetailField(detailBody, 'Viewpoint', target.viewpoint);
      if (target.documentation) {
        detailBody.appendChild(element('p', 'report-documentation', target.documentation));
      }
      if (target.properties && target.properties.length) {
        detailBody.appendChild(renderProperties(target.properties));
      }
      if (target.kind === 'relationship') renderRelationshipDetails(target);
      if (target.kind === 'element' || target.kind === 'relationship') renderAnalysis(target);
    }

    function renderRoute() {
      status.textContent = '';
      var target = routeTarget();
      if (!target) {
        status.textContent = 'Target not found. Showing the report start page.';
        target = fallbackTarget();
      }
      renderTarget(target);
      tree.querySelectorAll('[data-tree-target]').forEach(function (item) {
        if (item.getAttribute('data-tree-target') === target.id) {
          item.setAttribute('aria-current', 'page');
        } else {
          item.removeAttribute('aria-current');
        }
      });
      renderedHash = window.location.hash;
    }

    function treeItem(target) {
      var row = linkButton(target, 'report-tree-item', 'tree-target', target.id);
      row.title = (target.typeLabel || target.kind) + ': ' + displayName(target);
      return row;
    }

    function treeFolder(folder, visited) {
      if (visited.has(folder.id)) return undefined;
      visited.add(folder.id);
      var section = element('section', 'report-tree-folder');
      section.setAttribute('data-tree-id', folder.id);
      var header = element('div', 'report-tree-folder-header');
      var children = element('div', 'report-tree-children');
      var toggle = actionButton('−', 'report-tree-toggle', function () {
        var expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        toggle.textContent = expanded ? '+' : '−';
        children.hidden = expanded;
      });
      toggle.setAttribute('aria-label', 'Toggle ' + displayName(folder));
      toggle.setAttribute('aria-expanded', 'true');
      header.append(toggle, treeItem(folder));
      folder.folderIds.forEach(function (folderId) {
        var childFolder = objectIndex.get(folderId);
        if (!childFolder || childFolder.kind !== 'folder') return;
        var childTree = treeFolder(childFolder, visited);
        if (childTree) children.appendChild(childTree);
      });
      folder.itemIds.forEach(function (itemId) {
        var item = objectIndex.get(itemId);
        if (item) children.appendChild(treeItem(item));
      });
      section.append(header, children);
      return section;
    }

    function renderTree() {
      tree.replaceChildren();
      var visited = new Set();
      data.model.rootFolderIds.forEach(function (folderId) {
        var folder = objectIndex.get(folderId);
        if (!folder || folder.kind !== 'folder') return;
        var folderTree = treeFolder(folder, visited);
        if (folderTree) tree.appendChild(folderTree);
      });
    }

    function searchText(target) {
      return [
        target.name,
        target.documentation,
        target.typeLabel,
        target.specialization,
      ].concat((target.properties || []).flatMap(function (property) {
        return [property.key, property.value];
      })).filter(Boolean).join('\n').toLowerCase();
    }

    function renderSearch(query) {
      if (!query) {
        renderTree();
        return;
      }
      var needle = query.toLowerCase();
      var results = dataAttribute(element('div', 'report-search-results'), 'search-results');
      var groups = [
        ['Views', data.views],
        ['Elements', data.elements],
        ['Relationships', data.relationships],
        ['Folders', data.folders],
      ];
      var matchCount = 0;
      groups.forEach(function (group) {
        var matches = group[1].filter(function (target) {
          return searchText(target).includes(needle);
        }).sort(function (left, right) {
          return compareText(left.name, right.name) || compareText(left.id, right.id);
        });
        if (!matches.length) return;
        results.appendChild(element('h3', 'report-search-heading', group[0]));
        matches.forEach(function (target) {
          results.appendChild(treeItem(target));
          matchCount += 1;
        });
      });
      if (!matchCount) results.appendChild(element('p', 'report-empty', 'No matches'));
      tree.replaceChildren(results);
    }

    renderTree();
    search.addEventListener('input', function () {
      renderSearch(search.value.trim());
    });
    renderRoute();
    window.addEventListener('hashchange', function () {
      if (window.location.hash !== renderedHash) renderRoute();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}());
