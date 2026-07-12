import diagram from './schemas/archimate3_Diagram.xsd?raw';
import model from './schemas/archimate3_Model.xsd?raw';
import view from './schemas/archimate3_View.xsd?raw';
import dc from './schemas/dc.xsd?raw';
import xml from './schemas/xml.xsd?raw';

export const EXCHANGE_SCHEMAS: Readonly<Record<string, string>> = Object.freeze({
  'archimate3_Diagram.xsd': diagram,
  'archimate3_Model.xsd': model,
  'archimate3_View.xsd': view,
  'dc.xsd': dc,
  'xml.xsd': xml,
});
