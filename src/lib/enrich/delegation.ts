// Deterministic delegation join — post-Claude, never delegated to the model.
// Joins a vendor named by enrichment against the repo's declared subprocessors
// (compliance.yaml) and the platform attestation registry (subprocessors.json).

import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { FIXTURE_DIR, SUBPROCESSORS_PATH } from "../paths";
import type { AttestationEntry, ComplianceManifest, Disposition, Severity } from "../types";

const COMPLIANCE_YAML_PATH = path.join(FIXTURE_DIR, "compliance.yaml");

let registry: AttestationEntry[] | null = null;
let manifest: ComplianceManifest | null = null;

function loadRegistry(): AttestationEntry[] {
  if (registry === null) {
    registry = JSON.parse(readFileSync(SUBPROCESSORS_PATH, "utf8")) as AttestationEntry[];
  }
  return registry;
}

function loadManifest(): ComplianceManifest {
  if (manifest === null) {
    manifest = parseYaml(readFileSync(COMPLIANCE_YAML_PATH, "utf8")) as ComplianceManifest;
  }
  return manifest;
}

export interface DelegationJoinResult {
  disposition: Disposition | null; // DELEGATED | EXCEPTION | null (null iff NEEDS_REVIEW)
  severity: Severity | null;
  resolution_status: "AUTO_VALIDATED" | "NEEDS_REVIEW";
  review_reason: string | null;
  join_note: string; // appended to reasoning; cites the mechanical join outcome
}

export function joinDelegation(subprocessor: string | null): DelegationJoinResult {
  if (!subprocessor) {
    return {
      disposition: null,
      severity: null,
      resolution_status: "NEEDS_REVIEW",
      review_reason:
        "delegation identified but no vendor named; cannot join against compliance.yaml or the attestation registry",
      join_note: "Delegation join skipped: no vendor named.",
    };
  }

  const wanted = subprocessor.trim().toLowerCase();
  const declared = loadManifest().subprocessors.find((s) => s.name.toLowerCase() === wanted);
  const entry = loadRegistry().find((e) => e.name.toLowerCase() === wanted);

  if (!declared) {
    return {
      disposition: null,
      severity: null,
      resolution_status: "NEEDS_REVIEW",
      review_reason: `egress delegated to ${subprocessor}, but ${subprocessor} is not declared as a subprocessor in compliance.yaml; delegation cannot be validated`,
      join_note: `Delegation join failed: ${subprocessor} not declared in compliance.yaml.`,
    };
  }

  if (!entry || !entry.on_file) {
    const missing = !entry
      ? `has no entry in the platform attestation registry`
      : `has no attestation on file in the platform registry`;
    return {
      disposition: null,
      severity: null,
      resolution_status: "NEEDS_REVIEW",
      review_reason: `repo declares delegation to ${declared.name}, but ${declared.name} ${missing}; delegation cannot be validated`,
      join_note: `Delegation join failed: ${declared.name} ${missing}.`,
    };
  }

  if (!entry.covers_encryption_in_transit) {
    return {
      disposition: "EXCEPTION",
      severity: "MEDIUM",
      resolution_status: "AUTO_VALIDATED",
      review_reason: null,
      join_note: `repo declares delegation to ${entry.name}; ${entry.name} attestation on file (${entry.attestation}) does not cover encryption in transit.`,
    };
  }

  return {
    disposition: "DELEGATED",
    severity: null,
    resolution_status: "AUTO_VALIDATED",
    review_reason: null,
    join_note: `repo declares delegation to ${entry.name}; ${entry.name} attestation on file (${entry.attestation}) covers encryption in transit.`,
  };
}
