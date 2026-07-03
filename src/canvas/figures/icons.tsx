// ArchiMate element icons, transcribed 1:1 from Archi's figure classes
// (com.archimatetool.editor/diagram/figures/elements/*.java, drawIcon methods).
// Coordinates are in "pt-space": pt is Archi's getIconOrigin() point, placed at
// (nodeWidth - right, top) relative to the figure's top-left corner.
import type { ReactNode } from 'react';
import type { ElementType } from '../../model/metamodel';

/**
 * SWT Path.addArc as an SVG path segment. Angles in degrees, 0 = 3 o'clock,
 * positive = counter-clockwise (visually), ellipse in bounding box x,y,w,h.
 */
function arc(x: number, y: number, w: number, h: number, start: number, extent: number): string {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const px = (a: number) => +(cx + rx * Math.cos((a * Math.PI) / 180)).toFixed(2);
  const py = (a: number) => +(cy - ry * Math.sin((a * Math.PI) / 180)).toFixed(2);
  const sweep = extent > 0 ? 0 : 1;
  if (Math.abs(extent) >= 360) {
    const mid = start + 180;
    return `M${px(start)} ${py(start)} A${rx} ${ry} 0 1 ${sweep} ${px(mid)} ${py(mid)} A${rx} ${ry} 0 1 ${sweep} ${px(start)} ${py(start)}`;
  }
  const large = Math.abs(extent) > 180 ? 1 : 0;
  const end = start + extent;
  return `M${px(start)} ${py(start)} A${rx} ${ry} 0 ${large} ${sweep} ${px(end)} ${py(end)}`;
}

/**
 * Equipment cog polygon, porting Archi's drawIconCog polar math including
 * Draw2D's integer point rounding (which gives the icon its exact look).
 */
function cogPoints(cx: number, cy: number, segments: number, r2: number, r3: number): string {
  const pts: string[] = [];
  const halfSeg = Math.PI / (2 * segments);
  const delta = halfSeg / 4;
  for (let i = 0; i < segments; i++) {
    const base = (2 * Math.PI * i) / segments;
    for (const [r, a] of [
      [r2, base - halfSeg],
      [r3, base - halfSeg + delta],
      [r3, base + halfSeg - delta],
      [r2, base + halfSeg],
    ] as const) {
      pts.push(`${Math.round(cx + r * Math.cos(a))},${Math.round(cy - r * Math.sin(a))}`);
    }
  }
  return pts.join(' ');
}

/** DeliverableFigure.getFigurePath(1.5, rect(0,0,14,10), 0.5) — wavy-bottom box. */
const deliverablePath = (() => {
  const w = 14;
  const curveHeight = 1.5;
  const curveY = 10 - curveHeight; // 8.5
  return (
    `M0 0 L0 ${curveY - 1} ` +
    `Q${w / 4} ${10 + curveHeight} ${w / 2 + 1} ${curveY} ` +
    `Q${w - w / 4} ${curveY - curveHeight - 1} ${w} ${curveY} ` +
    `L${w} 0 L-0.5 0`
  );
})();

export interface ArchiIcon {
  glyph: ReactNode;
  /** pt.x = nodeWidth - right (includes Archi's getLineWidth() = 1) */
  right: number;
  /** pt.y = top */
  top: number;
  /** bounding box in pt-space: [x, y, width, height] (for standalone rendering) */
  box: [number, number, number, number];
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1 } as const;

// -------------------------------------------------------------- shared glyphs

const processIcon: ArchiIcon = {
  right: 18,
  top: 11,
  box: [0, -3, 14, 10],
  glyph: <polygon {...S} points="0,0 8,0 8,-3 14,2 8,7 8,4 0,4" />,
};

const functionIcon: ArchiIcon = {
  right: 17,
  top: 19,
  box: [0, -14, 12, 14],
  glyph: <polygon {...S} points="0,0 0,-9 6,-14 12,-9 12,0 6,-6" />,
};

const serviceIcon: ArchiIcon = {
  right: 21,
  top: 7,
  box: [0, 0, 16, 9],
  glyph: <rect {...S} x="0" y="0" width="16" height="9" rx="4" ry="4" />,
};

