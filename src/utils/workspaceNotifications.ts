import { supabase } from "@/integrations/supabase/client";

/**
 * Send workspace notification to a target user.
 * This is a thin helper so any component can fire notifications.
 */
export async function sendWorkspaceNotification(
  targetUserId: string,
  title: string,
  opts?: {
    body?: string;
    projectId?: string;
    type?: string;
    linkType?: string;
    linkId?: string;
    senderName?: string;
  }
) {
  const { data: { session } } = await supabase.auth.getSession();
  // Don't notify yourself
  if (session?.user?.id === targetUserId) return;

  await supabase.from("workspace_notifications").insert({
    user_id: targetUserId,
    title,
    body: opts?.body || null,
    project_id: opts?.projectId || null,
    type: opts?.type || 'info',
    link_type: opts?.linkType || null,
    link_id: opts?.linkId || null,
    sender_user_id: session?.user?.id || null,
    sender_name: opts?.senderName || session?.user?.email || null,
  } as any);
}

/**
 * Notify all project members except the sender about a task assignment.
 */
export async function notifyTaskAssigned(
  projectId: string,
  taskTitle: string,
  assignedName: string,
  taskId: string,
  senderEmail?: string
) {
  // Find the member by display_name
  const { data: members } = await supabase
    .from("workspace_project_members")
    .select("user_id, display_name")
    .eq("project_id", projectId);

  const target = members?.find(m => m.display_name === assignedName);
  if (target?.user_id) {
    await sendWorkspaceNotification(target.user_id, `Przypisano zadanie: ${taskTitle}`, {
      projectId,
      type: 'task_assigned',
      linkType: 'task',
      linkId: taskId,
      senderName: senderEmail,
      body: `Zostałeś przypisany do zadania "${taskTitle}"`,
    });
  }
}

/**
 * Notify about task status change (completed).
 */
export async function notifyTaskCompleted(
  projectId: string,
  taskTitle: string,
  taskId: string,
  creatorUserId: string,
  senderEmail?: string
) {
  await sendWorkspaceNotification(creatorUserId, `Zadanie ukończone: ${taskTitle}`, {
    projectId,
    type: 'task_completed',
    linkType: 'task',
    linkId: taskId,
    senderName: senderEmail,
    body: `Zadanie "${taskTitle}" zostało oznaczone jako gotowe`,
  });
}

/**
 * Parse @mentions from message content and notify mentioned users.
 */
export async function notifyMentions(
  content: string,
  projectId: string,
  channelName: string,
  senderEmail?: string
) {
  const mentionRegex = /@(\S+)/g;
  let match;
  const mentions: string[] = [];
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  if (mentions.length === 0) return;

  const { data: members } = await supabase
    .from("workspace_project_members")
    .select("user_id, display_name, email")
    .eq("project_id", projectId);

  for (const mention of mentions) {
    const target = members?.find(m =>
      m.display_name?.toLowerCase() === mention.toLowerCase() ||
      m.email?.toLowerCase() === mention.toLowerCase()
    );
    if (target?.user_id) {
      await sendWorkspaceNotification(target.user_id, `Wspomniano Cię w #${channelName}`, {
        projectId,
        type: 'mention',
        linkType: 'chat',
        linkId: channelName,
        senderName: senderEmail,
        body: content.length > 100 ? content.slice(0, 100) + '…' : content,
      });
    }
  }
}

/**
 * Notify about deadline approaching (for use in periodic checks).
 */
export async function notifyDeadlineApproaching(
  targetUserId: string,
  projectId: string,
  taskTitle: string,
  taskId: string,
  dueDate: string
) {
  await sendWorkspaceNotification(targetUserId, `Zbliża się termin: ${taskTitle}`, {
    projectId,
    type: 'deadline',
    linkType: 'task',
    linkId: taskId,
    body: `Termin wykonania: ${new Date(dueDate).toLocaleDateString('pl-PL')}`,
  });
}
