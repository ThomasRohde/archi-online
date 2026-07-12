import { newId } from '../id';
import { isElementType, isRelationshipType } from '../metamodel';
import { transact, type ModelStore } from '../store';
import type { Concept, ConceptType, ModelAsset, ModelState, ProfileDefinition } from '../types';
import { pruneUnreferencedAssets } from '../assets';

export interface CreateProfileInput {
  name: string;
  conceptType: ConceptType;
  specialization?: boolean;
  imagePath?: string;
}

export type UpdateProfileInput = Partial<Omit<ProfileDefinition, 'id'>>;

function normalizedName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error('Profile name must not be empty');
  return value;
}

function assertConceptType(conceptType: string): asserts conceptType is ConceptType {
  if (!isElementType(conceptType) && !isRelationshipType(conceptType)) {
    throw new Error(`Unknown profile concept type: ${conceptType}`);
  }
}

function assertUnique(
  state: ModelState,
  name: string,
  conceptType: ConceptType,
  exceptId?: string,
): void {
  const duplicate = Object.values(state.profiles).some(
    (profile) =>
      profile.id !== exceptId &&
      profile.conceptType === conceptType &&
      profile.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
  );
  if (duplicate) {
    throw new Error(`Profile name and concept type must be unique: ${name} (${conceptType})`);
  }
}

export function profileUsageCount(state: ModelState, profileId: string): number {
  let count = 0;
  for (const concept of [...Object.values(state.elements), ...Object.values(state.relationships)]) {
    if (concept.profileIds.includes(profileId)) count++;
  }
  return count;
}

export function profilesForConceptType(
  state: ModelState,
  conceptType: ConceptType,
): ProfileDefinition[] {
  return Object.values(state.profiles)
    .filter((profile) => profile.conceptType === conceptType)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findProfile(
  state: ModelState,
  name: string,
  conceptType: ConceptType,
): ProfileDefinition | undefined {
  return Object.values(state.profiles).find(
    (profile) =>
      profile.conceptType === conceptType &&
      profile.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
  );
}

export function createProfile(input: CreateProfileInput, store?: ModelStore): string {
  const id = newId();
  transact('Create Specialization', (draft) => {
    const name = normalizedName(input.name);
    assertConceptType(input.conceptType);
    assertUnique(draft, name, input.conceptType);
    assertAssetPath(draft, input.imagePath);
    draft.profiles[id] = {
      id,
      name,
      conceptType: input.conceptType,
      specialization: input.specialization ?? true,
      imagePath: input.imagePath,
    };
  }, store);
  return id;
}

export function updateProfile(
  profileId: string,
  patch: UpdateProfileInput,
  store?: ModelStore,
): void {
  transact('Edit Specialization', (draft) => {
    const profile = draft.profiles[profileId];
    if (!profile) throw new Error(`Profile not found: ${profileId}`);
    const name = patch.name === undefined ? profile.name : normalizedName(patch.name);
    const conceptType = patch.conceptType ?? profile.conceptType;
    assertConceptType(conceptType);
    if (conceptType !== profile.conceptType && profileUsageCount(draft, profileId) > 0) {
      throw new Error(`Cannot change the concept type of used profile: ${profile.name}`);
    }
    assertUnique(draft, name, conceptType, profileId);
    if ('imagePath' in patch) assertAssetPath(draft, patch.imagePath);
    profile.name = name;
    profile.conceptType = conceptType;
    if (patch.specialization !== undefined) profile.specialization = patch.specialization;
    if ('imagePath' in patch) profile.imagePath = patch.imagePath;
    pruneUnreferencedAssets(draft);
  }, store);
}

export function setConceptProfiles(
  conceptId: string,
  profileIds: string[],
  store?: ModelStore,
): void {
  transact('Set Specialization', (draft) => {
    const concept: Concept | undefined = draft.elements[conceptId] ?? draft.relationships[conceptId];
    if (!concept) throw new Error(`Concept not found: ${conceptId}`);
    const uniqueIds = [...new Set(profileIds)];
    for (const profileId of uniqueIds) {
      const profile = draft.profiles[profileId];
      if (!profile) throw new Error(`Profile not found: ${profileId}`);
      if (profile.conceptType !== concept.type) {
        throw new Error(
          `Profile ${profile.name} targets ${profile.conceptType}, not ${concept.type}`,
        );
      }
    }
    concept.profileIds = uniqueIds;
  }, store);
}

export function deleteProfile(profileId: string, store?: ModelStore): void {
  transact('Delete Specialization', (draft) => {
    if (!draft.profiles[profileId]) return;
    for (const concept of [...Object.values(draft.elements), ...Object.values(draft.relationships)]) {
      concept.profileIds = concept.profileIds.filter((id) => id !== profileId);
    }
    delete draft.profiles[profileId];
    pruneUnreferencedAssets(draft);
  }, store);
}

export function replaceProfiles(
  profiles: ProfileDefinition[],
  store?: ModelStore,
  stagedAssets: ModelAsset[] = [],
): void {
  transact('Manage Specializations', (draft) => {
    const assetPaths = new Map<string, string>();
    for (const asset of stagedAssets) {
      const duplicate = Object.values(draft.assets).find(
        (candidate) => candidate.sha256 === asset.sha256,
      );
      if (duplicate) {
        assetPaths.set(asset.path, duplicate.path);
      } else {
        if (draft.assets[asset.path]) throw new Error(`Image path already exists: ${asset.path}`);
        draft.assets[asset.path] = asset;
        assetPaths.set(asset.path, asset.path);
      }
    }
    const next: Record<string, ProfileDefinition> = {};
    for (const candidate of profiles) {
      const name = normalizedName(candidate.name);
      assertConceptType(candidate.conceptType);
      if (next[candidate.id]) throw new Error(`Duplicate profile id: ${candidate.id}`);
      const duplicate = Object.values(next).some(
        (profile) =>
          profile.conceptType === candidate.conceptType &&
          profile.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
      );
      if (duplicate) {
        throw new Error(
          `Profile name and concept type must be unique: ${name} (${candidate.conceptType})`,
        );
      }
      const current = draft.profiles[candidate.id];
      if (
        current &&
        current.conceptType !== candidate.conceptType &&
        profileUsageCount(draft, candidate.id) > 0
      ) {
        throw new Error(`Cannot change the concept type of used profile: ${current.name}`);
      }
      const imagePath = candidate.imagePath
        ? (assetPaths.get(candidate.imagePath) ?? candidate.imagePath)
        : undefined;
      assertAssetPath(draft, imagePath);
      next[candidate.id] = {
        ...candidate,
        name,
        specialization: candidate.specialization ?? true,
        imagePath,
      };
    }
    const retained = new Set(Object.keys(next));
    for (const concept of [...Object.values(draft.elements), ...Object.values(draft.relationships)]) {
      concept.profileIds = concept.profileIds.filter((id) => retained.has(id));
    }
    draft.profiles = next;
    pruneUnreferencedAssets(draft);
  }, store);
}

function assertAssetPath(state: ModelState, imagePath: string | undefined): void {
  if (imagePath && !state.assets[imagePath]) {
    throw new Error(`Profile image is missing from the model: ${imagePath}`);
  }
}
