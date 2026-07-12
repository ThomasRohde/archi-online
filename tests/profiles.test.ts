import { beforeEach, describe, expect, it } from 'vitest';
import {
  addElement,
  addRelationship,
  createEmptyModel,
  createProfile,
  deleteProfile,
  profileUsageCount,
  setConceptProfiles,
  updateProfile,
} from '../src/model/ops';
import { parseArchimate, serializeArchimate } from '../src/model/io/archimate-xml';
import { parseExchange, serializeExchange } from '../src/model/io/exchange-xml';
import { applyCsvImport, serializeCsv } from '../src/model/io/csv';
import { redo, replaceModel, undo } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';

function model() {
  return useStore.getState().model!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('Profiles'), null);
});

describe('Archi specializations', () => {
  it('creates, assigns, updates, deletes, and restores profiles transactionally', () => {
    const actor = addElement('BusinessActor', 'Customer');
    const profile = createProfile({
      name: 'External party',
      conceptType: 'BusinessActor',
      imagePath: 'images/_abcdefghijklmnopqrstuv.png',
    });

    setConceptProfiles(actor, [profile]);
    expect(model().elements[actor].profileIds).toEqual([profile]);
    expect(profileUsageCount(model(), profile)).toBe(1);

    expect(() => updateProfile(profile, { conceptType: 'BusinessRole' })).toThrow(
      /used profile/i,
    );
    expect(() => createProfile({ name: 'EXTERNAL PARTY', conceptType: 'BusinessActor' })).toThrow(
      /unique/i,
    );

    deleteProfile(profile);
    expect(model().profiles[profile]).toBeUndefined();
    expect(model().elements[actor].profileIds).toEqual([]);
    undo();
    expect(model().profiles[profile]?.name).toBe('External party');
    expect(model().elements[actor].profileIds).toEqual([profile]);
    redo();
    expect(model().profiles[profile]).toBeUndefined();
  });

  it('only assigns profiles with the exact concept type and preserves primary order', () => {
    const actor = addElement('BusinessActor', 'Customer');
    const role = addElement('BusinessRole', 'Buyer');
    const relation = addRelationship('AssignmentRelationship', actor, role)!;
    const first = createProfile({ name: 'First', conceptType: 'BusinessActor' });
    const second = createProfile({ name: 'Second', conceptType: 'BusinessActor' });
    const relationshipProfile = createProfile({
      name: 'Delegation',
      conceptType: 'AssignmentRelationship',
    });

    setConceptProfiles(actor, [second, first, second]);
    expect(model().elements[actor].profileIds).toEqual([second, first]);
    setConceptProfiles(relation, [relationshipProfile]);
    expect(model().relationships[relation].profileIds).toEqual([relationshipProfile]);
    expect(() => setConceptProfiles(role, [first])).toThrow(/BusinessRole/);
  });

  it('round-trips root profile definitions and ordered concept references', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.archimatetool.com/archimate" name="Specialized" id="model-1" version="5.0.0">
  <profile name="Primary" id="profile-1" imagePath="images/_abcdefghijklmnopqrstuv.png" conceptType="BusinessActor" specialization="true"/>
  <profile name="Secondary" id="profile-2" conceptType="BusinessActor" specialization="true"/>
  <folder name="Business" id="business" type="business">
    <element xsi:type="archimate:BusinessActor" name="Customer" id="actor-1" profiles="profile-2 profile-1"/>
  </folder>
</archimate:model>`;

    const parsed = parseArchimate(xml);
    expect(parsed.profiles['profile-1']).toMatchObject({
      name: 'Primary',
      conceptType: 'BusinessActor',
      specialization: true,
      imagePath: 'images/_abcdefghijklmnopqrstuv.png',
    });
    expect(parsed.elements['actor-1'].profileIds).toEqual(['profile-2', 'profile-1']);

    const serialized = serializeArchimate(parsed);
    expect(serialized).toContain('<profile name="Primary" id="profile-1"');
    expect(serialized).toContain('profiles="profile-2 profile-1"');
    expect(parseArchimate(serialized)).toEqual(parsed);
  });

  it('exports and imports the primary specialization in Archi CSV columns', () => {
    const actor = addElement('BusinessActor', 'Customer');
    const role = addElement('BusinessRole', 'Buyer');
    const relation = addRelationship('AssignmentRelationship', actor, role)!;
    const actorProfile = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    const relationProfile = createProfile({
      name: 'Delegation',
      conceptType: 'AssignmentRelationship',
    });
    setConceptProfiles(actor, [actorProfile]);
    setConceptProfiles(relation, [relationProfile]);

    const files = serializeCsv(model());
    expect(files[0].content).toContain('"External party"');
    expect(files[1].content).toContain('"Delegation"');

    const target = createEmptyModel('Imported');
    applyCsvImport(target, {
      elements: files[0].content,
      relations: files[1].content,
    });
    expect(Object.values(target.profiles).map((profile) => profile.name).sort()).toEqual([
      'Delegation',
      'External party',
    ]);
    expect(target.elements[actor].profileIds).toHaveLength(1);
    expect(target.relationships[relation].profileIds).toHaveLength(1);
  });

  it('maps the primary specialization through the Archi 5.9 Exchange property', () => {
    const actor = addElement('BusinessActor', 'Customer');
    const profile = createProfile({ name: 'External party', conceptType: 'BusinessActor' });
    setConceptProfiles(actor, [profile]);

    const xml = serializeExchange(model());
    expect(xml).toContain('identifier="specialization"');
    expect(xml).toContain('<name>Specialization</name>');
    expect(xml).toContain('propertyDefinitionRef="specialization"');
    expect(xml).toContain('<value>External party</value>');

    const imported = parseExchange(xml);
    expect(imported.elements[actor].profileIds).toHaveLength(1);
    expect(imported.profiles[imported.elements[actor].profileIds[0]]).toMatchObject({
      name: 'External party',
      conceptType: 'BusinessActor',
    });
  });
});
