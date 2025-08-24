import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CSVRow {
  [key: string]: string
}

interface ImportJobResult {
  ok: boolean
  job_id?: string
  inserted?: number
  errors?: string[]
}

interface ComputeResult {
  ok: boolean
  rows?: number
  errors?: string[]
}

// Helper function to get Monday of the week for a given date
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday as first day
  return new Date(d.setDate(diff))
}

// Helper function to get Sunday of the week for a given date
function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return weekEnd
}

// Parse CSV content
function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length === 0) return []
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows: CSVRow[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
    const row: CSVRow = {}
    
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    
    rows.push(row)
  }
  
  return rows
}

// Parse date string to UTC timestamp
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  
  try {
    // Try various date formats
    const formats = [
      // ISO format
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      // European format DD/MM/YYYY HH:mm:ss
      /^\d{1,2}\/\d{1,2}\/\d{4}/,
      // US format MM/DD/YYYY HH:mm:ss
      /^\d{1,2}\/\d{1,2}\/\d{4}/,
      // Simple date YYYY-MM-DD
      /^\d{4}-\d{2}-\d{2}$/
    ]
    
    // For now, assume Warsaw timezone and convert to UTC
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    
    return date
  } catch (error) {
    console.error('Error parsing date:', dateStr, error)
    return null
  }
}

