import { Resend } from 'https://esm.sh/resend@4.0.0';
import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requestCorrelationId,
  requireAdmin,
  requireInternalSecret,
  SecurityError,
  writeAuditEvent,
  type RequestIdentity,
} from '../_shared/security.ts';
import { isUuid } from '../_shared/securityPrimitives.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

interface DriverVehicleInfo {
  driverId: string;
  driverEmail: string;
  driverFirstName: string;
  vehiclePlate: string;
  vehicleId: string;
}

interface DriverInfo {
  driverId: string;
  driverEmail: string;
  driverFirstName: string;
}

// Email template for vehicle documents (OC, inspection)
async function sendDriverExpiryEmail(
  info: DriverVehicleInfo,
  expiryType: 'oc' | 'inspection',
  expiryDate: string,
  daysLeft: number
) {
  const typeLabel = expiryType === 'oc' ? 'Polisa OC' : 'Przegląd techniczny';
  const formattedDate = new Date(expiryDate).toLocaleDateString('pl-PL');
  
  const subject = `[get RIDO] ${typeLabel} Twojego auta ${info.vehiclePlate} kończy się ${daysLeft <= 1 ? 'jutro!' : `za ${daysLeft} dni`}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin: 0;">get RIDO</h1>
      </div>
      
      <h2 style="color: ${daysLeft <= 3 ? '#dc2626' : '#f59e0b'};">
        ⚠️ ${typeLabel} wygasa ${daysLeft <= 1 ? 'jutro!' : `za ${daysLeft} dni`}
      </h2>
      
      <p>Cześć ${info.driverFirstName || 'Kierowco'},</p>
      
      <p>Przypominamy, że <strong>${typeLabel}</strong> Twojego pojazdu <strong>${info.vehiclePlate}</strong> 
         wygasa <strong>${formattedDate}</strong>.</p>
      
      ${daysLeft <= 3 
        ? '<p style="color: #dc2626; font-weight: bold;">⚠️ Pilne! Zostało bardzo mało czasu - działaj teraz!</p>'
        : '<p>Pamiętaj o przedłużeniu, aby uniknąć problemów.</p>'
      }
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Pojazd:</strong> ${info.vehiclePlate}</p>
        <p style="margin: 5px 0 0 0;"><strong>${typeLabel} ważny do:</strong> ${formattedDate}</p>
        <p style="margin: 5px 0 0 0;"><strong>Pozostało dni:</strong> ${daysLeft}</p>
      </div>
      
      <p>Możesz zaktualizować datę ważności dokumentu w panelu kierowcy w sekcji "Twoje auto".</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">
        © ${new Date().getFullYear()} get RIDO. Wszelkie prawa zastrzeżone.
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: 'get RIDO <no-reply@getrido.pl>',
      to: [info.driverEmail],
      subject,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    
    console.log(`Email sent to ${info.driverEmail} for ${expiryType} expiring on ${expiryDate}`);
    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
}

// Email template for driver documents (license, medical, psychological exams)
async function sendDriverDocumentExpiryEmail(
  info: DriverInfo,
  documentType: string,
  expiryDate: string,
  daysLeft: number
) {
  const formattedDate = new Date(expiryDate).toLocaleDateString('pl-PL');
  
  const subject = `[get RIDO] ${documentType} wygasa ${daysLeft <= 1 ? 'jutro!' : `za ${daysLeft} dni`}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin: 0;">get RIDO</h1>
      </div>
      
      <h2 style="color: ${daysLeft <= 3 ? '#dc2626' : '#f59e0b'};">
        ⚠️ ${documentType} wygasa ${daysLeft <= 1 ? 'jutro!' : `za ${daysLeft} dni`}
      </h2>
      
      <p>Cześć ${info.driverFirstName || 'Kierowco'},</p>
      
      <p>Przypominamy, że Twój dokument <strong>${documentType}</strong> 
         wygasa <strong>${formattedDate}</strong>.</p>
      
      ${daysLeft <= 3 
        ? '<p style="color: #dc2626; font-weight: bold;">⚠️ Pilne! Zostało bardzo mało czasu - działaj teraz!</p>'
        : '<p>Pamiętaj o przedłużeniu ważności, aby móc kontynuować współpracę.</p>'
      }
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Dokument:</strong> ${documentType}</p>
        <p style="margin: 5px 0 0 0;"><strong>Ważny do:</strong> ${formattedDate}</p>
        <p style="margin: 5px 0 0 0;"><strong>Pozostało dni:</strong> ${daysLeft}</p>
      </div>
      
      <p>Możesz sprawdzić swoje dokumenty w panelu kierowcy w sekcji "Informacje kierowcy".</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">
        © ${new Date().getFullYear()} get RIDO. Wszelkie prawa zastrzeżone.
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: 'get RIDO <no-reply@getrido.pl>',
      to: [info.driverEmail],
      subject,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    
    console.log(`Email sent to ${info.driverEmail} for ${documentType} expiring on ${expiryDate}`);
    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
}

