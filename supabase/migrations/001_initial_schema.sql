-- ScanFlow - Migration initiale
-- Tables: profiles + 6 tables métier + RLS + triggers
-- Note: utilise auth.users de Supabase (pas de table users custom)

-- 1. Profiles (extension de auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url TEXT,
  locale TEXT DEFAULT 'fr',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#1c7b1d',
  icon TEXT DEFAULT 'folder',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  doc_type TEXT DEFAULT 'scan' CHECK (doc_type IN (
    'scan', 'upload', 'output', 'signed', 'merged', 'split', 'compressed', 'converted'
  )),
  status TEXT DEFAULT 'raw' CHECK (status IN ('raw', 'processed', 'signed')),
  original_file TEXT,
  processed_file TEXT,
  format TEXT DEFAULT 'pdf',
  page_count INTEGER DEFAULT 1,
  file_size_bytes BIGINT,
  is_favorite BOOLEAN DEFAULT false,
  is_protected BOOLEAN DEFAULT false,
  password_hash TEXT,
  tags TEXT[],
  ocr_text TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_deleted ON documents(deleted_at);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_search ON documents USING gin(to_tsvector('french', title));

-- 4. Jobs
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'scan', 'signature', 'merge', 'split', 'compress', 'convert',
    'ocr', 'watermark', 'page_numbers', 'protect', 'unlock',
    'rotate', 'crop', 'organize', 'redact'
  )),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  source_document_id UUID REFERENCES documents(id),
  result_document_id UUID REFERENCES documents(id),
  progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 5. Signature Certificates
CREATE TABLE signature_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_original_id UUID REFERENCES documents(id),
  document_signe_id UUID REFERENCES documents(id),
  signataires JSONB NOT NULL,
  lieu TEXT,
  coordonnees_gps TEXT,
  reference_unique TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Share Links
CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  permissions TEXT DEFAULT 'view' CHECK (permissions IN ('view', 'download')),
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  view_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Annotations
CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  page INTEGER NOT NULL,
  type TEXT CHECK (type IN (
    'highlight', 'underline', 'strikethrough', 'comment',
    'drawing', 'text', 'stamp', 'shape', 'image'
  )),
  position JSONB NOT NULL,
  content TEXT,
  color TEXT DEFAULT '#FFEB3B',
  stroke_width REAL DEFAULT 2,
  font_family TEXT,
  font_size INTEGER,
  opacity REAL DEFAULT 1.0,
  rotation INTEGER DEFAULT 0,
  paths JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row-Level Security
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "profiles_own_data" ON profiles
  FOR ALL USING (id = auth.uid());

-- Other tables: users see their own data, admins see everything
CREATE POLICY "users_own_data" ON documents
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_own_data" ON projects
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_own_data" ON jobs
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_own_data" ON signature_certificates
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_own_data" ON share_links
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_own_data" ON annotations
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "public_share_access" ON documents
  FOR SELECT USING (
    id IN (
      SELECT document_id FROM share_links
      WHERE token = current_setting('request.token', true) AND is_active = true
    )
  );

-- ============================================
-- Triggers
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
