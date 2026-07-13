import type { CSSProperties } from 'react';
import { assetDataUrl } from '../../model/assets';
import {
  deriveLegendEntries,
  layoutLegendEntries,
  type LegendPreferences,
} from '../../model/legend';
import { isElementType, type RelationshipType } from '../../model/metamodel';
import type { ModelState, NoteNode } from '../../model/types';
import { StandaloneIcon } from './icons';
import { RelationshipIcon } from './RelationshipIcon';

export interface LegendFigureProps {
  model: ModelState;
  node: NoteNode & { legendOptions: NonNullable<NoteNode['legendOptions']> };
  preferences: LegendPreferences;
  font: { family: string; sizePx: number; bold: boolean; italic: boolean };
  color: string;
}

/** Shared live legend content used by editor, viewer, outline, and static export. */
export function LegendFigure({ model, node, preferences, font, color }: LegendFigureProps) {
  const rowHeight = Math.max(22, font.sizePx * 1.2);
  const layout = layoutLegendEntries(
    deriveLegendEntries(model, node.id, preferences),
    node.legendOptions,
    (label) => label.length * font.sizePx * 0.56,
    rowHeight,
  );
  const textStyle: CSSProperties = {
    pointerEvents: 'none',
    userSelect: 'none',
  };
  return (
    <g data-native-legend="true" aria-label="Live legend">
      {layout.entries.map((entry) => {
        const iconY = entry.y + (rowHeight - 16) / 2;
        const profileAsset = entry.iconPath ? model.assets[entry.iconPath] : undefined;
        return (
          <g
            key={entry.key}
            data-legend-entry={entry.type}
            data-profile-id={entry.profileId}
          >
            {profileAsset ? (
              <image
                data-profile-icon="true"
                href={assetDataUrl(profileAsset)}
                x={entry.x + 4}
                y={iconY}
                width={16}
                height={16}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : isElementType(entry.type) ? (
              <g transform={`translate(${entry.x + 3},${iconY})`} color="#000000">
                <rect
                  data-legend-color="true"
                  x={0}
                  y={0}
                  width={18}
                  height={16}
                  rx={1}
                  fill={entry.color ?? 'none'}
                  stroke="#000000"
                  strokeWidth={0.8}
                />
                <svg x={1.5} y={0.5} width={15} height={15} overflow="visible">
                  <StandaloneIcon type={entry.type} size={15} />
                </svg>
              </g>
            ) : (
              <g
                transform={`translate(${entry.x},${iconY - 1}) scale(0.8)`}
                color="#000000"
                data-legend-color={entry.color}
              >
                <RelationshipIcon type={entry.type as RelationshipType} />
              </g>
            )}
            <text
              x={entry.x + 26}
              y={entry.y + Math.max(0, (22 - font.sizePx * 1.2) / 2) + font.sizePx}
              fill={color}
              fontFamily={`${font.family}, sans-serif`}
              fontSize={font.sizePx}
              fontWeight={font.bold ? 700 : 400}
              fontStyle={font.italic ? 'italic' : 'normal'}
              opacity={(node.fontAlpha ?? 255) / 255}
              style={textStyle}
            >
              {entry.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
