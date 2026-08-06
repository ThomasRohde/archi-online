import type { PackedTreeNode } from '../src/model/layout/packed-tree';

export interface CapabilityLayoutFrame {
  id: 'wide-16x9' | 'wide-4x3' | 'a4-landscape' | 'square';
  width: number;
  height: number;
}

export interface CapabilityLayoutFixture {
  id: string;
  title: string;
  roots: PackedTreeNode[];
  previousRoots?: PackedTreeNode[];
  render: boolean;
}

export const CAPABILITY_LAYOUT_FRAMES: readonly CapabilityLayoutFrame[] = [
  { id: 'wide-16x9', width: 1600, height: 900 },
  { id: 'wide-4x3', width: 1200, height: 900 },
  { id: 'a4-landscape', width: 1403, height: 992 },
  { id: 'square', width: 1000, height: 1000 },
];

function label(text: string, depth: number, parent: boolean) {
  const fontSizePx = [16, 14.67, 13.33, 12][Math.min(depth, 3)];
  return {
    text,
    fontSizePx,
    lineHeightPx: fontSizePx * 1.25,
    maxLines: parent ? 2 : 3,
    horizontalPadding: 8,
    verticalPadding: parent ? 4 : 6,
    minFontSizePx: fontSizePx,
  };
}

function relabelDepth(node: PackedTreeNode, depth: number): PackedTreeNode {
  const children = node.children?.map((child) => relabelDepth(child, depth + 1));
  return {
    ...node,
    label: label(node.name ?? '', depth, Boolean(children?.length)),
    ...(children?.length ? { children } : {}),
  };
}

export function capabilityNode(
  id: string,
  name: string,
  children: PackedTreeNode[] = [],
  depth = 0,
): PackedTreeNode {
  const normalizedChildren = children.map((child) => relabelDepth(child, depth + 1));
  return {
    id,
    name,
    label: label(name, depth, normalizedChildren.length > 0),
    ...(normalizedChildren.length > 0 ? { children: normalizedChildren } : {}),
  };
}

function leaves(prefix: string, names: readonly string[]): PackedTreeNode[] {
  return names.map((name, index) => capabilityNode(`${prefix}-${index}`, name));
}

function awkward(count: number): CapabilityLayoutFixture {
  return {
    id: `awkward-${count}`,
    title: `${count} equal sibling capabilities`,
    roots: [capabilityNode(`awkward-${count}-root`, `Capability Portfolio ${count}`,
      Array.from({ length: count }, (_, index) => capabilityNode(
        `awkward-${count}-${index}`,
        `Equal Capability ${String(index + 1).padStart(2, '0')}`,
      )))],
    render: true,
  };
}

function mixedForm(): CapabilityLayoutFixture {
  return {
    id: 'mixed-form',
    title: 'Mixed child-form counterexample',
    roots: [capabilityNode('mixed-root', 'Customer and Operations Portfolio', [
      capabilityNode('mixed-identity',
        'Customer Identity, Authentication and Access Management Across Every Channel'),
      capabilityNode('mixed-deep', 'Financial Crime Prevention', [
        capabilityNode('mixed-deep-1', 'Detection', [
          capabilityNode('mixed-deep-2', 'Transaction Monitoring', [
            capabilityNode('mixed-deep-3', 'Scenario Calibration'),
            capabilityNode('mixed-deep-4', 'Alert Prioritisation'),
          ]),
        ]),
      ]),
      capabilityNode('mixed-payments', 'Payments', leaves('mixed-payments', [
        'Payment Initiation', 'Clearing and Settlement', 'Cash Positioning', 'ISO 20022',
      ])),
      capabilityNode('mixed-lending', 'Lending', leaves('mixed-lending', [
        'Credit Decisioning', 'Loan Origination', 'Collateral Management', 'Servicing',
      ])),
      capabilityNode('mixed-stable', 'People', leaves('mixed-people', [
        'Workforce Planning', 'Learning and Development',
      ])),
    ])],
    render: true,
  };
}

