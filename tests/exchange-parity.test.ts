import { describe, expect, it } from 'vitest';
import {
  EXCHANGE_SCHEMAS,
  exportExchange,
  parseExchangeDocument,
  serializeExchange,
} from '../src/model/io/exchange-xml';
import { createEmptyModel } from '../src/model/ops';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';

function model() {
  const state = createEmptyModel('Metadata Model');
  const folder = Object.values(state.folders).find((candidate) => candidate.folderType === 'business')!;
  state.elements.actor = { id: 'actor', kind: 'element', type: 'BusinessActor', name: 'Kunde', documentation: '', properties: [], profileIds: [], folderId: folder.id };
  folder.itemIds.push('actor');
  state.info.language = 'da';
  state.info.metadata = [
    { name: 'creator', value: 'Architecture Team' },
    { name: 'rights', value: 'Internal' },
  ];
  return state;
}

describe('Archi 5.9 Open Exchange completion', () => {
  it('exports language, ordered Dublin Core metadata, specialization, and optional organization', () => {
    const state = model();
    const actor = Object.values(state.elements)[0];
    state.profiles.profile = { id: 'profile', name: 'External Party', conceptType: actor.type, specialization: true };
    actor.profileIds = ['profile'];
    const xml = serializeExchange(state, { includeOrganization: false });
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xml).toContain('<dc:creator>Architecture Team</dc:creator>');
    expect(xml.indexOf('<dc:creator>')).toBeLessThan(xml.indexOf('<dc:rights>'));
    expect(xml).toContain('<name xml:lang="da">Kunde</name>');
    expect(xml).toContain('propertyDefinitionRef="specialization"');
    expect(xml).not.toContain('<organizations>');
  });

  it('imports language-tagged values, metadata, and profiles with a structured result', () => {
    const xml = serializeExchange(model());
    const result = parseExchangeDocument(xml, { language: 'da' });
    expect(result.errors).toEqual([]);
    expect(result.model?.info.language).toBe('da');
    expect(result.model?.info.metadata).toEqual([
      { name: 'creator', value: 'Architecture Team' },
      { name: 'rights', value: 'Internal' },
    ]);
    expect(result.counts.elements).toBe(1);
  });

  it('selects the requested language and retains metadata in native documents', () => {
    const state = model();
    const native = parseArchimate(serializeArchimate(state));
    expect(native.info.metadata).toEqual(state.info.metadata);
    expect(native.info.language).toBe('da');

    const exchange = serializeExchange(state).replace(
      '<name xml:lang="da">Metadata Model</name>',
      '<name xml:lang="en">Metadata Model</name><name xml:lang="da">Metadata Model DA</name>',
    );
    expect(parseExchangeDocument(exchange, { language: 'da' }).model?.info.name).toBe('Metadata Model DA');
  });

  it('never returns a partial model when import fails', () => {
    const result = parseExchangeDocument('<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/"><elements><element identifier="x" xsi:type="Bogus" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/></elements></model>');
    expect(result.model).toBeUndefined();
    expect(result.errors[0]).toMatchObject({ severity: 'error' });
  });

  it('bundles all five schemas and validates before export', async () => {
    expect(Object.keys(EXCHANGE_SCHEMAS).sort()).toEqual([
      'archimate3_Diagram.xsd', 'archimate3_Model.xsd', 'archimate3_View.xsd', 'dc.xsd', 'xml.xsd',
    ]);
    const result = await exportExchange(model(), { validate: true, copySchemas: true });
    expect(result.valid, result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toBe(true);
    expect(result.schemas).toEqual(EXCHANGE_SCHEMAS);
  });
});
