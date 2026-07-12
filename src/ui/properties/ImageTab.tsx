import { assetDataUrl } from '../../model/assets';
import { setNodeStyle } from '../../model/ops';
import type { Target } from './target';
import { ImageGallery } from '../ImageGallery';
import { useModelStoreApi, useStore } from '../store-hooks';

const POSITIONS = [
  'Top left', 'Top center', 'Top right',
  'Middle left', 'Middle center', 'Middle right',
  'Bottom left', 'Bottom center', 'Bottom right', 'Fill',
];

export function ImageTab({ target, readOnly }: { target: Target; readOnly: boolean }) {
  const modelStore = useModelStoreApi();
  const model = useStore((state) => state.model);
  if (!model || target.count !== 1 || !target.node) {
    return <div className="empty-hint">Select one diagram object.</div>;
  }
  const node = target.node;
  const element = node.nodeType === 'element' ? model.elements[node.elementId] : undefined;
  const profilePath = element ? model.profiles[element.profileIds[0]]?.imagePath : undefined;
  const source = node.nodeType === 'element' ? (node.imageSource ?? (profilePath ? 0 : 1)) : 1;
  const effectivePath = source === 0 ? profilePath : node.imagePath;
  const asset = effectivePath ? model.assets[effectivePath] : undefined;
  const commit = (style: Parameters<typeof setNodeStyle>[1]) => {
    if (!readOnly) setNodeStyle([node.id], style, modelStore);
  };

  return (
    <div className="image-tab">
      {node.nodeType === 'element' && (
        <div className="prop-row">
          <label>Source</label>
          <select
            aria-label="Image source"
            value={source}
            disabled={readOnly || !profilePath}
            onChange={(event) => commit({ imageSource: Number(event.target.value) as 0 | 1 })}
          >
            {profilePath && <option value={0}>Specialization</option>}
            <option value={1}>Custom</option>
          </select>
        </div>
      )}
      <div className="prop-row">
        <label>Position</label>
        <select
          aria-label="Image position"
          value={node.imagePosition ?? (node.nodeType === 'image' ? 9 : 2)}
          disabled={readOnly || !effectivePath}
          onChange={(event) => commit({ imagePosition: Number(event.target.value) })}
        >
          {POSITIONS.map((label, value) => <option key={label} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="image-preview">
        {asset ? <img src={assetDataUrl(asset)} alt="Selected" /> : <span>No image selected</span>}
      </div>
      {source === 1 && !readOnly && (
        <ImageGallery
          selectedPath={node.imagePath}
          onSelect={(path) => commit({ imagePath: path, imageSource: 1 })}
        />
      )}
      {source === 1 && node.imagePath && !readOnly && (
        <button className="tb-btn" onClick={() => commit({ imagePath: undefined })}>
          Remove image
        </button>
      )}
    </div>
  );
}
