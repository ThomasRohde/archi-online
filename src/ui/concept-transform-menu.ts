import {
  ELEMENT_TYPES,
  LAYERS,
  RELATIONSHIP_TYPES,
  type ConceptType,
} from '../model/metamodel';
import {
  analyzeConceptTypeChange,
  analyzeRelationshipInversion,
  applyConceptTypeChange,
  applyRelationshipInversion,
} from '../model/ops';
import type { ModelStore } from '../model/store';
import type { ModelState } from '../model/types';
import type { AppSettings } from '../settings/app-settings';
import { showConfirmDialog } from './AppDialog';
import { SEPARATOR, type MenuItem } from './ContextMenu';

export const INVALID_RELATIONSHIPS_CONFIRMATION =
  'Some connected relationships for the chosen elements will become invalid by this operation. They will be converted to Association relationships.';

export function conceptTransformationMenuItems(
  model: ModelState,
  selectedIds: string[],
  store: ModelStore,
  settings: AppSettings,
): MenuItem[] {
  const conceptIds = semanticConceptIds(model, selectedIds);
  const elementIds = conceptIds.filter((id) => Boolean(model.elements[id]));
  const relationshipIds = conceptIds.filter((id) => Boolean(model.relationships[id]));
  const items: MenuItem[] = [];
  const typeChildren: MenuItem[] = [];

  if (elementIds.length > 0) {
    const layerMenus = LAYERS.flatMap((layer) => {
      const children = ELEMENT_TYPES
        .filter((definition) => definition.layer === layer.layer && definition.type !== 'Junction')
        .flatMap((definition) => {
          const plan = analyzeConceptTypeChange(model, {
            conceptIds: elementIds,
            targetType: definition.type,
          });
          return plan.valid
            ? [{
                label: definition.label,
                disabled: store.getState().readOnly,
                onClick: () => {
                  void performConceptTypeChange(elementIds, definition.type, store, settings);
                },
              } satisfies MenuItem]
            : [];
        });
      return children.length > 0 ? [{ label: layer.label, children } satisfies MenuItem] : [];
    });
    typeChildren.push(...layerMenus);
  }

  const relationshipTypeItems = relationshipIds.length > 0
    ? RELATIONSHIP_TYPES.flatMap((definition) => {
        const plan = analyzeConceptTypeChange(model, {
          conceptIds: relationshipIds,
          targetType: definition.type,
        });
        return plan.valid
          ? [{
              label: definition.label,
              disabled: store.getState().readOnly,
              onClick: () => {
                void performConceptTypeChange(relationshipIds, definition.type, store, settings);
              },
            } satisfies MenuItem]
          : [];
      })
    : [];

  if (relationshipTypeItems.length > 0) {
    if (typeChildren.length > 0) {
      typeChildren.push(SEPARATOR, { label: 'Relations', children: relationshipTypeItems });
    } else {
      typeChildren.push(...relationshipTypeItems);
    }
  }
  if (typeChildren.length > 0) {
    items.push({
      label: 'Set Concept Type',
      disabled: store.getState().readOnly,
      children: typeChildren,
    });
  }

  if (relationshipIds.length > 0) {
    const inversion = analyzeRelationshipInversion(model, { ids: relationshipIds });
    items.push({
      label: 'Invert Connection Direction',
      disabled: store.getState().readOnly || !inversion.valid,
      onClick: () => {
        const current = store.getState().model;
        if (!current) return;
        applyRelationshipInversion(
          analyzeRelationshipInversion(current, { ids: relationshipIds }),
          store,
        );
      },
    });
  }

  return items;
}

async function performConceptTypeChange(
  conceptIds: string[],
  targetType: ConceptType,
  store: ModelStore,
  settings: AppSettings,
): Promise<void> {
  const model = store.getState().model;
  if (!model || store.getState().readOnly) return;
  const plan = analyzeConceptTypeChange(model, { conceptIds, targetType });
  if (!plan.valid) return;
  if (plan.requiresConfirmation) {
    const details = plan.invalidAdjacentRelationshipIds
      .map((id) => model.relationships[id])
      .filter((relationship) => Boolean(relationship))
      .map((relationship) => `${relationship.name || '(unnamed)'} (${relationship.type.replace(/Relationship$/, '')})`)
      .join('\n');
    const confirmed = await showConfirmDialog({
      title: 'Set Concept Type',
      message: INVALID_RELATIONSHIPS_CONFIRMATION,
      details,
      confirmLabel: 'Convert to Association',
    });
    if (!confirmed) return;
  }
  applyConceptTypeChange(plan, {
    convertInvalidRelationshipsToAssociation: plan.requiresConfirmation,
    addDocumentationNote: settings.addDocumentationNoteOnRelationChange,
  }, store);
}

function semanticConceptIds(model: ModelState, selectedIds: string[]): string[] {
  const conceptIds: string[] = [];
  for (const id of selectedIds) {
    const conceptId = model.elements[id] || model.relationships[id]
      ? id
      : model.nodes[id]?.nodeType === 'element'
        ? model.nodes[id].elementId
        : model.connections[id]?.relationshipId;
    if (conceptId && !conceptIds.includes(conceptId)) conceptIds.push(conceptId);
  }
  return conceptIds;
}
