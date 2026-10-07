-- CreateEnum
CREATE TYPE "role_code" AS ENUM ('SUPER_ADMIN', 'HR_MANAGER', 'RECRUITER', 'ACCOUNT_MANAGER', 'HIRING_MANAGER', 'FINANCE', 'EMPLOYEE', 'CLIENT_USER');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('INVITED', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "auth_token_type" AS ENUM ('PASSWORD_RESET', 'INVITATION');

-- CreateEnum
CREATE TYPE "industry" AS ENUM ('CONSTRUCTION', 'LOGISTICS', 'FACILITIES', 'HEALTHCARE', 'HOSPITALITY', 'TECHNOLOGY', 'OTHER');

-- CreateEnum
CREATE TYPE "emirate" AS ENUM ('ABU_DHABI', 'DUBAI', 'SHARJAH', 'AJMAN', 'UMM_AL_QUWAIN', 'RAS_AL_KHAIMAH', 'FUJAIRAH');

-- CreateEnum
CREATE TYPE "client_status" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'NOTE');

-- CreateEnum
CREATE TYPE "manpower_request_status" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "job_category" AS ENUM ('DRIVER', 'CONSTRUCTION', 'ENGINEERING', 'ELECTRICAL', 'HEALTHCARE', 'FACILITIES', 'HOSPITALITY', 'FINANCE', 'IT', 'OTHER');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "skill_weight" AS ENUM ('MUST', 'NICE');

