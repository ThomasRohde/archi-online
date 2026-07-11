import type { ReactNode } from 'react';
import { ELEMENT_TYPE_MAP } from '../../model/metamodel';
import { setNodeStyle, type NodeStyle } from '../../model/ops';
import { useModelStoreApi, useStore } from '../store-hooks';
import type { Target } from './target';

const DEFAULT_LINE = '#5c5c5c';
const DEFAULT_FONT = '#000000';

const FONT_OPTIONS = [
  { label: 'Segoe UI 9', value: buildFontString('Segoe UI', 9, false, false) },
  { label: 'Segoe UI 10', value: buildFontString('Segoe UI', 10, false, false) },
  { label: 'Segoe UI 11', value: buildFontString('Segoe UI', 11, false, false) },
  { label: 'Arial 9', value: buildFontString('Arial', 9, false, false) },
  { label: 'Arial 10', value: buildFontString('Arial', 10, false, false) },
];

function buildFontString(name: string, size: number, bold: boolean, italic: boolean): string {
  const style = (bold ? 1 : 0) | (italic ? 2 : 0);
  return `1|${name}|${size}|${style}|`;
}

function labelForFont(font: string): string {
  const parts = font.split('|');
  if (parts.length < 4) return font;
  const name = parts[1] || 'Segoe UI';
  const size = Math.round(parseFloat(parts[2])) || 9;
  const style = parseInt(parts[3], 10) || 0;
  const suffix = [(style & 1) !== 0 ? 'Bold' : '', (style & 2) !== 0 ? 'Italic' : '']
    .filter(Boolean)
    .join(' ');
  return `${name} ${size}${suffix ? ` ${suffix}` : ''}`;
}

function clampByte(value: string | number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(255, parsed));
}

function AppearanceField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="appearance-field">
      <label>{label}</label>
      <div className="appearance-control">{children}</div>
    </div>
  );
}

function ColourControl({
  value,
  fallback,
  disabled,
  onChange,
}: {
  value: string | undefined;
  fallback: string;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="appearance-colour">
      <input
        type="color"
        value={value ?? fallback}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="appearance-reset"
        aria-label="Reset colour"
        title="Reset to default"
        disabled={disabled || value === undefined}
        onClick={() => onChange(undefined)}
      />
    </div>
  );
}

function OpacityControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <input
      className="appearance-number"
      type="number"
      min={0}
      max={255}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(clampByte(event.target.value, value))}
      onBlur={(event) => {
        const next = clampByte(event.target.value, value);
        event.currentTarget.value = String(next);
        onChange(next);
      }}
    />
  );
}