async function getDriverForVehicle(supabaseClient: any, vehicleId: string): Promise<DriverVehicleInfo | null> {
  // Get vehicle plate
  const { data: vehicle } = await supabaseClient
    .from('vehicles')
    .select('plate')
    .eq('id', vehicleId)
    .single();

  if (!vehicle) return null;

  // Get active driver assignment for this vehicle
  const { data: assignment } = await supabaseClient
    .from('driver_vehicle_assignments')
    .select(`
      driver_id,
      drivers!inner (
        id,
        email,
        first_name
      )
    `)
    .eq('vehicle_id', vehicleId)
    .eq('status', 'active')
    .is('unassigned_at', null)
    .maybeSingle();

  if (!assignment?.drivers?.email) return null;

  return {
    driverId: assignment.driver_id,
    driverEmail: assignment.drivers.email,
    driverFirstName: assignment.drivers.first_name || '',
    vehiclePlate: vehicle.plate,
    vehicleId
  };
}

async function checkDriverExpiryDates(supabaseClient: any) {
  const results = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Warning thresholds in days
  const warningDays = [14, 7, 3, 1];

  // =====================================================
  // 1. Check vehicle policies (OC)
  // =====================================================
  for (const days of warningDays) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + days);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    console.log(`Checking policies expiring on ${targetDateStr} (${days} days from now)`);
    
    const { data: policies, error } = await supabaseClient
      .from('vehicle_policies')
      .select('id, vehicle_id, valid_to, type')
      .eq('valid_to', targetDateStr)
      .eq('type', 'OC');

    if (error) {
      console.error('Error fetching policies:', error);
      continue;
    }

    console.log(`Found ${policies?.length || 0} expiring policies`);

    for (const policy of policies || []) {
      const driverInfo = await getDriverForVehicle(supabaseClient, policy.vehicle_id);
      
      if (!driverInfo) {
        console.log(`No driver found for vehicle ${policy.vehicle_id}`);
        continue;
      }

      // Check if we already sent notification for this
      const { data: existingSent } = await supabaseClient
        .from('reminders')
        .select('id')
        .eq('entity_type', 'Policy')
        .eq('entity_id', policy.id)
        .eq('due_date', policy.valid_to)
        .eq('channel', 'driver_email')
        .maybeSingle();

      if (existingSent) {
        console.log(`Already sent notification for policy ${policy.id}`);
        continue;
      }

      // Send email to driver
      const emailSent = await sendDriverExpiryEmail(
        driverInfo,
        'oc',
        policy.valid_to,
        days
      );

      if (emailSent) {
        // Record that we sent this notification
        await supabaseClient
          .from('reminders')
          .insert([{
            entity_type: 'Policy',
            entity_id: policy.id,
            due_date: policy.valid_to,
            title: `Email do kierowcy: ${driverInfo.vehiclePlate} - OC wygasa`,
            notes: `Wysłano email do ${driverInfo.driverEmail}`,
            channel: 'driver_email',
            status: 'sent'
          }]);

        results.push({
          type: 'policy',
          vehicle: driverInfo.vehiclePlate,
          driver: driverInfo.driverEmail,
          days,
          date: policy.valid_to
        });
      }
    }
  }

  // =====================================================
  // 2. Check vehicle inspections
  // =====================================================
  for (const days of warningDays) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + days);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    console.log(`Checking inspections expiring on ${targetDateStr} (${days} days from now)`);
    
    const { data: inspections, error } = await supabaseClient
      .from('vehicle_inspections')
      .select('id, vehicle_id, valid_to')
      .eq('valid_to', targetDateStr);

    if (error) {
      console.error('Error fetching inspections:', error);
      continue;
    }

    console.log(`Found ${inspections?.length || 0} expiring inspections`);

    for (const inspection of inspections || []) {
      const driverInfo = await getDriverForVehicle(supabaseClient, inspection.vehicle_id);
      
      if (!driverInfo) {
        console.log(`No driver found for vehicle ${inspection.vehicle_id}`);
        continue;
      }

      // Check if we already sent notification for this
      const { data: existingSent } = await supabaseClient
        .from('reminders')
        .select('id')
        .eq('entity_type', 'Inspection')
        .eq('entity_id', inspection.id)
        .eq('due_date', inspection.valid_to)
        .eq('channel', 'driver_email')
        .maybeSingle();

      if (existingSent) {
        console.log(`Already sent notification for inspection ${inspection.id}`);
        continue;
      }

      // Send email to driver
      const emailSent = await sendDriverExpiryEmail(
        driverInfo,
        'inspection',
        inspection.valid_to,
        days
      );

      if (emailSent) {
        // Record that we sent this notification
        await supabaseClient
          .from('reminders')
          .insert([{
            entity_type: 'Inspection',
            entity_id: inspection.id,
            due_date: inspection.valid_to,
            title: `Email do kierowcy: ${driverInfo.vehiclePlate} - Przegląd wygasa`,
            notes: `Wysłano email do ${driverInfo.driverEmail}`,
            channel: 'driver_email',
            status: 'sent'
          }]);

        results.push({
          type: 'inspection',
          vehicle: driverInfo.vehiclePlate,
          driver: driverInfo.driverEmail,
          days,
          date: inspection.valid_to
        });
      }
    }
  }

  // =====================================================
  // 3. Check driver's license expiry dates
  // =====================================================
  for (const days of warningDays) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + days);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    console.log(`Checking driver licenses expiring on ${targetDateStr} (${days} days from now)`);
    
    const { data: drivers, error } = await supabaseClient
      .from('drivers')
      .select('id, email, first_name, license_expiry_date')
      .eq('license_expiry_date', targetDateStr)
      .eq('license_is_unlimited', false)
      .not('email', 'is', null);

    if (error) {
      console.error('Error fetching drivers with expiring licenses:', error);
      continue;
    }

    console.log(`Found ${drivers?.length || 0} expiring driver licenses`);

    for (const driver of drivers || []) {
      if (!driver.email) continue;

      // Check if we already sent notification for this
      const { data: existingSent } = await supabaseClient
        .from('reminders')
        .select('id')
        .eq('entity_type', 'DriverLicense')
        .eq('entity_id', driver.id)
        .eq('due_date', driver.license_expiry_date)
        .eq('channel', 'driver_email')
        .maybeSingle();

      if (existingSent) {
        console.log(`Already sent notification for driver license ${driver.id}`);
        continue;
      }

      // Send email to driver
      const emailSent = await sendDriverDocumentExpiryEmail(
        {
          driverId: driver.id,
          driverEmail: driver.email,
          driverFirstName: driver.first_name || ''
        },
        'Prawo jazdy',
        driver.license_expiry_date,
        days
      );

      if (emailSent) {
        // Record that we sent this notification
        await supabaseClient
          .from('reminders')
          .insert([{
            entity_type: 'DriverLicense',
            entity_id: driver.id,
            due_date: driver.license_expiry_date,
            title: `Email do kierowcy: Prawo jazdy wygasa`,
            notes: `Wysłano email do ${driver.email}`,
            channel: 'driver_email',
            status: 'sent'
          }]);

        results.push({
          type: 'driver_license',
          driver: driver.email,
          days,
          date: driver.license_expiry_date
        });
      }
    }
  }

  // =====================================================
  // 4. Check driver documents (medical, psychological exams)
  // =====================================================
  for (const days of warningDays) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + days);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    console.log(`Checking driver documents expiring on ${targetDateStr} (${days} days from now)`);
    
    const { data: documents, error } = await supabaseClient
      .from('driver_documents')
      .select(`
        id,
        driver_id,
        expires_at,
        document_types(name)
      `)
      .eq('expires_at', targetDateStr);

    if (error) {
      console.error('Error fetching driver documents:', error);
      continue;
    }

    console.log(`Found ${documents?.length || 0} expiring driver documents`);

    for (const doc of documents || []) {
      // Get driver info
      const { data: driver } = await supabaseClient
        .from('drivers')
        .select('id, email, first_name')
        .eq('id', doc.driver_id)
        .single();

      if (!driver?.email) {
        console.log(`No email found for driver ${doc.driver_id}`);
        continue;
      }

      const documentName = doc.document_types?.name || 'Dokument';

      // Check if we already sent notification for this
      const { data: existingSent } = await supabaseClient
        .from('reminders')
        .select('id')
        .eq('entity_type', 'DriverDocument')
        .eq('entity_id', doc.id)
        .eq('due_date', doc.expires_at)
        .eq('channel', 'driver_email')
        .maybeSingle();

      if (existingSent) {
        console.log(`Already sent notification for driver document ${doc.id}`);
        continue;
      }

      // Send email to driver
      const emailSent = await sendDriverDocumentExpiryEmail(
        {
          driverId: driver.id,
          driverEmail: driver.email,
          driverFirstName: driver.first_name || ''
        },
        documentName,
        doc.expires_at,
        days
      );

      if (emailSent) {
        // Record that we sent this notification
        await supabaseClient
          .from('reminders')
          .insert([{
            entity_type: 'DriverDocument',
            entity_id: doc.id,
            due_date: doc.expires_at,
            title: `Email do kierowcy: ${documentName} wygasa`,
            notes: `Wysłano email do ${driver.email}`,
            channel: 'driver_email',
            status: 'sent'
          }]);

        results.push({
          type: 'driver_document',
          documentType: documentName,
          driver: driver.email,
          days,
          date: doc.expires_at
        });
      }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  let identity: RequestIdentity | null = null;
  let auditClient: ReturnType<typeof createServiceClient> | null = null;
  let auditAction = 'unknown';
  const correlationId = requestCorrelationId(req);

  try {
    const supabaseClient = createServiceClient();
    auditClient = supabaseClient;

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];
    auditAction = action;

    const isCron = req.method === 'POST' && action === 'cron';
    if (isCron) {
      requireInternalSecret(req, { envName: 'REMINDERS_CRON_INTERNAL_SECRET' });
    } else {
      identity = await requireAdmin(req, supabaseClient);
    }

    switch (req.method) {
      case 'GET': {
        if (action === 'check') {
          // Manual trigger of expiry check
          if (Deno.env.get('REMINDERS_DELIVERY_ENABLED') !== 'true') {
            throw new SecurityError(503, 'reminder_delivery_disabled', 'Wysyłka przypomnień jest wyłączona do czasu konfiguracji idempotencji');
          }
          console.log('Manual check triggered');
          await writeAuditEvent(supabaseClient, {
            actorId: identity?.userId,
            action: 'reminders.expiry_check',
            resourceType: 'reminder_queue',
            result: 'attempted',
            correlationId: identity?.correlationId ?? correlationId,
          });
          const results = await checkDriverExpiryDates(supabaseClient);

          await writeAuditEvent(supabaseClient, {
            actorId: identity?.userId,
            action: 'reminders.expiry_check',
            resourceType: 'reminder_queue',
            result: 'succeeded',
            correlationId: identity?.correlationId ?? correlationId,
            metadata: { processed: results.length },
          });
          return jsonResponse(req, 200, {
            message: 'Driver expiry check completed',
            processed: results.length,
            results,
          });
        } else {
          // Get reminders
          const status = url.searchParams.get('status') || 'open';
          if (!['open', 'pending', 'sent', 'done', 'cancelled'].includes(status)) {
            throw new SecurityError(400, 'invalid_status', 'Nieprawidłowy status przypomnienia');
          }

          const { data, error } = await supabaseClient
            .from('reminders')
            .select('*')
            .eq('status', status)
            .order('due_date')
            .limit(500);

          if (error) throw error;

          return jsonResponse(req, 200, data);
        }
      }

      case 'POST': {
        if (action === 'cron') {
          // This is called by a cron job
          if (Deno.env.get('REMINDERS_DELIVERY_ENABLED') !== 'true') {
            throw new SecurityError(503, 'reminder_delivery_disabled', 'Wysyłka przypomnień jest wyłączona do czasu konfiguracji idempotencji');
          }
          console.log('Running scheduled driver reminder check...');
          await writeAuditEvent(supabaseClient, {
            action: 'reminders.cron',
            resourceType: 'reminder_queue',
            result: 'attempted',
            correlationId,
          });
          const results = await checkDriverExpiryDates(supabaseClient);

          await writeAuditEvent(supabaseClient, {
            action: 'reminders.cron',
            resourceType: 'reminder_queue',
            result: 'succeeded',
            correlationId,
            metadata: { processed: results.length },
          });
          return jsonResponse(req, 200, {
            message: 'Cron job completed - driver emails sent',
            processed: results.length,
            timestamp: new Date().toISOString(),
            results,
          });
        } else {
          // Create manual reminder
          const input = await req.json();
          if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new SecurityError(400, 'invalid_body', 'Nieprawidłowe dane przypomnienia');
          }
          const entityId = (input as Record<string, unknown>).entity_id;
          const dueDate = (input as Record<string, unknown>).due_date;
          const title = (input as Record<string, unknown>).title;
          const parsedDueDate = typeof dueDate === 'string' ? new Date(`${dueDate}T00:00:00Z`) : null;
          if (
            !isUuid(entityId) ||
            typeof dueDate !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
            !parsedDueDate ||
            Number.isNaN(parsedDueDate.getTime()) ||
            parsedDueDate.toISOString().slice(0, 10) !== dueDate
          ) {
            throw new SecurityError(400, 'invalid_reminder', 'Nieprawidłowy zasób lub termin przypomnienia');
          }
          if (typeof title !== 'string' || !title.trim() || title.length > 200) {
            throw new SecurityError(400, 'invalid_title', 'Nieprawidłowy tytuł przypomnienia');
          }
          const reminder = {
            entity_type: typeof (input as any).entity_type === 'string' ? (input as any).entity_type.slice(0, 64) : 'Manual',
            entity_id: entityId,
            due_date: dueDate,
            title: title.trim(),
            notes: typeof (input as any).notes === 'string' ? (input as any).notes.slice(0, 2000) : null,
            channel: typeof (input as any).channel === 'string' ? (input as any).channel.slice(0, 64) : 'manual',
            status: 'open',
          };

          await writeAuditEvent(supabaseClient, {
            actorId: identity?.userId,
            action: 'reminders.create',
            resourceType: reminder.entity_type,
            resourceId: entityId,
            result: 'attempted',
            correlationId: identity?.correlationId ?? correlationId,
          });
          const { data, error } = await supabaseClient
            .from('reminders')
            .insert([reminder])
            .select()
            .single();

          if (error) throw error;

          await writeAuditEvent(supabaseClient, {
            actorId: identity?.userId,
            action: 'reminders.create',
            resourceType: reminder.entity_type,
            resourceId: entityId,
            result: 'succeeded',
            correlationId: identity?.correlationId ?? correlationId,
          });
          return jsonResponse(req, 201, data);
        }
      }

      default:
        throw new SecurityError(405, 'method_not_allowed', 'Metoda niedozwolona');
    }
  } catch (error) {
    if (auditClient) {
      try {
        await writeAuditEvent(auditClient, {
          actorId: identity?.userId,
          action: `reminders.${auditAction}`,
          resourceType: 'reminder_queue',
          result: error instanceof SecurityError && (error.status === 401 || error.status === 403) ? 'denied' : 'failed',
          correlationId: identity?.correlationId ?? correlationId,
          metadata: { error_code: error instanceof SecurityError ? error.code : 'internal_error' },
        });
      } catch {
        // Awaria zapisu audytu jest rejestrowana przez writeAuditEvent.
      }
    }
    return errorResponse(req, error);
  }
});
