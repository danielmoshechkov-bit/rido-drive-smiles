
-- 1) Allow partial email search in admin user finder
CREATE OR REPLACE FUNCTION public.admin_find_user_by_email(p_email text)
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE au.email ILIKE '%' || p_email || '%'
  ORDER BY au.email
  LIMIT 20;
$function$;

-- 2) Admin-only function returning ALL service providers (bypassing public/active RLS)
CREATE OR REPLACE FUNCTION public.admin_list_service_providers()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  owner_email text,
  company_name text,
  company_nip text,
  company_address text,
  company_city text,
  company_phone text,
  sms_balance integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
    SELECT sp.id, sp.user_id, sp.owner_email, sp.company_name, sp.company_nip,
           sp.company_address, sp.company_city, sp.company_phone,
           COALESCE(sp.sms_balance, 0)::int
    FROM public.service_providers sp
    ORDER BY sp.company_name NULLS LAST
    LIMIT 1000;
END;
$$;
