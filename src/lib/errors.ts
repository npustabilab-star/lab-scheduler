const MESSAGES: Record<string, string> = {
  TOO_SOON: '需至少提前 7 天預約',
  SLOT_UNAVAILABLE: '這個時段已被預約或不再開放，請重新選擇',
  HAS_ACTIVE_BOOKING: '你已經有一筆進行中的預約',
  NO_MENTOR: '尚未設定指導研究生，請聯絡管理者',
  NOT_ADMIN: '需要管理者權限',
  INVALID_MENTOR: '指導研究生必須是已啟用的研究生',
  LAST_ADMIN: '至少要保留一位管理者',
  NOT_CANCELLABLE: '這筆預約已無法取消',
  NO_SEMESTER: '管理者尚未設定學期',
  USER_NOT_FOUND: '找不到這位使用者',
  NOT_ALLOWED: '你沒有權限進行這個操作',
  NOT_PARTICIPANT: '你不是這筆預約的參與者',
  NOT_PENDING: '這筆預約已經不是待確認狀態',
  TEACHER_EXISTS: '系統中已經有一位老師',
  NOT_UNDERGRAD: '只有專題生可以預約',
}

export const DEFAULT_ERROR_MESSAGE = '發生錯誤，請稍後再試'

export function rpcErrorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : DEFAULT_ERROR_MESSAGE
}
