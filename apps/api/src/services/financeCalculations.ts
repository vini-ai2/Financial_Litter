/** Pure finance calculations. Rates are percentages; amounts use caller currency units. */
const MAX_LOG = Math.log(Number.MAX_VALUE);

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and greater than zero`);
}

function finiteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
}

function finiteRate(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function checkedResult(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} exceeds the supported numeric range`);
  return value;
}

/** Fixed monthly payment, nominal annual percentage rate / 12, payments at month end. */
export function calculateEmi(principal: number, annualRatePercent: number, tenureMonths: number): number {
  finitePositive(principal, "principal");
  finiteRate(annualRatePercent, "annualRatePercent");
  if (annualRatePercent < 0) throw new RangeError("annualRatePercent must be non-negative");
  if (!Number.isSafeInteger(tenureMonths) || tenureMonths <= 0) throw new RangeError("tenureMonths must be a positive safe integer");
  const monthlyRate = annualRatePercent / 1200;
  if (monthlyRate === 0) return principal / tenureMonths;
  const logGrowth = Math.log1p(monthlyRate);
  // Algebraically equivalent to P*r*(1+r)^n / ((1+r)^n-1), but avoids overflow.
  const denominator = -Math.expm1(-tenureMonths * logGrowth);
  return checkedResult((principal * monthlyRate) / denominator, "EMI");
}

export type SipPaymentTiming = "MONTH_END" | "BEGINNING_OF_MONTH";

/** SIP future value with an effective annual percentage return and monthly deposits. */
export function calculateSipFutureValue(
  monthlyPayment: number,
  annualEffectiveRatePercent: number,
  tenureMonths: number,
  timing: SipPaymentTiming = "MONTH_END",
): number {
  finiteNonNegative(monthlyPayment, "monthlyPayment");
  finiteRate(annualEffectiveRatePercent, "annualEffectiveRatePercent");
  if (annualEffectiveRatePercent <= -100) throw new RangeError("annualEffectiveRatePercent must be greater than -100%");
  if (!Number.isSafeInteger(tenureMonths) || tenureMonths <= 0) throw new RangeError("tenureMonths must be a positive safe integer");
  if (timing !== "MONTH_END" && timing !== "BEGINNING_OF_MONTH") throw new RangeError("timing must be MONTH_END or BEGINNING_OF_MONTH");
  if (monthlyPayment === 0) return 0;
  const monthlyRate = Math.expm1(Math.log1p(annualEffectiveRatePercent / 100) / 12);
  if (monthlyRate === 0) return checkedResult(monthlyPayment * tenureMonths, "SIP future value");
  const exponent = tenureMonths * Math.log1p(monthlyRate);
  if (exponent > MAX_LOG) throw new RangeError("SIP future value exceeds the supported numeric range");
  let factor = Math.expm1(exponent) / monthlyRate;
  if (timing === "BEGINNING_OF_MONTH") factor *= 1 + monthlyRate;
  return checkedResult(monthlyPayment * factor, "SIP future value");
}

/** Annualized compound growth over an elapsed duration expressed in years. */
export function calculateCagr(beginningValue: number, endingValue: number, years: number): number {
  finitePositive(beginningValue, "beginningValue");
  finiteNonNegative(endingValue, "endingValue");
  finitePositive(years, "years");
  if (endingValue === 0) return -1;
  const exponent = (Math.log(endingValue) - Math.log(beginningValue)) / years;
  if (exponent > MAX_LOG) throw new RangeError("CAGR exceeds the supported numeric range");
  return checkedResult(Math.expm1(exponent), "CAGR");
}

/** FD maturity for a nominal annual percentage rate compounded `frequency` times per year. */
export function calculateFdMaturity(
  principal: number,
  annualNominalRatePercent: number,
  years: number,
  compoundingFrequency: number,
): number {
  finitePositive(principal, "principal");
  finiteRate(annualNominalRatePercent, "annualNominalRatePercent");
  if (annualNominalRatePercent < 0) throw new RangeError("annualNominalRatePercent must be non-negative");
  finitePositive(years, "years");
  if (!Number.isSafeInteger(compoundingFrequency) || compoundingFrequency <= 0) throw new RangeError("compoundingFrequency must be a positive safe integer");
  const ratePerPeriod = annualNominalRatePercent / (100 * compoundingFrequency);
  if (ratePerPeriod === 0) return principal;
  const exponent = compoundingFrequency * years * Math.log1p(ratePerPeriod);
  if (exponent > MAX_LOG) throw new RangeError("FD maturity exceeds the supported numeric range");
  return checkedResult(principal * Math.exp(exponent), "FD maturity");
}