-- CreateEnum
CREATE TYPE "candidate_source" AS ENUM ('CAREERS_PORTAL', 'CV_UPLOAD', 'MANUAL', 'REFERRAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "application_stage" AS ENUM ('APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "interview_mode" AS ENUM ('ONSITE', 'VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "recommendation" AS ENUM ('STRONG_YES', 'YES', 'NO', 'STRONG_NO');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "contract_type" AS ENUM ('PERMANENT', 'FIXED_TERM', 'PROJECT');

-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('CV', 'PASSPORT', 'VISA', 'EMIRATES_ID', 'LABOUR_CARD', 'MEDICAL', 'CERTIFICATE', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "onboarding_task_type" AS ENUM ('DOCUMENTS', 'MEDICAL', 'VISA', 'IT', 'INDUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "onboarding_plan_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "onboarding_task_status" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "deployment_status" AS ENUM ('PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "timesheet_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "workflow_subject" AS ENUM ('MANPOWER_REQUEST', 'OFFER');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "approval_decision_type" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "automation_event" AS ENUM ('APPLICATION_STAGE_CHANGED', 'EMPLOYEE_HIRED', 'DOCUMENT_EXPIRING', 'TIMESHEET_SUBMITTED', 'MANPOWER_REQUEST_CREATED');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ai_feature" AS ENUM ('CV_PARSE', 'MATCH', 'JD_DRAFT', 'INTERVIEW_KIT', 'INTERVIEW_SUMMARY', 'ASK_DATA');

-- CreateEnum
CREATE TYPE "ai_request_status" AS ENUM ('SUCCEEDED', 'FAILED', 'INVALID_OUTPUT', 'BUDGET_EXCEEDED');

-- CreateEnum
CREATE TYPE "webhook_event" AS ENUM ('APPLICATION_STAGE_CHANGED', 'EMPLOYEE_HIRED', 'INVOICE_ISSUED');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "data_request_type" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "data_request_status" AS ENUM ('OPEN', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'INVITED',
    "client_id" UUID,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "role_code" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "created_by_ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "auth_token_type" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" "industry" NOT NULL,
    "trn" TEXT,
    "vat_rate_bps" INTEGER NOT NULL DEFAULT 500,
    "address_line1" TEXT,
    "city" TEXT NOT NULL,
    "emirate" "emirate" NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'AE',
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "status" "client_status" NOT NULL DEFAULT 'ACTIVE',
    "account_manager_id" UUID NOT NULL,
    "zoho_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "job_title" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "portal_user_id" UUID,
    "zoho_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contact_id" UUID,
    "type" "activity_type" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manpower_requests" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "project_id" UUID,
    "role_title" TEXT NOT NULL,
    "category" "job_category" NOT NULL,
    "headcount" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "emirate" "emirate" NOT NULL,
    "start_date" DATE NOT NULL,
    "duration_months" INTEGER,
    "bill_rate_min_fils" INTEGER,
    "bill_rate_max_fils" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "requirements" TEXT,
    "status" "manpower_request_status" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "decision_comment" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "manpower_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "manpower_request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" "job_category" NOT NULL,
    "location" TEXT NOT NULL,
    "emirate" "emirate" NOT NULL,
    "headcount" INTEGER NOT NULL,
    "salary_min_fils" INTEGER,
    "salary_max_fils" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "show_client_name" BOOLEAN NOT NULL DEFAULT false,
    "status" "job_status" NOT NULL DEFAULT 'DRAFT',
    "hiring_manager_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_recruiters" (
    "job_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_recruiters_pkey" PRIMARY KEY ("job_id","user_id")
);

-- CreateTable
CREATE TABLE "job_skills" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weight" "skill_weight" NOT NULL,
    "min_years" INTEGER,

    CONSTRAINT "job_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "current_title" TEXT,
    "total_experience_months" INTEGER,
    "summary" TEXT,
    "nationality" TEXT,
    "education" JSONB,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "candidate_source" NOT NULL,
    "consent_at" TIMESTAMPTZ(3),
    "anonymised_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skills" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "years" INTEGER,

    CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "stage" "application_stage" NOT NULL DEFAULT 'APPLIED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reject_reason" TEXT,
    "tracking_token_hash" TEXT,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stage_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_stage" "application_stage",
    "to_stage" "application_stage" NOT NULL,
    "reason" TEXT,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "mode" "interview_mode" NOT NULL,
    "location" TEXT,
    "meeting_url" TEXT,
    "status" "interview_status" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_interviewers" (
    "interview_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "interview_interviewers_pkey" PRIMARY KEY ("interview_id","user_id")
);

-- CreateTable
CREATE TABLE "interview_feedback" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "interviewer_id" UUID NOT NULL,
    "scores" JSONB NOT NULL,
    "recommendation" "recommendation" NOT NULL,
    "notes" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "salary_fils" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "start_date" DATE NOT NULL,
    "contract_type" "contract_type" NOT NULL,
    "contract_months" INTEGER,
    "notes" TEXT,
    "status" "offer_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "department_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_number" TEXT NOT NULL,
    "user_id" UUID,
    "candidate_id" UUID,
    "application_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "department_id" UUID,
    "position_id" UUID,
    "status" "employee_status" NOT NULL DEFAULT 'ONBOARDING',
    "hire_date" DATE NOT NULL,
    "salary_fils" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "candidate_id" UUID,
    "employee_id" UUID,
    "type" "document_type" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "number" TEXT,
    "issue_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_expiry_alerts" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_expiry_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "job_category",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_tasks" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "onboarding_task_type" NOT NULL,
    "assignee_role" "role_code" NOT NULL,
    "due_offset_days" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onboarding_template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_plans" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_id" UUID,
    "status" "onboarding_plan_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "start_date" DATE NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "onboarding_task_type" NOT NULL,
    "assignee_role" "role_code" NOT NULL,
    "assignee_id" UUID,
    "due_date" DATE NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "onboarding_task_status" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "note" TEXT,
    "document_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location" TEXT,
    "emirate" "emirate",
    "status" "project_status" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "bill_rate_fils" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "status" "deployment_status" NOT NULL DEFAULT 'PLANNED',
    "override_reason" TEXT,
    "end_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "status" "timesheet_status" NOT NULL DEFAULT 'DRAFT',
    "total_minutes" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "reject_comment" TEXT,
    "invoice_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "client_id" UUID NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "issue_date" DATE,
    "due_date" DATE,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "subtotal_fils" INTEGER NOT NULL,
    "vat_rate_bps" INTEGER NOT NULL,
    "vat_fils" INTEGER NOT NULL,
    "total_fils" INTEGER NOT NULL,
    "paid_on" DATE,
    "void_reason" TEXT,
    "pdf_storage_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "rate_fils" INTEGER NOT NULL,
    "amount_fils" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" "workflow_subject" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approver_role" "role_code" NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "subject" "workflow_subject" NOT NULL,
    "manpower_request_id" UUID,
    "offer_id" UUID,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "status" "approval_status" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "decision" "approval_decision_type" NOT NULL,
    "comment" TEXT,
    "decided_by_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "event" "automation_event" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "event" "automation_event" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'OPEN',
    "assignee_id" UUID,
    "assignee_role" "role_code",
    "due_date" DATE,
    "entity_type" TEXT,
    "entity_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "feature" "ai_feature" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_micro_usd" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "status" "ai_request_status" NOT NULL,
    "error_code" TEXT,
    "user_id" UUID,
    "entity_type" TEXT,
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_results" (
    "id" UUID NOT NULL,
    "ai_request_id" UUID NOT NULL,
    "feature" "ai_feature" NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "output" JSONB NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "pre_score" INTEGER NOT NULL,
    "adjustment" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "matched" JSONB NOT NULL,
    "partial" JSONB NOT NULL,
    "missing" JSONB NOT NULL,
    "explanation" TEXT,
    "ai_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" "webhook_event"[],
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "event" "webhook_event" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "response_body" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "type" "data_request_type" NOT NULL,
    "status" "data_request_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_client_id_idx" ON "users"("client_id");

-- CreateIndex
CREATE INDEX "users_created_by_id_idx" ON "users"("created_by_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "clients_trn_key" ON "clients"("trn");

-- CreateIndex
CREATE UNIQUE INDEX "clients_zoho_id_key" ON "clients"("zoho_id");

-- CreateIndex
CREATE INDEX "clients_account_manager_id_idx" ON "clients"("account_manager_id");

-- CreateIndex
CREATE INDEX "clients_created_by_id_idx" ON "clients"("created_by_id");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_created_at_idx" ON "clients"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_contacts_portal_user_id_key" ON "client_contacts"("portal_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_contacts_zoho_id_key" ON "client_contacts"("zoho_id");

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id");

-- CreateIndex
CREATE INDEX "client_contacts_created_by_id_idx" ON "client_contacts"("created_by_id");

-- CreateIndex
CREATE INDEX "activities_client_id_occurred_at_idx" ON "activities"("client_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "activities_contact_id_idx" ON "activities"("contact_id");

-- CreateIndex
CREATE INDEX "activities_created_by_id_idx" ON "activities"("created_by_id");

-- CreateIndex
CREATE INDEX "manpower_requests_client_id_status_idx" ON "manpower_requests"("client_id", "status");

-- CreateIndex
CREATE INDEX "manpower_requests_status_idx" ON "manpower_requests"("status");

-- CreateIndex
CREATE INDEX "manpower_requests_created_at_idx" ON "manpower_requests"("created_at");

-- CreateIndex
CREATE INDEX "manpower_requests_project_id_idx" ON "manpower_requests"("project_id");

-- CreateIndex
CREATE INDEX "manpower_requests_decided_by_id_idx" ON "manpower_requests"("decided_by_id");

-- CreateIndex
CREATE INDEX "manpower_requests_created_by_id_idx" ON "manpower_requests"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_slug_key" ON "jobs"("slug");

-- CreateIndex
CREATE INDEX "jobs_manpower_request_id_idx" ON "jobs"("manpower_request_id");

-- CreateIndex
CREATE INDEX "jobs_client_id_status_idx" ON "jobs"("client_id", "status");

-- CreateIndex
CREATE INDEX "jobs_status_published_at_idx" ON "jobs"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_hiring_manager_id_idx" ON "jobs"("hiring_manager_id");

-- CreateIndex
CREATE INDEX "jobs_created_by_id_idx" ON "jobs"("created_by_id");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE INDEX "job_recruiters_user_id_idx" ON "job_recruiters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_skills_job_id_name_key" ON "job_skills"("job_id", "name");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "candidates_phone_idx" ON "candidates"("phone");

-- CreateIndex
CREATE INDEX "candidates_created_by_id_idx" ON "candidates"("created_by_id");

-- CreateIndex
CREATE INDEX "candidates_created_at_idx" ON "candidates"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skills_candidate_id_name_key" ON "candidate_skills"("candidate_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "applications_tracking_token_hash_key" ON "applications"("tracking_token_hash");

-- CreateIndex
CREATE INDEX "applications_job_id_stage_idx" ON "applications"("job_id", "stage");

-- CreateIndex
CREATE INDEX "applications_stage_idx" ON "applications"("stage");

-- CreateIndex
CREATE INDEX "applications_created_by_id_idx" ON "applications"("created_by_id");

-- CreateIndex
CREATE INDEX "applications_created_at_idx" ON "applications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidate_id_job_id_key" ON "applications"("candidate_id", "job_id");

-- CreateIndex
CREATE INDEX "application_stage_history_application_id_changed_at_idx" ON "application_stage_history"("application_id", "changed_at");

-- CreateIndex
CREATE INDEX "application_stage_history_to_stage_changed_at_idx" ON "application_stage_history"("to_stage", "changed_at");

-- CreateIndex
CREATE INDEX "application_stage_history_changed_by_id_idx" ON "application_stage_history"("changed_by_id");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interviews_scheduled_at_idx" ON "interviews"("scheduled_at");

-- CreateIndex
CREATE INDEX "interviews_created_by_id_idx" ON "interviews"("created_by_id");

-- CreateIndex
CREATE INDEX "interview_interviewers_user_id_idx" ON "interview_interviewers"("user_id");

-- CreateIndex
CREATE INDEX "interview_feedback_interviewer_id_idx" ON "interview_feedback"("interviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_feedback_interview_id_interviewer_id_key" ON "interview_feedback"("interview_id", "interviewer_id");

-- CreateIndex
CREATE INDEX "offers_application_id_status_idx" ON "offers"("application_id", "status");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE INDEX "offers_approved_by_id_idx" ON "offers"("approved_by_id");

-- CreateIndex
CREATE INDEX "offers_created_by_id_idx" ON "offers"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_title_key" ON "positions"("title");

-- CreateIndex
CREATE INDEX "positions_department_id_idx" ON "positions"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_number_key" ON "employees"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_candidate_id_key" ON "employees"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_application_id_key" ON "employees"("application_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_position_id_idx" ON "employees"("position_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_created_by_id_idx" ON "employees"("created_by_id");

-- CreateIndex
CREATE INDEX "employees_created_at_idx" ON "employees"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_candidate_id_idx" ON "documents"("candidate_id");

-- CreateIndex
CREATE INDEX "documents_employee_id_idx" ON "documents"("employee_id");

-- CreateIndex
CREATE INDEX "documents_type_expiry_date_idx" ON "documents"("type", "expiry_date");

-- CreateIndex
CREATE INDEX "documents_created_by_id_idx" ON "documents"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_expiry_alerts_document_id_threshold_days_key" ON "document_expiry_alerts"("document_id", "threshold_days");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_templates_category_key" ON "onboarding_templates"("category");

-- CreateIndex
CREATE INDEX "onboarding_templates_created_by_id_idx" ON "onboarding_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "onboarding_template_tasks_template_id_idx" ON "onboarding_template_tasks"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_plans_employee_id_key" ON "onboarding_plans"("employee_id");

-- CreateIndex
CREATE INDEX "onboarding_plans_template_id_idx" ON "onboarding_plans"("template_id");

-- CreateIndex
CREATE INDEX "onboarding_plans_status_idx" ON "onboarding_plans"("status");

-- CreateIndex
CREATE INDEX "onboarding_tasks_plan_id_idx" ON "onboarding_tasks"("plan_id");

-- CreateIndex
CREATE INDEX "onboarding_tasks_assignee_id_status_idx" ON "onboarding_tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "onboarding_tasks_completed_by_id_idx" ON "onboarding_tasks"("completed_by_id");

-- CreateIndex
CREATE INDEX "onboarding_tasks_document_id_idx" ON "onboarding_tasks"("document_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_client_id_name_key" ON "projects"("client_id", "name");

-- CreateIndex
CREATE INDEX "deployments_employee_id_idx" ON "deployments"("employee_id");

-- CreateIndex
CREATE INDEX "deployments_project_id_idx" ON "deployments"("project_id");

-- CreateIndex
CREATE INDEX "deployments_client_id_status_idx" ON "deployments"("client_id", "status");

-- CreateIndex
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

-- CreateIndex
CREATE INDEX "deployments_created_by_id_idx" ON "deployments"("created_by_id");

-- CreateIndex
CREATE INDEX "timesheets_client_id_status_idx" ON "timesheets"("client_id", "status");

-- CreateIndex
CREATE INDEX "timesheets_employee_id_week_start_idx" ON "timesheets"("employee_id", "week_start");

-- CreateIndex
CREATE INDEX "timesheets_status_idx" ON "timesheets"("status");

-- CreateIndex
CREATE INDEX "timesheets_invoice_id_idx" ON "timesheets"("invoice_id");

-- CreateIndex
CREATE INDEX "timesheets_decided_by_id_idx" ON "timesheets"("decided_by_id");

-- CreateIndex
CREATE INDEX "timesheets_created_by_id_idx" ON "timesheets"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_deployment_id_week_start_key" ON "timesheets"("deployment_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_entries_timesheet_id_date_key" ON "timesheet_entries"("timesheet_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_client_id_status_idx" ON "invoices"("client_id", "status");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_issue_date_idx" ON "invoices"("issue_date");

-- CreateIndex
CREATE INDEX "invoices_created_by_id_idx" ON "invoices"("created_by_id");

-- CreateIndex
CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_deployment_id_idx" ON "invoice_lines"("deployment_id");

-- CreateIndex
CREATE INDEX "workflow_definitions_subject_active_idx" ON "workflow_definitions"("subject", "active");

-- CreateIndex
CREATE INDEX "workflow_definitions_created_by_id_idx" ON "workflow_definitions"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_step_order_key" ON "workflow_steps"("workflow_id", "step_order");

-- CreateIndex
CREATE INDEX "approval_requests_workflow_id_idx" ON "approval_requests"("workflow_id");

-- CreateIndex
CREATE INDEX "approval_requests_manpower_request_id_idx" ON "approval_requests"("manpower_request_id");

-- CreateIndex
CREATE INDEX "approval_requests_offer_id_idx" ON "approval_requests"("offer_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_created_by_id_idx" ON "approval_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "approval_decisions_decided_by_id_idx" ON "approval_decisions"("decided_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_decisions_approval_request_id_step_order_key" ON "approval_decisions"("approval_request_id", "step_order");

-- CreateIndex
CREATE INDEX "automation_rules_event_active_idx" ON "automation_rules"("event", "active");

-- CreateIndex
CREATE INDEX "automation_rules_created_by_id_idx" ON "automation_rules"("created_by_id");

-- CreateIndex
CREATE INDEX "automation_runs_rule_id_created_at_idx" ON "automation_runs"("rule_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "automation_runs_status_idx" ON "automation_runs"("status");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "tasks_assignee_role_status_idx" ON "tasks"("assignee_role", "status");

-- CreateIndex
CREATE INDEX "tasks_entity_type_entity_id_idx" ON "tasks"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "tasks_created_by_id_idx" ON "tasks"("created_by_id");

-- CreateIndex
CREATE INDEX "ai_requests_feature_created_at_idx" ON "ai_requests"("feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_requests_created_at_idx" ON "ai_requests"("created_at");

-- CreateIndex
CREATE INDEX "ai_requests_user_id_idx" ON "ai_requests"("user_id");

-- CreateIndex
CREATE INDEX "ai_results_ai_request_id_idx" ON "ai_results"("ai_request_id");

-- CreateIndex
CREATE INDEX "ai_results_entity_type_entity_id_idx" ON "ai_results"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "match_results_ai_request_id_idx" ON "match_results"("ai_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_application_id_prompt_version_key" ON "match_results"("application_id", "prompt_version");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "webhooks_created_by_id_idx" ON "webhooks"("created_by_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_created_at_idx" ON "webhook_deliveries"("webhook_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "settings_updated_by_id_idx" ON "settings"("updated_by_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "data_subject_requests_candidate_id_idx" ON "data_subject_requests"("candidate_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_idx" ON "data_subject_requests"("status");

-- CreateIndex
CREATE INDEX "data_subject_requests_resolved_by_id_idx" ON "data_subject_requests"("resolved_by_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manpower_requests" ADD CONSTRAINT "manpower_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_manpower_request_id_fkey" FOREIGN KEY ("manpower_request_id") REFERENCES "manpower_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_hiring_manager_id_fkey" FOREIGN KEY ("hiring_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recruiters" ADD CONSTRAINT "job_recruiters_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_recruiters" ADD CONSTRAINT "job_recruiters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_interviewers" ADD CONSTRAINT "interview_interviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_expiry_alerts" ADD CONSTRAINT "document_expiry_alerts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_tasks" ADD CONSTRAINT "onboarding_template_tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_plans" ADD CONSTRAINT "onboarding_plans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_plans" ADD CONSTRAINT "onboarding_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "onboarding_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_manpower_request_id_fkey" FOREIGN KEY ("manpower_request_id") REFERENCES "manpower_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_ai_request_id_fkey" FOREIGN KEY ("ai_request_id") REFERENCES "ai_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_ai_request_id_fkey" FOREIGN KEY ("ai_request_id") REFERENCES "ai_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
