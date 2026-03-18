import { assertSupabase } from "@/lib/supabase";
import type {
	AccumulationCurrency,
	AccumulationType,
	Broker,
	Cadence,
	ExpenseItem,
	ExpenseKind,
	FinanceOverview,
	InstallmentApplyMode,
	InstallmentBenefitType,
	InstallmentContributionLog,
	InstallmentSaving,
	Market,
	StockAccumulationLog,
	StockHolding,
} from "@/types/finance";

type OverviewRow = {
	id: number;
	salary: number;
	actual_spent: number;
	realized_pnl: number;
	toss_deposit_amount: number;
	toss_deposit_currency: "KRW" | "USD";
	samsung_deposit_amount: number;
	samsung_deposit_currency: "KRW" | "USD";
	user_code: string;
};

type ExpenseRow = {
	id: number;
	kind: ExpenseKind;
	name: string;
	amount: number;
	user_code: string;
};

type InstallmentRow = {
	id: number;
	name: string;
	monthly_amount: number;
	saved_amount: number | null;
	is_recurring: boolean | null;
	cadence: Cadence | null;
	run_day: number | null;
	apply_mode: InstallmentApplyMode | null;
	recurring_started_at: string | null;
	start_date: string;
	maturity_date: string | null;
	benefit_type: InstallmentBenefitType;
	benefit_value: number;
	user_code: string;
};

type InstallmentContributionLogRow = {
	id: number;
	installment_id: number;
	run_date: string;
	amount: number;
	user_code: string;
};

type HoldingRow = {
	id: number;
	broker: Broker;
	market: Market;
	symbol: string;
	name: string;
	quote_symbol: string;
	quantity: number;
	average_price: number;
	is_accumulating: boolean;
	accumulation_started_at: string | null;
	cadence: Cadence | null;
	run_day: number | null;
	accumulation_type: AccumulationType;
	accumulation_currency: AccumulationCurrency | null;
	accumulation_value: number;
	user_code: string;
};

type AccumulationLogRow = {
	id: number;
	holding_id: number;
	run_date: string;
	local_amount: number;
	currency: "KRW" | "USD";
	fx_rate: number | null;
	krw_amount: number;
	user_code: string;
};

export const LEGACY_USER_CODE = "LEGACY_OWNER";
export const LEGACY_YEAR_MONTH = "2026-03";

let activeUserCode: string | null = null;
let activeYearMonth: string | null = null;

function normalizeUserCode(userCode: string): string {
	return userCode.trim().toUpperCase();
}

function requireUserCode(): string {
	if (activeUserCode === null || activeUserCode.length === 0) {
		throw new Error("식별 번호 검증이 필요합니다.");
	}
	return activeUserCode;
}

function requireYearMonth(): string {
	if (activeYearMonth === null || !/^\d{4}-\d{2}$/.test(activeYearMonth)) {
		throw new Error("연/월 설정이 필요합니다.");
	}
	return activeYearMonth;
}

export function setActiveYearMonth(yearMonth: string) {
	activeYearMonth = yearMonth;
}

export function getActiveYearMonth(): string | null {
	return activeYearMonth;
}

export function getActiveUserCode(): string | null {
	return activeUserCode;
}

export function clearActiveUserCode() {
	activeUserCode = null;
}

export type SettlementOverviewSnapshot = {
	yearMonth: string;
	salary: number;
	actualSpent: number;
	realizedPnl: number;
};

export type SettlementExpenseSnapshot = {
	yearMonth: string;
	kind: ExpenseKind;
	amount: number;
};

export type SettlementInstallmentSnapshot = {
	yearMonth: string;
	name: string;
	monthlyAmount: number;
	savedAmount: number;
	isRecurring: boolean;
	cadence: Cadence | null;
	startDate: string;
	maturityDate: string | null;
};

export type SettlementHoldingSnapshot = {
	yearMonth: string;
	name: string;
	symbol: string;
	market: Market;
	quantity: number;
	averagePrice: number;
	isAccumulating: boolean;
	cadence: Cadence | null;
	accumulationType: AccumulationType;
	accumulationCurrency: AccumulationCurrency;
	accumulationValue: number;
};

export type SettlementDataset = {
	overviews: SettlementOverviewSnapshot[];
	expenses: SettlementExpenseSnapshot[];
	installments: SettlementInstallmentSnapshot[];
	holdings: SettlementHoldingSnapshot[];
};

