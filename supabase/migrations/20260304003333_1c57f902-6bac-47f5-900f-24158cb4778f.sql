
-- Meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Spotkanie bez tytułu',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recording', 'processing', 'completed', 'failed')),
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('live', 'upload', 'link')),
  duration_seconds INTEGER,
  participants TEXT[],
  transcript TEXT,
  summary TEXT,
  key_points JSONB DEFAULT '[]'::jsonb,
  sentiment TEXT,
  next_meeting_suggestion JSONB,
  questions_unresolved JSONB DEFAULT '[]'::jsonb,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meeting tasks extracted from meetings
CREATE TABLE public.meeting_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  assignee TEXT,
  deadline DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  source_quote TEXT,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meeting decisions
CREATE TABLE public.meeting_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  rationale TEXT,
  impact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_decisions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users see only their own meetings
CREATE POLICY "Users can view own meetings" ON public.meetings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own meetings" ON public.meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meetings" ON public.meetings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meetings" ON public.meetings FOR DELETE USING (auth.uid() = user_id);

-- Meeting tasks - access through meeting ownership
CREATE POLICY "Users can view own meeting tasks" ON public.meeting_tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_tasks.meeting_id AND user_id = auth.uid()));
CREATE POLICY "Users can create own meeting tasks" ON public.meeting_tasks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_tasks.meeting_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own meeting tasks" ON public.meeting_tasks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_tasks.meeting_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own meeting tasks" ON public.meeting_tasks FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_tasks.meeting_id AND user_id = auth.uid()));

-- Meeting decisions - access through meeting ownership
CREATE POLICY "Users can view own meeting decisions" ON public.meeting_decisions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_decisions.meeting_id AND user_id = auth.uid()));
CREATE POLICY "Users can create own meeting decisions" ON public.meeting_decisions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_decisions.meeting_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own meeting decisions" ON public.meeting_decisions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_decisions.meeting_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own meeting decisions" ON public.meeting_decisions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meetings WHERE id = meeting_decisions.meeting_id AND user_id = auth.uid()));

-- Updated at trigger
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_meetings_user_id ON public.meetings(user_id);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meeting_tasks_meeting_id ON public.meeting_tasks(meeting_id);
CREATE INDEX idx_meeting_decisions_meeting_id ON public.meeting_decisions(meeting_id);

-- Storage bucket for meeting audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-audio', 'meeting-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload meeting audio" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'meeting-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own meeting audio" ON storage.objects FOR SELECT
  USING (bucket_id = 'meeting-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own meeting audio" ON storage.objects FOR DELETE
  USING (bucket_id = 'meeting-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
