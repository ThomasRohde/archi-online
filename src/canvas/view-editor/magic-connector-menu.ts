import {
  ELEMENT_TYPES,
  LAYERS,
  RELATIONSHIP_TYPES,
  type ElementType,
} from '../../model/metamodel';
import type {
  MagicExistingTargetAnalysis,
  MagicExistingTargetOption,
  MagicTargetCreationAnalysis,
  MagicTargetCreationPair,
} from '../../model/ops';
import { SEPARATOR, type MenuItem } from '../../ui/ContextMenu';

function elementDefinition(type: ElementType) {
  return ELEMENT_TYPES.find((definition) => definition.type === type)!;
}

export function buildMagicConnectionMenuItems(
  analysis: MagicExistingTargetAnalysis,
  choose: (option: MagicExistingTargetOption, relationshipId?: string) => void,
): MenuItem[] {
  return analysis.groups
    .map((group): MenuItem => ({
      label: group.direction === 'forward' ? 'Forward' : 'Reverse',
      children: group.options.map((option) => {
        const definition = RELATIONSHIP_TYPES.find(
          (candidate) => candidate.type === option.relationshipType,
        )!;
        const existing = option.existingRelationships.map((relationship): MenuItem => ({
          label: `Reuse ${relationship.name || `unnamed ${definition.label}`}`,
          onClick: () => choose(option, relationship.relationshipId),
        }));
        return {
          label: definition.label,
          children: [
            ...existing,
            ...(existing.length > 0 ? [SEPARATOR] : []),
            {
              label: `New ${definition.label}`,
              onClick: () => choose(option),
            },
          ],
        };
      }),
    }))
    .filter((group) => (group.children?.length ?? 0) > 0);
}

function relationshipFirstItems(
  analysis: MagicTargetCreationAnalysis,
  choose: (pair: MagicTargetCreationPair) => void,
): MenuItem[] {
  return RELATIONSHIP_TYPES.flatMap((relationship) => {
    const matching = analysis.pairs.filter(
      (pair) => pair.relationshipType === relationship.type,
    );
    if (matching.length === 0) return [];
    const children = LAYERS.flatMap(({ layer, label }) => {
      const elementTypes = matching
        .map((pair) => pair.elementType)
        .filter((type) => elementDefinition(type).layer === layer);
      if (elementTypes.length === 0) return [];
      return [{
        label,
        children: elementTypes.map((elementType) => ({
          label: elementDefinition(elementType).label,
          onClick: () => choose({ relationshipType: relationship.type, elementType }),
        })),
      }];
    });
    return [{ label: relationship.label, children }];
  });
}

function elementFirstItems(
  analysis: MagicTargetCreationAnalysis,
  choose: (pair: MagicTargetCreationPair) => void,
): MenuItem[] {
  return LAYERS.flatMap(({ layer, label }) => {
    const elementTypes = ELEMENT_TYPES
      .filter((definition) => definition.layer === layer)
      .map((definition) => definition.type)
      .filter((elementType) =>
        analysis.pairs.some((pair) => pair.elementType === elementType),
      );
    if (elementTypes.length === 0) return [];
    return [{
      label,
      children: elementTypes.map((elementType) => ({
        label: elementDefinition(elementType).label,
        children: RELATIONSHIP_TYPES.flatMap((relationship) => {
          const pair = analysis.pairs.find(
            (candidate) =>
              candidate.elementType === elementType &&
              candidate.relationshipType === relationship.type,
          );
          return pair
            ? [{ label: relationship.label, onClick: () => choose(pair) }]
            : [];
        }),
      })),
    }];
  });
}

export function buildMagicTargetMenuItems(
  analysis: MagicTargetCreationAnalysis,
  elementFirst: boolean,
  choose: (pair: MagicTargetCreationPair) => void,
): MenuItem[] {
  return elementFirst
    ? elementFirstItems(analysis, choose)
    : relationshipFirstItems(analysis, choose);
}