async function migrateLegacyDataToUserCode(userCode: string): Promise<void> {
	const client = assertSupabase();

	const results = await Promise.all([
		client
			.from("finance_overview")
			.update({ user_code: userCode, year_month: LEGACY_YEAR_MONTH })
			.eq("user_code", LEGACY_USER_CODE),
		client
			.from("expense_items")
			.update({ user_code: userCode, year_month: LEGACY_YEAR_MONTH })
			.eq("user_code", LEGACY_USER_CODE),
		client
			.from("stock_holdings")
			.update({ user_code: userCode, year_month: LEGACY_YEAR_MONTH })
			.eq("user_code", LEGACY_USER_CODE),
		client
			.from("stock_accumulation_logs")
			.update({ user_code: userCode, year_month: LEGACY_YEAR_MONTH })
			.eq("user_code", LEGACY_USER_CODE),
		client
			.from("installment_savings")
			.update({ user_code: userCode, year_month: LEGACY_YEAR_MONTH })
			.eq("user_code", LEGACY_USER_CODE),
		client
			.from("installment_contribution_logs")
			.update({ user_code: userCode, year_month: LEGACY_YEAR_MONTH })
			.eq("user_code", LEGACY_USER_CODE),
	]);
	for (const result of results) {
		if (result.error !== null) {
			throw new Error(result.error.message);
		}
	}
}

export async function verifyAndActivateUserCode(
	inputCode: string,
): Promise<{ migrated: boolean }> {
	const client = assertSupabase();
	const userCode = normalizeUserCode(inputCode);
	if (userCode.length < 4) {
		throw new Error("식별 번호는 4자 이상 입력해주세요.");
	}

	const { data: ownOverviewRows, error: ownOverviewError } = await client
		.from("finance_overview")
		.select("id")
		.eq("user_code", userCode)
		.limit(1);
	if (ownOverviewError !== null) {
		throw new Error(ownOverviewError.message);
	}

	if ((ownOverviewRows ?? []).length > 0) {
		activeUserCode = userCode;
		return { migrated: false };
	}

	const { data: legacyOverviewRows, error: legacyOverviewError } = await client
		.from("finance_overview")
		.select("id")
		.eq("user_code", LEGACY_USER_CODE)
		.limit(1);
	if (legacyOverviewError !== null) {
		throw new Error(legacyOverviewError.message);
	}

	if ((legacyOverviewRows ?? []).length > 0) {
		await migrateLegacyDataToUserCode(userCode);
		activeUserCode = userCode;
		return { migrated: true };
	}

	const { data: anyOverview, error: anyOverviewError } = await client
		.from("finance_overview")
		.select("id")
		.limit(1);
	if (anyOverviewError !== null) {
		throw new Error(anyOverviewError.message);
	}

	if ((anyOverview ?? []).length > 0) {
		throw new Error("식별 번호가 일치하지 않습니다.");
	}

	const { error: createOverviewError } = await client
		.from("finance_overview")
		.insert({
			user_code: userCode,
			year_month: LEGACY_YEAR_MONTH,
			salary: 0,
			actual_spent: 0,
			realized_pnl: 0,
			toss_deposit_amount: 0,
			toss_deposit_currency: "KRW",
			samsung_deposit_amount: 0,
			samsung_deposit_currency: "KRW",
		});
	if (createOverviewError !== null) {
		throw new Error(createOverviewError.message);
	}

	activeUserCode = userCode;
	return { migrated: false };
}

function getPreviousYearMonth(yearMonth: string): string {
	const [yearText, monthText] = yearMonth.split("-");
	const year = Number.parseInt(yearText, 10);
	const month = Number.parseInt(monthText, 10);
	if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
		throw new Error("연/월 형식이 올바르지 않습니다.");
	}
	const prev = new Date(Date.UTC(year, month - 2, 1));
	const prevYear = prev.getUTCFullYear();
	const prevMonth = String(prev.getUTCMonth() + 1).padStart(2, "0");
	return `${prevYear}-${prevMonth}`;
}

