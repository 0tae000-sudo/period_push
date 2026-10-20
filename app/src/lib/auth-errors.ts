export const ALREADY_REGISTERED_MESSAGE = '이미 가입된 이메일이에요. 로그인해 주세요.';

/**
 * 가입 응답에서 "이미 가입된 이메일"인지 판별한다.
 * 이메일 인증을 켠 프로젝트는 보안상 에러를 내지 않고, 메일도 보내지 않은 채 identities가 빈 배열인 사용자를 돌려준다.
 */
export function isAlreadyRegistered(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

// Supabase Auth 에러를 사용자에게 보여줄 한글 메시지로 바꾼다.
export function toKoreanAuthMessage(error: { message?: string; code?: string } | null | undefined): string {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않아요.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return '이메일 인증을 먼저 완료해 주세요. 가입할 때 받은 메일을 확인해 주세요.';
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return ALREADY_REGISTERED_MESSAGE;
  }
  if (code === 'otp_expired' || message.includes('token has expired') || message.includes('invalid or has expired')) {
    return '코드가 올바르지 않거나 만료됐어요. 코드를 다시 받아 주세요.';
  }
  if (code === 'same_password' || message.includes('different from the old password')) {
    return '이전과 다른 비밀번호를 입력해 주세요. 코드는 한 번만 쓸 수 있어서 다시 받아야 해요.';
  }
  if (message.includes('only request this after')) {
    return '잠시 후에 다시 요청해 주세요. (60초에 한 번만 보낼 수 있어요)';
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return '비밀번호는 6자 이상으로 입력해 주세요.';
  }
  if (code === 'validation_failed' || message.includes('invalid email') || message.includes('unable to validate email')) {
    return '이메일 형식이 올바르지 않아요.';
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || message.includes('rate limit')) {
    return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 연결을 확인해 주세요.';
  }
  return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
