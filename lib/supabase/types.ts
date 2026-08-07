// Hand-written to match supabase/migrations/*.sql.
// Regenerate with `npx supabase gen types typescript` once a project is linked.
//
// `Relationships: []` on every table (and empty Views/Functions on the
// schema) aren't decorative — @supabase/postgrest-js's GenericTable/
// GenericSchema constraints require them structurally. Omitting them doesn't
// error here; it silently makes every .from(...) call resolve to `never`,
// which is a much worse failure mode. Keep them even though nothing in this
// app reads them.

export type RfpSource = "aggregator" | "email" | "manual" | "portal";
export type BudgetSource = "rfp" | "qa_document" | "none_listed";
export type RfpStatus = "pending" | "go" | "no_go" | "maybe";
export type DisqualifierResult = "pass" | "fail" | "not_applicable";
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
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["org_profile"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["org_profile"]["Row"]>;
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
          bandwidth: Bandwidth;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["team_members"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["team_members"]["Row"]>;
        Relationships: [];
      };

      rfps: {
        Row: {
          id: string;
          external_id: string | null;
          title: string;
          client_agency: string;
          project_type: string | null;
          source: RfpSource;
          source_url: string | null;
          drive_folder_url: string | null;
          received_at: string;
          due_at: string | null;
          question_deadline_at: string | null;
          budget_amount: number | null;
          budget_source: BudgetSource;
          status: RfpStatus;
          score_percent: number | null;
          verdict_why: string | null;
          verdict_why_not: string | null;
          verdict_set_at: string | null;
          is_demo: boolean;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

export type OrgProfileRow = Database["public"]["Tables"]["org_profile"]["Row"];
export type SectorExperienceRow = Database["public"]["Tables"]["sector_experience"]["Row"];
export type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
export type RfpRow = Database["public"]["Tables"]["rfps"]["Row"];
export type RfpGapItemRow = Database["public"]["Tables"]["rfp_gap_items"]["Row"];
export type RfpComplianceItemRow = Database["public"]["Tables"]["rfp_compliance_items"]["Row"];
export type RfpDisqualifierCheckRow = Database["public"]["Tables"]["rfp_disqualifier_checks"]["Row"];
export type RfpQuestionRow = Database["public"]["Tables"]["rfp_questions"]["Row"];