export async function copyPreviousMonthData(): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const previousYearMonth = getPreviousYearMonth(yearMonth);

	const [
		{ data: currentOverview },
		{ data: currentExpenses },
		{ data: currentHoldings },
		{ data: currentInstallments },
	] = await Promise.all([
		client
			.from("finance_overview")
			.select(
				"id, salary, actual_spent, toss_deposit_amount, samsung_deposit_amount",
			)
			.eq("user_code", userCode)
			.eq("year_month", yearMonth)
			.maybeSingle<{
				id: number;
				salary: number;
				actual_spent: number;
				toss_deposit_amount: number;
				samsung_deposit_amount: number;
			}>(),
		client
			.from("expense_items")
			.select("id")
			.eq("user_code", userCode)
			.eq("year_month", yearMonth)
			.limit(1),
		client
			.from("stock_holdings")
			.select("id")
			.eq("user_code", userCode)
			.eq("year_month", yearMonth)
			.limit(1),
		client
			.from("installment_savings")
			.select("id")
			.eq("user_code", userCode)
			.eq("year_month", yearMonth)
			.limit(1),
	]);

	const hasCurrentData =
		(currentOverview !== null &&
			(currentOverview.salary !== 0 ||
				currentOverview.actual_spent !== 0 ||
				currentOverview.toss_deposit_amount !== 0 ||
				currentOverview.samsung_deposit_amount !== 0)) ||
		(currentExpenses ?? []).length > 0 ||
		(currentHoldings ?? []).length > 0 ||
		(currentInstallments ?? []).length > 0;
	if (hasCurrentData) {
		throw new Error(
			"이미 데이터가 있는 달입니다. 비어있는 달에서만 불러올 수 있습니다.",
		);
	}

	const [
		{ data: previousOverview },
		{ data: previousExpenses },
		{ data: previousHoldings },
		{ data: previousInstallments },
	] = await Promise.all([
		client
			.from("finance_overview")
			.select(
				"salary, toss_deposit_amount, toss_deposit_currency, samsung_deposit_amount, samsung_deposit_currency",
			)
			.eq("user_code", userCode)
			.eq("year_month", previousYearMonth)
			.maybeSingle<{
				salary: number;
				toss_deposit_amount: number;
				toss_deposit_currency: "KRW" | "USD";
				samsung_deposit_amount: number;
				samsung_deposit_currency: "KRW" | "USD";
			}>(),
		client
			.from("expense_items")
			.select("kind, name, amount")
			.eq("user_code", userCode)
			.eq("year_month", previousYearMonth)
			.returns<Array<{ kind: ExpenseKind; name: string; amount: number }>>(),
		client
			.from("stock_holdings")
			.select(
				"broker, market, symbol, name, quote_symbol, quantity, average_price, is_accumulating, accumulation_started_at, cadence, run_day, accumulation_type, accumulation_currency, accumulation_value",
			)
			.eq("user_code", userCode)
			.eq("year_month", previousYearMonth)
			.returns<
				Array<{
					broker: Broker;
					market: Market;
					symbol: string;
					name: string;
					quote_symbol: string;
					quantity: number;
					average_price: number;
					is_accumulating: boolean;
					accumulation_started_at: string | null;
					cadence: Cadence | null;
					run_day: number | null;
					accumulation_type: AccumulationType;
					accumulation_currency: AccumulationCurrency | null;
					accumulation_value: number;
				}>
			>(),
		client
			.from("installment_savings")
			.select(
				"name, monthly_amount, saved_amount, is_recurring, cadence, run_day, apply_mode, recurring_started_at, start_date, maturity_date, benefit_type, benefit_value",
			)
			.eq("user_code", userCode)
			.eq("year_month", previousYearMonth)
			.returns<
				Array<{
					name: string;
					monthly_amount: number;
					saved_amount: number;
					is_recurring: boolean;
					cadence: Cadence | null;
					run_day: number | null;
					apply_mode: InstallmentApplyMode;
					recurring_started_at: string | null;
					start_date: string;
					maturity_date: string | null;
					benefit_type: InstallmentBenefitType;
					benefit_value: number;
				}>
			>(),
	]);

	if (
		previousOverview === null &&
		(previousExpenses ?? []).length === 0 &&
		(previousHoldings ?? []).length === 0 &&
		(previousInstallments ?? []).length === 0
	) {
		throw new Error("직전 월 데이터가 없습니다.");
	}

	if (previousOverview !== null) {
		const { error } = await client.from("finance_overview").insert({
			user_code: userCode,
			year_month: yearMonth,
			salary: previousOverview.salary,
			actual_spent: 0,
			realized_pnl: 0,
			toss_deposit_amount: previousOverview.toss_deposit_amount,
			toss_deposit_currency: previousOverview.toss_deposit_currency,
			samsung_deposit_amount: previousOverview.samsung_deposit_amount,
			samsung_deposit_currency: previousOverview.samsung_deposit_currency,
		});
		if (error !== null) {
			throw new Error(error.message);
		}
	}

	if ((previousExpenses ?? []).length > 0) {
		const { error } = await client.from("expense_items").insert(
			(previousExpenses ?? []).map((row) => ({
				user_code: userCode,
				year_month: yearMonth,
				kind: row.kind,
				name: row.name,
				amount: row.amount,
			})),
		);
		if (error !== null) {
			throw new Error(error.message);
		}
	}

	if ((previousHoldings ?? []).length > 0) {
		const { error } = await client.from("stock_holdings").insert(
			(previousHoldings ?? []).map((row) => ({
				user_code: userCode,
				year_month: yearMonth,
				broker: row.broker,
				market: row.market,
				symbol: row.symbol,
				name: row.name,
				quote_symbol: row.quote_symbol,
				quantity: row.quantity,
				average_price: row.average_price,
				is_accumulating: row.is_accumulating,
				accumulation_started_at: row.accumulation_started_at,
				cadence: row.cadence,
				run_day: row.run_day,
				accumulation_type: row.accumulation_type,
				accumulation_currency: row.accumulation_currency,
				accumulation_value: row.accumulation_value,
			})),
		);
		if (error !== null) {
			throw new Error(error.message);
		}
	}

	if ((previousInstallments ?? []).length > 0) {
		const { error } = await client.from("installment_savings").insert(
			(previousInstallments ?? []).map((row) => ({
				user_code: userCode,
				year_month: yearMonth,
				name: row.name,
				monthly_amount: row.monthly_amount,
				saved_amount: row.saved_amount,
				is_recurring: row.is_recurring,
				cadence: row.cadence,
				run_day: row.run_day,
				apply_mode: row.apply_mode,
				recurring_started_at: row.recurring_started_at,
				start_date: row.start_date,
				maturity_date: row.maturity_date,
				benefit_type: row.benefit_type,
				benefit_value: row.benefit_value,
			})),
		);
		if (error !== null) {
			throw new Error(error.message);
		}
	}
}