// Parse numeric value
function parseNumeric(value: string): number {
  if (!value) return 0
  
  // Remove currency symbols and spaces
  const cleaned = value.replace(/[€$£,\s]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  
  return isNaN(num) ? 0 : num
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (action === 'import') {
      return await handleImport(req, supabase)
    } else if (action === 'compute') {
      return await handleCompute(req, supabase)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use import or compute.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleImport(req: Request, supabase: any): Promise<Response> {
  console.log('Starting CSV import')
  
  const formData = await req.formData()
  const platform = formData.get('platform') as string
  const weekStartStr = formData.get('week_start') as string
  const weekEndStr = formData.get('week_end') as string
  const cityId = formData.get('city_id') as string
  const file = formData.get('file') as File
  
  if (!platform || !['uber', 'bolt', 'freenow'].includes(platform)) {
    return new Response(
      JSON.stringify({ error: 'Invalid platform' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!file) {
    return new Response(
      JSON.stringify({ error: 'No file provided' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const weekStart = new Date(weekStartStr)
  const weekEnd = new Date(weekEndStr)
  const filename = file.name

  // Create import job
  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert({
      platform,
      week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0],
      city_id: cityId || null,
      filename,
      status: 'processing'
    })
    .select()
    .single()

  if (jobError) {
    console.error('Error creating job:', jobError)
    return new Response(
      JSON.stringify({ error: 'Failed to create import job' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const jobId = job.id
  console.log('Created job:', jobId)

  try {
    // Get column mapping for platform
    const { data: config } = await supabase
      .from('platform_import_config')
      .select('columns')
      .eq('platform', platform)
      .single()

    const columnMapping = config?.columns || {}
    console.log('Column mapping:', columnMapping)

    // Read and parse CSV
    const csvContent = await file.text()
    const rows = parseCSV(csvContent)
    console.log(`Parsed ${rows.length} rows`)

    const ridesToInsert = []
    const errors = []

    // Get existing driver platform mappings
    const { data: driverMappings } = await supabase
      .from('driver_platform_ids')
      .select('platform_id, driver_id')
      .eq('platform', platform)

    const driverMap = new Map(
      driverMappings?.map(dm => [dm.platform_id, dm.driver_id]) || []
    )

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // Account for header row

      try {
        // Map columns using the configuration
        const driverPlatformId = row[columnMapping.driver_platform_id] || ''
        const tripUuid = row[columnMapping.trip_uuid] || ''
        const startedAtStr = row[columnMapping.started_at] || ''
        const completedAtStr = row[columnMapping.completed_at] || ''
        const city = row[columnMapping.city] || ''
        const grossAmountStr = row[columnMapping.gross_amount] || '0'
        const commissionAmountStr = row[columnMapping.commission_amount] || '0'
        const cashCollectedStr = row[columnMapping.cash_collected] || '0'
        const adjustmentsStr = row[columnMapping.adjustments] || '0'

        if (!tripUuid) {
          errors.push({
            job_id: jobId,
            row_no: rowNum,
            code: 'MISSING_TRIP_UUID',
            message: 'Missing trip UUID',
            raw: row
          })
          continue
        }

        // Parse dates and amounts
        const startedAt = parseDate(startedAtStr)
        const completedAt = parseDate(completedAtStr)
        const grossAmount = parseNumeric(grossAmountStr)
        const commissionAmount = parseNumeric(commissionAmountStr)
        const cashCollected = parseNumeric(cashCollectedStr)
        const adjustments = parseNumeric(adjustmentsStr)

        // Find driver ID
        const driverId = driverMap.get(driverPlatformId) || null

        if (driverPlatformId && !driverId) {
          errors.push({
            job_id: jobId,
            row_no: rowNum,
            code: 'DRIVER_NOT_FOUND',
            message: `Driver not found for platform ID: ${driverPlatformId}`,
            raw: row
          })
        }

        ridesToInsert.push({
          job_id: jobId,
          platform,
          driver_platform_id: driverPlatformId,
          driver_id: driverId,
          started_at: startedAt?.toISOString(),
          completed_at: completedAt?.toISOString(),
          city,
          trip_uuid: tripUuid,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          cash_collected: cashCollected,
          adjustments: adjustments,
          extra: row
        })

      } catch (error) {
        console.error(`Error processing row ${rowNum}:`, error)
        errors.push({
          job_id: jobId,
          row_no: rowNum,
          code: 'PARSE_ERROR',
          message: error.message,
          raw: row
        })
      }
    }

    // Insert rides
    let insertedCount = 0
    if (ridesToInsert.length > 0) {
      const { data: insertedRides, error: ridesError } = await supabase
        .from('rides_raw')
        .insert(ridesToInsert)
        .select('id')

      if (ridesError) {
        console.error('Error inserting rides:', ridesError)
        errors.push({
          job_id: jobId,
          row_no: null,
          code: 'INSERT_ERROR',
          message: ridesError.message,
          raw: null
        })
      } else {
        insertedCount = insertedRides?.length || 0
      }
    }

    // Insert errors if any
    if (errors.length > 0) {
      const { error: errorsInsertError } = await supabase
        .from('import_errors')
        .insert(errors)

      if (errorsInsertError) {
        console.error('Error inserting errors:', errorsInsertError)
      }
    }

    // Update job status
    await supabase
      .from('import_jobs')
      .update({ status: 'done' })
      .eq('id', jobId)

    console.log(`Import completed: ${insertedCount} rides inserted, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: jobId,
        inserted: insertedCount,
        errors: errors.length
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Import error:', error)
    
    // Update job status to error
    await supabase
      .from('import_jobs')
      .update({ status: 'error' })
      .eq('id', jobId)

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

async function handleCompute(req: Request, supabase: any): Promise<Response> {
  console.log('Starting settlement computation')
  
  const body = await req.json()
  const { job_id } = body

  if (!job_id) {
    return new Response(
      JSON.stringify({ error: 'Missing job_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Delete existing settlements for this job
    await supabase
      .from('settlements_weekly')
      .delete()
      .eq('job_id', job_id)

    // Aggregate rides by driver and platform
    const { data: aggregatedRides, error: ridesError } = await supabase
      .from('rides_raw')
      .select(`
        driver_id,
        platform,
        gross_amount,
        commission_amount,
        cash_collected,
        adjustments
      `)
      .eq('job_id', job_id)
      .not('driver_id', 'is', null)

    if (ridesError) {
      console.error('Error fetching rides:', ridesError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rides data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Group by driver_id and platform
    const settlements = new Map<string, {
      driver_id: string
      platform: string
      trips_count: number
      gross_sum: number
      commission_sum: number
      cash_sum: number
      adjustments_sum: number
    }>()

    aggregatedRides?.forEach(ride => {
      const key = `${ride.driver_id}-${ride.platform}`
      
      if (!settlements.has(key)) {
        settlements.set(key, {
          driver_id: ride.driver_id,
          platform: ride.platform,
          trips_count: 0,
          gross_sum: 0,
          commission_sum: 0,
          cash_sum: 0,
          adjustments_sum: 0
        })
      }

      const settlement = settlements.get(key)!
      settlement.trips_count += 1
      settlement.gross_sum += parseFloat(ride.gross_amount || '0')
      settlement.commission_sum += parseFloat(ride.commission_amount || '0')
      settlement.cash_sum += parseFloat(ride.cash_collected || '0')
      settlement.adjustments_sum += parseFloat(ride.adjustments || '0')
    })

    // Prepare settlements for insertion
    const settlementsToInsert = Array.from(settlements.values()).map(settlement => ({
      job_id: job_id,
      driver_id: settlement.driver_id,
      platform: settlement.platform,
      week_start: job.week_start,
      week_end: job.week_end,
      trips_count: settlement.trips_count,
      gross_sum: settlement.gross_sum,
      commission_sum: settlement.commission_sum,
      cash_sum: settlement.cash_sum,
      adjustments_sum: settlement.adjustments_sum,
      // Basic formula: net_result = gross - commission + adjustments
      net_result: settlement.gross_sum - settlement.commission_sum + settlement.adjustments_sum
    }))

    // Insert settlements
    const { error: insertError } = await supabase
      .from('settlements_weekly')
      .insert(settlementsToInsert)

    if (insertError) {
      console.error('Error inserting settlements:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to insert settlements' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Computed settlements for ${settlementsToInsert.length} driver-platform combinations`)

    return new Response(
      JSON.stringify({
        ok: true,
        rows: settlementsToInsert.length
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Compute error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}