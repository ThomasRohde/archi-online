import { findInView, modelRelations, viewsUsing } from '../../model/analysis';
import { relationshipLabel } from '../../model/metamodel';
import { openView, setSelection } from '../../model/store';
import type { ModelState } from '../../model/types';
import { conceptName } from './target';

export function AnalysisTab({
  model,
  conceptId,
}: {
  model: ModelState;
  conceptId: string;
}) {
  const relationships = modelRelations(model, conceptId);
  const views = viewsUsing(model, conceptId);

  return (
    <div className="analysis-form">
      <div className="prop-section">
        <div className="prop-section-title">Model Relations</div>
        {relationships.length === 0 ? (
          <div className="empty-hint">No relations.</div>
        ) : (
          <div className="analysis-list">
            {relationships.map((relationship) => (
              <button
                className="analysis-row"
                key={relationship.id}
                type="button"
                onClick={() => setSelection('tree', [relationship.id])}
              >
                {relationshipLabel(relationship.type)} ({conceptName(model, relationship.sourceId)} →{' '}
                {conceptName(model, relationship.targetId)})
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="prop-section">
        <div className="prop-section-title">Used in Views</div>
        {views.length === 0 ? (
          <div className="empty-hint">Not used in any view.</div>
        ) : (
          <div className="analysis-list">
            {views.map((view) => (
              <button
                className="analysis-row"
                key={view.id}
                type="button"
                onClick={() => {
                  openView(view.id);
                  const objectId = findInView(model, view.id, conceptId);
                  if (objectId) setSelection('view', [objectId]);
                }}
              >
                {view.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