export type SectionYearMonthCopyTarget =
	| "FIXED_EXPENSE"
	| "VARIABLE_EXPENSE"
	| "STOCK_HOLDINGS"
	| "INSTALLMENTS";

function normalizeYearMonthInput(value: string): string {
	const trimmed = value.trim();
	const match = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
	if (match === null) {
		throw new Error("연/월 형식이 올바르지 않습니다. (YYYY-MM)");
	}
	const year = match[1];
	const monthNumber = Number.parseInt(match[2], 10);
	if (Number.isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) {
		throw new Error("월은 1~12 사이여야 합니다.");
	}
	return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

export async function copySectionDataFromYearMonth(
	sourceYearMonthInput: string,
	target: SectionYearMonthCopyTarget,
): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const targetYearMonth = requireYearMonth();
	const sourceYearMonth = normalizeYearMonthInput(sourceYearMonthInput);

	if (sourceYearMonth === targetYearMonth) {
		throw new Error("현재 선택 월과 동일한 연월은 불러올 수 없습니다.");
	}

	if (target === "FIXED_EXPENSE" || target === "VARIABLE_EXPENSE") {
		const kind: ExpenseKind = target === "FIXED_EXPENSE" ? "FIXED" : "VARIABLE";
		const { data: sourceRows, error: sourceError } = await client
			.from("expense_items")
			.select("name, amount")
			.eq("user_code", userCode)
			.eq("year_month", sourceYearMonth)
			.eq("kind", kind)
			.returns<Array<{ name: string; amount: number }>>();
		if (sourceError !== null) {
			throw new Error(sourceError.message);
		}
		if ((sourceRows ?? []).length === 0) {
			throw new Error("해당 연월에 불러올 지출 데이터가 없습니다.");
		}

		const { error: deleteError } = await client
			.from("expense_items")
			.delete()
			.eq("user_code", userCode)
			.eq("year_month", targetYearMonth)
			.eq("kind", kind);
		if (deleteError !== null) {
			throw new Error(deleteError.message);
		}

		const { error: insertError } = await client.from("expense_items").insert(
			(sourceRows ?? []).map((row) => ({
				user_code: userCode,
				year_month: targetYearMonth,
				kind,
				name: row.name,
				amount: row.amount,
			})),
		);
		if (insertError !== null) {
			throw new Error(insertError.message);
		}
		return;
	}

	if (target === "STOCK_HOLDINGS") {
		const { data: sourceRows, error: sourceError } = await client
			.from("stock_holdings")
			.select(
				"broker, market, symbol, name, quote_symbol, quantity, average_price, is_accumulating, accumulation_started_at, cadence, run_day, accumulation_type, accumulation_currency, accumulation_value",
			)
			.eq("user_code", userCode)
			.eq("year_month", sourceYearMonth)
			.returns<
				Array<{
					broker: Broker;
					market: Market;
					symbol: string;
					name: string;
					quote_symbol: string;
					quantity: number;
					average_price: number;
					is_accumulating: boolean;
					accumulation_started_at: string | null;
					cadence: Cadence | null;
					run_day: number | null;
					accumulation_type: AccumulationType;
					accumulation_currency: AccumulationCurrency | null;
					accumulation_value: number;
				}>
			>();
		if (sourceError !== null) {
			throw new Error(sourceError.message);
		}
		if ((sourceRows ?? []).length === 0) {
			throw new Error("해당 연월에 불러올 주식 데이터가 없습니다.");
		}

		const { error: deleteError } = await client
			.from("stock_holdings")
			.delete()
			.eq("user_code", userCode)
			.eq("year_month", targetYearMonth);
		if (deleteError !== null) {
			throw new Error(deleteError.message);
		}

		const { error: insertError } = await client.from("stock_holdings").insert(
			(sourceRows ?? []).map((row) => ({
				user_code: userCode,
				year_month: targetYearMonth,
				broker: row.broker,
				market: row.market,
				symbol: row.symbol,
				name: row.name,
				quote_symbol: row.quote_symbol,
				quantity: row.quantity,
				average_price: row.average_price,
				is_accumulating: row.is_accumulating,
				accumulation_started_at: row.accumulation_started_at,
				cadence: row.cadence,
				run_day: row.run_day,
				accumulation_type: row.accumulation_type,
				accumulation_currency: row.accumulation_currency,
				accumulation_value: row.accumulation_value,
			})),
		);
		if (insertError !== null) {
			throw new Error(insertError.message);
		}
		return;
	}

	const { data: sourceRows, error: sourceError } = await client
		.from("installment_savings")
		.select(
			"name, monthly_amount, saved_amount, is_recurring, cadence, run_day, apply_mode, recurring_started_at, start_date, maturity_date, benefit_type, benefit_value",
		)
		.eq("user_code", userCode)
		.eq("year_month", sourceYearMonth)
		.returns<
			Array<{
				name: string;
				monthly_amount: number;
				saved_amount: number;
				is_recurring: boolean;
				cadence: Cadence | null;
				run_day: number | null;
				apply_mode: InstallmentApplyMode;
				recurring_started_at: string | null;
				start_date: string;
				maturity_date: string | null;
				benefit_type: InstallmentBenefitType;
				benefit_value: number;
			}>
		>();
	if (sourceError !== null) {
		throw new Error(sourceError.message);
	}
	if ((sourceRows ?? []).length === 0) {
		throw new Error("해당 연월에 불러올 적금 데이터가 없습니다.");
	}

	const { error: deleteError } = await client
		.from("installment_savings")
		.delete()
		.eq("user_code", userCode)
		.eq("year_month", targetYearMonth);
	if (deleteError !== null) {
		throw new Error(deleteError.message);
	}

	const { error: insertError } = await client
		.from("installment_savings")
		.insert(
			(sourceRows ?? []).map((row) => ({
				user_code: userCode,
				year_month: targetYearMonth,
				name: row.name,
				monthly_amount: row.monthly_amount,
				saved_amount: row.saved_amount,
				is_recurring: row.is_recurring,
				cadence: row.cadence,
				run_day: row.run_day,
				apply_mode: row.apply_mode,
				recurring_started_at: row.recurring_started_at,
				start_date: row.start_date,
				maturity_date: row.maturity_date,
				benefit_type: row.benefit_type,
				benefit_value: row.benefit_value,
			})),
		);
	if (insertError !== null) {
		throw new Error(insertError.message);
	}
}

