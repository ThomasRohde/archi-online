import type { ReactNode } from 'react';
import type { RelationshipType } from '../../model/metamodel';

/** Compact ArchiMate relationship symbol shared by the palette and live legends. */
export function RelationshipIcon({ type }: { type: RelationshipType }): ReactNode {
  const line = (dash?: string, x1 = 3, x2 = 21) => (
    <line x1={x1} y1={9} x2={x2} y2={9} stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} />
  );
  switch (type) {
    case 'CompositionRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line(undefined, 10)}<path d="M2,9 L6,6.5 L10,9 L6,11.5 Z" fill="currentColor" /></svg>;
    case 'AggregationRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line(undefined, 10)}<path d="M2,9 L6,6.5 L10,9 L6,11.5 Z" fill="#fff" stroke="currentColor" /></svg>;
    case 'AssignmentRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line()}<circle cx="4" cy="9" r="2" fill="currentColor" /><path d="M21,9 L15,6 V12 Z" fill="currentColor" /></svg>;
    case 'RealizationRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line('2 2', 3, 14)}<path d="M21,9 L14,5.5 V12.5 Z" fill="#fff" stroke="currentColor" /></svg>;
    case 'ServingRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line()}<path d="M16,5 L21,9 L16,13" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>;
    case 'AccessRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line('2 2')}<path d="M17,6 L21,9 L17,12" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>;
    case 'InfluenceRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line('5 3')}<path d="M16,5 L21,9 L16,13" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>;
    case 'TriggeringRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line()}<path d="M21,9 L15,6 V12 Z" fill="currentColor" /></svg>;
    case 'FlowRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line('5 3', 3, 15)}<path d="M21,9 L15,6 V12 Z" fill="currentColor" /></svg>;
    case 'SpecializationRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line(undefined, 3, 14)}<path d="M21,9 L14,5.5 V12.5 Z" fill="#fff" stroke="currentColor" /></svg>;
    case 'AssociationRelationship':
      return <svg viewBox="0 0 24 18" width="22" height="17">{line()}</svg>;
  }
}
