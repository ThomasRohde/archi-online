import { useEffect, useState, type ReactNode } from 'react';
import { ELEMENT_TYPE_MAP } from '../../model/metamodel';
import { parseFontStyle } from '../../model/font-style';
import { setNodeStyle, setPlainConnectionAttributes, type NodeStyle } from '../../model/ops';
import { useModelStoreApi, useStore } from '../store-hooks';
import type { Target } from './target';
import {
  PLAIN_CONNECTION_LINE_MASK,
  PLAIN_CONNECTION_SOURCE_ARROW_MASK,
  PLAIN_CONNECTION_TARGET_ARROW_MASK,
  PLAIN_CONNECTION_TYPE,
} from '../../model/types';

const DEFAULT_LINE = '#5c5c5c';
const DEFAULT_FONT = '#000000';

function effectivePlainLine(connectionType: number): number {
  if ((connectionType & PLAIN_CONNECTION_TYPE.DASHED) !== 0) {
    return PLAIN_CONNECTION_TYPE.DASHED;
  }
  if ((connectionType & PLAIN_CONNECTION_TYPE.DOTTED) !== 0) {
    return PLAIN_CONNECTION_TYPE.DOTTED;
  }
  return 0;
}

function effectivePlainSourceArrow(connectionType: number): number {
  if ((connectionType & PLAIN_CONNECTION_TYPE.SOURCE_FILLED) !== 0) {
    return PLAIN_CONNECTION_TYPE.SOURCE_FILLED;
  }
  if ((connectionType & PLAIN_CONNECTION_TYPE.SOURCE_OPEN) !== 0) {
    return PLAIN_CONNECTION_TYPE.SOURCE_OPEN;
  }
  if ((connectionType & PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW) !== 0) {
    return PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW;
  }
  return 0;
}

function effectivePlainTargetArrow(connectionType: number): number {
  if ((connectionType & PLAIN_CONNECTION_TYPE.TARGET_FILLED) !== 0) {
    return PLAIN_CONNECTION_TYPE.TARGET_FILLED;
  }
  if ((connectionType & PLAIN_CONNECTION_TYPE.TARGET_OPEN) !== 0) {
    return PLAIN_CONNECTION_TYPE.TARGET_OPEN;
  }
  if ((connectionType & PLAIN_CONNECTION_TYPE.TARGET_HOLLOW) !== 0) {
    return PLAIN_CONNECTION_TYPE.TARGET_HOLLOW;
  }
  return 0;
}

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

