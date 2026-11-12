import { daysUntil, paymentState, seoulDate, summarizeLedger } from "./ledger.js";

const number = new Intl.NumberFormat("ko-KR");
const won = (amount) => `${number.format(amount)}원`;
const ledgerStatus = document.querySelector("#ledger-status");
let ledger;
let renderedMonth;

document.querySelector("[data-lock]")?.addEventListener("click", () => {
  window.location.reload();
});

document.querySelector("#copy-account").addEventListener("click", async () => {
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(document.querySelector("#account-number").textContent.trim());
    status.textContent = "계좌번호를 복사했습니다.";
    status.removeAttribute("data-error");
  } catch (error) {
    console.error("Unable to copy the account number:", error);
    status.textContent = "복사하지 못했습니다. 위 계좌번호를 직접 선택해 복사해주세요.";
    status.dataset.error = "";
  }
});

function cell(tag, text, scope) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (scope) element.scope = scope;
  return element;
}

function renderLedger(data, currentMonth) {
  const summary = summarizeLedger(data);
  const head = document.createElement("tr");
  head.append(cell("th", "이름", "col"));
  for (const month of data.months) {
    head.append(cell("th", `${month.slice(2, 4)}.${month.slice(5)}`, "col"));
  }
  head.append(cell("th", "누적 입금", "col"));
  const body = document.createDocumentFragment();
  const labels = { paid: "완료", partial: "일부", scheduled: "예정", unpaid: "미입금" };
  for (const member of summary.members) {
    const row = document.createElement("tr");
    row.append(cell("th", member.name, "row"));
    for (const month of data.months) {
      const amount = member.payments[month];
      const state = paymentState(amount, data.monthlyAmount, month, currentMonth);
      const entry = cell("td", "");
      const badge = document.createElement("span");
      badge.className = `payment-status ${state}`;
      badge.textContent = labels[state];
      entry.append(badge);
      if (amount > 0) {
        const detail = document.createElement("small");
        detail.textContent = number.format(amount);
        entry.append(detail);
      }
      row.append(entry);
    }
    const total = cell("td", won(member.total));
    total.className = "member-total";
    const completed = document.createElement("small");
    completed.textContent = `${member.completed} / ${data.months.length}개월`;
    total.append(completed);
    row.append(total);
    body.append(row);
  }
  const foot = document.createElement("tr");
  foot.append(cell("th", "월별 합계", "row"));
  for (const month of data.months) {
    foot.append(cell("td", number.format(data.members.reduce(
      (total, member) => total + member.payments[month], 0,
    ))));
  }
  foot.append(cell("td", won(summary.paidAmount)));

  document.querySelector("#payment-table thead").replaceChildren(head);
  document.querySelector("#payment-table tbody").replaceChildren(body);
  document.querySelector("#payment-table tfoot").replaceChildren(foot);
  document.querySelector("#member-count").textContent = data.members.length;
  document.querySelector("#collected-amount").textContent = won(summary.paidAmount);
  document.querySelector("#target-amount").textContent = won(summary.targetAmount);
  document.querySelector("#completed-payments").textContent = `${summary.completedPayments} / ${summary.totalPayments}회`;
  const percent = summary.creditedAmount / summary.targetAmount * 100;
  document.querySelector("#fund-progress").value = percent;
  document.querySelector("#progress-label").textContent = `${percent.toFixed(1)}%`;
  document.querySelector("#updated-at").textContent = data.updatedAt === null
    ? "첫 입금 내역 등록 전"
    : `마지막 반영 · ${new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(data.updatedAt))}`;
  ledgerStatus.textContent = data.updatedAt === null
    ? "아직 입금 내역이 등록되지 않았습니다. 확인된 금액부터 반영할 예정입니다."
    : "입금현황을 불러왔습니다. 최신 게시 내역은 페이지를 새로고침해 확인해주세요.";
  renderedMonth = currentMonth;
}

function updateCalendar() {
  const now = new Date();
  const dday = document.querySelector("#dday");
  try {
    const days = daysUntil(document.querySelector("#event-date").dateTime, now);
    dday.textContent = days > 0 ? `D-${days}` : days === 0 ? "D-DAY" : `D+${Math.abs(days)}`;
    dday.setAttribute("aria-label", days > 0
      ? `모임까지 ${days}일`
      : days === 0 ? "오늘이 모임 날입니다" : `모임 후 ${Math.abs(days)}일`);
  } catch (error) {
    console.error("Unable to calculate D-day:", error);
    dday.textContent = "날짜 확인 필요";
  }
  const month = seoulDate(now).slice(0, 7);
  if (ledger && month !== renderedMonth) renderLedger(ledger, month);
}

try {
  const data = window.club711Ledger;
  delete window.club711Ledger;
  renderLedger(data, seoulDate().slice(0, 7));
  ledger = data;
} catch (error) {
  console.error("Unable to display the payment ledger:", error);
  ledgerStatus.textContent = "입금현황 데이터가 올바르지 않습니다. 원본 JSON을 확인한 뒤 다시 암호화해 게시해주세요.";
  ledgerStatus.dataset.error = "";
}

updateCalendar();
setInterval(updateCalendar, 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateCalendar();
});