function banking(): CapabilityLayoutFixture {
  return {
    id: 'banking-forest',
    title: 'Uneven banking capability forest',
    roots: [
      capabilityNode('bank-customer', 'Customer and Channel Management', [
        capabilityNode('bank-customer-core', 'Customer Management', leaves('bank-customer-core', [
          'Customer Identity and Access', 'Party Data Management', 'Customer Consent & Preferences',
          'Complaints Management', 'Customer Insight and Segmentation',
        ])),
        capabilityNode('bank-channel', 'Channel Management', leaves('bank-channel', [
          'Mobile & Web Banking', 'Contact Centre', 'Branch Network', 'Partner Distribution',
          'ATM and Self-Service',
        ])),
      ]),
      capabilityNode('bank-lending', 'Lending', [
        capabilityNode('bank-credit', 'Credit Lifecycle', leaves('bank-credit', [
          'Credit Policy', 'Origination', 'Decisioning', 'Collateral', 'Servicing',
          'Collections and Recoveries',
        ])),
      ]),
      capabilityNode('bank-payments', 'Payments and Cash Management', [
        capabilityNode('bank-payments-retail', 'Retail Payments', leaves('bank-payments-retail', [
          'Payment Initiation', 'Cards', 'Wallets', 'Clearing', 'Settlement', 'Disputes',
        ])),
        capabilityNode('bank-cash', 'Cash Management', leaves('bank-cash', [
          'Liquidity Positioning', 'Virtual Accounts', 'Receivables', 'Payables',
        ])),
      ]),
      capabilityNode('bank-fcc', 'Financial Crime Prevention', leaves('bank-fcc', [
        'KYC / CDD', 'Sanctions Screening', 'Transaction Monitoring', 'Fraud Detection',
        'Case Investigation', 'Suspicious Activity Reporting',
      ])),
      capabilityNode('bank-risk', 'Risk and Compliance', leaves('bank-risk', [
        'Enterprise Risk', 'Operational Risk', 'Market Risk', 'Liquidity Risk',
        'Regulatory Compliance', 'Model Risk Management',
      ])),
      capabilityNode('bank-finance', 'Finance', leaves('bank-finance', [
        'General Ledger', 'Financial Planning & Analysis', 'Tax', 'Treasury Accounting',
      ])),
      capabilityNode('bank-data', 'Data and Analytics', leaves('bank-data', [
        'Data Governance', 'Reference Data', 'Analytical Products', 'AI / ML Enablement',
      ])),
      capabilityNode('bank-people', 'People', leaves('bank-people', [
        'Workforce Planning', 'Talent Acquisition', 'Learning',
      ])),
      capabilityNode('bank-tech', 'Technology Operations', [
        capabilityNode('bank-platform', 'Platform Operations', leaves('bank-platform', [
          'Cloud Platform', 'Mainframe', 'Networks', 'Observability', 'Service Management',
        ])),
        capabilityNode('bank-security', 'Cyber Security', leaves('bank-security', [
          'Identity Security', 'Security Operations', 'Vulnerability Management',
        ])),
      ]),
    ],
    render: true,
  };
}

function dominant(): CapabilityLayoutFixture {
  return {
    id: 'dominant-strip',
    title: 'Dominant subtree plus semantic strip',
    roots: [capabilityNode('dominant-root', 'Business Operations', [
      capabilityNode('dominant-core', 'Customer Operations', [
        capabilityNode('dominant-service', 'Customer Service', leaves('dominant-service', [
          'Case Intake', 'Case Routing', 'Customer Communication', 'Resolution Management',
          'Service Quality', 'Knowledge Management',
        ])),
        capabilityNode('dominant-channel', 'Channel Operations', leaves('dominant-channel', [
          'Digital', 'Branch', 'Contact Centre', 'Partner', 'Self-Service',
        ])),
      ]),
      capabilityNode('dominant-finance', 'Finance'),
      capabilityNode('dominant-people', 'People'),
      capabilityNode('dominant-risk', 'Risk'),
      capabilityNode('dominant-data', 'Data and Analytics'),
    ])],
    render: true,
  };
}

