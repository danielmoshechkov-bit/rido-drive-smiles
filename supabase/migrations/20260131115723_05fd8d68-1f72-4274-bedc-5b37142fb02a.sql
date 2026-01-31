-- Dodaj politykę INSERT dla użytkowników floty
CREATE POLICY "Fleet can create rentals"
ON public.vehicle_rentals
FOR INSERT
WITH CHECK (fleet_id = get_user_fleet_id(auth.uid()));

-- Dodaj politykę DELETE dla floty
CREATE POLICY "Fleet can delete their rentals"
ON public.vehicle_rentals
FOR DELETE
USING (fleet_id = get_user_fleet_id(auth.uid()));