function SegmentedControl({
  value,
  options,
  disabled,
  onChange,
}: {
  value: number;
  options: { value: number; label: string; icon: ReactNode }[];
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="appearance-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          className={option.value === value ? 'active' : ''}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  return (
    <span className={`appearance-align-icon ${align}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function PositionIcon({ position }: { position: 'top' | 'middle' | 'bottom' }) {
  return (
    <span className={`appearance-position-icon ${position}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function LineStylePreview() {
  return (
    <button type="button" className="appearance-line-preview" disabled aria-label="Line style">
      <span />
    </button>
  );
}

function fontOptions(currentFont: string): { label: string; value: string }[] {
  if (FONT_OPTIONS.some((option) => option.value === currentFont)) return FONT_OPTIONS;
  return [{ label: labelForFont(currentFont), value: currentFont }, ...FONT_OPTIONS];
}

export function AppearanceTab({ target, readOnly }: { target: Target; readOnly: boolean }) {
  const modelStore = useModelStoreApi();
  if (target.styleIds.length === 0) {
    return <div className="empty-hint">Select objects on a view to edit their appearance.</div>;
  }

  const apply = (style: NodeStyle) => setNodeStyle(target.styleIds, style, modelStore);
  const node = target.node;
  const conn = target.connection;
  const isConnection = !!conn && !node;
  const currentFont = node?.font ?? conn?.font ?? FONT_OPTIONS[0].value;
  const defaultFill =
    node?.nodeType === 'element'
      ? ELEMENT_TYPE_MAP[
          (useStore.getState().model?.elements[node.elementId]?.type ?? 'BusinessActor')
        ].fill
      : '#ffffff';

  return (
    <div className="appearance-form">
      <div className="appearance-column">
        <AppearanceField label="Fill Colour">
          <ColourControl
            value={node?.fillColor}
            fallback={defaultFill}
            disabled={readOnly || !node}
            onChange={(value) => apply({ fillColor: value })}
          />
        </AppearanceField>
        <AppearanceField label="Fill Opacity">
          <OpacityControl
            value={node?.alpha ?? 255}
            disabled={readOnly || !node}
            onChange={(value) => apply({ alpha: value })}
          />
        </AppearanceField>
        <AppearanceField label="Line Colour">
          <ColourControl
            value={node?.lineColor ?? conn?.lineColor}
            fallback={DEFAULT_LINE}
            disabled={readOnly || (!node && !conn)}
            onChange={(value) => apply({ lineColor: value })}
          />
        </AppearanceField>
        <AppearanceField label="Line Opacity">
          <OpacityControl
            value={node?.lineAlpha ?? 255}
            disabled={readOnly || !node}
            onChange={(value) => apply({ lineAlpha: value })}
          />
        </AppearanceField>
        <AppearanceField label="Text Alignment">
          <SegmentedControl
            value={node?.textAlignment ?? 2}
            disabled={readOnly || !node}
            onChange={(value) => apply({ textAlignment: value })}
            options={[
              { value: 1, label: 'Align left', icon: <AlignIcon align="left" /> },
              { value: 2, label: 'Align center', icon: <AlignIcon align="center" /> },
              { value: 4, label: 'Align right', icon: <AlignIcon align="right" /> },
            ]}
          />
        </AppearanceField>
        <AppearanceField label="Font">
          <select
            value={currentFont}
            disabled={readOnly || (!node && !conn)}
            onChange={(event) => apply({ font: event.target.value })}
          >
            {fontOptions(currentFont).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AppearanceField>
      </div>
      <div className="appearance-column">
        <AppearanceField label="Gradient">
          <select value="none" disabled>
            <option value="none">None</option>
          </select>
        </AppearanceField>
        <AppearanceField label="Line Width">
          <select
            value={conn?.lineWidth ?? 1}
            disabled={readOnly || !conn}
            onChange={(event) => apply({ lineWidth: parseInt(event.target.value, 10) })}
          >
            <option value={1}>Normal</option>
            <option value={2}>Medium</option>
            <option value={3}>Heavy</option>
          </select>
        </AppearanceField>
        <AppearanceField label="Line Style">
          <LineStylePreview />
        </AppearanceField>
        <AppearanceField label="Text Position">
          <SegmentedControl
            value={(node?.textPosition ?? conn?.textPosition) ?? 1}
            disabled={readOnly || (!node && !conn)}
            onChange={(value) => apply({ textPosition: value })}
            options={[
              {
                value: 0,
                label: isConnection ? 'Position source' : 'Position top',
                icon: <PositionIcon position="top" />,
              },
              { value: 1, label: 'Position middle', icon: <PositionIcon position="middle" /> },
              {
                value: 2,
                label: isConnection ? 'Position target' : 'Position bottom',
                icon: <PositionIcon position="bottom" />,
              },
            ]}
          />
        </AppearanceField>
        <AppearanceField label="Font Colour">
          <ColourControl
            value={node?.fontColor ?? conn?.fontColor}
            fallback={DEFAULT_FONT}
            disabled={readOnly || (!node && !conn)}
            onChange={(value) => apply({ fontColor: value })}
          />
        </AppearanceField>
        {node?.nodeType === 'element' && (
          <AppearanceField label="Figure">
            <select
              value={node.figureType ?? 0}
              disabled={readOnly}
              onChange={(event) => apply({ figureType: parseInt(event.target.value, 10) })}
            >
              <option value={0}>Default (box + icon)</option>
              <option value={1}>ArchiMate notation shape</option>
            </select>
          </AppearanceField>
        )}
      </div>
    </div>
  );
}
