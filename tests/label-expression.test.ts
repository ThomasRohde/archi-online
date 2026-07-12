import { describe, expect, it } from 'vitest';
import { evaluateLabelExpression, labelForModelTreeItem } from '../src/model/label-expression';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { createEmptyModel } from '../src/model/ops';
import type { ModelState } from '../src/model/types';

function fixture(): ModelState {
  const model = createEmptyModel('Expression Model');
  model.info.documentation = 'Model docs';
  model.info.properties = [{ key: 'owner', value: 'Architecture' }];
  const businessFolder = Object.values(model.folders).find((folder) => folder.folderType === 'business')!;
  const diagramsFolder = Object.values(model.folders).find((folder) => folder.folderType === 'diagrams')!;
  model.profiles['profile-1'] = {
    id: 'profile-1',
    name: 'Customer Service',
    conceptType: 'BusinessActor',
    specialization: true,
  };
  model.elements.source = {
    id: 'source', kind: 'element', type: 'BusinessActor', name: 'Source', documentation: 'Source docs',
    properties: [{ key: 'key', value: 'one' }, { key: 'key', value: 'two' }], profileIds: ['profile-1'], folderId: businessFolder.id,
  };
  model.elements.target = {
    id: 'target', kind: 'element', type: 'BusinessRole', name: 'Target', documentation: '',
    properties: [], profileIds: [], folderId: businessFolder.id,
  };
  businessFolder.itemIds.push('source', 'target');
  model.relationships.rel = {
    id: 'rel', kind: 'relationship', type: 'AccessRelationship', name: 'reads', documentation: '',
    properties: [], profileIds: [], folderId: businessFolder.id, sourceId: 'source', targetId: 'target', accessType: 1,
  };
  businessFolder.itemIds.push('rel');
  model.views.view = {
    id: 'view', kind: 'view', name: 'Main View', documentation: 'View docs', properties: [],
    folderId: diagramsFolder.id, viewpoint: 'business_process_cooperation', childIds: ['node-source', 'node-target'],
  };
  diagramsFolder.itemIds.push('view');
  const base = { viewId: 'view', parentId: 'view', bounds: { x: 0, y: 0, width: 120, height: 55 }, childIds: [], sourceConnectionIds: [], targetConnectionIds: [] };
  model.nodes['node-source'] = { ...base, id: 'node-source', nodeType: 'element', elementId: 'source', sourceConnectionIds: ['conn'] };
  model.nodes['node-target'] = { ...base, id: 'node-target', nodeType: 'element', elementId: 'target', targetConnectionIds: ['conn'] };
  model.connections.conn = {
    id: 'conn', viewId: 'view', connType: 'relationship', relationshipId: 'rel', sourceId: 'node-source', targetId: 'node-target', bendpoints: [],
  };
  return model;
}

describe('Archi 5.9 label expressions', () => {
  it('renders core values, duplicate properties, and relationship fields', () => {
    const model = fixture();
    expect(evaluateLabelExpression(model, 'node-source', '${name}|${doc}|${type}|${specialization}|${property:key}|${properties: / :key}').text)
      .toBe('Source|Source docs|Business Actor|Customer Service|one|one / two');
    expect(evaluateLabelExpression(model, 'conn', '${name}|${accessType}').text).toBe('reads|Read');
  });

  it('resolves core and relationship source/target prefixes', () => {
    const model = fixture();
    expect(evaluateLabelExpression(model, 'conn', '$source{name} -> $target{name} @ $view{name} / $model{name}').text)
      .toBe('Source -> Target @ Main View / Expression Model');
    expect(evaluateLabelExpression(model, 'conn', '$parent{name}').text).toBe('Source');
    expect(evaluateLabelExpression(model, 'node-source', '$access:target{name}').text).toBe('Target');
    expect(evaluateLabelExpression(model, 'node-source', '$mfolder{name}|$vfolder{name}').text)
      .toBe(`${model.folders[model.elements.source.folderId].name}|${model.folders[model.views.view.folderId].name}`);
  });

  it('supports recursive if, nvl, wordwrap, newlines, and escaped delimiters', () => {
    const model = fixture();
    model.elements.source.properties.push({ key: 'nested', value: '${name}' });
    expect(evaluateLabelExpression(model, 'node-source', '${if:${property:key}:yes:no}').text).toBe('yes');
    expect(evaluateLabelExpression(model, 'node-source', '${nvl:${property:missing}:fallback}').text).toBe('fallback');
    expect(evaluateLabelExpression(model, 'node-source', '${wordwrap:6:one two three}').text).toBe('one \ntwo \nthree');
    expect(evaluateLabelExpression(model, 'node-source', 'a\\:b\\\\c\\n${name}').text).toBe('a:b\\c\nSource');
    expect(evaluateLabelExpression(model, 'node-source', '${property:nested}').text).toBe('Source');
  });

  it('returns visible diagnostics instead of throwing', () => {
    const model = fixture();
    expect(evaluateLabelExpression(model, 'node-source', '${if:broken}')).toMatchObject({
      text: '*** Error in Label Expression ***',
      diagnostics: [{ severity: 'error' }],
    });
    let nested = 'done';
    for (let index = 0; index < 11; index++) nested = `\${if:x:${nested}:no}`;
    expect(evaluateLabelExpression(model, 'node-source', nested)).toMatchObject({
      text: '*** Recursion Error in Label Expression ***',
    });
  });

  it('round-trips label and appearance feature entries', () => {
    const model = fixture();
    model.nodes['node-source'].labelExpression = '${specialization}';
    model.nodes['node-source'].gradient = 2;
    model.nodes['node-source'].lineStyle = 1;
    model.nodes['node-source'].lineWidth = 3;
    model.nodes['node-source'].iconVisible = 2;
    model.nodes['node-source'].iconColor = '#123456';
    model.nodes['node-source'].derivedLineColor = false;
    model.nodes['node-source'].lineAlpha = 120;
    model.nodes['node-source'].imageSource = 1;
    model.nodes['node-source'].fontStyle = { family: 'Aptos', sizePt: 12, bold: true, italic: true };
    model.connections.conn.labelExpression = '${source:name}';
    model.folders[model.elements.source.folderId].labelExpression = '${name} folder';

    const xml = serializeArchimate(model);
    expect(xml).toContain('name="labelExpression"');
    expect(xml).toContain('name="gradient" value="2"');
    expect(xml).toContain('name="lineAlpha" value="120"');
    expect(xml).toContain('name="imageSource" value="1"');
    const reparsed = parseArchimate(xml);
    expect(reparsed.nodes['node-source']).toMatchObject(model.nodes['node-source']);
    expect(reparsed.connections.conn.labelExpression).toBe('${source:name}');
    expect(reparsed.folders[model.elements.source.folderId].labelExpression).toBe('${name} folder');
  });

  it('applies the nearest ancestor folder expression to model-tree labels', () => {
    const model = fixture();
    model.folders[model.elements.source.folderId].labelExpression = '${type}: ${name}';
    expect(labelForModelTreeItem(model, 'source')).toBe('Business Actor: Source');
  });
});
