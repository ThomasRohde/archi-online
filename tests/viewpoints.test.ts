import { describe, expect, it } from 'vitest';
import { VIEWPOINTS, isAllowedElementInViewpoint } from '../src/model/data/viewpoints';
import { VIEWPOINT_ID_TO_NAME } from '../src/model/io/exchange-xml/mapping';
import type { ElementType } from '../src/model/metamodel';

describe('viewpoints table', () => {
  it('has ids matching VIEWPOINT_ID_TO_NAME exactly, both directions', () => {
    const tableIds = VIEWPOINTS.map((vp) => vp.id).sort();
    const mappingIds = Object.keys(VIEWPOINT_ID_TO_NAME).sort();
    expect(tableIds).toEqual(mappingIds);
  });

  it('has names matching VIEWPOINT_ID_TO_NAME', () => {
    for (const vp of VIEWPOINTS) {
      expect(vp.name).toBe(VIEWPOINT_ID_TO_NAME[vp.id]);
    }
  });

  it('has no unknown ids and no duplicates', () => {
    const ids = VIEWPOINTS.map((vp) => vp.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isAllowedElementInViewpoint', () => {
  it('allows everything when no viewpoint is set', () => {
    expect(isAllowedElementInViewpoint(undefined, 'BusinessActor')).toBe(true);
    expect(isAllowedElementInViewpoint('', 'Node')).toBe(true);
    expect(isAllowedElementInViewpoint(undefined, 'Goal')).toBe(true);
  });

  it('allows everything for an unknown viewpoint id', () => {
    expect(isAllowedElementInViewpoint('does_not_exist', 'BusinessActor')).toBe(true);
  });

  it('allows everything for the Layered viewpoint (empty allow-list)', () => {
    for (const type of ['BusinessActor', 'Node', 'Goal', 'DataObject'] as ElementType[]) {
      expect(isAllowedElementInViewpoint('layered', type)).toBe(true);
    }
  });

  it('restricts a business-only viewpoint (Organization)', () => {
    expect(isAllowedElementInViewpoint('organization', 'BusinessActor')).toBe(true);
    expect(isAllowedElementInViewpoint('organization', 'Node')).toBe(false);
  });

  it('restricts Application Structure to application concepts', () => {
    expect(isAllowedElementInViewpoint('application_structure', 'ApplicationComponent')).toBe(true);
    expect(isAllowedElementInViewpoint('application_structure', 'BusinessActor')).toBe(false);
  });

  it('restricts Motivation to motivation elements', () => {
    expect(isAllowedElementInViewpoint('motivation', 'Goal')).toBe(true);
    expect(isAllowedElementInViewpoint('motivation', 'ApplicationComponent')).toBe(false);
  });

  it('always allows Junction and Grouping (defaultList) in any restricted viewpoint', () => {
    for (const id of ['organization', 'application_structure', 'motivation', 'migration']) {
      expect(isAllowedElementInViewpoint(id, 'Junction')).toBe(true);
      expect(isAllowedElementInViewpoint(id, 'Grouping')).toBe(true);
    }
  });
});
