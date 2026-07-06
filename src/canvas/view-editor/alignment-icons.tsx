import type { ReactNode } from 'react';

// 14×14 line/bar glyphs for the align / distribute / match-size context-menu
// items. Monochrome (currentColor) so they inherit the menu text color and sit
// in the 14px `.ctx-icon` slot.

function icon(children: ReactNode): ReactNode {
  return (
    <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const guide = { stroke: 'currentColor', strokeWidth: 1 } as const;
const bar = { fill: 'currentColor' } as const;
const box = { fill: 'none', stroke: 'currentColor', strokeWidth: 1 } as const;

export const alignLeftIcon = icon(
  <>
    <line x1="1.5" y1="1" x2="1.5" y2="13" {...guide} />
    <rect x="2.5" y="3" width="9" height="2.5" {...bar} />
    <rect x="2.5" y="8" width="5.5" height="2.5" {...bar} />
  </>,
);

export const alignCenterIcon = icon(
  <>
    <line x1="7" y1="1" x2="7" y2="13" {...guide} />
    <rect x="2.5" y="3" width="9" height="2.5" {...bar} />
    <rect x="4.25" y="8" width="5.5" height="2.5" {...bar} />
  </>,
);

export const alignRightIcon = icon(
  <>
    <line x1="12.5" y1="1" x2="12.5" y2="13" {...guide} />
    <rect x="2.5" y="3" width="9" height="2.5" {...bar} />
    <rect x="6" y="8" width="5.5" height="2.5" {...bar} />
  </>,
);

export const alignTopIcon = icon(
  <>
    <line x1="1" y1="1.5" x2="13" y2="1.5" {...guide} />
    <rect x="3" y="2.5" width="2.5" height="9" {...bar} />
    <rect x="8.5" y="2.5" width="2.5" height="5.5" {...bar} />
  </>,
);

export const alignMiddleIcon = icon(
  <>
    <line x1="1" y1="7" x2="13" y2="7" {...guide} />
    <rect x="3" y="2.5" width="2.5" height="9" {...bar} />
    <rect x="8.5" y="4.25" width="2.5" height="5.5" {...bar} />
  </>,
);

export const alignBottomIcon = icon(
  <>
    <line x1="1" y1="12.5" x2="13" y2="12.5" {...guide} />
    <rect x="3" y="2.5" width="2.5" height="9" {...bar} />
    <rect x="8.5" y="6" width="2.5" height="5.5" {...bar} />
  </>,
);

export const distributeHorizontalIcon = icon(
  <>
    <rect x="1.5" y="3" width="2.5" height="8" {...bar} />
    <rect x="5.75" y="3" width="2.5" height="8" {...bar} />
    <rect x="10" y="3" width="2.5" height="8" {...bar} />
  </>,
);

export const distributeVerticalIcon = icon(
  <>
    <rect x="3" y="1.5" width="8" height="2.5" {...bar} />
    <rect x="3" y="5.75" width="8" height="2.5" {...bar} />
    <rect x="3" y="10" width="8" height="2.5" {...bar} />
  </>,
);

export const matchWidthIcon = icon(
  <>
    <rect x="2" y="2.5" width="4" height="9" {...box} />
    <rect x="8" y="5" width="4" height="4" {...box} />
  </>,
);

export const matchHeightIcon = icon(
  <>
    <rect x="1.5" y="4" width="4" height="6" {...box} />
    <rect x="7.5" y="4" width="5" height="6" {...box} />
  </>,
);

export const matchSizeIcon = icon(
  <>
    <rect x="1.5" y="4" width="5" height="6" {...box} />
    <rect x="7.5" y="4" width="5" height="6" {...box} />
  </>,
);
