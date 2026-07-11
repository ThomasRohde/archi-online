import { useEffect, useMemo, useState } from 'react';
import { incomingRelationships, outgoingRelationships } from '../model/analysis';
import { relationshipLabel } from '../model/metamodel';
import { setSelection, type AppState, type SelectionState } from '../model/store';
import { useStore } from './store-hooks';
import type { ArchimateRelationship, Concept, ModelState } from '../model/types';

type Direction = 'out' | 'in';

let internalSelection = false;

function concept(model: ModelState, id: string): Concept | undefined {
  return model.elements[id] ?? model.relationships[id];
}

function conceptFromSelection(
  model: ModelState | null,
  selection: SelectionState,
): string | null {
  if (!model) return null;
  for (let i = selection.ids.length - 1; i >= 0; i--) {
    const id = selection.ids[i];
    if (model.elements[id] || model.relationships[id]) return id;
    if (selection.source === 'view') {
      const node = model.nodes[id];
      if (node?.nodeType === 'element') return node.elementId;
      const connection = model.connections[id];
      if (connection?.relationshipId) return connection.relationshipId;
    }
  }
  return null;
}

function currentSelectionConcept(): string | null {
  const state = useStore.getState();
  return conceptFromSelection(state.model, state.selection);
}

function relationshipText(relationship: ArchimateRelationship): string {
  const label = relationshipLabel(relationship.type);
  return relationship.name ? `${label}: ${relationship.name}` : label;
}

function childrenFor(
  model: ModelState,
  conceptId: string,
  direction: Direction,
): string[] {
  const element = model.elements[conceptId];
  if (element) {
    return (direction === 'out'
      ? outgoingRelationships(model, conceptId)
      : incomingRelationships(model, conceptId)
    ).map((relationship) => relationship.id);
  }

  const relationship = model.relationships[conceptId];
  if (!relationship) return [];
  const otherId = direction === 'out' ? relationship.targetId : relationship.sourceId;
  return concept(model, otherId) ? [otherId] : [];
}

function selectNavigatorConcept(conceptId: string): void {
  internalSelection = true;
  setSelection('tree', [conceptId]);
}

function selectionKey(selection: SelectionState): string {
  return `${selection.source}:${selection.ids.join('|')}`;
}

export function NavigatorPanel() {
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const selectedKey = useStore((s: AppState) => selectionKey(s.selection));
  const [rootId, setRootId] = useState<string | null>(() => currentSelectionConcept());
  const [direction, setDirection] = useState<Direction>('out');
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    rootId ? new Set([`root:${rootId}`]) : new Set(),
  );

  useEffect(() => {
    if (!model) {
      setRootId(null);
      setExpanded(new Set());
      internalSelection = false;
      return;
    }
    if (internalSelection) {
      internalSelection = false;
      return;
    }
    if (pinned) return;
    const next = conceptFromSelection(model, selection);
    if (next) setRootId(next);
  }, [model, pinned, selectedKey, selection]);

  useEffect(() => {
    if (!model || !rootId || !concept(model, rootId)) {
      setExpanded(new Set());
      return;
    }
    setExpanded(new Set([`root:${rootId}`]));
  }, [direction, model, rootId]);

  const rootConcept = useMemo(() => {
    if (!model || !rootId) return undefined;
    return concept(model, rootId);
  }, [model, rootId]);

  const setHome = () => {
    const next = currentSelectionConcept();
    if (next) setRootId(next);
  };

  const togglePath = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderRows = (conceptId: string, path: string, level: number): JSX.Element[] => {
    if (!model) return [];
    const item = concept(model, conceptId);
    if (!item) return [];
    const children = childrenFor(model, conceptId, direction);
    const isExpanded = expanded.has(path);
    const isElement = item.kind === 'element';
    const label = isElement ? item.name : relationshipText(item);
    const rows = [
      <div
        key={path}
        className={'navigator-row' + (path === `root:${rootId}` ? ' root' : '')}
        aria-level={level}
        style={{ paddingLeft: 6 + (level - 1) * 16 }}
        onClick={() => selectNavigatorConcept(conceptId)}
        onDoubleClick={() => {
          if (isElement) setRootId(conceptId);
        }}
      >
        {children.length > 0 ? (
          <button
            className="navigator-toggle"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(event) => {
              event.stopPropagation();
              togglePath(path);
            }}
          >
            {isExpanded ? 'v' : '>'}
          </button>
        ) : (
          <span className="navigator-toggle-spacer" />
        )}
        <span className={isElement ? 'navigator-element-icon' : 'navigator-relationship-icon'}>
          {isElement ? 'E' : 'R'}
        </span>
        <span className="navigator-label">{label}</span>
      </div>,
    ];

    if (isExpanded) {
      for (const childId of children) {
        rows.push(...renderRows(childId, `${path}/${childId}`, level + 1));
      }
    }

    return rows;
  };

  return (
    <div className="navigator-panel">
      <div className="navigator-toolbar">
        <button
          className={'tb-btn small' + (direction === 'out' ? ' active' : '')}
          title="Show target relations"
          aria-pressed={direction === 'out'}
          onClick={() => setDirection('out')}
        >
          Down
        </button>
        <button
          className={'tb-btn small' + (direction === 'in' ? ' active' : '')}
          title="Show source relations"
          aria-pressed={direction === 'in'}
          onClick={() => setDirection('in')}
        >
          Up
        </button>
        <button
          className={'tb-btn small' + (pinned ? ' active' : '')}
          title="Pin to selection"
          aria-pressed={pinned}
          onClick={() => setPinned((value) => !value)}
        >
          Pin
        </button>
        <button className="tb-btn small" title="Home" onClick={setHome}>
          Home
        </button>
      </div>
      <div className="navigator-tree" role="tree">
        {!model && <div className="empty-hint">No model open.</div>}
        {model && !rootConcept && (
          <div className="empty-hint">Select an element or relationship.</div>
        )}
        {model && rootConcept && renderRows(rootConcept.id, `root:${rootConcept.id}`, 1)}
      </div>
    </div>
  );
}
