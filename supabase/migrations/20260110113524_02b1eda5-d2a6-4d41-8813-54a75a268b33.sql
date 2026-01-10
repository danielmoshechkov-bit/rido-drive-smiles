INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES (
  'marketplace_email_confirmation_required',
  'Wymagaj potwierdzenia emaila (Marketplace)',
  'Gdy włączone, nowi użytkownicy marketplace muszą potwierdzić email przed logowaniem. Wyłącz gdy system emailowy nie jest skonfigurowany.',
  false,
  'authentication'
);