const eventIcon: ArchiIcon = {
  right: 20,
  top: 7,
  box: [-4, 0, 20, 9],
  glyph: (
    <g {...S}>
      <path d={arc(-4, 0, 8, 9, 270, 180)} />
      <path d={`${arc(8, 0, 8, 9, 270, 180)} M0 0 L12 0 M0 9 L12 9`} />
    </g>
  ),
};

const interactionIcon: ArchiIcon = {
  right: 12,
  top: 6,
  box: [-5, -0.5, 13, 13],
  glyph: (
    <g {...S}>
      <path d={`${arc(-5, 0, 10, 12, 90, 180)} L0 -0.5`} />
      <path d={`${arc(-2, 0, 10, 12, -90, 180)} L3 12.5`} />
    </g>
  ),
};

const collaborationIcon: ArchiIcon = {
  right: 18,
  top: 7,
  box: [0, 0, 14, 10],
  glyph: (
    <g {...S}>
      <ellipse cx="9" cy="5" rx="5" ry="5" />
      <ellipse cx="5" cy="5" rx="5" ry="5" />
    </g>
  ),
};

const interfaceIcon: ArchiIcon = {
  right: 14,
  top: 8,
  box: [-7, 0, 17, 10],
  glyph: (
    <g {...S}>
      <ellipse cx="5" cy="5" rx="5" ry="5" />
      <line x1="0" y1="5" x2="-7" y2="5" />
    </g>
  ),
};

const objectIcon: ArchiIcon = {
  right: 18,
  top: 6,
  box: [0, 0, 13, 10],
  glyph: (
    <g {...S}>
      <rect x="0" y="0" width="13" height="10" />
      <line x1="0" y1="3" x2="13" y2="3" />
    </g>
  ),
};

const deliverableIcon: ArchiIcon = {
  right: 18,
  top: 6,
  box: [0, 0, 14, 11.5],
  glyph: <path {...S} d={deliverablePath} />,
};

// ------------------------------------------------------------------ registry

const goalCircles = (
  <g {...S} strokeWidth={1.2}>
    <path d={arc(0, 0, 13, 13, 0, 360)} />
    <path d={arc(2.5, 2.5, 8, 8, 0, 360)} />
    <path d={arc(5, 5, 3, 3, 0, 360)} />
    <path d={arc(6, 6, 1, 1, 0, 360)} />
  </g>
);

