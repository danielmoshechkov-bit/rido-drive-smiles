-- Create email_settings table for custom email configuration
CREATE TABLE IF NOT EXISTS public.email_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  
  -- Provider settings
  smtp_provider text DEFAULT 'resend',
  
  -- Sender info
  sender_name text DEFAULT 'RIDO',
  sender_email text DEFAULT 'no-reply@getrido.pl',
  
  -- Registration email template
  registration_subject text DEFAULT 'Potwierdź rejestrację w RIDO',
  registration_template text DEFAULT '<h1>Witaj {{first_name}}!</h1>
<p>Dziękujemy za rejestrację w platformie RIDO.</p>
<p>Aby aktywować swoje konto, kliknij poniższy link:</p>
<p><a href="{{activation_link}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Aktywuj konto</a></p>
<p>Link jest ważny przez 24 godziny.</p>
<p>Pozdrawiamy,<br>Zespół RIDO</p>',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage email settings" 
ON public.email_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.email_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_email_settings_updated_at
BEFORE UPDATE ON public.email_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();