function mapOverview(row: OverviewRow): FinanceOverview {
	return {
		id: row.id,
		salary: row.salary,
		actualSpent: row.actual_spent,
		realizedPnl: row.realized_pnl,
		tossDepositAmount: row.toss_deposit_amount,
		tossDepositCurrency: row.toss_deposit_currency,
		samsungDepositAmount: row.samsung_deposit_amount,
		samsungDepositCurrency: row.samsung_deposit_currency,
	};
}

function mapExpense(row: ExpenseRow): ExpenseItem {
	return {
		id: row.id,
		kind: row.kind,
		name: row.name,
		amount: row.amount,
	};
}

function mapInstallment(row: InstallmentRow): InstallmentSaving {
	return {
		id: row.id,
		name: row.name,
		monthlyAmount: row.monthly_amount,
		savedAmount: row.saved_amount ?? 0,
		isRecurring: row.is_recurring ?? row.monthly_amount > 0,
		cadence: row.cadence ?? (row.monthly_amount > 0 ? "MONTHLY" : null),
		runDay: row.run_day ?? (row.monthly_amount > 0 ? 1 : null),
		applyMode: row.apply_mode ?? "TODAY",
		recurringStartedAt: row.recurring_started_at,
		startDate: row.start_date,
		maturityDate: row.maturity_date,
		benefitType: row.benefit_type,
		benefitValue: row.benefit_value,
	};
}

function mapInstallmentContributionLog(
	row: InstallmentContributionLogRow,
): InstallmentContributionLog {
	return {
		id: row.id,
		installmentId: row.installment_id,
		runDate: row.run_date,
		amount: row.amount,
	};
}

