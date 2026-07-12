import { useEffect, useState } from 'react';
import { evaluateLabelExpression } from '../../model/label-expression';
import { setLabelExpression } from '../../model/ops';
import type { ModelState } from '../../model/types';
import { useModelStoreApi } from '../store-hooks';

export function LabelTab({ model, objectId, readOnly }: { model: ModelState; objectId: string; readOnly: boolean }) {
  const modelStore = useModelStoreApi();
  const object = model.nodes[objectId] ?? model.connections[objectId] ?? model.folders[objectId];
  const value = object?.labelExpression ?? '';
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value, objectId]);
  const result = evaluateLabelExpression(model, objectId, text || undefined);
  const commit = () => {
    if (!readOnly && text !== value) setLabelExpression(objectId, text || undefined, modelStore);
  };
  return (
    <div className="prop-form label-expression-form">
      <div className="prop-row">
        <label>Expression</label>
        <textarea
          className="prop-input prop-doc"
          aria-label="Label expression"
          value={text}
          disabled={readOnly}
          placeholder="${name}"
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
        />
      </div>
      <div className="prop-row">
        <label>Preview</label>
        <output className="label-expression-preview">{result.text}</output>
      </div>
      {result.diagnostics.map((diagnostic, index) => (
        <div key={index} className="prop-hint label-expression-error">{diagnostic.message}</div>
      ))}
    </div>
  );
}
