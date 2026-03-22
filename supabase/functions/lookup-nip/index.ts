import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), {
      status: s,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { nip } = await req.json()

    // Walidacja NIP (10 cyfr)
    const cleanNip = String(nip || '').replace(/[\s-]/g, '')
    if (!/^\d{10}$/.test(cleanNip)) {
      return json({ error: 'Nieprawidłowy NIP — wymagane 10 cyfr', valid: false })
    }

    // Weryfikacja sumy kontrolnej NIP
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    const digits = cleanNip.split('').map(Number)
    const checksum = weights.reduce((sum, w, i) => sum + w * digits[i], 0) % 11
    if (checksum !== digits[9]) {
      return json({ error: 'NIP ma nieprawidłową sumę kontrolną', valid: false })
    }

    // API Ministerstwa Finansów — biała lista VAT (bezpłatne, bez klucza)
    const today = new Date().toISOString().slice(0, 10)
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${cleanNip}?date=${today}`

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('MF API error:', res.status, text)
      return json({ error: 'Nie można pobrać danych z rejestru — spróbuj ponownie', valid: false })
    }

    const data = await res.json()
    const subject = data?.result?.subject

    if (!subject) {
      return json({ error: 'Firma o podanym NIP nie została znaleziona w rejestrze VAT', valid: false })
    }

    // Parse address into components
    const workingAddress = subject.workingAddress || subject.residenceAddress || ''
    const residenceAddress = subject.residenceAddress || ''

    // Try to extract street, building number, city, postal code
    const addressToParse = workingAddress || residenceAddress
    const postalCityMatch = addressToParse.match(/(\d{2}-\d{3})\s+(.+)$/)
    const postalCode = postalCityMatch ? postalCityMatch[1] : ''
    const city = postalCityMatch ? postalCityMatch[2].split(',')[0].trim() : ''

    // Extract street and building number from the first part of address
    const streetPart = postalCityMatch
      ? addressToParse.substring(0, addressToParse.indexOf(postalCityMatch[1])).trim().replace(/,\s*$/, '')
      : addressToParse

    // Try to split street into street name and building/apartment numbers
    const streetMatch = streetPart.match(/^(.+?)\s+(\d+\w*(?:\/\d+\w*)?)$/)
    const street = streetMatch ? streetMatch[1] : streetPart
    const buildingFull = streetMatch ? streetMatch[2] : ''
    const buildingParts = buildingFull.split('/')
    const buildingNumber = buildingParts[0] || ''
    const apartmentNumber = buildingParts[1] || ''

    const province = getProvince(postalCode)

    return json({
      valid: true,
      source: 'mf',
      data: {
        nip: cleanNip,
        name: subject.name || '',
        regon: subject.regon || '',
        fullAddress: addressToParse,
        street: street,
        buildingNumber: buildingNumber,
        apartmentNumber: apartmentNumber,
        city: city,
        postalCode: postalCode,
        province: province,
        statusVat: subject.statusVat || 'Nieznany',
        isVatPayer: subject.statusVat === 'Czynny',
        accountNumbers: subject.accountNumbers || [],
        residenceAddress: residenceAddress,
        workingAddress: workingAddress,
      },
    })
  } catch (err) {
    console.error('lookup-nip error:', err)
    return json({ error: `Błąd połączenia z rejestrem: ${String(err)}`, valid: false })
  }
})

function getProvince(postalCode: string): string {
  const code = parseInt(postalCode?.replace('-', '') || '0')
  if (code >= 0 && code < 10000) return 'Mazowieckie'
  if (code >= 10000 && code < 20000) return 'Mazowieckie'
  if (code >= 20000 && code < 25000) return 'Lubelskie'
  if (code >= 25000 && code < 28000) return 'Mazowieckie'
  if (code >= 28000 && code < 31000) return 'Świętokrzyskie'
  if (code >= 31000 && code < 39000) return 'Małopolskie'
  if (code >= 39000 && code < 42000) return 'Podkarpackie'
  if (code >= 42000 && code < 46000) return 'Śląskie'
  if (code >= 46000 && code < 50000) return 'Opolskie'
  if (code >= 50000 && code < 59000) return 'Dolnośląskie'
  if (code >= 59000 && code < 66000) return 'Lubuskie'
  if (code >= 66000 && code < 70000) return 'Wielkopolskie'
  if (code >= 70000 && code < 79000) return 'Zachodniopomorskie'
  if (code >= 79000 && code < 87000) return 'Pomorskie'
  if (code >= 87000 && code < 93000) return 'Kujawsko-Pomorskie'
  if (code >= 93000 && code < 99000) return 'Warmińsko-Mazurskie'
  if (code >= 99000) return 'Podlaskie'
  return ''
}