export function AppearanceTab({ target, readOnly }: { target: Target; readOnly: boolean }) {
  const modelStore = useModelStoreApi();
  const apply = (style: NodeStyle) => setNodeStyle(target.styleIds, style, modelStore);
  const node = target.node;
  const conn = target.connection;
  const plainConnection = conn?.connType === 'plain' ? conn : undefined;
  const isConnection = !!conn && !node;
  const currentFont = node?.font ?? conn?.font ?? FONT_OPTIONS[0].value;
  const currentFontStyle = node?.fontStyle ?? conn?.fontStyle ?? parseFontStyle(currentFont) ?? {
    family: 'Segoe UI', sizePt: 9, bold: false, italic: false,
  };
  const [fontFamilies, setFontFamilies] = useState(['Segoe UI', 'Arial', 'Aptos', 'Calibri', 'Helvetica', 'sans-serif']);
  useEffect(() => {
    const query = (window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
    if (!query) return;
    void query().then((fonts) => setFontFamilies([...new Set([...fontFamilies, ...fonts.map((font) => font.family)])].sort()))
      .catch(() => undefined);
  // Common-font fallbacks are intentionally stable if permission is denied.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const updateFont = (patch: Partial<typeof currentFontStyle>) => apply({ fontStyle: { ...currentFontStyle, ...patch } });
  const updatePlainPart = (mask: number, value: number) => {
    if (!plainConnection) return;
    setPlainConnectionAttributes(
      plainConnection.id,
      { connectionType: ((plainConnection.connectionType ?? 0) & ~mask) | value },
      modelStore,
    );
  };
  if (target.styleIds.length === 0) {
    return <div className="empty-hint">Select objects on a view to edit their appearance.</div>;
  }
  const defaultFill =
    node?.nodeType === 'element'
      ? ELEMENT_TYPE_MAP[
          (useStore.getState().model?.elements[node.elementId]?.type ?? 'BusinessActor')
        ].fill
      : '#ffffff';

  return (
    <div className="appearance-form">
      <div className="appearance-column">
        {plainConnection && (
          <>
            <AppearanceField label="Plain Line">
              <select
                aria-label="Plain line style"
                value={effectivePlainLine(plainConnection.connectionType ?? 0)}
                disabled={readOnly}
                onChange={(event) => updatePlainPart(PLAIN_CONNECTION_LINE_MASK, Number(event.target.value))}
              >
                <option value={0}>Solid</option>
                <option value={PLAIN_CONNECTION_TYPE.DASHED}>Dashed</option>
                <option value={PLAIN_CONNECTION_TYPE.DOTTED}>Dotted</option>
              </select>
            </AppearanceField>
            <AppearanceField label="Source Arrow">
              <select
                aria-label="Plain source arrow"
                value={effectivePlainSourceArrow(plainConnection.connectionType ?? 0)}
                disabled={readOnly}
                onChange={(event) => updatePlainPart(PLAIN_CONNECTION_SOURCE_ARROW_MASK, Number(event.target.value))}
              >
                <option value={0}>None</option>
                <option value={PLAIN_CONNECTION_TYPE.SOURCE_FILLED}>Filled</option>
                <option value={PLAIN_CONNECTION_TYPE.SOURCE_HOLLOW}>Hollow</option>
                <option value={PLAIN_CONNECTION_TYPE.SOURCE_OPEN}>Open</option>
              </select>
            </AppearanceField>
            <AppearanceField label="Target Arrow">
              <select
                aria-label="Plain target arrow"
                value={effectivePlainTargetArrow(plainConnection.connectionType ?? 0)}
                disabled={readOnly}
                onChange={(event) => updatePlainPart(PLAIN_CONNECTION_TARGET_ARROW_MASK, Number(event.target.value))}
              >
                <option value={0}>None</option>
                <option value={PLAIN_CONNECTION_TYPE.TARGET_FILLED}>Filled</option>
                <option value={PLAIN_CONNECTION_TYPE.TARGET_HOLLOW}>Hollow</option>
                <option value={PLAIN_CONNECTION_TYPE.TARGET_OPEN}>Open</option>
              </select>
            </AppearanceField>
          </>
        )}
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
          <div className="appearance-font-controls">
            <input list="local-font-families" value={currentFontStyle.family} disabled={readOnly || (!node && !conn)} onChange={(event) => updateFont({ family: event.target.value })} />
            <datalist id="local-font-families">{fontFamilies.map((family) => <option key={family} value={family} />)}</datalist>
            <input className="appearance-number" type="number" min={6} max={72} value={currentFontStyle.sizePt} disabled={readOnly || (!node && !conn)} onChange={(event) => updateFont({ sizePt: Math.max(6, Math.min(72, Number(event.target.value) || 9)) })} />
            <button type="button" className={currentFontStyle.bold ? 'active' : ''} disabled={readOnly || (!node && !conn)} onClick={() => updateFont({ bold: !currentFontStyle.bold })}>B</button>
            <button type="button" className={currentFontStyle.italic ? 'active' : ''} disabled={readOnly || (!node && !conn)} onClick={() => updateFont({ italic: !currentFontStyle.italic })}><i>I</i></button>
          </div>
        </AppearanceField>
      </div>
      <div className="appearance-column">
        <AppearanceField label="Gradient">
          <select value={node?.gradient ?? -1} disabled={readOnly || !node} onChange={(event) => apply({ gradient: Number(event.target.value) as -1 | 0 | 1 | 2 | 3 })}>
            <option value={-1}>None</option>
            <option value={0}>Top</option>
            <option value={1}>Left</option>
            <option value={2}>Right</option>
            <option value={3}>Bottom</option>
          </select>
        </AppearanceField>
        <AppearanceField label="Line Width">
          <select
            value={node?.lineWidth ?? conn?.lineWidth ?? 1}
            disabled={readOnly || (!node && !conn)}
            onChange={(event) => apply({ lineWidth: parseInt(event.target.value, 10) as 1 | 2 | 3 })}
          >
            <option value={1}>Normal</option>
            <option value={2}>Medium</option>
            <option value={3}>Heavy</option>
          </select>
        </AppearanceField>
        <AppearanceField label="Line Style">
          <select value={node?.lineStyle ?? conn?.lineStyle ?? -1} disabled={readOnly || (!node && !conn)} onChange={(event) => apply({ lineStyle: Number(event.target.value) as -1 | 0 | 1 | 2 | 3 })}>
            <option value={-1}>Default</option>
            <option value={0}>Solid</option>
            <option value={1}>Dashed</option>
            <option value={2}>Dotted</option>
            <option value={3}>Hidden</option>
          </select>
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
        <AppearanceField label="Font Opacity">
          <OpacityControl value={node?.fontAlpha ?? conn?.fontAlpha ?? 255} disabled={readOnly || (!node && !conn)} onChange={(value) => apply({ fontAlpha: value })} />
        </AppearanceField>
        {node && (
          <>
            <AppearanceField label="Derived Line Colour">
              <input type="checkbox" checked={node.derivedLineColor ?? true} disabled={readOnly} onChange={(event) => apply({ derivedLineColor: event.target.checked })} />
            </AppearanceField>
            <AppearanceField label="Icon Visibility">
              <select value={node.iconVisible ?? 0} disabled={readOnly || node.nodeType !== 'element'} onChange={(event) => apply({ iconVisible: Number(event.target.value) as 0 | 1 | 2 })}>
                <option value={0}>When no image</option><option value={1}>Always</option><option value={2}>Never</option>
              </select>
            </AppearanceField>
            <AppearanceField label="Icon Colour">
              <ColourControl value={node.iconColor} fallback={DEFAULT_LINE} disabled={readOnly || node.nodeType !== 'element'} onChange={(value) => apply({ iconColor: value })} />
            </AppearanceField>
          </>
        )}
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
