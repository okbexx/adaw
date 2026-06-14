import type { SchemaValidationError } from "./validation.ts";

export type JsonObject = Record<string, any>;

export type AcceptanceStatus = "unknown" | "failing" | "passing" | "blocked" | "waived";
export type WorkflowStatus = "active" | "blocked" | "complete";
export type EvidenceResult = "failing" | "passing" | "blocked" | "waived";
export type EvidenceBasis =
  | "human-confirmation"
  | "tool-observation"
  | "artifact-review"
  | "protocol-check"
  | "agent-observation"
  | (string & {});
export type RiskLevel = "low" | "medium" | "high" | (string & {});
export type ProfileItemType = "skill" | "stack" | "constraint";
export type ProfileStrength = "must" | "prefer" | "avoid";
export type ProfileEvidenceResult = "satisfied" | "violated" | "waived";
export type ProfileComplianceStatus = "unknown" | ProfileEvidenceResult;

export type AcceptanceBasis = {
  status: "draft" | "approved" | (string & {});
  summary?: string;
  approved_at?: string;
  [key: string]: unknown;
};

export type AcceptanceCriterion = {
  id: string;
  layer?: string;
  user_story: string;
  measurement: string;
  threshold: string;
  required?: boolean;
  risk?: RiskLevel;
  status?: AcceptanceStatus | string;
  [key: string]: unknown;
};

export type NoriBrief = {
  goal_id?: string;
  goal: string;
  acceptance_basis?: AcceptanceBasis;
  criteria: AcceptanceCriterion[];
  [key: string]: unknown;
};

export type NoriContract = {
  protocol_version: string;
  goal_id: string;
  goal: string;
  created_at?: string;
  acceptance_basis?: AcceptanceBasis;
  criteria: AcceptanceCriterion[];
  [key: string]: unknown;
};

export type EvidenceSource = {
  type?: string;
  label?: string;
  command?: string;
  path?: string;
  url?: string;
  summary?: string;
  [key: string]: unknown;
};

export type EvidenceInput = {
  kind?: string;
  basis?: EvidenceBasis;
  summary?: string;
  result: EvidenceResult;
  confidence?: string;
  path?: string;
  sources?: Array<EvidenceSource | string>;
  reviewability?: string;
  limitations?: string;
  [key: string]: any;
};

export type NormalizedEvidence = Omit<EvidenceInput, "kind" | "basis" | "sources" | "reviewability" | "limitations"> & {
  kind: string;
  basis: EvidenceBasis;
  sources: EvidenceSource[];
  reviewability: string;
  limitations: string;
  result: EvidenceResult;
};

export type RiskGateResult = {
  result: EvidenceResult;
  confidence: string;
  gate: "accepted" | "downgraded_high_risk_requires_strong_evidence" | (string & {});
};

export type EvidenceRecord = {
  kind: string;
  basis: EvidenceBasis;
  summary?: string;
  result: EvidenceResult;
  confidence?: string;
  path?: string;
  sources?: EvidenceSource[];
  reviewability?: string;
  limitations?: string;
  gate?: string;
  created_at?: string;
  [key: string]: any;
};

export type CriterionLedgerState = {
  status: AcceptanceStatus;
  confidence: string;
  required: boolean;
  risk: RiskLevel;
  evidence: EvidenceRecord[];
  [key: string]: unknown;
};

export type CapabilityProfileEvidence = {
  item_id: string;
  result: ProfileEvidenceResult;
  summary?: string;
  path?: string;
  created_at?: string;
  [key: string]: unknown;
};

export type CapabilityProfileItem = {
  id: string;
  type: ProfileItemType;
  name: string;
  strength: ProfileStrength;
  purpose?: string;
  scope?: string;
  install_policy?: string;
  evidence?: CapabilityProfileEvidence[];
  [key: string]: unknown;
};

export type CapabilityProfile = {
  items: CapabilityProfileItem[];
  evidence: CapabilityProfileEvidence[];
};

export type EvidenceLedger = {
  protocol_version: string;
  goal_id: string;
  status: WorkflowStatus;
  updated_at: string;
  criteria: Record<string, CriterionLedgerState>;
  capability_profile?: CapabilityProfile;
  [key: string]: unknown;
};

export type NoriEvidencePayload = {
  contract: NoriContract;
  ledger: EvidenceLedger;
};

export type ProfileItemInput = {
  id?: string;
  type?: ProfileItemType;
  name: string;
  strength?: ProfileStrength;
  purpose?: string;
  scope?: string;
  install_policy?: string;
  [key: string]: unknown;
};

export type ProfileEvidenceInput = {
  result: ProfileEvidenceResult;
  summary?: string;
  path?: string;
  [key: string]: unknown;
};

