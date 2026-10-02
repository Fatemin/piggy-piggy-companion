/**
 * [ST0014] The login-code email. Sent through Resend's HTTP API when
 * `RESEND_API_KEY` is set; `PIG_DEV_MAIL=log` prints it instead (local dev),
 * and `PIG_DEV_MAIL=memory` drops it into `env.outbox` (tests).
 */

const TEXT = {
  zh: { subject: '猪猪登录验证码：{code}', body: '你的登录验证码是 {code}，10 分钟内有效。\n\n不是你本人操作的话，忽略这封邮件即可。' },
  ja: { subject: 'ブタのログインコード：{code}', body: 'ログインコードは {code} です。10 分間有効です。\n\nお心当たりがない場合は、このメールを無視してください。' },
  en: { subject: 'Your pig login code: {code}', body: 'Your login code is {code}. It works for 10 minutes.\n\nIf this was not you, just ignore this email.' },
}

export function loginMail(lang, code) {
  const text = TEXT[lang] ?? TEXT.zh
  return {
    subject: text.subject.replace('{code}', code),
    text: text.body.replace('{code}', code),
  }
}

/** Send `code` to `to`; true when it left. */
export async function sendLoginCode(env, to, code, lang) {
  const mail = loginMail(lang, code)
  if (env.PIG_DEV_MAIL === 'memory') {
    env.outbox = env.outbox ?? []
    env.outbox.push({ to, code, ...mail })
    return true
  }
  if (env.PIG_DEV_MAIL === 'log') {
    console.log(`[pig mail] to ${to}: ${mail.subject}`)
    return true
  }
  if (typeof env.RESEND_API_KEY !== 'string' || env.RESEND_API_KEY === '' || typeof env.PIG_MAIL_FROM !== 'string') return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.PIG_MAIL_FROM, to: [to], subject: mail.subject, text: mail.text }),
    })
    return response.ok
  } catch {
    return false
  }
}
