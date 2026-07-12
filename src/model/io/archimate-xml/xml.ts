import { parseFontStyle, serializeFontStyle } from '../../font-style';
import type { Bounds, DiagramNode, Property } from '../../types';

export const ARCHIMATE_NS = 'http://www.archimatetool.com/archimate';

export function typeOf(el: Element): string {
  const t = el.getAttribute('xsi:type') ?? '';
  return t.replace(/^archimate:/, '');
}

export function parseProperties(el: Element): Property[] {
  const props: Property[] = [];
  for (const child of el.children) {
    if (child.localName === 'property') {
      props.push({
        key: child.getAttribute('key') ?? '',
        value: child.getAttribute('value') ?? childText(child, 'value'),
      });
    }
  }
  return props;
}

export function parseDocumentation(el: Element): string {
  for (const child of el.children) {
    if (child.localName === 'documentation') return child.textContent ?? '';
  }
  return '';
}

export function childText(el: Element, name: string): string {
  for (const child of el.children) {
    if (child.localName === name) return child.textContent ?? '';
  }
  return '';
}

export function parseBounds(el: Element, defaults: { width: number; height: number }): Bounds {
  let bounds: Bounds = { x: 0, y: 0, width: defaults.width, height: defaults.height };
  for (const child of el.children) {
    if (child.localName === 'bounds') {
      const num = (n: string, d: number) => {
        const v = child.getAttribute(n);
        return v === null ? d : parseInt(v, 10);
      };
      bounds = {
        x: num('x', 0),
        y: num('y', 0),
        width: num('width', -1),
        height: num('height', -1),
      };
    }
  }
  if (bounds.width <= 0) bounds.width = defaults.width;
  if (bounds.height <= 0) bounds.height = defaults.height;
  return bounds;
}

export function intAttr(el: Element, name: string): number | undefined {
  const v = el.getAttribute(name);
  return v === null ? undefined : parseInt(v, 10);
}

export function strAttr(el: Element, name: string): string | undefined {
  return el.getAttribute(name) ?? undefined;
}

export function parseNodeStyle(el: Element, node: DiagramNode): void {
  node.fillColor = strAttr(el, 'fillColor');
  node.lineColor = strAttr(el, 'lineColor');
  node.fontColor = strAttr(el, 'fontColor');
  node.font = strAttr(el, 'font');
  node.fontStyle = parseFontStyle(node.font);
  node.alpha = intAttr(el, 'alpha');
  node.lineAlpha = intFeature(el, 'lineAlpha') ?? intAttr(el, 'lineAlpha');
  node.textAlignment = intAttr(el, 'textAlignment');
  node.textPosition = intAttr(el, 'textPosition');
  node.lineWidth = intAttr(el, 'lineWidth') as DiagramNode['lineWidth'];
  node.labelExpression = feature(el, 'labelExpression');
  node.gradient = intFeature(el, 'gradient') as DiagramNode['gradient'];
  node.lineStyle = intFeature(el, 'lineStyle') as DiagramNode['lineStyle'];
  node.iconVisible = intFeature(el, 'iconVisible') as DiagramNode['iconVisible'];
  node.iconColor = feature(el, 'iconColor');
  node.fontAlpha = intFeature(el, 'fontAlpha');
  const derive = feature(el, 'deriveElementLineColor');
  node.derivedLineColor = derive === undefined ? undefined : derive === 'true';
  node.imageSource = (intFeature(el, 'imageSource') ?? intAttr(el, 'imageSource')) as 0 | 1 | undefined;
}

export function feature(el: Element, name: string): string | undefined {
  for (const child of el.children) {
    if (child.localName === 'feature' && child.getAttribute('name') === name) {
      return child.getAttribute('value') ?? '';
    }
  }
  return undefined;
}

export function intFeature(el: Element, name: string): number | undefined {
  const value = feature(el, name);
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#xD;')
    .replace(/\n/g, '&#xA;')
    .replace(/\t/g, '&#x9;');
}

export function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
}

export type Attr = [name: string, value: string | number | undefined];

export function tag(indent: string, name: string, attrs: Attr[], children: string[] = []): string {
  let s = indent + '<' + name;
  for (const [an, av] of attrs) {
    if (av !== undefined && av !== '') s += ` ${an}="${esc(String(av))}"`;
  }
  if (children.length === 0) return s + '/>\n';
  s += '>\n' + children.join('') + indent + `</${name}>\n`;
  return s;
}

export function textTag(indent: string, name: string, text: string): string {
  return `${indent}<${name}>${escText(text)}</${name}>\n`;
}

export function propertyTags(indent: string, properties: Property[]): string[] {
  return properties.map((p) =>
    tag(indent, 'property', [
      ['key', p.key],
      ['value', p.value],
    ]),
  );
}

export function featureTags(indent: string, entries: Record<string, string | number | boolean | undefined>): string[] {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => tag(indent, 'feature', [['name', name], ['value', String(value)]]));
}

export { serializeFontStyle };

export function docTag(indent: string, documentation: string): string[] {
  return documentation !== '' ? [textTag(indent, 'documentation', documentation)] : [];
}