function mapHolding(row: HoldingRow): StockHolding {
	return {
		id: row.id,
		broker: row.broker,
		market: row.market,
		symbol: row.symbol,
		name: row.name,
		quoteSymbol: row.quote_symbol,
		quantity: row.quantity,
		averagePrice: row.average_price,
		isAccumulating: row.is_accumulating,
		accumulationStartedAt: row.accumulation_started_at,
		cadence: row.cadence,
		runDay: row.run_day,
		accumulationType: row.accumulation_type,
		accumulationCurrency:
			row.accumulation_currency ?? (row.market === "US" ? "USD" : "KRW"),
		accumulationValue: row.accumulation_value,
	};
}

function mapAccumulationLog(row: AccumulationLogRow): StockAccumulationLog {
	return {
		id: row.id,
		holdingId: row.holding_id,
		runDate: row.run_date,
		localAmount: row.local_amount,
		currency: row.currency,
		fxRate: row.fx_rate,
		krwAmount: row.krw_amount,
	};
}

export async function fetchOverview(): Promise<FinanceOverview> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("finance_overview")
		.select(
			"id, salary, actual_spent, realized_pnl, toss_deposit_amount, toss_deposit_currency, samsung_deposit_amount, samsung_deposit_currency, user_code",
		)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth)
		.maybeSingle<OverviewRow>();

	if (error !== null) {
		throw new Error(error.message);
	}

	if (data !== null) {
		return mapOverview(data);
	}

	const { data: inserted, error: insertError } = await client
		.from("finance_overview")
		.insert({ user_code: userCode, year_month: yearMonth })
		.select(
			"id, salary, actual_spent, realized_pnl, toss_deposit_amount, toss_deposit_currency, samsung_deposit_amount, samsung_deposit_currency, user_code",
		)
		.single<OverviewRow>();

	if (insertError !== null) {
		throw new Error(insertError.message);
	}

	return mapOverview(inserted);
}

export async function saveOverview(
	input: Omit<FinanceOverview, "id">,
): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client.from("finance_overview").upsert(
		{
			user_code: userCode,
			year_month: yearMonth,
			salary: input.salary,
			actual_spent: input.actualSpent,
			realized_pnl: input.realizedPnl,
			toss_deposit_amount: input.tossDepositAmount,
			toss_deposit_currency: input.tossDepositCurrency,
			samsung_deposit_amount: input.samsungDepositAmount,
			samsung_deposit_currency: input.samsungDepositCurrency,
		},
		{
			onConflict: "user_code,year_month",
		},
	);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchExpenseItems(): Promise<ExpenseItem[]> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("expense_items")
		.select("id, kind, name, amount, user_code")
		.eq("user_code", userCode)
		.eq("year_month", yearMonth)
		.order("kind", { ascending: true })
		.order("created_at", { ascending: true })
		.returns<ExpenseRow[]>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return (data ?? []).map(mapExpense);
}

export async function insertExpenseItem(
	input: Omit<ExpenseItem, "id">,
): Promise<ExpenseItem> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("expense_items")
		.insert({
			kind: input.kind,
			name: input.name,
			amount: input.amount,
			user_code: userCode,
			year_month: yearMonth,
		})
		.select("id, kind, name, amount, user_code")
		.single<ExpenseRow>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return mapExpense(data);
}

export async function updateExpenseItem(
	id: number,
	input: Omit<ExpenseItem, "id">,
): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client
		.from("expense_items")
		.update({
			kind: input.kind,
			name: input.name,
			amount: input.amount,
		})
		.eq("id", id)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteExpenseItem(id: number): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client
		.from("expense_items")
		.delete()
		.eq("id", id)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth);
	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchInstallments(): Promise<InstallmentSaving[]> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("installment_savings")
		.select(
			"id, name, monthly_amount, saved_amount, is_recurring, cadence, run_day, apply_mode, recurring_started_at, start_date, maturity_date, benefit_type, benefit_value, user_code",
		)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth)
		.order("created_at", { ascending: true })
		.returns<InstallmentRow[]>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return (data ?? []).map(mapInstallment);
}

export async function insertInstallment(
	input: Omit<InstallmentSaving, "id">,
): Promise<InstallmentSaving> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("installment_savings")
		.insert({
			name: input.name,
			monthly_amount: input.monthlyAmount,
			saved_amount: input.savedAmount,
			is_recurring: input.isRecurring,
			cadence: input.cadence,
			run_day: input.runDay,
			apply_mode: input.applyMode,
			recurring_started_at: input.recurringStartedAt,
			start_date: input.startDate,
			maturity_date: input.maturityDate,
			benefit_type: input.benefitType,
			benefit_value: input.benefitValue,
			user_code: userCode,
			year_month: yearMonth,
		})
		.select(
			"id, name, monthly_amount, saved_amount, is_recurring, cadence, run_day, apply_mode, recurring_started_at, start_date, maturity_date, benefit_type, benefit_value, user_code",
		)
		.single<InstallmentRow>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return mapInstallment(data);
}