export type ProfileStatusRow = {
  id: string;
  type: ProfileItemType;
  name: string;
  strength: ProfileStrength;
  purpose?: string;
  status: ProfileComplianceStatus;
  summary: string;
};

export type ProfileCompliance = {
  required: boolean;
  complete: boolean;
  blocking: ProfileStatusRow[];
  review: ProfileStatusRow[];
  statuses: ProfileStatusRow[];
};

export type CurrentGap = {
  id: string;
  user_story: string;
  status: AcceptanceStatus;
  reason: string;
};

export type UserIntervention = {
  required: boolean;
  criterion?: string;
  user_story?: string;
  action: string;
};

export type CompletionAnswer = {
  complete: boolean;
  objective_complete: boolean;
  confidence: "confident" | "review-risk" | "not-complete" | (string & {});
  review_risks: string[];
  answer: string;
};

export type NextRecommendation = {
  status:
    | "user-intervention-required"
    | "acceptance-approval-required"
    | "work-on-current-gap"
    | "evidence-review-required"
    | "completion-review-required"
    | "ready-for-next-loop"
    | "reconcile-workflow-state"
    | (string & {});
  focus: string | null;
  summary: string;
  actions: string[];
};

export type EvidenceView = {
  kind: string;
  basis: EvidenceBasis;
  summary: string;
  result: EvidenceResult | "unknown";
  confidence?: string;
  sources: EvidenceSource[];
  reviewability: string;
  limitations: string;
  path?: string;
  gate?: string;
  created_at?: string;
};

export type EvidencePruneSummary = {
  changed: boolean;
  removed_records: number;
  removed_sources: number;
  criteria?: string[];
  reason?: string;
};

export type CriterionStatusRow = {
  id: string;
  layer: string;
  user_story: string;
  status: AcceptanceStatus;
  confidence: string;
  latest_evidence: EvidenceView | null;
};

export type EvidenceHealthFinding = {
  criterion_id: string;
  severity: "review" | "needs-action" | "broken" | (string & {});
  issue: string;
  message: string;
  recovery: string;
};

export type EvidenceHealth = {
  status: "clear" | "review" | (string & {});
  summary: string;
  stale_days: number;
  findings: EvidenceHealthFinding[];
};

export type ParsedAcceptanceCriterion = AcceptanceCriterion & {
  status: AcceptanceStatus | string;
};

export type ParsedAcceptanceMarkdown = {
  goal: string;
  criteria: ParsedAcceptanceCriterion[];
};

export type AcceptanceDiscoveryGap = {
  id: string;
  patterns?: string[];
  question: string;
  why: string;
  priority?: "must-answer" | "can-default" | string;
};

export type AcceptanceDiscovery = {
  protocol_version: "opennori/discovery-v1";
  id: string;
  goal: string;
  status: "needs-user-answers" | "ready-for-draft";
  is_acceptance_contract: false;
  gaps: AcceptanceDiscoveryGap[];
  next: string;
};

export type AcceptanceQualityFinding = {
  criterion_id: string;
  path: string;
  gap_id: string;
  question: string;
  why: string;
  message?: string;
  agent_guidance?: string;
  source?: "heuristic" | string;
  severity: "needs-user-review" | string;
};

export type AcceptanceQualityAudit = {
  status: "needs-user-review" | "clear";
  summary: string;
  findings: AcceptanceQualityFinding[];
};

export type BrainstormCandidate = {
  id: string;
  title: string;
  user_value: string;
  suggested_goal_template: string;
  acceptance_directions: string[];
  risks: string[];
};

export type Brainstorm = {
  protocol_version: "opennori/brainstorm-v1";
  id: string;
  idea: string;
  status: "draft-source";
  candidates: BrainstormCandidate[];
  rule: string;
};

export type ArchitectureSource = {
  label: string;
  lesson?: string;
  [key: string]: unknown;
};

export type ArchitectureCheck = {
  id: string;
  audience: string;
  statement: string;
  review?: string;
  [key: string]: unknown;
};

export type PreferredLibraryPolicy = {
  area: string;
  policy: string;
  [key: string]: unknown;
};

export type BuildVsBuyPolicy = {
  order: string[];
  require_reason_when_self_building?: boolean;
  requires_decision_for?: string[];
  [key: string]: unknown;
};

export type ArchitectureProfile = {
  id: string;
  title: string;
  origin?: "builtin" | "project" | string;
  applies_to: string[];
  summary: string;
  sources: ArchitectureSource[];
  principles: string[];
  checks: ArchitectureCheck[];
  preferred_libraries: PreferredLibraryPolicy[];
  avoid: string[];
  build_vs_buy_policy: BuildVsBuyPolicy;
  updated_at?: string;
  [key: string]: unknown;
};

