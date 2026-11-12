import assert from "node:assert/strict";
import test from "node:test";
import {
  daysUntil, paymentState, seoulDate, summarizeLedger, validateLedger,
} from "../assets/ledger.js";

function fixture() {
  return {
    version: 1,
    updatedAt: null,
    monthlyAmount: 20000,
    months: ["2026-12", "2027-01"],
    members: [
      { id: "one", name: "Member A", payments: { "2026-12": 20000, "2027-01": 10000 } },
      { id: "two", name: "Member B", payments: { "2026-12": 30000, "2027-01": 0 } },
    ],
  };
}

test("D-day uses Korean calendar dates across midnight, event day, and leap years", () => {
  assert.equal(seoulDate(new Date("2027-12-20T15:00:00Z")), "2027-12-21");
  assert.equal(daysUntil("2027-12-21", new Date("2027-12-20T14:59:59Z")), 1);
  assert.equal(daysUntil("2027-12-21", new Date("2027-12-20T15:00:00Z")), 0);
  assert.equal(daysUntil("2027-12-21", new Date("2027-12-21T15:00:00Z")), -1);
  assert.equal(daysUntil("2028-03-01", new Date("2028-02-28T00:00:00+09:00")), 2);
  assert.throws(() => daysUntil("2027-02-29"), /날짜/);
});

test("totals count partial payments without reallocating overpayments to other months", () => {
  const summary = summarizeLedger(fixture());
  assert.equal(summary.paidAmount, 60000);
  assert.equal(summary.creditedAmount, 50000);
  assert.equal(summary.targetAmount, 80000);
  assert.equal(summary.remainingAmount, 30000);
  assert.equal(summary.completedPayments, 2);
  assert.equal(summary.totalPayments, 4);
  assert.equal(summary.members[0].total, 30000);
  assert.equal(summary.members[0].completed, 1);
});

test("future payments are recognized while zero entries reflect the due month", () => {
  assert.equal(paymentState(20000, 20000, "2027-01", "2026-11"), "paid");
  assert.equal(paymentState(10000, 20000, "2027-01", "2026-11"), "partial");
  assert.equal(paymentState(0, 20000, "2027-01", "2026-11"), "scheduled");
  assert.equal(paymentState(0, 20000, "2026-12", "2026-12"), "unpaid");
  assert.equal(paymentState(0, 20000, "2026-12", "2027-01"), "unpaid");
});

test("invalid monthly records, duplicate members, and invalid timestamps are rejected", () => {
  const changes = [
    (data) => { delete data.members[0].payments["2026-12"]; },
    (data) => { data.members[0].payments["2026-12"] = -1; },
    (data) => { data.members[0].payments["2026-12"] = "20000"; },
    (data) => { data.members[0].payments["2026-12"] = 0.5; },
    (data) => { data.members[0].payments["2027-02"] = 0; },
    (data) => { data.members[1].id = "one"; },
    (data) => { data.months = ["2026-12", "2026-12"]; },
    (data) => { data.months = ["2026-12", "2027-02"]; },
    (data) => { data.months = ["2026-13", "2027-01"]; },
    (data) => { data.updatedAt = "2026-12-01T10:00:00"; },
    (data) => { data.updatedAt = "2027-02-30T10:00:00+09:00"; },
    (data) => { data.updatedAt = "2027-02-01T24:00:00+09:00"; },
    (data) => { data.monthlyAmount = Number.MAX_SAFE_INTEGER; },
    (data) => { data.members[0].payments["2026-12"] = Number.MAX_SAFE_INTEGER; },
  ];
  for (const change of changes) {
    const data = fixture();
    change(data);
    assert.throws(() => validateLedger(data));
  }
  const valid = fixture();
  valid.updatedAt = "2026-12-01T10:00:00+09:00";
  assert.equal(validateLedger(valid), valid);
});
