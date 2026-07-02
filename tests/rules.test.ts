import { describe, expect, it } from 'vitest';
import { isAllowedRelationship, validRelationshipTypes } from '../src/model/rules';
import { ELEMENT_TYPE_NAMES } from '../src/model/metamodel';
import { relationsMatrix } from '../src/model/data/relations-matrix';

describe('relationship rules (ArchiMate 3.2 matrix)', () => {
  it('allows classic valid relationships', () => {
    expect(isAllowedRelationship('AssignmentRelationship', 'BusinessActor', 'BusinessRole')).toBe(true);
    expect(isAllowedRelationship('ServingRelationship', 'ApplicationService', 'BusinessProcess')).toBe(true);
    expect(isAllowedRelationship('RealizationRelationship', 'ApplicationComponent', 'ApplicationService')).toBe(true);
    expect(isAllowedRelationship('CompositionRelationship', 'ApplicationComponent', 'ApplicationComponent')).toBe(true);
    expect(isAllowedRelationship('AccessRelationship', 'BusinessProcess', 'BusinessObject')).toBe(true);
    expect(isAllowedRelationship('SpecializationRelationship', 'Goal', 'Goal')).toBe(true);
  });

  it('rejects invalid relationships', () => {
    // A business object cannot be assigned to anything
    expect(isAllowedRelationship('AssignmentRelationship', 'BusinessObject', 'BusinessProcess')).toBe(false);
    // Access from passive structure to behaviour is not allowed
    expect(isAllowedRelationship('AccessRelationship', 'BusinessObject', 'BusinessProcess')).toBe(false);
    // Composition from Business Actor to Business Service is not allowed
    expect(isAllowedRelationship('CompositionRelationship', 'BusinessActor', 'BusinessService')).toBe(false);
  });

  it('association is always allowed between any two elements', () => {
    for (const src of ELEMENT_TYPE_NAMES) {
      for (const tgt of ELEMENT_TYPE_NAMES) {
        expect(
          isAllowedRelationship('AssociationRelationship', src, tgt),
          `association ${src} -> ${tgt}`,
        ).toBe(true);
      }
    }
  });

  it('supports association to relationships (pseudo-concept)', () => {
    expect(isAllowedRelationship('AssociationRelationship', 'BusinessActor', 'ServingRelationship')).toBe(true);
    expect(isAllowedRelationship('CompositionRelationship', 'BusinessActor', 'ServingRelationship')).toBe(false);
  });

  it('matrix covers every element type as source and target', () => {
    for (const t of ELEMENT_TYPE_NAMES) {
      expect(relationsMatrix[t], `source row ${t}`).toBeDefined();
      expect(relationsMatrix.BusinessActor[t], `target column ${t}`).toBeDefined();
    }
  });

  it('lists valid types for the magic connector', () => {
    const types = validRelationshipTypes('ApplicationComponent', 'ApplicationService');
    expect(types).toContain('RealizationRelationship');
    expect(types).toContain('AssociationRelationship');
    expect(types).not.toContain('AccessRelationship');
  });

  it('junction participates in the matrix', () => {
    expect(isAllowedRelationship('TriggeringRelationship', 'BusinessProcess', 'Junction')).toBe(true);
    expect(isAllowedRelationship('TriggeringRelationship', 'Junction', 'BusinessProcess')).toBe(true);
  });
});