export const ARCHI_ICONS: Partial<Record<ElementType, ArchiIcon>> = {
  // ---- strategy
  Resource: {
    right: 20,
    top: 7,
    box: [0, 0, 17, 10],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="15" height="10" rx="1.5" ry="1.5" />
        <rect x="15" y="3" width="2" height="4" rx="0.5" ry="0.5" />
        <path d="M3 2 L3 8 M6 2 L6 8 M9 2 L9 8" />
      </g>
    ),
  },
  Capability: {
    right: 17,
    top: 5,
    box: [0, 0, 12, 12],
    glyph: (
      <g {...S}>
        <rect x="8" y="0" width="4" height="4" />
        <rect x="4" y="4" width="4" height="4" />
        <rect x="8" y="4" width="4" height="4" />
        <rect x="0" y="8" width="4" height="4" />
        <rect x="4" y="8" width="4" height="4" />
        <rect x="8" y="8" width="4" height="4" />
      </g>
    ),
  },
  CourseOfAction: {
    right: 17,
    top: 3,
    box: [-7.5, 0, 20.5, 22],
    glyph: (
      <g {...S}>
        <path d="M-5.4 9 L0.6 10 L-2.4 15.2 Z" fill="currentColor" stroke="none" />
        <path d={arc(-7.5, 12, 10, 10, 90, 80)} strokeWidth={2} />
        <g strokeWidth={1.2}>
          <path d={arc(0, 0, 13, 13, 0, 360)} />
          <path d={arc(2.5, 2.5, 8, 8, 0, 360)} />
          <path d={arc(5, 5, 3, 3, 0, 360)} />
          <path d={arc(6, 6, 1, 1, 0, 360)} />
        </g>
      </g>
    ),
  },
  ValueStream: {
    right: 19,
    top: 7,
    box: [0, 0, 15, 10],
    glyph: <polygon {...S} points="0,0 10,0 15,5 10,10 0,10 5,5" />,
  },

  // ---- business
  BusinessActor: {
    right: 11,
    top: 4,
    box: [-1, 0, 8, 17],
    glyph: (
      <g {...S}>
        <ellipse cx="3" cy="3" rx="3" ry="3" />
        <path d="M3 6 L3 12 M3 12 L-1 17 M3 12 L7 17 M-1 9 L7 9" />
      </g>
    ),
  },
  BusinessRole: {
    right: 18,
    top: 7,
    box: [0, 0, 15, 8],
    glyph: (
      <g {...S}>
        <path d={`${arc(0, 0, 5, 8, 90, 180)} L12 8 M2 0 L12 0`} />
        <ellipse cx="12.5" cy="4" rx="2.5" ry="4" />
      </g>
    ),
  },
  BusinessCollaboration: collaborationIcon,
  BusinessInterface: interfaceIcon,
  BusinessProcess: processIcon,
  BusinessFunction: functionIcon,
  BusinessInteraction: interactionIcon,
  BusinessEvent: eventIcon,
  BusinessService: serviceIcon,
  BusinessObject: objectIcon,
  Contract: {
    right: 18,
    top: 6,
    box: [0, 0, 13, 10],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="13" height="10" />
        <line x1="0" y1="3" x2="13" y2="3" />
        <line x1="0" y1="7" x2="13" y2="7" />
      </g>
    ),
  },
  Representation: {
    right: 18,
    top: 6,
    box: [0, 0, 14, 11.5],
    glyph: (
      <g {...S}>
        <path d={deliverablePath} />
        <line x1="0" y1="3" x2="14" y2="3" />
      </g>
    ),
  },
  Product: {
    right: 18,
    top: 6,
    box: [0, 0, 13, 10],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="13" height="10" />
        <rect x="0" y="0" width="6" height="3" />
      </g>
    ),
  },

  // ---- application
  ApplicationComponent: {
    right: 15,
    top: 19,
    box: [-3, -13, 13, 13],
    glyph: (
      <g {...S}>
        <path d="M0 0 L0 -4 M0 -6 L0 -8 M0 -11 L0 -13 L10 -13 L10 0 L-0.5 0" />
        <rect x="-3" y="-11" width="6" height="2.5" />
        <rect x="-3" y="-6" width="6" height="2.5" />
      </g>
    ),
  },
  ApplicationCollaboration: collaborationIcon,
  ApplicationInterface: interfaceIcon,
  ApplicationFunction: functionIcon,
  ApplicationInteraction: interactionIcon,
  ApplicationProcess: processIcon,
  ApplicationEvent: eventIcon,
  ApplicationService: serviceIcon,
  DataObject: objectIcon,

  // ---- technology
  Node: {
    right: 18,
    top: 8,
    box: [-0.2, -3, 14.2, 14.2],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="11" height="11" />
        <path d="M-0.2 0 L3.2 -3 L14 -3 L14 8 L11 11.2 M11 0 L14 -3" />
      </g>
    ),
  },
  Device: {
    right: 16,
    top: 5,
    box: [-1, 0, 13, 12],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="11" height="8" rx="1.5" ry="1.5" />
        <polygon points="-1,12 2,8 9,8 12,12" />
      </g>
    ),
  },
  SystemSoftware: {
    right: 17,
    top: 8,
    box: [0, -2, 13, 13],
    glyph: (
      <g {...S}>
        <path d={arc(0, 0, 11, 11, 90, 360)} />
        <path d={arc(2, -2, 11, 11, -60, 210)} />
      </g>
    ),
  },
  TechnologyCollaboration: collaborationIcon,
  TechnologyInterface: interfaceIcon,
  Path: {
    right: 20,
    top: 12,
    box: [-1, -5, 17, 10],
    glyph: (
      <g {...S} strokeWidth={1.5}>
        <path d="M2.5 0 L4.5 0 M6.5 0 L8.5 0 M10.5 0 L12.5 0" />
        <path d="M4 -5 L-1 0 L4 5 M11 -5 L16 0 L11 5" />
      </g>
    ),
  },
  CommunicationNetwork: {
    right: 19,
    top: 14,
    box: [0, -8, 15, 13],
    glyph: (
      <g {...S}>
        <path d={arc(0, 0, 5, 5, 0, 360)} />
        <path d={arc(2, -8, 5, 5, 0, 360)} />
        <path d={arc(10, -8, 5, 5, 0, 360)} />
        <path d={arc(8, 0, 5, 5, 0, 360)} />
        <path d="M3 0 L4 -3 M11 0 L12 -3 M5 2.5 L8 2.5 M7 -5.5 L10 -5.5" />
      </g>
    ),
  },
  TechnologyFunction: functionIcon,
  TechnologyProcess: processIcon,
  TechnologyInteraction: interactionIcon,
  TechnologyEvent: eventIcon,
  TechnologyService: serviceIcon,
  Artifact: {
    right: 16,
    top: 6,
    box: [0, -0.5, 12, 15.5],
    glyph: <path {...S} d="M0 0 L7 0 L12 5 L12 15 L0 15 L0 -0.5 M7 0 L7 5 L12 5" />,
  },

  // ---- physical
  Equipment: {
    right: 19,
    top: 17,
    box: [-3, -13, 18, 24],
    glyph: (
      <g {...S}>
        <polygon points={cogPoints(5, 3, 8, 6, 8)} />
        <path d={arc(5 - 3, 3 - 3, 6, 6, 0, 360)} />
        <polygon points={cogPoints(10, -8, 6, 4, 5)} />
        <path d={arc(10 - 2, -8 - 2, 4, 4, 0, 360)} />
      </g>
    ),
  },
  Facility: {
    right: 20,
    top: 17,
    box: [0, -12, 15, 12],
    glyph: (
      <polygon
        {...S}
        strokeWidth={1.2}
        points="0,0 15,0 15,-6 11,-3 11,-6 7,-3 7,-6 3,-3 3,-12 0,-12"
      />
    ),
  },
  DistributionNetwork: {
    right: 20,
    top: 12,
    box: [-1, -5, 17, 10],
    glyph: (
      <g {...S} strokeWidth={1.2}>
        <path d="M1 -2 L14 -2 M1 2 L14 2" />
        <path d="M4 -5 L-1 0 L4 5 M11 -5 L16 0 L11 5" />
      </g>
    ),
  },
  Material: {
    right: 12,
    top: 12,
    box: [-8, -7, 16, 14],
    glyph: (
      <g {...S} strokeWidth={1.2}>
        <polygon points="4,-7 -4,-7 -8,0 -5,7 4,7 8,0" />
        <path d="M-2 -5 L-5.3 0.5 M-3.7 4.5 L3 4.5 M5 0.5 L2 -5" />
      </g>
    ),
  },

  // ---- motivation
  Stakeholder: {
    right: 21,
    top: 9,
    box: [0, 0, 15, 7],
    glyph: (
      <g {...S}>
        <path d={`${arc(0, 0, 8, 7, 90, 180)} L11 7 M3.5 0 L11 0`} />
        <ellipse cx="11.5" cy="3.5" rx="3.5" ry="3.5" />
      </g>
    ),
  },
  Driver: {
    right: 21,
    top: 6,
    box: [-2, -2, 17, 17],
    glyph: (
      <g {...S}>
        <g strokeWidth={1.2}>
          <path d={arc(0, 0, 13, 13, 0, 360)} />
          <path d={arc(5, 5, 3, 3, 0, 360)} />
          <path d={arc(6, 6, 1, 1, 0, 360)} />
        </g>
        <path d="M-2 6.5 L15 6.5 M6.5 -2 L6.5 15 M0.5 0.5 L12.5 12.5 M0.5 12.5 L12.5 0.5" />
      </g>
    ),
  },
  Assessment: {
    right: 15,
    top: 6,
    box: [-3, 0, 11, 12],
    glyph: (
      <g {...S}>
        <ellipse cx="4" cy="4" rx="4" ry="4" />
        <line x1="2" y1="7" x2="-3" y2="12" />
      </g>
    ),
  },
  Goal: {
    right: 20,
    top: 6,
    box: [0, 0, 13, 13],
    glyph: goalCircles,
  },
  Outcome: {
    right: 25,
    top: 9,
    box: [0, -5, 18, 18],
    glyph: (
      <g {...S}>
        {goalCircles}
        <path d="M6 7 L15.5 -2.5 M13 0 L14 -5 M13 0 L18 -1" />
      </g>
    ),
  },
  Principle: {
    right: 20,
    top: 6,
    box: [0, 0, 12, 14],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="12" height="14" rx="2" ry="2" />
        <path d="M5.5 2 L5.5 9 M6.5 2 L6.5 9 M5.5 10.5 L5.5 12.5 M6.5 10.5 L6.5 12.5" />
      </g>
    ),
  },
  Requirement: {
    right: 19,
    top: 8,
    box: [-4, 0, 16, 9],
    glyph: <polygon {...S} points="0,0 12,0 8,9 -4,9" />,
  },
  Constraint: {
    right: 19,
    top: 8,
    box: [-4, 0, 16, 9],
    glyph: (
      <g {...S}>
        <polygon points="0,0 12,0 8,9 -4,9" />
        <line x1="4" y1="0" x2="0" y2="9" />
      </g>
    ),
  },
  Meaning: {
    right: 18,
    top: 8,
    box: [0, 0, 12, 9],
    glyph: (
      <g {...S}>
        <path d={arc(0, 0, 8, 6, 60, 149)} />
        <path d={arc(3, 0, 8, 6, -38, 157)} />
        <path d={arc(0, 3, 6, 5, -41, -171)} />
        <path d={arc(4, 2, 6, 6, 7, -136)} />
      </g>
    ),
  },
  Value: {
    right: 20,
    top: 7,
    box: [0, 0, 14, 9],
    glyph: <ellipse {...S} cx="7" cy="4.5" rx="7" ry="4.5" />,
  },

  // ---- implementation & migration
  WorkPackage: {
    right: 18,
    top: 6,
    box: [0, 0, 15, 12],
    glyph: (
      <g {...S}>
        <path d={`${arc(0, 0, 9, 9, 340, 295)} M4.5 9 L11 9`} />
        <path d="M11 6 L15 9 L11 12 Z" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  Deliverable: deliverableIcon,
  ImplementationEvent: eventIcon,
  Plateau: {
    right: 21,
    top: 13,
    box: [0, -6, 16, 6],
    glyph: (
      <g {...S} strokeWidth={2}>
        <path d="M0 0 L12 0 M2 -3 L14 -3 M4 -6 L16 -6" />
      </g>
    ),
  },
  Gap: {
    right: 18,
    top: 6,
    box: [-2, 0, 17, 13],
    glyph: (
      <g {...S}>
        <ellipse cx="6.5" cy="6.5" rx="6.5" ry="6.5" />
        <path d="M-2 5 L15 5 M-2 8 L15 8" />
      </g>
    ),
  },

  // ---- other
  Location: {
    right: 9,
    top: 20,
    box: [-5, -15, 10, 15],
    glyph: <path {...S} d={`${arc(-5, -15, 10, 10, -20, 220)} L0 0 Z`} />,
  },
  Grouping: {
    right: 18,
    top: 6,
    box: [0, 0, 13, 10],
    glyph: (
      <g {...S}>
        <rect x="0" y="0" width="6" height="3" />
        <rect x="0" y="3" width="13" height="7" />
      </g>
    ),
  },
  Junction: {
    // palette/tree only: the canvas junction figure is a plain dot
    right: 18,
    top: 0,
    box: [1, 1, 16, 14],
    glyph: (
      <g {...S}>
        <rect x="2" y="2" width="2" height="2" />
        <rect x="2" y="12" width="2" height="2" />
        <rect x="14" y="7" width="2" height="2" />
        <path d="M4 4 L6 6 M10 8 L14 8 M4 12 L6 10" />
        <ellipse cx="8" cy="8" rx="3" ry="3" fill="currentColor" stroke="none" />
      </g>
    ),
  },
};

/** Icon positioned exactly as in Archi, relative to a figure of the given width. */
export function NodeIcon({ type, width }: { type: ElementType; width: number }) {
  const def = ARCHI_ICONS[type];
  if (!def) return null;
  return (
    <g transform={`translate(${width - def.right}, ${def.top})`} style={{ pointerEvents: 'none' }}>
      {def.glyph}
    </g>
  );
}

/** Standalone icon (palette, menus): the glyph scaled to fit a square. */
export function StandaloneIcon({ type, size = 15 }: { type: ElementType; size?: number }) {
  const def = ARCHI_ICONS[type];
  if (!def) return null;
  const [x, y, w, h] = def.box;
  const pad = 1.5;
  return (
    <svg
      viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    >
      {def.glyph}
    </svg>
  );
}