export type ArchitectureProfileDescriptor = ArchitectureProfile & {
  origin?: "builtin" | "project" | string;
  path?: string;
  valid: boolean;
  validation_issues: ValidationIssue[];
  review: {
    can_generate_baseline: boolean;
    source_count: number;
    check_count: number;
    avoid_count: number;
    next: string;
  };
};

export type InvalidArchitectureProfileDescriptor = {
  id: string;
  title: string;
  origin: "project" | string;
  path?: string;
  valid: false;
  error: string;
};

export type ArchitectureProfileListItem = ArchitectureProfileDescriptor | InvalidArchitectureProfileDescriptor;

export type ArchitectureBaseline = {
  schema_version: "opennori/architecture-baseline-v1";
  status: "draft" | "active";
  profile: string;
  profile_title: string;
  profile_origin?: string;
  goal_id: string;
  goal: string;
  summary: string;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  sticky: boolean;
  requires_challenge_to_change: boolean;
  applies_to: string[];
  sources: ArchitectureSource[];
  principles: string[];
  checks: ArchitectureCheck[];
  preferred_libraries: PreferredLibraryPolicy[];
  avoid: string[];
  build_vs_buy_policy: BuildVsBuyPolicy;
  challenge_policy: {
    agent_may_challenge: boolean;
    agent_must_not_silently_replace: boolean;
    requires_user_confirmation: boolean;
  };
  agent_surfaces: string[];
  [key: string]: unknown;
};

export type ArchitectureSurfaceState = {
  guide: { path: string; installed: boolean; in_sync: boolean };
  agents: { path: string; installed: boolean; references_baseline: boolean };
  claude: { path: string; installed: boolean; references_baseline: boolean };
};

export type ArchitectureChallengeSummary = {
  id: string;
  status: string;
  summary: string;
  needs_user: boolean;
  path: string;
};

export type BuildVsBuyDecision = {
  id: string;
  schema_version?: "opennori/build-vs-buy-v1" | string;
  area: string;
  need: string;
  recommendation: string;
  status?: string;
  summary?: string;
  current_project?: string;
  standard_library?: string;
  official_sdk?: string;
  open_source?: string;
  self_build_reason?: string;
  superseded_by?: string;
  superseded_reason?: string;
  [key: string]: unknown;
};

export type BuildVsBuyDecisionSummary = Partial<BuildVsBuyDecision> & {
  id: string;
  path: string;
  schema_valid?: boolean;
  schema_errors?: SchemaValidationError[];
  error?: string;
};

export type BuildVsBuyFinding = {
  decision_id: string;
  severity: "needs-action" | "broken" | string;
  issue: string;
  message: string;
  recovery: string;
};

export type BuildVsBuyHealth = {
  status: "clear" | "needs-action" | "broken";
  summary: string;
  decision_count: number;
  total_decision_count: number;
  superseded_decision_count: number;
  findings: BuildVsBuyFinding[];
};

export type ArchitectureState = {
  schema_version: "opennori/architecture-state-v1";
  decision: "missing" | "invalid" | "draft" | "valid" | "challenged";
  required_for_goal: boolean;
  baseline: {
    status: ArchitectureBaseline["status"];
    profile: string;
    profile_title: string;
    goal_id: string;
    sticky: boolean;
    requires_challenge_to_change: boolean;
    accepted_at: string | null;
  } | null;
  issues: ValidationIssue[];
  open_challenges: ArchitectureChallengeSummary[];
  build_vs_buy_decisions: BuildVsBuyDecisionSummary[];
  build_vs_buy: BuildVsBuyHealth;
  agent_surface: ArchitectureSurfaceState;
  paths: {
    baseline_json: string;
    baseline_markdown: string;
    agent_guide: string;
  };
};

export type ArchitectureChallenge = {
  id: string;
  status: string;
  needs_user: boolean;
  baseline?: Partial<ArchitectureBaseline>;
  summary?: string;
  evidence?: string;
  recommendation?: string;
  [key: string]: unknown;
};

export type NoriArtifact = {
  kind: string;
  path?: string;
  [key: string]: unknown;
};

export type NoriWarning = {
  type?: string;
  message?: string;
  [key: string]: unknown;
};

export type NoriOk<T extends object = JsonObject> = {
  ok: true;
  data: T;
  artifacts: NoriArtifact[];
  warnings: NoriWarning[];
  next_actions: string[];
};

export type NoriFailure = {
  ok: false;
  error: {
    type: string;
    message: string;
    fix?: string;
  };
};

export type NoriResult<T extends object = JsonObject> = NoriOk<T> | NoriFailure;

export type PathPair = {
  jsonPath: string;
  markdownPath: string;
};

export type ManagedAction = {
  path: string;
  action: string;
  kind: string;
  managed: boolean;
  reason?: string;
  recursive?: boolean;
  manifest?: Manifest;
  write?: () => unknown;
  from_version?: string;
  to_version?: string;
  [key: string]: unknown;
};

