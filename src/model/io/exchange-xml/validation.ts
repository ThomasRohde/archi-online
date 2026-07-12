import {
  XmlBufferInputProvider,
  XmlDocument,
  XmlLibError,
  XsdValidator,
  xmlCleanupInputProvider,
  xmlRegisterInputProvider,
} from 'libxml2-wasm';
import type { ExchangeDiagnostic } from './contracts';
import { EXCHANGE_SCHEMAS } from './schemas';

const encoder = new TextEncoder();

export async function validateExchangeXml(xml: string): Promise<ExchangeDiagnostic[]> {
  const buffers: Record<string, Uint8Array> = {};
  for (const [name, source] of Object.entries(EXCHANGE_SCHEMAS)) {
    buffers[name] = encoder.encode(source);
    buffers[`memory:///${name}`] = buffers[name];
  }
  buffers['http://www.w3.org/2001/xml.xsd'] = buffers['xml.xsd'];
  buffers['http://www.w3.org/2001/03/xml.xsd'] = buffers['xml.xsd'];

  const provider = new XmlBufferInputProvider(buffers);
  xmlCleanupInputProvider();
  xmlRegisterInputProvider(provider);
  let schemaDocument: XmlDocument | undefined;
  let document: XmlDocument | undefined;
  let validator: XsdValidator | undefined;
  try {
    const diagramSchema = EXCHANGE_SCHEMAS['archimate3_Diagram.xsd'].replace(
      /(<xs:schema\b[^>]*>)/,
      '$1\n<xs:import namespace="http://purl.org/dc/elements/1.1/" schemaLocation="dc.xsd"/>',
    );
    schemaDocument = XmlDocument.fromString(diagramSchema, { url: 'memory:///archimate3_Diagram.xsd' });
    validator = XsdValidator.fromDoc(schemaDocument);
    document = XmlDocument.fromString(xml, { url: 'memory:///model.xml' });
    validator.validate(document);
    return [];
  } catch (error) {
    if (error instanceof XmlLibError) {
      return error.details.map((detail) => ({
        severity: 'error' as const,
        message: detail.message.trim(),
        line: detail.line || undefined,
        column: detail.col || undefined,
      }));
    }
    return [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }];
  } finally {
    validator?.dispose();
    document?.dispose();
    schemaDocument?.dispose();
    xmlCleanupInputProvider();
  }
}
