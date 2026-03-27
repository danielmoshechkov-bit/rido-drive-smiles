-- Workspace documents
CREATE TABLE IF NOT EXISTS workspace_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nowy dokument',
  content text DEFAULT '',
  content_html text DEFAULT '',
  icon text DEFAULT '📄',
  cover_color text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  last_edited_by uuid REFERENCES auth.users(id),
  last_edited_by_name text,
  parent_document_id uuid REFERENCES workspace_documents(id) ON DELETE SET NULL,
  is_template boolean DEFAULT false,
  template_category text,
  is_archived boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  word_count integer DEFAULT 0,
  version integer DEFAULT 1,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Docs visible to project members" ON workspace_documents
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT get_workspace_owned_project_ids())
    OR project_id IN (SELECT get_workspace_member_project_ids())
  );

CREATE POLICY "Docs insert by members" ON workspace_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (SELECT get_workspace_owned_project_ids())
    OR project_id IN (SELECT get_workspace_member_project_ids())
  );

CREATE POLICY "Docs update by members" ON workspace_documents
  FOR UPDATE TO authenticated
  USING (
    project_id IN (SELECT get_workspace_owned_project_ids())
    OR project_id IN (SELECT get_workspace_member_project_ids())
  );

CREATE POLICY "Docs delete by owner" ON workspace_documents
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR project_id IN (SELECT get_workspace_owned_project_ids())
  );

-- Document version history
CREATE TABLE IF NOT EXISTS workspace_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES workspace_documents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  content text DEFAULT '',
  content_html text DEFAULT '',
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_by_name text,
  change_summary text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Versions visible" ON workspace_document_versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Versions insert" ON workspace_document_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- Document comments (inline)
CREATE TABLE IF NOT EXISTS workspace_document_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES workspace_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  user_name text,
  content text NOT NULL,
  selection_text text,
  selection_start integer,
  selection_end integer,
  is_resolved boolean DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_document_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doc comments visible" ON workspace_document_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Doc comments insert" ON workspace_document_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Doc comments update" ON workspace_document_comments
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_resolved = false);

CREATE POLICY "Doc comments delete" ON workspace_document_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_docs_project ON workspace_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_parent ON workspace_documents(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_workspace_doc_versions_doc ON workspace_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_workspace_doc_comments_doc ON workspace_document_comments(document_id);

-- Trigger for updated_at
CREATE TRIGGER set_workspace_documents_updated_at
  BEFORE UPDATE ON workspace_documents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();