export type LifecyclePlanAction = {
  path: string;
  kind: string;
  action: string;
  managed: boolean;
  would_write: boolean;
  will_write: boolean;
  destructive: boolean;
  recursive?: boolean;
  from_version?: string;
  to_version?: string;
  reason: string;
};

export type LifecyclePlanSummary = {
  total: number;
  by_action: Record<string, number>;
  would_write: number;
  will_write: number;
  destructive: number;
  managed: number;
  preserved?: number;
};

export type InstallPlan = {
  schema_version: "opennori/install-plan-v1";
  root: string;
  dry_run: boolean;
  force: boolean;
  merge_agent_route: boolean;
  summary: LifecyclePlanSummary;
  actions: LifecyclePlanAction[];
};

export type UninstallPlan = {
  schema_version: "opennori/uninstall-plan-v1";
  root: string;
  dry_run: boolean;
  include_state: boolean;
  summary: LifecyclePlanSummary;
  actions: LifecyclePlanAction[];
};

export type UpgradePlan = {
  schema_version: "opennori/upgrade-plan-v1";
  root: string;
  dry_run: boolean;
  merge_agent_route: boolean;
  summary: LifecyclePlanSummary;
  actions: LifecyclePlanAction[];
};

export type PluginSkillState = {
  name: string;
  description: string;
  path: string;
  source: "package";
};

export type PluginState = {
  schema_version: "opennori/plugin-v1";
  name: string;
  version: string;
  manifest_path: string;
  marketplace_path: string;
  marketplace_name: string;
  marketplace_plugin_path: string;
  skills_path: string;
  packaged: boolean;
  marketplace_packaged: boolean;
  skill_count: number;
  skills: PluginSkillState[];
};

export type ManifestManagedFile = {
  path: string;
  kind: string;
  required: boolean;
  exists: boolean;
};

export type ActiveGoalSummary = {
  goal_id: string;
  status: WorkflowStatus | "unknown" | "unreadable" | string;
  current_gap: CurrentGap | null;
  acceptance_path: string;
  evidence_path: string;
  recoverable: boolean;
  schema_valid?: boolean;
  error?: string;
};

export type Manifest = {
  schema_version: string;
  protocol_version: string;
  opennori_version: string;
  created_at: string;
  updated_at: string;
  capabilities: string[];
  managed_files: ManifestManagedFile[];
  active_goals: ActiveGoalSummary[];
  plugin: PluginState;
  architecture: ArchitectureState;
  [key: string]: unknown;
};

export type ManifestWriteAction = ManagedAction & {
  manifest: Manifest;
};

export type DoctorIssue = {
  goal_id: string;
  message: string;
  path?: string;
};

export type DoctorCheck = {
  name: string;
  ok: boolean;
  summary: string;
  recovery?: string;
  severity?: string;
};

export type DoctorRecoveryAction = {
  check: string;
  severity: string;
  action: string;
  goal_id?: string;
  path?: string;
};

export type DoctorState = {
  status: "ready" | "needs-action" | "broken";
  checks: DoctorCheck[];
  recovery_actions: DoctorRecoveryAction[];
  active_goals: ActiveGoalSummary[];
  active_goal_issues: DoctorIssue[];
  manifest_path: string;
  plugin: PluginState;
  architecture: ArchitectureState;
};

export type BootstrapData = {
  root: string;
  status: "ready" | "needs_confirm" | "installed";
  confirmed: boolean;
  side_effect?: "none" | string;
  existing_state?: boolean;
  install_plan?: InstallPlan;
  actions?: LifecyclePlanAction[];
  doctor: DoctorState;
  next: string;
};

export type ContextExport = {
  schema_version: "opennori/context-export-v1";
  exported_at: string;
  root: string;
  goal_id: string;
  goal: string;
  acceptance_basis: AcceptanceBasis;
  workflow_status: WorkflowStatus;
  current_gap: CurrentGap | null;
  completion: CompletionAnswer;
  intervention: UserIntervention;
  acceptance_review: AcceptanceQualityAudit;
  evidence_health: EvidenceHealth;
  next_recommendation: NextRecommendation;
  criteria: CriterionStatusRow[];
  capability_profile: CapabilityProfile;
  capability_compliance: ProfileCompliance;
  architecture: ArchitectureState;
  paths: {
    acceptance: string;
    evidence: string;
    report: string;
    report_exists: boolean;
    manifest: string;
  };
  manifest: Manifest | null;
};

export type AutoProfileCheck = {
  item_id: string;
  type: ProfileItemType;
  name: string;
  strength: ProfileStrength;
  result: ProfileComplianceStatus;
  basis: string;
  summary: string;
  sources: EvidenceSource[];
  can_auto_record: boolean;
};

export type ValidationIssue = {
  path: string;
  message: string;
  [key: string]: unknown;
};