export async function updateInstallment(
	id: number,
	input: Omit<InstallmentSaving, "id">,
): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client
		.from("installment_savings")
		.update({
			name: input.name,
			monthly_amount: input.monthlyAmount,
			saved_amount: input.savedAmount,
			is_recurring: input.isRecurring,
			cadence: input.cadence,
			run_day: input.runDay,
			apply_mode: input.applyMode,
			recurring_started_at: input.recurringStartedAt,
			start_date: input.startDate,
			maturity_date: input.maturityDate,
			benefit_type: input.benefitType,
			benefit_value: input.benefitValue,
		})
		.eq("id", id)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteInstallment(id: number): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client
		.from("installment_savings")
		.delete()
		.eq("id", id)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth);
	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchInstallmentContributionLogsByDateRange(
	fromDate: string,
	toDate: string,
): Promise<InstallmentContributionLog[]> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("installment_contribution_logs")
		.select("id, installment_id, run_date, amount, user_code")
		.eq("user_code", userCode)
		.eq("year_month", yearMonth)
		.gte("run_date", fromDate)
		.lte("run_date", toDate)
		.order("run_date", { ascending: true })
		.returns<InstallmentContributionLogRow[]>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return (data ?? []).map(mapInstallmentContributionLog);
}

export async function upsertInstallmentContributionLogs(
	logs: Omit<InstallmentContributionLog, "id">[],
): Promise<void> {
	if (logs.length === 0) {
		return;
	}
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client.from("installment_contribution_logs").upsert(
		logs.map((log) => ({
			installment_id: log.installmentId,
			run_date: log.runDate,
			amount: log.amount,
			user_code: userCode,
			year_month: yearMonth,
		})),
		{
			onConflict: "installment_id,run_date,user_code,year_month",
		},
	);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchHoldings(): Promise<StockHolding[]> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("stock_holdings")
		.select(
			"id, broker, market, symbol, name, quote_symbol, quantity, average_price, is_accumulating, accumulation_started_at, cadence, run_day, accumulation_type, accumulation_currency, accumulation_value, user_code",
		)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth)
		.order("broker", { ascending: true })
		.order("created_at", { ascending: true })
		.returns<HoldingRow[]>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return (data ?? []).map(mapHolding);
}

export async function insertHolding(
	input: Omit<StockHolding, "id">,
): Promise<StockHolding> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("stock_holdings")
		.insert({
			broker: input.broker,
			market: input.market,
			symbol: input.symbol,
			name: input.name,
			quote_symbol: input.quoteSymbol,
			quantity: input.quantity,
			average_price: input.averagePrice,
			is_accumulating: input.isAccumulating,
			accumulation_started_at: input.accumulationStartedAt,
			cadence: input.cadence,
			run_day: input.runDay,
			accumulation_type: input.accumulationType,
			accumulation_currency: input.accumulationCurrency,
			accumulation_value: input.accumulationValue,
			user_code: userCode,
			year_month: yearMonth,
		})
		.select(
			"id, broker, market, symbol, name, quote_symbol, quantity, average_price, is_accumulating, accumulation_started_at, cadence, run_day, accumulation_type, accumulation_currency, accumulation_value, user_code",
		)
		.single<HoldingRow>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return mapHolding(data);
}

export async function updateHolding(
	id: number,
	input: Omit<StockHolding, "id">,
): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client
		.from("stock_holdings")
		.update({
			broker: input.broker,
			market: input.market,
			symbol: input.symbol,
			name: input.name,
			quote_symbol: input.quoteSymbol,
			quantity: input.quantity,
			average_price: input.averagePrice,
			is_accumulating: input.isAccumulating,
			accumulation_started_at: input.accumulationStartedAt,
			cadence: input.cadence,
			run_day: input.runDay,
			accumulation_type: input.accumulationType,
			accumulation_currency: input.accumulationCurrency,
			accumulation_value: input.accumulationValue,
		})
		.eq("id", id)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchAccumulationLogsByDateRange(
	fromDate: string,
	toDate: string,
): Promise<StockAccumulationLog[]> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { data, error } = await client
		.from("stock_accumulation_logs")
		.select(
			"id, holding_id, run_date, local_amount, currency, fx_rate, krw_amount, user_code",
		)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth)
		.gte("run_date", fromDate)
		.lte("run_date", toDate)
		.order("run_date", { ascending: true })
		.returns<AccumulationLogRow[]>();

	if (error !== null) {
		throw new Error(error.message);
	}

	return (data ?? []).map(mapAccumulationLog);
}