function deepHierarchy(): CapabilityLayoutFixture {
  return {
    id: 'deep-hierarchy',
    title: 'Deep mixed hierarchy',
    roots: [capabilityNode('deep-root', 'Enterprise Enablement', [
      capabilityNode('deep-data', 'Data', [
        capabilityNode('deep-governance', 'Data Governance', [
          capabilityNode('deep-metadata', 'Metadata Management', [
            capabilityNode('deep-catalogue', 'Enterprise Data Catalogue'),
            capabilityNode('deep-lineage', 'Data Lineage & Impact Analysis'),
          ]),
          capabilityNode('deep-quality', 'Data Quality'),
        ]),
        capabilityNode('deep-analytics', 'Analytics', leaves('deep-analytics', [
          'Decision Intelligence', 'Reporting', 'Experimentation',
        ])),
      ]),
      capabilityNode('deep-platform', 'Technology Platform', [
        capabilityNode('deep-cloud', 'Cloud Platform', leaves('deep-cloud', [
          'Landing Zones', 'Container Platform', 'FinOps', 'Platform Security',
        ])),
        capabilityNode('deep-network', 'Network Operations'),
      ]),
      capabilityNode('deep-procurement', 'Third-Party & Procurement Management'),
    ])],
    render: true,
  };
}

function collisionRoots(expanded: boolean): PackedTreeNode[] {
  return [
    capabilityNode('collision-a', expanded
      ? 'Customer Identity, Authentication and Access Management Across Every Retail, Corporate, Partner and Assisted Banking Channel'
      : 'Customer', leaves('collision-a', expanded
      ? [
        'Customer Identity, Authentication and Access Management Across Every Channel',
        'Insight', 'Experience', 'Consent', 'Complaints', 'Campaigns', 'Service',
      ]
      : ['Identity', 'Insight', 'Experience'])),
    capabilityNode('collision-b', 'Payments', leaves('collision-b', expanded
      ? [
        'Initiation', 'Clearing', 'Settlement', 'Cash Positioning', 'Cards', 'Wallets',
        'Receivables', 'Payables', 'Virtual Accounts', 'Liquidity', 'Pricing', 'Disputes',
        'Fraud Controls', 'Payment Data', 'Correspondent Banking', 'ISO 20022',
      ]
      : ['Initiation', 'Clearing', 'Settlement', 'Cash Positioning'])),
    capabilityNode('collision-c', 'Risk', leaves('collision-c', [
      'Credit Risk', 'Market Risk', 'Operational Risk',
    ])),
    capabilityNode('collision-d', 'People', leaves('collision-d', [
      'Workforce', 'Learning', 'Rewards',
    ])),
  ];
}

function collision(): CapabilityLayoutFixture {
  return {
    id: 'preserved-collision',
    title: 'Preserved multi-root collision',
    previousRoots: collisionRoots(false),
    roots: collisionRoots(true),
    render: true,
  };
}

function evolutionBase(): PackedTreeNode[] {
  return [capabilityNode('evo-root', 'Enterprise Capabilities', [
    capabilityNode('evo-customer', 'Customer', leaves('evo-customer', [
      'Identity', 'Insight', 'Experience', 'Service',
    ])),
    capabilityNode('evo-payments', 'Payments', leaves('evo-payments', [
      'Initiation', 'Clearing', 'Settlement', 'Disputes',
    ])),
    capabilityNode('evo-risk', 'Risk', leaves('evo-risk', [
      'Credit Risk', 'Market Risk', 'Operational Risk',
    ])),
  ])];
}

function copyRoots(roots: readonly PackedTreeNode[]): PackedTreeNode[] {
  return roots.map((node) => ({
    ...node,
    label: node.label ? { ...node.label } : undefined,
    children: node.children ? copyRoots(node.children) : undefined,
  }));
}

function findNode(roots: PackedTreeNode[], id: string): PackedTreeNode {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = root.children ? findNodeOptional(root.children as PackedTreeNode[], id) : undefined;
    if (found) return found;
  }
  throw new Error(`Unknown evolution node: ${id}`);
}

function findNodeOptional(roots: PackedTreeNode[], id: string): PackedTreeNode | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = root.children ? findNodeOptional(root.children as PackedTreeNode[], id) : undefined;
    if (found) return found;
  }
  return undefined;
}

