export async function notifySlack(webhookUrl: string | undefined, message: string) {
  if (!webhookUrl) return
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  }).catch(() => {})
}

export function leaveSubmittedMessage(userName: string, type: string, dateFrom: string, dateTo: string, value: string) {
  const dates = dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`
  const duration = parseFloat(value) === 0.5 ? 'half day' : `${value} day(s)`
  return `📋 *Leave Request* — ${userName} has applied for *${type} leave* on ${dates} (${duration}). Pending approval.`
}

export function leaveStatusMessage(userName: string, type: string, dateFrom: string, status: 'approved' | 'rejected') {
  const icon = status === 'approved' ? '✅' : '❌'
  return `${icon} *Leave ${status.charAt(0).toUpperCase() + status.slice(1)}* — ${userName}'s ${type} leave on ${dateFrom} has been ${status}.`
}
