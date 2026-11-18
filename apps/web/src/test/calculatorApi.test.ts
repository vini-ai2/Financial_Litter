import assert from "node:assert/strict";
import { test } from "node:test";
import { financeApi, setAccessToken } from "../lib/api";

test("all calculator client workflows call their authenticated endpoints and return API values unchanged", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  setAccessToken("test-access-token");
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    requests.push({ url: String(input), init });
    const results: Record<string, object> = {
      "/finance/calculators/emi": { monthlyPayment: 8884.878867834166 },
      "/finance/calculators/sip": { futureValue: 12766.497908353189 },
      "/finance/calculators/cagr": { annualizedReturn: 0.1 },
      "/finance/calculators/fd": { maturityValue: 117165.93810022657 },
    };
    const path = new URL(String(input)).pathname;
    return new Response(JSON.stringify(results[path]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const emiInput = { principal: 100_000, annualRatePercent: 12, tenureMonths: 12 };
    const sipInput = { monthlyPayment: 1000, annualEffectiveRatePercent: 12, tenureMonths: 12, timing: "BEGINNING_OF_MONTH" as const };
    const cagrInput = { beginningValue: 100, endingValue: 121, years: 2 };
    const fdInput = { principal: 100_000, annualNominalRatePercent: 8, years: 2, compoundingFrequency: 4 };

    assert.deepEqual(await financeApi.calculateEmi(emiInput), { monthlyPayment: 8884.878867834166 });
    assert.deepEqual(await financeApi.calculateSip(sipInput), { futureValue: 12766.497908353189 });
    assert.deepEqual(await financeApi.calculateCagr(cagrInput), { annualizedReturn: 0.1 });
    assert.deepEqual(await financeApi.calculateFd(fdInput), { maturityValue: 117165.93810022657 });

    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
      "/finance/calculators/emi", "/finance/calculators/sip", "/finance/calculators/cagr", "/finance/calculators/fd",
    ]);
    assert.ok(requests.every(({ init }) => init.method === "POST"));
    assert.ok(requests.every(({ init }) => (init.headers as Record<string, string>).Authorization === "Bearer test-access-token"));
    assert.deepEqual(requests.map(({ init }) => JSON.parse(String(init.body))), [emiInput, sipInput, cagrInput, fdInput]);
  } finally {
    globalThis.fetch = originalFetch;
    setAccessToken("");
  }
});

test("calculator client surfaces API validation and connection failures", async () => {
  const originalFetch = globalThis.fetch;
  setAccessToken("test-access-token");
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Invalid calculator inputs" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    await assert.rejects(
      financeApi.calculateEmi({ principal: -1, annualRatePercent: 8, tenureMonths: 12 }),
      /Invalid calculator inputs/,
    );

    globalThis.fetch = (async () => { throw new TypeError("Network unavailable"); }) as typeof fetch;
    await assert.rejects(
      financeApi.calculateFd({ principal: 1000, annualNominalRatePercent: 8, years: 2, compoundingFrequency: 4 }),
      /Network unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    setAccessToken("");
  }
});
