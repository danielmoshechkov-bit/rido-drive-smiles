-- Dodaj policy pozwalającą fleet users na usuwanie kierowców z ich floty
CREATE POLICY "Fleet users can delete their drivers" 
ON public.drivers 
FOR DELETE 
TO authenticated
USING (fleet_id = get_user_fleet_id(auth.uid()));

-- Komentarz: Ta policy pozwala menedżerom floty na usuwanie kierowców przypisanych do ich floty