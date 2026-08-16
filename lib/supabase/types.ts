// Hand-written to match supabase/migrations/*.sql.
// Regenerate with `npx supabase gen types typescript` once a project is linked.
//
// `Relationships: []` on every table (and empty Views/Functions on the
// schema) aren't decorative - @supabase/postgrest-js's GenericTable/
// GenericSchema constraints require them structurally. Omitting them doesn't
// error here; it silently makes every .from(...) call resolve to `never`,
// which is a much worse failure mode. Keep them even though nothing in this
// app reads them.

export type RfpSource = "aggregator" | "email" | "manual" | "portal";
export type BudgetSource = "rfp" | "qa_document" | "none_listed";
export type RfpStatus = "pending" | "go" | "no_go" | "maybe";
export type DisqualifierResult = "pass" | "fail" | "not_applicable" | "unclear";
export type GapType =
  | "experience"
  | "sector"
  | "certification"
  | "staffing"
  | "geography"
  | "other";
export type ComplianceCategory =
  | "deadline"
  | "page_limit"
  | "format"
  | "submission"
  | "insurance"
  | "rubric"
  | "other";
export type QuestionLane = "public_memo" | "incumbent_request";
export type QuestionStatus = "drafted" | "approved" | "sent";
export type AssignmentStatus = "recommended" | "confirmed";
export type FileType = "rfp" | "addendum" | "draft" | "form" | "other";
export type EdgeCaseStatus = "pending" | "approved" | "rejected";
export type Bandwidth = "open" | "limited" | "full";
export type FilingStatus = "not_filed" | "pending" | "filed" | "failed";
export type SectionStatus = "draft" | "needs_input" | "approved";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };

      org_profile: {
        Row: {
          id: boolean;
          bilingual_staff: boolean;
          media_production_capable: boolean;
          pr_capable: boolean;
          office_locations: string[];
          consultant_locations: string[];
          certifications: string[];
          set_aside_status: string[];
          notes: string | null;
          /** What Caravann does, in its own words - functional areas, key
           *  capabilities and subject areas. Judged alongside the sector map. */
          capabilities: { functional_areas?: string[]; key_capabilities?: string[]; subject_areas?: string[] } | null;
          /** Coverage carried, in Caravann's own words. Read by the gate so an
           *  insurance requirement resolves rather than sitting unclear. */
          insurance_coverage: string | null;
          /** Experience facilitating elected or appointed bodies - a recurring
           *  mandatory requirement the profile previously could not answer. */
          governing_body_experience: string | null;
          /** Ticked on the settings screen once a human has checked this
           *  against reality. Until then every verdict is stored provisional. */
          profile_confirmed: boolean;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["org_profile"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["org_profile"]["Row"]>;
        Relationships: [];
      };

      scoring_settings: {
        Row: {
          id: boolean;
          go_threshold: number;
          maybe_threshold: number;
          deadline_warning_days: number;
          deadline_critical_days: number;
          preferred_misses_are_fatal: boolean;
          max_score_spread: number;
          rubric_weights: Record<string, number> | null;
          /** Subject substrings that mark an email as a solicitation. Empty means
           *  every email qualifies. */
          email_subject_terms: string[];
          notes: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["scoring_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["scoring_settings"]["Row"]>;
        Relationships: [];
      };

      sector_experience: {
        Row: {
          id: string;
          sector: string;
          years_experience: number | null;
          engagement_count: number | null;
          notes: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sector_experience"]["Row"]> & {
          sector: string;
        };
        Update: Partial<Database["public"]["Tables"]["sector_experience"]["Row"]>;
        Relationships: [];
      };

      team_members: {
        Row: {
          id: string;
          name: string;
          role: string | null;
          rate: number | null;
          qualifications: string[];
          /** Work this person wants. Breaks ties between equally qualified,
           *  equally available people. */
          interests: string[];
          bandwidth: Bandwidth;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["team_members"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["team_members"]["Row"]>;
        Relationships: [];
      };

      rfp_folders: {
        Row: {
          id: string;
          name: string;
          /** Folders can be grouped. Null means top level. */
          parent_id: string | null;
          sort_order: number;
          /** A pipeline stage rather than a folder someone made. */
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_folders"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["rfp_folders"]["Row"]>;
        Relationships: [];
      };

      rfps: {
        Row: {
          id: string;
          external_id: string | null;
          /** The agency's own number for the solicitation. Never external_id,
           *  which is a dedupe key. */
          solicitation_number: string | null;
          /** The address this arrived at - which Google account the desk reads. */
          source_mailbox: string | null;
          title: string;
          client_agency: string;
          project_type: string | null;
          source: RfpSource;
          source_url: string | null;
          /** True when this verdict was computed against an unconfirmed
           *  eligibility profile. Only a re-triage clears it. */
          is_provisional: boolean;
          drive_folder_url: string | null;
          received_at: string;
          due_at: string | null;
          question_deadline_at: string | null;
          budget_amount: number | null;
          budget_source: BudgetSource;
          status: RfpStatus;
          score_percent: number | null;
          score_samples: number[] | null;
          score_breakdown: Record<string, { level: string; note?: string | null }> | null;
          verdict_why: string | null;
          verdict_why_not: string | null;
          verdict_set_at: string | null;
          /** What a human decided, when they disagreed with the computed
           *  verdict. Never overwrites `status` - the gap is the measurement. */
          human_verdict: RfpStatus | null;
          human_verdict_at: string | null;
          human_verdict_note: string | null;
          /** Which folder this sits in, null for unfiled. Cleared rather than
           *  cascaded when a folder is deleted - a label is not the bid. */
          folder_id: string | null;
          is_demo: boolean;
          filing_status: FilingStatus;
          filing_error: string | null;
          filed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfps"]["Row"]> & {
          title: string;
          client_agency: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfps"]["Row"]>;
        Relationships: [];
      };

      rfp_disqualifier_checks: {
        Row: {
          id: string;
          rfp_id: string;
          requirement_text: string;
          is_required: boolean;
          result: DisqualifierResult;
          is_hard_knockout: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_disqualifier_checks"]["Row"]> & {
          rfp_id: string;
          requirement_text: string;
          result: DisqualifierResult;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_disqualifier_checks"]["Row"]>;
        Relationships: [];
      };

      rfp_gap_items: {
        Row: {
          id: string;
          rfp_id: string;
          gap_type: GapType;
          description: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_gap_items"]["Row"]> & {
          rfp_id: string;
          gap_type: GapType;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_gap_items"]["Row"]>;
        Relationships: [];
      };

      rfp_compliance_items: {
        Row: {
          id: string;
          rfp_id: string;
          category: ComplianceCategory;
          label: string;
          detail: string | null;
          due_at: string | null;
          is_complete: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_compliance_items"]["Row"]> & {
          rfp_id: string;
          category: ComplianceCategory;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_compliance_items"]["Row"]>;
        Relationships: [];
      };

      rfp_questions: {
        Row: {
          id: string;
          rfp_id: string;
          lane: QuestionLane;
          question_text: string;
          status: QuestionStatus;
          sent_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_questions"]["Row"]> & {
          rfp_id: string;
          lane: QuestionLane;
          question_text: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_questions"]["Row"]>;
        Relationships: [];
      };

      rfp_team_assignments: {
        Row: {
          id: string;
          rfp_id: string;
          team_member_id: string;
          status: AssignmentStatus;
          notes: string | null;
          match_reason: string | null;
          match_score: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_team_assignments"]["Row"]> & {
          rfp_id: string;
          team_member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_team_assignments"]["Row"]>;
        Relationships: [];
      };

      rfp_files: {
        Row: {
          id: string;
          rfp_id: string;
          file_type: FileType;
          name: string;
          drive_url: string | null;
          uploaded_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_files"]["Row"]> & {
          rfp_id: string;
          file_type: FileType;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_files"]["Row"]>;
        Relationships: [];
      };

      connection_events: {
        Row: {
          kind: string;
          last_ok_at: string;
          detail: string | null;
        };
        Insert: { kind: string; last_ok_at: string; detail?: string | null };
        Update: Partial<{ kind: string; last_ok_at: string; detail: string | null }>;
        Relationships: [];
      };
      rfp_edge_cases: {
        Row: {
          id: string;
          rfp_id: string | null;
          description: string;
          proposed_rule_change: string | null;
          status: EdgeCaseStatus;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_edge_cases"]["Row"]> & {
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_edge_cases"]["Row"]>;
        Relationships: [];
      };

      portal_rules: {
        Row: {
          id: string;
          portal_name: string;
          rule_text: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["portal_rules"]["Row"]> & {
          portal_name: string;
          rule_text: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_rules"]["Row"]>;
        Relationships: [];
      };

      language_blocks: {
        Row: {
          id: string;
          section_type: string;
          title: string;
          body: string;
          source: string | null;
          won: boolean;
          is_boilerplate: boolean;
          weight: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["language_blocks"]["Row"]> & {
          section_type: string;
          title: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["language_blocks"]["Row"]>;
        Relationships: [];
      };

      rfp_proposal_sections: {
        Row: {
          id: string;
          rfp_id: string;
          section_type: string;
          heading: string;
          body: string | null;
          sort_order: number;
          status: SectionStatus;
          source_block_ids: string[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rfp_proposal_sections"]["Row"]> & {
          rfp_id: string;
          section_type: string;
          heading: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfp_proposal_sections"]["Row"]>;
        Relationships: [];
      };

      app_users: {
        Row: { email: string; note: string | null; added_at: string };
        Insert: Partial<Database["public"]["Tables"]["app_users"]["Row"]> & { email: string };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

/** Row/Insert shorthands. `TableInsert` keeps the machine routes readable -
 *  `TableInsert<"rfp_gap_items">` rather than the four-level index. */
export type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TableUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type FolderRow = Database["public"]["Tables"]["rfp_folders"]["Row"];
export type OrgProfileRow = Database["public"]["Tables"]["org_profile"]["Row"];
export type ScoringSettingsRow = Database["public"]["Tables"]["scoring_settings"]["Row"];
export type SectorExperienceRow = Database["public"]["Tables"]["sector_experience"]["Row"];
export type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
export type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];
export type RfpDisqualifierCheckRow = Database["public"]["Tables"]["rfp_disqualifier_checks"]["Row"];
export type RfpQuestionRow = Database["public"]["Tables"]["rfp_questions"]["Row"];
export type LanguageBlockRow = Database["public"]["Tables"]["language_blocks"]["Row"];
export type ProposalSectionRow = Database["public"]["Tables"]["rfp_proposal_sections"]["Row"];
export type EdgeCaseRow = Database["public"]["Tables"]["rfp_edge_cases"]["Row"];
export type PortalRuleRow = Database["public"]["Tables"]["portal_rules"]["Row"];