export async function upsertAccumulationLogs(
	logs: Omit<StockAccumulationLog, "id">[],
): Promise<void> {
	if (logs.length === 0) {
		return;
	}
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client.from("stock_accumulation_logs").upsert(
		logs.map((log) => ({
			holding_id: log.holdingId,
			run_date: log.runDate,
			local_amount: log.localAmount,
			currency: log.currency,
			fx_rate: log.fxRate,
			krw_amount: log.krwAmount,
			user_code: userCode,
			year_month: yearMonth,
		})),
		{
			onConflict: "holding_id,run_date,user_code,year_month",
		},
	);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteHolding(id: number): Promise<void> {
	const client = assertSupabase();
	const userCode = requireUserCode();
	const yearMonth = requireYearMonth();
	const { error } = await client
		.from("stock_holdings")
		.delete()
		.eq("id", id)
		.eq("user_code", userCode)
		.eq("year_month", yearMonth);
	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchSettlementDataset(): Promise<SettlementDataset> {
	const client = assertSupabase();
	const userCode = requireUserCode();

	const [
		{ data: overviews, error: overviewError },
		{ data: expenses, error: expenseError },
		{ data: installments, error: installmentError },
		{ data: holdings, error: holdingError },
	] = await Promise.all([
		client
			.from("finance_overview")
			.select("year_month, salary, actual_spent, realized_pnl")
			.eq("user_code", userCode)
			.order("year_month", { ascending: true })
			.returns<
				Array<{
					year_month: string;
					salary: number;
					actual_spent: number;
					realized_pnl: number;
				}>
			>(),
		client
			.from("expense_items")
			.select("year_month, kind, amount")
			.eq("user_code", userCode)
			.order("year_month", { ascending: true })
			.returns<
				Array<{ year_month: string; kind: ExpenseKind; amount: number }>
			>(),
		client
			.from("installment_savings")
			.select(
				"year_month, name, monthly_amount, saved_amount, is_recurring, cadence, start_date, maturity_date",
			)
			.eq("user_code", userCode)
			.order("year_month", { ascending: true })
			.returns<
				Array<{
					year_month: string;
					name: string;
					monthly_amount: number;
					saved_amount: number;
					is_recurring: boolean;
					cadence: Cadence | null;
					start_date: string;
					maturity_date: string | null;
				}>
			>(),
		client
			.from("stock_holdings")
			.select(
				"year_month, name, symbol, market, quantity, average_price, is_accumulating, cadence, accumulation_type, accumulation_currency, accumulation_value",
			)
			.eq("user_code", userCode)
			.order("year_month", { ascending: true })
			.returns<
				Array<{
					year_month: string;
					name: string;
					symbol: string;
					market: Market;
					quantity: number;
					average_price: number;
					is_accumulating: boolean;
					cadence: Cadence | null;
					accumulation_type: AccumulationType;
					accumulation_currency: AccumulationCurrency | null;
					accumulation_value: number;
				}>
			>(),
	]);

	if (overviewError !== null) {
		throw new Error(overviewError.message);
	}
	if (expenseError !== null) {
		throw new Error(expenseError.message);
	}
	if (installmentError !== null) {
		throw new Error(installmentError.message);
	}
	if (holdingError !== null) {
		throw new Error(holdingError.message);
	}

	return {
		overviews: (overviews ?? []).map((row) => ({
			yearMonth: row.year_month,
			salary: row.salary,
			actualSpent: row.actual_spent,
			realizedPnl: row.realized_pnl,
		})),
		expenses: (expenses ?? []).map((row) => ({
			yearMonth: row.year_month,
			kind: row.kind,
			amount: row.amount,
		})),
		installments: (installments ?? []).map((row) => ({
			yearMonth: row.year_month,
			name: row.name,
			monthlyAmount: row.monthly_amount,
			savedAmount: row.saved_amount,
			isRecurring: row.is_recurring,
			cadence: row.cadence,
			startDate: row.start_date,
			maturityDate: row.maturity_date,
		})),
		holdings: (holdings ?? []).map((row) => ({
			yearMonth: row.year_month,
			name: row.name,
			symbol: row.symbol,
			market: row.market,
			quantity: row.quantity,
			averagePrice: row.average_price,
			isAccumulating: row.is_accumulating,
			cadence: row.cadence,
			accumulationType: row.accumulation_type,
			accumulationCurrency:
				row.accumulation_currency ?? (row.market === "US" ? "USD" : "KRW"),
			accumulationValue: row.accumulation_value,
		})),
	};
}
