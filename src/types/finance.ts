export const BROKERS = [
	"KOREA_INVEST",
	"MIRAE_ASSET",
	"NH_INVESTMENT",
	"SAMSUNG",
	"TOSS",
	"KIWOOM",
] as const;
export const BROKER_LABELS: Record<(typeof BROKERS)[number], string> = {
	KOREA_INVEST: "한국투자증권",
	MIRAE_ASSET: "미래에셋증권",
	NH_INVESTMENT: "NH투자증권",
	SAMSUNG: "삼성증권",
	TOSS: "토스증권",
	KIWOOM: "키움증권",
};
export const MARKETS = ["KR", "US"] as const;
export const ACCUMULATION_TYPES = ["AMOUNT", "SHARES"] as const;
export const ACCUMULATION_CURRENCIES = ["KRW", "USD"] as const;
export const EXPENSE_KINDS = [
	"FIXED",
	"VARIABLE",
	"CONSUMPTION",
	"INCOME",
] as const;
export const CADENCES = ["WEEKLY", "MONTHLY"] as const;
export const INSTALLMENT_BENEFIT_TYPES = [
	"INTEREST_RATE",
	"MATURITY_AMOUNT",
] as const;
export const INSTALLMENT_APPLY_MODES = ["TODAY", "NEXT_CYCLE"] as const;

export type Broker = (typeof BROKERS)[number];
export type Market = (typeof MARKETS)[number];
export type AccumulationType = (typeof ACCUMULATION_TYPES)[number];
export type AccumulationCurrency = (typeof ACCUMULATION_CURRENCIES)[number];
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];
export type Cadence = (typeof CADENCES)[number];
export type InstallmentBenefitType = (typeof INSTALLMENT_BENEFIT_TYPES)[number];
export type InstallmentApplyMode = (typeof INSTALLMENT_APPLY_MODES)[number];

export type FinanceOverview = {
	id: number;
	salary: number;
	actualSpent: number;
	realizedPnl: number;
	memo: string;
	tossDepositAmount: number;
	tossDepositCurrency: "KRW" | "USD";
	samsungDepositAmount: number;
	samsungDepositCurrency: "KRW" | "USD";
};

export type ExpenseItem = {
	id: number;
	kind: ExpenseKind;
	name: string;
	amount: number;
};

export type InstallmentSaving = {
	id: number;
	name: string;
	monthlyAmount: number;
	savedAmount: number;
	isRecurring: boolean;
	cadence: Cadence | null;
	runDay: number | null;
	applyMode: InstallmentApplyMode;
	recurringStartedAt: string | null;
	startDate: string;
	maturityDate: string | null;
	benefitType: InstallmentBenefitType;
	benefitValue: number;
};

export type InstallmentContributionLog = {
	id: number;
	installmentId: number;
	runDate: string;
	amount: number;
};

export type StockHolding = {
	id: number;
	broker: Broker;
	market: Market;
	symbol: string;
	name: string;
	quoteSymbol: string;
	quantity: number;
	averagePrice: number;
	isAccumulating: boolean;
	accumulationStartedAt: string | null;
	cadence: Cadence | null;
	runDay: number | null;
	accumulationType: AccumulationType;
	accumulationCurrency: AccumulationCurrency;
	accumulationValue: number;
};

export type StockAccumulationLog = {
	id: number;
	holdingId: number;
	runDate: string;
	localAmount: number;
	currency: "KRW" | "USD";
	fxRate: number | null;
	krwAmount: number;
};

export type StockQuote = {
	price: number;
	asOf: string;
};

export type SymbolSearchItem = {
	name: string;
	symbol: string;
	market: Market;
	exchange: string;
	quoteSymbol: string;
};
