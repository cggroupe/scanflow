export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type DocType = 'scan' | 'upload' | 'output' | 'signed' | 'merged' | 'split' | 'compressed' | 'converted'
export type DocStatus = 'raw' | 'processed' | 'signed'
export type UserRole = 'user' | 'admin'
export type JobType =
  | 'scan' | 'signature' | 'merge' | 'split' | 'compress' | 'convert'
  | 'ocr' | 'watermark' | 'page_numbers' | 'protect' | 'unlock'
  | 'rotate' | 'crop' | 'organize' | 'redact'
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type AnnotationType =
  | 'highlight' | 'underline' | 'strikethrough' | 'comment'
  | 'drawing' | 'text' | 'stamp' | 'shape' | 'image'
export type SharePermission = 'view' | 'download'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  locale: string
  created_at: string
  updated_at: string
}

/** @deprecated Use Profile instead */
export type User = Profile

export interface Document {
  id: string
  user_id: string
  title: string
  doc_type: DocType
  status: DocStatus
  original_file: string | null
  processed_file: string | null
  format: string
  page_count: number
  file_size_bytes: number | null
  is_favorite: boolean
  is_protected: boolean
  password_hash: string | null
  tags: string[] | null
  ocr_text: string | null
  project_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  description: string | null
  color: string
  icon: string
  created_at: string
}

export interface Job {
  id: string
  user_id: string
  job_type: JobType
  status: JobStatus
  source_document_id: string | null
  result_document_id: string | null
  progress: number
  error_message: string | null
  metadata: Json | null
  created_at: string
  completed_at: string | null
}

export interface SignatureCertificate {
  id: string
  user_id: string
  document_original_id: string | null
  document_signe_id: string | null
  signataires: Json
  lieu: string | null
  coordonnees_gps: string | null
  reference_unique: string
  created_at: string
}

export interface ShareLink {
  id: string
  user_id: string
  document_id: string
  token: string
  permissions: SharePermission
  password_hash: string | null
  expires_at: string | null
  max_views: number | null
  view_count: number
  is_active: boolean
  created_at: string
}

export interface Annotation {
  id: string
  user_id: string
  document_id: string
  page: number
  type: AnnotationType
  position: Json
  content: string | null
  color: string
  stroke_width: number
  font_family: string | null
  font_size: number | null
  opacity: number
  rotation: number
  paths: Json | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Omit<Profile, 'id'>> }
      documents: { Row: Document; Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Document, 'id'>> }
      projects: { Row: Project; Insert: Omit<Project, 'id' | 'created_at'>; Update: Partial<Omit<Project, 'id'>> }
      jobs: { Row: Job; Insert: Omit<Job, 'id' | 'created_at'>; Update: Partial<Omit<Job, 'id'>> }
      signature_certificates: { Row: SignatureCertificate; Insert: Omit<SignatureCertificate, 'id' | 'created_at'>; Update: Partial<Omit<SignatureCertificate, 'id'>> }
      share_links: { Row: ShareLink; Insert: Omit<ShareLink, 'id' | 'created_at'>; Update: Partial<Omit<ShareLink, 'id'>> }
      annotations: { Row: Annotation; Insert: Omit<Annotation, 'id' | 'created_at'>; Update: Partial<Omit<Annotation, 'id'>> }
    }
  }
}
