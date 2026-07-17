import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnectionToView,
  addElement,
  addElementNodeToView,
  addNoteToView,
  addRelationship,
  addView,
  createEmptyModel,
} from '../src/model/ops';
import { replaceModel } from '../src/model/store';
import { useStore } from '../src/ui/store-hooks';
import {
  conceptsFromSelection,
  findInView,
  modelRelations,
  selectionMatchesObject,
  viewsUsing,
} from '../src/model/analysis';

function model() {
  return useStore.getState().model!;
}

beforeEach(() => {
  replaceModel(createEmptyModel('Analysis Test'), null);
});

describe('analysis queries', () => {
  it('returns outgoing relationships first, then incoming relationships, sorted by name and id', () => {
    const customer = addElement('BusinessActor', 'Customer');
    const vipCustomer = addElement('BusinessActor', 'VIP Customer');
    const assignedRole = addElement('BusinessRole', 'Assigned Role');
    const backupRole = addElement('BusinessRole', 'Backup Role');
    const firstOutgoing = addRelationship('AssignmentRelationship', customer, assignedRole, 'A assigned')!;
    const secondOutgoing = addRelationship('AssignmentRelationship', customer, backupRole, 'Z assigned')!;
    const incoming = addRelationship('SpecializationRelationship', vipCustomer, customer, 'B specialized')!;
    const selfRelation = addRelationship('SpecializationRelationship', customer, customer, 'Self specialized')!;

    expect(firstOutgoing).toBeTruthy();
    expect(secondOutgoing).toBeTruthy();
    expect(incoming).toBeTruthy();
    expect(selfRelation).toBeTruthy();

    expect(modelRelations(model(), customer).map((rel) => rel.id)).toEqual([
      firstOutgoing,
      selfRelation,
      secondOutgoing,
      incoming,
    ]);
  });

  it('finds element and relationship usage in views and ignores unused concepts', () => {
    const customer = addElement('BusinessActor', 'Customer');
    const unused = addElement('BusinessActor', 'Unused');
    const role = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship('AssignmentRelationship', customer, role, 'Assignment')!;
    const zView = addView('Z view');
    const aView = addView('A view');

    addElementNodeToView(zView, customer, zView, { x: 10, y: 10, width: 120, height: 55 });
    addElementNodeToView(aView, customer, aView, { x: 20, y: 20, width: 120, height: 55 });
    addElementNodeToView(aView, role, aView, { x: 200, y: 20, width: 120, height: 55 });

    expect(viewsUsing(model(), customer).map((view) => view.id)).toEqual([aView, zView]);
    expect(viewsUsing(model(), relationshipId).map((view) => view.id)).toEqual([aView]);
    expect(viewsUsing(model(), unused)).toEqual([]);
  });

  it('finds the first node or connection representing a concept in a view', () => {
    const customer = addElement('BusinessActor', 'Customer');
    const role = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship('AssignmentRelationship', customer, role, 'Assignment')!;
    const viewId = addView('View');
    const customerNodeId = addElementNodeToView(
      viewId,
      customer,
      viewId,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
    );
    const secondCustomerNodeId = addElementNodeToView(
      viewId,
      customer,
      viewId,
      { x: 10, y: 100, width: 120, height: 55 },
      false,
    );
    const roleNodeId = addElementNodeToView(
      viewId,
      role,
      viewId,
      { x: 200, y: 10, width: 120, height: 55 },
      false,
    );
    const connectionId = addConnectionToView(viewId, relationshipId, customerNodeId, roleNodeId);

    expect(secondCustomerNodeId).toBeTruthy();
    expect(findInView(model(), viewId, customer)).toBe(customerNodeId);
    expect(findInView(model(), viewId, relationshipId)).toBe(connectionId);
    expect(findInView(model(), viewId, addElement('BusinessActor', 'Absent'))).toBeUndefined();
  });

  it('matches semantic selections across tree concepts and every diagram occurrence', () => {
    const customer = addElement('BusinessActor', 'Customer');
    const role = addElement('BusinessRole', 'Role');
    const relationshipId = addRelationship(
      'AssignmentRelationship',
      customer,
      role,
      'Assignment',
    )!;
    const firstView = addView('First view');
    const secondView = addView('Second view');
    const firstCustomerNode = addElementNodeToView(
      firstView,
      customer,
      firstView,
      { x: 10, y: 10, width: 120, height: 55 },
      false,
    );
    const roleNode = addElementNodeToView(
      firstView,
      role,
      firstView,
      { x: 200, y: 10, width: 120, height: 55 },
      false,
    );
    const secondCustomerNode = addElementNodeToView(
      secondView,
      customer,
      secondView,
      { x: 20, y: 20, width: 120, height: 55 },
      false,
    );
    const connectionId = addConnectionToView(
      firstView,
      relationshipId,
      firstCustomerNode,
      roleNode,
    );
    const noteId = addNoteToView(
      firstView,
      firstView,
      { x: 10, y: 100, width: 120, height: 55 },
      'Canvas only',
    );

    expect(selectionMatchesObject(
      model(),
      { source: 'tree', ids: [customer] },
      firstCustomerNode,
    )).toBe(true);
    expect(selectionMatchesObject(
      model(),
      { source: 'tree', ids: [customer] },
      secondCustomerNode,
    )).toBe(true);
    expect(selectionMatchesObject(
      model(),
      { source: 'view', ids: [firstCustomerNode] },
      customer,
    )).toBe(true);
    expect(selectionMatchesObject(
      model(),
      { source: 'view', ids: [firstCustomerNode] },
      secondCustomerNode,
    )).toBe(true);
    expect(selectionMatchesObject(
      model(),
      { source: 'tree', ids: [relationshipId] },
      connectionId,
    )).toBe(true);
    expect(selectionMatchesObject(
      model(),
      { source: 'view', ids: [connectionId] },
      relationshipId,
    )).toBe(true);
    expect(selectionMatchesObject(
      model(),
      { source: 'view', ids: [noteId] },
      customer,
    )).toBe(false);
    expect(conceptsFromSelection(model(), {
      source: 'view',
      ids: [firstCustomerNode, secondCustomerNode, connectionId, 'missing'],
    })).toEqual([customer, relationshipId]);
  });
});
