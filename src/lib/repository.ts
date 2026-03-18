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
};

type ExpenseRow = {
	id: number;
	kind: ExpenseKind;
	name: string;
	amount: number;
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
};

type InstallmentContributionLogRow = {
	id: number;
	installment_id: number;
	run_date: string;
	amount: number;
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
};

type AccumulationLogRow = {
	id: number;
	holding_id: number;
	run_date: string;
	local_amount: number;
	currency: "KRW" | "USD";
	fx_rate: number | null;
	krw_amount: number;
};

function mapOverview(row: OverviewRow): FinanceOverview {
	return {
		id: row.id,
		salary: row.salary,
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
	const { data, error } = await client
		.from("finance_overview")
		.select("id, salary")
		.eq("id", 1)
		.maybeSingle<OverviewRow>();

	if (error !== null) {
		throw new Error(error.message);
	}

	if (data !== null) {
		return mapOverview(data);
	}

	const { data: inserted, error: insertError } = await client
		.from("finance_overview")
		.insert({ id: 1 })
		.select("id, salary")
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
	const { error } = await client.from("finance_overview").upsert({
		id: 1,
		salary: input.salary,
	});

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchExpenseItems(): Promise<ExpenseItem[]> {
	const client = assertSupabase();
	const { data, error } = await client
		.from("expense_items")
		.select("id, kind, name, amount")
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
	const { data, error } = await client
		.from("expense_items")
		.insert({
			kind: input.kind,
			name: input.name,
			amount: input.amount,
		})
		.select("id, kind, name, amount")
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
	const { error } = await client
		.from("expense_items")
		.update({
			kind: input.kind,
			name: input.name,
			amount: input.amount,
		})
		.eq("id", id);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteExpenseItem(id: number): Promise<void> {
	const client = assertSupabase();
	const { error } = await client.from("expense_items").delete().eq("id", id);
	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchInstallments(): Promise<InstallmentSaving[]> {
	const client = assertSupabase();
	const { data, error } = await client
		.from("installment_savings")
		.select(
			"id, name, monthly_amount, saved_amount, is_recurring, cadence, run_day, apply_mode, recurring_started_at, start_date, maturity_date, benefit_type, benefit_value",
		)
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
		})
		.select(
			"id, name, monthly_amount, saved_amount, is_recurring, cadence, run_day, apply_mode, recurring_started_at, start_date, maturity_date, benefit_type, benefit_value",
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
		.eq("id", id);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteInstallment(id: number): Promise<void> {
	const client = assertSupabase();
	const { error } = await client
		.from("installment_savings")
		.delete()
		.eq("id", id);
	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchInstallmentContributionLogsByDateRange(
	fromDate: string,
	toDate: string,
): Promise<InstallmentContributionLog[]> {
	const client = assertSupabase();
	const { data, error } = await client
		.from("installment_contribution_logs")
		.select("id, installment_id, run_date, amount")
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
	const { error } = await client.from("installment_contribution_logs").upsert(
		logs.map((log) => ({
			installment_id: log.installmentId,
			run_date: log.runDate,
			amount: log.amount,
		})),
		{
			onConflict: "installment_id,run_date",
		},
	);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchHoldings(): Promise<StockHolding[]> {
	const client = assertSupabase();
	const { data, error } = await client
		.from("stock_holdings")
		.select(
			"id, broker, market, symbol, name, quote_symbol, quantity, average_price, is_accumulating, accumulation_started_at, cadence, run_day, accumulation_type, accumulation_currency, accumulation_value",
		)
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
		})
		.select(
			"id, broker, market, symbol, name, quote_symbol, quantity, average_price, is_accumulating, accumulation_started_at, cadence, run_day, accumulation_type, accumulation_currency, accumulation_value",
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
		.eq("id", id);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function fetchAccumulationLogsByDateRange(
	fromDate: string,
	toDate: string,
): Promise<StockAccumulationLog[]> {
	const client = assertSupabase();
	const { data, error } = await client
		.from("stock_accumulation_logs")
		.select(
			"id, holding_id, run_date, local_amount, currency, fx_rate, krw_amount",
		)
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
	const { error } = await client.from("stock_accumulation_logs").upsert(
		logs.map((log) => ({
			holding_id: log.holdingId,
			run_date: log.runDate,
			local_amount: log.localAmount,
			currency: log.currency,
			fx_rate: log.fxRate,
			krw_amount: log.krwAmount,
		})),
		{
			onConflict: "holding_id,run_date",
		},
	);

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteHolding(id: number): Promise<void> {
	const client = assertSupabase();
	const { error } = await client.from("stock_holdings").delete().eq("id", id);
	if (error !== null) {
		throw new Error(error.message);
	}
}
