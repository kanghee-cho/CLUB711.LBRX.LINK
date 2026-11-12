function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isCalendarDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

export function validateLedger(data) {
  requireValue(data !== null && typeof data === "object", "입금 데이터가 객체가 아닙니다.");
  requireValue(data.version === 1, "지원하지 않는 입금 데이터 버전입니다.");
  requireValue(
    Number.isSafeInteger(data.monthlyAmount) && data.monthlyAmount > 0,
    "monthlyAmount는 0보다 큰 정수여야 합니다.",
  );
  requireValue(
    Array.isArray(data.months) && data.months.length > 0,
    "months에 납부할 월을 입력하세요.",
  );
  let previousMonth;
  for (const month of data.months) {
    requireValue(
      typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
      "납부 월은 YYYY-MM 형식이어야 합니다.",
    );
    const [year, number] = month.split("-").map(Number);
    const index = year * 12 + number;
    requireValue(
      previousMonth === undefined || index === previousMonth + 1,
      "납부 월은 중복 없이 연속된 오름차순이어야 합니다.",
    );
    previousMonth = index;
  }
  requireValue(
    data.updatedAt === null
      || (typeof data.updatedAt === "string"
        && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.updatedAt)
        && isCalendarDate(data.updatedAt.slice(0, 10))
        && Number.isFinite(Date.parse(data.updatedAt))),
    "updatedAt은 시간대가 포함된 ISO 날짜 또는 null이어야 합니다.",
  );
  requireValue(
    Array.isArray(data.members) && data.members.length > 0,
    "members에 참가자를 입력하세요.",
  );
  const ids = new Set();
  let total = 0;
  for (const [index, member] of data.members.entries()) {
    const prefix = `members[${index}]`;
    requireValue(member !== null && typeof member === "object", `${prefix}가 올바르지 않습니다.`);
    requireValue(
      typeof member.id === "string" && member.id.trim() !== "" && !ids.has(member.id),
      `${prefix}.id는 중복되지 않는 문자열이어야 합니다.`,
    );
    ids.add(member.id);
    requireValue(
      typeof member.name === "string" && member.name.trim() !== "",
      `${prefix}.name을 입력하세요.`,
    );
    requireValue(
      member.payments !== null && typeof member.payments === "object"
        && !Array.isArray(member.payments)
        && Object.keys(member.payments).length === data.months.length,
      `${prefix}.payments에 모든 납부 월을 입력하세요.`,
    );
    for (const month of data.months) {
      const amount = member.payments[month];
      requireValue(
        Object.hasOwn(member.payments, month) && Number.isSafeInteger(amount) && amount >= 0,
        `${prefix}.payments[${month}]는 0 이상의 정수 금액이어야 합니다.`,
      );
      total += amount;
      requireValue(Number.isSafeInteger(total), "입금 합계가 안전하게 계산할 수 있는 범위를 넘었습니다.");
    }
  }
  requireValue(
    Number.isSafeInteger(data.monthlyAmount * data.months.length * data.members.length),
    "납부 목표액이 안전하게 계산할 수 있는 범위를 넘었습니다.",
  );
  return data;
}

export function summarizeLedger(data) {
  validateLedger(data);
  let paidAmount = 0;
  let creditedAmount = 0;
  let completedPayments = 0;
  const members = data.members.map((member) => {
    let total = 0;
    let completed = 0;
    for (const month of data.months) {
      const amount = member.payments[month];
      total += amount;
      creditedAmount += Math.min(amount, data.monthlyAmount);
      if (amount >= data.monthlyAmount) completed += 1;
    }
    paidAmount += total;
    completedPayments += completed;
    return { ...member, total, completed };
  });
  const targetAmount = data.monthlyAmount * data.months.length * members.length;
  return {
    members,
    paidAmount,
    targetAmount,
    creditedAmount,
    remainingAmount: targetAmount - creditedAmount,
    completedPayments,
    totalPayments: data.months.length * members.length,
  };
}

export function seoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function daysUntil(date, now = new Date()) {
  requireValue(isCalendarDate(date), "모임 날짜가 유효하지 않습니다.");
  const target = Date.parse(`${date}T00:00:00Z`);
  return Math.round((target - Date.parse(`${seoulDate(now)}T00:00:00Z`)) / 86_400_000);
}

export function paymentState(amount, monthlyAmount, month, currentMonth) {
  if (amount >= monthlyAmount) return "paid";
  if (amount > 0) return "partial";
  return month > currentMonth ? "scheduled" : "unpaid";
}
