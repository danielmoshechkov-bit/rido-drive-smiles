
-- Add labor tracking columns to workshop_order_items
ALTER TABLE workshop_order_items 
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES workshop_employees(id),
  ADD COLUMN IF NOT EXISTS labor_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_cost numeric DEFAULT 0;

-- Order statuses table (custom per user)
CREATE TABLE IF NOT EXISTS order_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  color text DEFAULT '#6B7280',
  sort_order int DEFAULT 0,
  is_default bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own order_statuses" ON order_statuses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Order types table
CREATE TABLE IF NOT EXISTS order_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  is_active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own order_types" ON order_types FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Task templates
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  description text,
  hours numeric DEFAULT 0,
  price numeric DEFAULT 0,
  is_active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own task_templates" ON task_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Checklist items
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  label text NOT NULL,
  item_type text DEFAULT 'checkbox',
  is_required bool DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own checklist_items" ON checklist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