export function capabilityEvolutionSequence(): CapabilityLayoutFixture[] {
  const steps: CapabilityLayoutFixture[] = [];
  let roots = evolutionBase();
  const addStep = (id: string, title: string, next: PackedTreeNode[]) => {
    steps.push({ id, title, previousRoots: roots, roots: next, render: true });
    roots = next;
  };

  let next = copyRoots(roots);
  const customer = findNode(next, 'evo-customer');
  customer.children = [
    ...customer.children!.slice(0, 2),
    relabelDepth(capabilityNode('evo-customer-new', 'Consent and Preferences'), 2),
    ...customer.children!.slice(2),
  ];
  addStep('evolution-1-insert', 'Evolution 1 — insert in semantic order', next);

  next = copyRoots(roots);
  const payments = findNode(next, 'evo-payments');
  payments.children = payments.children!.filter((node) => node.id !== 'evo-payments-3');
  addStep('evolution-2-remove', 'Evolution 2 — remove a leaf', next);

  next = copyRoots(roots);
  const renamed = findNode(next, 'evo-customer-0');
  renamed.name = 'Customer Identity, Authentication and Access Management Across Channels';
  renamed.label = label(renamed.name, 2, false);
  addStep('evolution-3-rename', 'Evolution 3 — materially longer label', next);

  next = copyRoots(roots);
  const risk = findNode(next, 'evo-risk');
  risk.children = [...risk.children!, relabelDepth(capabilityNode(
    'evo-risk-new', 'Model Risk Management'), 2)];
  addStep('evolution-4-add-child', 'Evolution 4 — add child to subtree', next);

  next = copyRoots(roots);
  const riskNext = findNode(next, 'evo-risk');
  const reparented = riskNext.children!.find((node) => node.id === 'evo-risk-2')!;
  riskNext.children = riskNext.children!.filter((node) => node.id !== reparented.id);
  const paymentsNext = findNode(next, 'evo-payments');
  paymentsNext.children = [...paymentsNext.children!, reparented];
  addStep('evolution-5-reparent', 'Evolution 5 — reparent subtree', next);

  next = [...copyRoots(roots), capabilityNode('evo-people', 'People', leaves('evo-people', [
    'Workforce Planning', 'Learning and Development', 'Rewards',
  ]))];
  addStep('evolution-6-add-root', 'Evolution 6 — add root', next);
  return steps;
}

export function capabilityStressForest(): PackedTreeNode[] {
  const names = [
    'Customer Identity, Authentication and Access Management',
    'Payments and Cash Management',
    'Financial Crime Prevention and Detection',
    'Enterprise Data Governance and Regulatory Reporting',
    'Partner Ecosystem and Distribution Channel Management',
  ];
  let leafIndex = 0;
  return Array.from({ length: 8 }, (_, rootIndex) => capabilityNode(
    `stress-root-${rootIndex}`,
    `Business Area ${rootIndex + 1}`,
    Array.from({ length: 12 }, (_, domainIndex) => {
      const domainOrdinal = rootIndex * 12 + domainIndex;
      const count = domainOrdinal < 60 ? 17 : 16;
      const children = Array.from({ length: count }, () => {
        const index = leafIndex++;
        return capabilityNode(
          `stress-leaf-${index}`,
          `${names[index % names.length]} ${String(index + 1).padStart(4, '0')}`,
        );
      });
      return capabilityNode(
        `stress-domain-${domainOrdinal}`,
        `Enterprise Capability Domain ${domainOrdinal + 1}`,
        children,
      );
    }),
  ));
}

export function capabilityLayoutFixtures(): CapabilityLayoutFixture[] {
  return [
    awkward(7),
    awkward(11),
    awkward(13),
    mixedForm(),
    banking(),
    dominant(),
    deepHierarchy(),
    collision(),
    ...capabilityEvolutionSequence(),
    {
      id: 'stress-1700',
      title: 'Deterministic 1,700-node stress forest',
      roots: capabilityStressForest(),
      render: false,
    },
  ];
}
