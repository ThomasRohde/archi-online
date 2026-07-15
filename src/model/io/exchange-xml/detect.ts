const OPEN_EXCHANGE_NAMESPACE = 'http://www.opengroup.org/xsd/archimate/3.0/';

/** Lightweight format sniffing that does not pull the parser or XSD runtime into startup. */
export function isExchangeXml(text: string): boolean {
  return text.includes(OPEN_EXCHANGE_NAMESPACE);
}
