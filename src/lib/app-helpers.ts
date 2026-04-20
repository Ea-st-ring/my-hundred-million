import { clampPercent } from "@/lib/format";
import type { Cadence, StockHolding } from "@/types/finance";

const QUOTE_CACHE_STORAGE_KEY = "my-hundred-million.quote-cache.v1";

export const QUOTE_CACHE_TTL_MS = 30 * 60 * 1000;

export type CsvRow = Array<string | number | null | undefined>;

type CachedQuoteEntry = {
	price: number;
	asOf: string;
	cachedAt: number;
};

export type QuoteCacheStore = Record<string, CachedQuoteEntry>;

export function downloadCsvFile(fileName: string, rows: CsvRow[]) {
	const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
	const blob = new Blob([`\uFEFF${csv}`], {
		type: "text/csv;charset=utf-8;",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) {
		return "";
	}
	const normalized = String(value)
		.replaceAll("\r\n", "\n")
		.replaceAll("\r", "\n");
	if (
		normalized.includes(",") ||
		normalized.includes('"') ||
		normalized.includes("\n")
	) {
		return `"${normalized.replaceAll('"', '""')}"`;
	}
	return normalized;
}

export function isValidInstallmentBenefit(draft: {
	benefitType: "INTEREST_RATE" | "MATURITY_AMOUNT";
	benefitValue: number;
}): boolean {
	if (draft.benefitType === "INTEREST_RATE") {
		return draft.benefitValue >= 0;
	}
	return draft.benefitValue > 0;
}

export function isValidRecurringInstallmentConfig(draft: {
	isRecurring: boolean;
	monthlyAmount: number;
	runDay: number;
	cadence: Cadence;
}): boolean {
	if (!draft.isRecurring) {
		return true;
	}
	if (draft.monthlyAmount <= 0) {
		return false;
	}
	const normalizedRunDay = clampRunDay(draft.runDay, draft.cadence);
	if (draft.cadence === "WEEKLY") {
		return normalizedRunDay >= 1 && normalizedRunDay <= 7;
	}
	return normalizedRunDay >= 1 && normalizedRunDay <= 31;
}

export function toYearMonthInput(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	return `${year}-${month}`;
}

export function getPreviousYearMonthInput(yearMonth: string): string {
	const [yearText, monthText] = yearMonth.split("-");
	const year = Number.parseInt(yearText, 10);
	const month = Number.parseInt(monthText, 10);
	if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
		return toYearMonthInput(new Date());
	}
	return toYearMonthInput(new Date(year, month - 2, 1));
}

export function parseYearMonthFromSearch(search: string): string | null {
	const params = new URLSearchParams(search);
	const year = params.get("year");
	const month = params.get("month");
	if (year === null || month === null) {
		return null;
	}
	if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
		return null;
	}
	const monthNumber = Number.parseInt(month, 10);
	if (Number.isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) {
		return null;
	}
	return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

export function getInitialYearMonthFromQuery(): string {
	if (typeof window === "undefined") {
		return toYearMonthInput(new Date());
	}
	return (
		parseYearMonthFromSearch(window.location.search) ??
		toYearMonthInput(new Date())
	);
}

export function parseYearMonth(yearMonth: string): {
	year: number;
	month: number;
} {
	const [yearText, monthText] = yearMonth.split("-");
	const year = Number.parseInt(yearText, 10);
	const month = Number.parseInt(monthText, 10);
	if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() + 1 };
	}
	return { year, month };
}

export function getYearMonthDateRange(yearMonth: string) {
	const { year, month } = parseYearMonth(yearMonth);
	const start = new Date(year, month - 1, 1);
	const end = new Date(year, month, 0);
	return {
		fromDate: toDateInput(start),
		toDate: toDateInput(end),
	};
}

export function getWeekdayLabel(value: number): string {
	const map: Record<number, string> = {
		1: "월",
		2: "화",
		3: "수",
		4: "목",
		5: "금",
		6: "토",
		7: "일",
	};
	return map[Math.min(Math.max(1, value), 7)] ?? "월";
}

export function clampRunDay(runDay: number, cadence: Cadence): number {
	if (cadence === "WEEKLY") {
		return Math.min(Math.max(1, runDay), 7);
	}
	return Math.min(Math.max(1, runDay), 31);
}

export function calcDateProgress(
	startDate: string,
	endDate: string | null,
): number {
	if (endDate === null) {
		return 0;
	}
	const start = new Date(startDate);
	const end = new Date(endDate);
	const total = end.getTime() - start.getTime();
	if (Number.isNaN(total) || total <= 0) {
		return 0;
	}
	const elapsed = Date.now() - start.getTime();
	return clampPercent((elapsed / total) * 100);
}

export function toDateInput(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function extractError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "알 수 없는 오류가 발생했습니다.";
}

export function buildHoldingQuoteCacheKey(holding: StockHolding): string {
	const symbol = holding.symbol.trim().toUpperCase();
	const quoteSymbol = holding.quoteSymbol.trim().toUpperCase();
	return `${holding.market}:${quoteSymbol.length > 0 ? quoteSymbol : symbol}`;
}

export function readQuoteCache(): QuoteCacheStore {
	if (typeof window === "undefined") {
		return {};
	}
	try {
		const raw = window.localStorage.getItem(QUOTE_CACHE_STORAGE_KEY);
		if (raw === null) {
			return {};
		}
		const parsed = JSON.parse(raw) as unknown;
		if (parsed === null || typeof parsed !== "object") {
			return {};
		}
		const result: QuoteCacheStore = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (
				value === null ||
				typeof value !== "object" ||
				!("price" in value) ||
				!("asOf" in value) ||
				!("cachedAt" in value)
			) {
				continue;
			}
			const price = (value as { price: unknown }).price;
			const asOf = (value as { asOf: unknown }).asOf;
			const cachedAt = (value as { cachedAt: unknown }).cachedAt;
			if (
				typeof price !== "number" ||
				typeof asOf !== "string" ||
				typeof cachedAt !== "number"
			) {
				continue;
			}
			result[key] = { price, asOf, cachedAt };
		}
		return result;
	} catch {
		return {};
	}
}

export function writeQuoteCache(cache: QuoteCacheStore): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(QUOTE_CACHE_STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// ignore cache write failures
	}
}
