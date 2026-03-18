import { assertSupabase, hasSupabaseEnv } from "@/lib/supabase";
import type { Market, StockQuote, SymbolSearchItem } from "@/types/finance";

type TwelveDataSearchRow = {
	symbol: string;
	instrument_name?: string;
	exchange?: string;
	country?: string;
};

type TwelveDataSearchResponse = {
	data?: TwelveDataSearchRow[];
};

type TwelveDataPriceResponse = {
	price?: string;
	code?: number;
	message?: string;
};

type FmpSearchRow = {
	symbol?: string;
	name?: string;
	exchange?: string;
	exchangeShortName?: string;
	country?: string;
};

type FmpQuoteRow = {
	price?: number | string;
};

type EodhdSearchRow = {
	Code?: string;
	Name?: string;
	Exchange?: string;
	Country?: string;
};

type EodhdQuoteResponse = {
	close?: number | string;
	previousClose?: number | string;
	adjusted_close?: number | string;
};

type AlphaVantageSymbolMatch = {
	"1. symbol"?: string;
	"2. name"?: string;
	"4. region"?: string;
	"4. market"?: string;
	"6. marketClose"?: string;
	"7. timezone"?: string;
	"8. currency"?: string;
	"9. matchScore"?: string;
};

type AlphaVantageSearchResponse = {
	bestMatches?: AlphaVantageSymbolMatch[];
	Note?: string;
	Information?: string;
	ErrorMessage?: string;
};

type AlphaVantageQuoteResponse = {
	"Global Quote"?: Record<string, string>;
	Note?: string;
	Information?: string;
	ErrorMessage?: string;
};

type FrankfurterResponse = {
	rates?: {
		KRW?: number;
	};
	date?: string;
};

type KrxApiResponse<T> = {
	OutBlock_1?: T[];
	respCode?: string;
	respMsg?: string;
};

type KrxBaseInfoRow = {
	ISU_SRT_CD?: string;
	ISU_NM?: string;
	ISU_ABBRV?: string;
	ISU_ENG_NM?: string;
	MKT_TP_NM?: string;
};

type KrxDailyTradeRow = {
	ISU_CD?: string;
	ISU_NM?: string;
	MKT_NM?: string;
	TDD_CLSPRC?: string;
};

type StockProvider = "KRX" | "EODHD" | "TWELVE_DATA" | "FMP" | "ALPHA_VANTAGE";

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const FMP_BASE_URL = "https://financialmodelingprep.com";
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const EODHD_BASE_URL = "https://eodhd.com/api";
const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1/latest";
const KRX_DATASET_CACHE_MS = 30 * 60 * 1000;
const PROVIDER_COOLDOWN_MS = 60 * 1000;

const eodhdApiKey = normalizeKey(import.meta.env.VITE_EODHD_API_KEY);
const twelveDataApiKey = normalizeKey(import.meta.env.VITE_TWELVE_DATA_API_KEY);
const fmpApiKey = normalizeKey(import.meta.env.VITE_FMP_API_KEY);
const alphaVantageApiKey = normalizeKey(
	import.meta.env.VITE_ALPHA_VANTAGE_API_KEY,
);

const enabledUsStockProviders: StockProvider[] = [
	...(eodhdApiKey === null ? [] : (["EODHD"] as const)),
	...(fmpApiKey === null ? [] : (["FMP"] as const)),
	...(alphaVantageApiKey === null ? [] : (["ALPHA_VANTAGE"] as const)),
	...(twelveDataApiKey === null ? [] : (["TWELVE_DATA"] as const)),
];

const hasKrxApiProxy = hasSupabaseEnv;
export const hasStockApiKey =
	hasKrxApiProxy || enabledUsStockProviders.length > 0;
export const hasUsStockApiKey = enabledUsStockProviders.length > 0;
const providerCooldownUntil: Partial<Record<StockProvider, number>> = {};

class StockProviderError extends Error {
	provider: StockProvider;
	status: number;
	rateLimited: boolean;

	constructor(
		provider: StockProvider,
		status: number,
		message: string,
		rateLimited: boolean,
	) {
		super(message);
		this.provider = provider;
		this.status = status;
		this.rateLimited = rateLimited;
	}
}

type LocalAlias = {
	name: string;
	symbol: string;
	market: Market;
	exchange: string;
	aliases: string[];
};

const LOCAL_ALIASES: LocalAlias[] = [
	{
		name: "삼성전자",
		symbol: "005930",
		market: "KR",
		exchange: "KRX",
		aliases: ["삼성전자", "삼전", "samsung electronics"],
	},
	{
		name: "삼성전자우",
		symbol: "005935",
		market: "KR",
		exchange: "KRX",
		aliases: ["삼성전자우", "삼전우"],
	},
	{
		name: "SK하이닉스",
		symbol: "000660",
		market: "KR",
		exchange: "KRX",
		aliases: ["sk하이닉스", "하이닉스", "hynix"],
	},
	{
		name: "현대차",
		symbol: "005380",
		market: "KR",
		exchange: "KRX",
		aliases: ["현대차", "현대자동차"],
	},
	{
		name: "NAVER",
		symbol: "035420",
		market: "KR",
		exchange: "KRX",
		aliases: ["네이버", "naver"],
	},
	{
		name: "카카오",
		symbol: "035720",
		market: "KR",
		exchange: "KRX",
		aliases: ["카카오", "kakao"],
	},
	{
		name: "LG에너지솔루션",
		symbol: "373220",
		market: "KR",
		exchange: "KRX",
		aliases: ["lg에너지솔루션", "엘지에너지솔루션", "lg엔솔"],
	},
	{
		name: "기아",
		symbol: "000270",
		market: "KR",
		exchange: "KRX",
		aliases: ["기아", "기아차", "kia"],
	},
	{
		name: "셀트리온",
		symbol: "068270",
		market: "KR",
		exchange: "KRX",
		aliases: ["셀트리온", "celltrion"],
	},
	{
		name: "POSCO홀딩스",
		symbol: "005490",
		market: "KR",
		exchange: "KRX",
		aliases: ["포스코", "posco", "posco홀딩스", "포스코홀딩스"],
	},
	{
		name: "애플",
		symbol: "AAPL",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["애플", "apple", "aapl"],
	},
	{
		name: "테슬라",
		symbol: "TSLA",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["테슬라", "tsla", "tesla"],
	},
	{
		name: "엔비디아",
		symbol: "NVDA",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["엔비디아", "nvidia", "nvda"],
	},
	{
		name: "마이크로소프트",
		symbol: "MSFT",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["마이크로소프트", "microsoft", "msft"],
	},
	{
		name: "알파벳",
		symbol: "GOOGL",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["알파벳", "구글", "google", "googl"],
	},
	{
		name: "아마존",
		symbol: "AMZN",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["아마존", "amazon", "amzn"],
	},
	{
		name: "메타",
		symbol: "META",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["메타", "meta", "facebook"],
	},
	{
		name: "넷플릭스",
		symbol: "NFLX",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["넷플릭스", "netflix", "nflx"],
	},
	{
		name: "브로드컴",
		symbol: "AVGO",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["브로드컴", "broadcom", "avgo"],
	},
	{
		name: "AMD",
		symbol: "AMD",
		market: "US",
		exchange: "NASDAQ",
		aliases: ["amd", "에이엠디"],
	},
];

type KrxMarketKey = "KOSPI" | "KOSDAQ" | "KONEX";

type KrxDatasetCache<T> = {
	loadedAt: number;
	rows: T[];
};

const KRX_MARKET_TO_BASE_INFO_API_ID: Record<KrxMarketKey, string> = {
	KOSPI: "stk_isu_base_info",
	KOSDAQ: "ksq_isu_base_info",
	KONEX: "knx_isu_base_info",
};

const KRX_MARKET_TO_DAILY_API_ID: Record<KrxMarketKey, string> = {
	KOSPI: "stk_bydd_trd",
	KOSDAQ: "ksq_bydd_trd",
	KONEX: "knx_bydd_trd",
};
const KRX_ETP_DAILY_API_IDS = [
	"etf_bydd_trd",
	"etn_bydd_trd",
	"elw_bydd_trd",
] as const;

let krxBaseInfoCache: KrxDatasetCache<KrxBaseInfoRow> | null = null;
let krxDailyTradeCache: KrxDatasetCache<KrxDailyTradeRow> | null = null;
let krxBaseInfoPromise: Promise<KrxBaseInfoRow[]> | null = null;
let krxDailyTradePromise: Promise<KrxDailyTradeRow[]> | null = null;

function detectMarket(country?: string): Market | null {
	const lower = country?.toLowerCase() ?? "";
	if (lower.includes("korea")) {
		return "KR";
	}
	if (lower.includes("united states") || lower.includes("usa")) {
		return "US";
	}
	return null;
}

function detectMarketByRegion(region?: string): Market | null {
	const lower = region?.toLowerCase() ?? "";
	if (
		lower.includes("south korea") ||
		lower.includes("korea") ||
		lower.includes("krx")
	) {
		return "KR";
	}
	if (
		lower.includes("united states") ||
		lower.includes("usa") ||
		lower.includes("nasdaq") ||
		lower.includes("nyse")
	) {
		return "US";
	}
	return null;
}

function detectMarketBySymbol(symbol: string): Market | null {
	if (/^\d{6}([.-][A-Z]+)?$/.test(symbol)) {
		return "KR";
	}
	const suffix = symbol.split(".")[1]?.toUpperCase();
	if (suffix === "US") {
		return "US";
	}
	if (
		suffix === "KO" ||
		suffix === "KS" ||
		suffix === "KQ" ||
		suffix === "KRX"
	) {
		return "KR";
	}
	return null;
}

function buildQuoteSymbol(symbol: string, exchange?: string): string {
	if (exchange === undefined || exchange.length === 0) {
		return symbol;
	}
	return `${symbol}:${exchange}`;
}

function normalizeExchange(exchange?: string): string {
	return exchange?.trim().toUpperCase() ?? "";
}

function normalizeKey(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeQuery(value: string): string {
	return value.toLowerCase().replace(/\s+/g, "");
}

function isProviderCoolingDown(provider: StockProvider): boolean {
	const until = providerCooldownUntil[provider] ?? 0;
	return until > Date.now();
}

function setProviderCooldown(provider: StockProvider): void {
	providerCooldownUntil[provider] = Date.now() + PROVIDER_COOLDOWN_MS;
}

function clearProviderCooldown(provider: StockProvider): void {
	providerCooldownUntil[provider] = 0;
}

function isRateLimitMessage(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("run out of api credits") ||
		lower.includes("rate limit") ||
		lower.includes("too many requests") ||
		lower.includes("credits were used") ||
		lower.includes("current limit")
	);
}

function extractMessageFromPayload(payload: unknown): string | null {
	if (payload === null || typeof payload !== "object") {
		return null;
	}
	const candidate = payload as Record<string, unknown>;
	const message = candidate.message;
	if (typeof message === "string" && message.trim().length > 0) {
		return message.trim();
	}
	const note = candidate.Note;
	if (typeof note === "string" && note.trim().length > 0) {
		return note.trim();
	}
	const information = candidate.Information;
	if (typeof information === "string" && information.trim().length > 0) {
		return information.trim();
	}
	const errorMessage = candidate.ErrorMessage;
	if (typeof errorMessage === "string" && errorMessage.trim().length > 0) {
		return errorMessage.trim();
	}
	return null;
}

function markProviderCooldownFromPayload(
	provider: StockProvider,
	payload: unknown,
): void {
	const message = extractMessageFromPayload(payload);
	if (message !== null && isRateLimitMessage(message)) {
		setProviderCooldown(provider);
	}
	if (
		payload !== null &&
		typeof payload === "object" &&
		"code" in payload &&
		(payload as { code: unknown }).code === 429
	) {
		setProviderCooldown(provider);
	}
}

function searchLocalAliases(query: string): SymbolSearchItem[] {
	const normalized = normalizeQuery(query.trim());
	if (normalized.length === 0) {
		return [];
	}

	return LOCAL_ALIASES.filter((item) => {
		return item.aliases.some((alias) => {
			const normalizedAlias = normalizeQuery(alias);
			return (
				normalizedAlias.includes(normalized) ||
				normalized.includes(normalizedAlias)
			);
		});
	}).map((item) => ({
		name: item.name,
		symbol: item.symbol,
		market: item.market,
		exchange: item.exchange,
		quoteSymbol: buildQuoteSymbol(item.symbol, item.exchange),
	}));
}

function parseNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const normalized = value.replaceAll(",", "").trim();
		if (normalized.length === 0) {
			return null;
		}
		const parsed = Number.parseFloat(normalized);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function normalizeKrxMarketName(value?: string): KrxMarketKey {
	const upper = value?.trim().toUpperCase() ?? "";
	if (upper.includes("KOSDAQ")) {
		return "KOSDAQ";
	}
	if (upper.includes("KONEX")) {
		return "KONEX";
	}
	return "KOSPI";
}

function formatKrxBasDd(date: Date): string {
	const year = date.getFullYear().toString().padStart(4, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	return `${year}${month}${day}`;
}

function getKrxBasDdCandidates(maxDays = 10): string[] {
	const items: string[] = [];
	const base = new Date();
	for (let offset = 0; offset < maxDays; offset += 1) {
		const target = new Date(base);
		target.setDate(base.getDate() - offset);
		items.push(formatKrxBasDd(target));
	}
	return items;
}

function normalizeKrxSymbol(value?: string): string {
	const raw = value?.trim() ?? "";
	if (/^\d{6}$/.test(raw)) {
		return raw;
	}
	const matched = raw.match(/(\d{6})$/);
	return matched?.[1] ?? "";
}

async function invokeKrxProxy<T>(
	apiId: string,
	basDd: string,
): Promise<KrxApiResponse<T>> {
	const client = assertSupabase();
	const { data, error } = await client.functions.invoke<unknown>("krx-proxy", {
		body: { apiId, basDd },
	});
	if (error !== null) {
		throw new StockProviderError(
			"KRX",
			502,
			`KRX 프록시 호출 실패: ${error.message}`,
			false,
		);
	}
	if (data === null || data === undefined) {
		return {};
	}
	if (typeof data === "string") {
		try {
			return JSON.parse(data) as KrxApiResponse<T>;
		} catch {
			throw new StockProviderError(
				"KRX",
				502,
				"KRX 프록시 응답 파싱에 실패했습니다.",
				false,
			);
		}
	}
	if (typeof data === "object") {
		return data as KrxApiResponse<T>;
	}
	return {};
}

async function loadKrxRowsByApiId<T>(apiId: string): Promise<T[]> {
	if (!hasKrxApiProxy) {
		return [];
	}

	const basDdCandidates = getKrxBasDdCandidates();
	for (const basDd of basDdCandidates) {
		try {
			const data = await invokeKrxProxy<T>(apiId, basDd);
			if ((data.respCode ?? "").trim() === "401") {
				throw new StockProviderError(
					"KRX",
					401,
					`${apiId}: ${data.respMsg?.trim() || "KRX API 인증에 실패했습니다."}`,
					false,
				);
			}
			const rows = data.OutBlock_1 ?? [];
			if (rows.length > 0) {
				return rows;
			}
		} catch (error) {
			if (error instanceof StockProviderError) {
				if (error.status === 401 || error.status === 403) {
					throw error;
				}
			}
		}
	}
	return [];
}

async function loadKrxRowsByApiIdOptional<T>(apiId: string): Promise<T[]> {
	try {
		return await loadKrxRowsByApiId<T>(apiId);
	} catch (error) {
		if (error instanceof StockProviderError) {
			if (error.status === 401 || error.status === 403) {
				return [];
			}
		}
		return [];
	}
}

async function getKrxBaseInfoRows(): Promise<KrxBaseInfoRow[]> {
	const now = Date.now();
	if (
		krxBaseInfoCache !== null &&
		now - krxBaseInfoCache.loadedAt < KRX_DATASET_CACHE_MS
	) {
		return krxBaseInfoCache.rows;
	}
	if (krxBaseInfoPromise !== null) {
		return krxBaseInfoPromise;
	}

	krxBaseInfoPromise = Promise.all(
		(Object.values(KRX_MARKET_TO_BASE_INFO_API_ID) as string[]).map((apiId) =>
			loadKrxRowsByApiId<KrxBaseInfoRow>(apiId),
		),
	)
		.then((chunks) => {
			const rows = chunks.flat();
			krxBaseInfoCache = {
				loadedAt: Date.now(),
				rows,
			};
			return rows;
		})
		.finally(() => {
			krxBaseInfoPromise = null;
		});

	return krxBaseInfoPromise;
}

async function getKrxDailyTradeRows(): Promise<KrxDailyTradeRow[]> {
	const now = Date.now();
	if (
		krxDailyTradeCache !== null &&
		now - krxDailyTradeCache.loadedAt < KRX_DATASET_CACHE_MS
	) {
		return krxDailyTradeCache.rows;
	}
	if (krxDailyTradePromise !== null) {
		return krxDailyTradePromise;
	}

	krxDailyTradePromise = Promise.all([
		...(Object.values(KRX_MARKET_TO_DAILY_API_ID) as string[]).map((apiId) =>
			loadKrxRowsByApiId<KrxDailyTradeRow>(apiId),
		),
		...KRX_ETP_DAILY_API_IDS.map((apiId) =>
			loadKrxRowsByApiIdOptional<KrxDailyTradeRow>(apiId),
		),
	])
		.then((chunks) => {
			const rows = chunks.flat();
			krxDailyTradeCache = {
				loadedAt: Date.now(),
				rows,
			};
			return rows;
		})
		.finally(() => {
			krxDailyTradePromise = null;
		});

	return krxDailyTradePromise;
}

function buildSymbolCandidates(symbol: string, quoteSymbol: string): string[] {
	const candidates = new Set<string>();
	const normalizedSymbol = symbol.trim();
	const normalizedQuoteSymbol = quoteSymbol.trim();
	if (normalizedQuoteSymbol.length > 0) {
		candidates.add(normalizedQuoteSymbol);
	}
	if (normalizedSymbol.length > 0) {
		candidates.add(normalizedSymbol);
	}
	if (normalizedQuoteSymbol.includes(":")) {
		candidates.add(normalizedQuoteSymbol.split(":")[0] ?? "");
	}
	if (normalizedSymbol.includes(":")) {
		candidates.add(normalizedSymbol.split(":")[0] ?? "");
	}

	const plainSymbol =
		normalizedQuoteSymbol.split(":")[0]?.trim() || normalizedSymbol.trim();
	if (/^\d{6}$/.test(plainSymbol)) {
		candidates.add(`${plainSymbol}.KS`);
		candidates.add(`${plainSymbol}.KQ`);
		candidates.add(`${plainSymbol}.KRX`);
	}
	return [...candidates].filter((item) => item.length > 0);
}

function normalizeTargetForProvider(
	target: string,
	provider: StockProvider,
): string {
	if (provider === "EODHD") {
		return normalizeEodhdSymbol(target);
	}
	if (provider === "TWELVE_DATA") {
		return target;
	}
	return target.split(":")[0]?.trim() ?? target.trim();
}

function normalizeEodhdSymbol(target: string): string {
	const trimmed = target.trim();
	if (trimmed.length === 0) {
		return "";
	}
	if (trimmed.includes(".")) {
		return trimmed.toUpperCase();
	}
	const [symbolPart, exchangePart] = trimmed.split(":");
	const symbol = symbolPart?.trim().toUpperCase() ?? "";
	const exchange = exchangePart?.trim().toUpperCase() ?? "";
	if (symbol.length === 0) {
		return "";
	}
	if (exchange.length > 0) {
		if (
			exchange.includes("NASDAQ") ||
			exchange.includes("NYSE") ||
			exchange.includes("AMEX")
		) {
			return `${symbol}.US`;
		}
		if (
			exchange.includes("KRX") ||
			exchange.includes("KOSPI") ||
			exchange.includes("KOSDAQ")
		) {
			return `${symbol}.KO`;
		}
	}
	if (/^\d{6}$/.test(symbol)) {
		return `${symbol}.KO`;
	}
	return `${symbol}.US`;
}

async function fetchJson<T>(
	provider: StockProvider,
	url: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(url, init);
	const payload = (await response.json().catch(() => null)) as unknown;
	if (!response.ok) {
		const message =
			extractMessageFromPayload(payload) ??
			`주식 API 요청 실패: ${response.status}`;
		const rateLimited =
			response.status === 429 ||
			(message !== null && isRateLimitMessage(message));
		if (rateLimited) {
			setProviderCooldown(provider);
		}
		throw new StockProviderError(
			provider,
			response.status,
			message,
			rateLimited,
		);
	}
	markProviderCooldownFromPayload(provider, payload);
	if (!isProviderCoolingDown(provider)) {
		clearProviderCooldown(provider);
	}
	return payload as T;
}

async function fetchPriceFromTwelveData(
	symbol: string,
): Promise<StockQuote | null> {
	if (twelveDataApiKey === null) {
		return null;
	}

	const params = new URLSearchParams({
		symbol,
		apikey: twelveDataApiKey,
	});
	const data = await fetchJson<TwelveDataPriceResponse>(
		"TWELVE_DATA",
		`${TWELVE_DATA_BASE_URL}/price?${params.toString()}`,
	);
	markProviderCooldownFromPayload("TWELVE_DATA", data);
	const parsed = parseNumber(data.price);
	if (parsed === null) {
		return null;
	}
	if (data.code !== undefined || (data.message ?? "").length > 0) {
		return null;
	}
	return {
		price: parsed,
		asOf: new Date().toISOString(),
	};
}

async function fetchPriceFromEodhd(symbol: string): Promise<StockQuote | null> {
	if (eodhdApiKey === null) {
		return null;
	}
	const params = new URLSearchParams({
		api_token: eodhdApiKey,
		fmt: "json",
	});
	const data = await fetchJson<EodhdQuoteResponse>(
		"EODHD",
		`${EODHD_BASE_URL}/real-time/${encodeURIComponent(symbol)}?${params.toString()}`,
	);
	markProviderCooldownFromPayload("EODHD", data);
	const parsed =
		parseNumber(data.close) ??
		parseNumber(data.adjusted_close) ??
		parseNumber(data.previousClose);
	if (parsed === null) {
		return null;
	}
	return {
		price: parsed,
		asOf: new Date().toISOString(),
	};
}

async function fetchPriceFromFmp(symbol: string): Promise<StockQuote | null> {
	if (fmpApiKey === null) {
		return null;
	}

	const params = new URLSearchParams({
		symbol,
		apikey: fmpApiKey,
	});
	const data = await fetchJson<unknown>(
		"FMP",
		`${FMP_BASE_URL}/stable/quote?${params.toString()}`,
	);
	markProviderCooldownFromPayload("FMP", data);
	if (!Array.isArray(data) || data.length === 0) {
		return null;
	}
	const row = data[0] as FmpQuoteRow;
	const parsed = parseNumber(row.price);
	if (parsed === null) {
		return null;
	}
	return {
		price: parsed,
		asOf: new Date().toISOString(),
	};
}

async function fetchPriceFromAlphaVantage(
	symbol: string,
): Promise<StockQuote | null> {
	if (alphaVantageApiKey === null) {
		return null;
	}

	const params = new URLSearchParams({
		function: "GLOBAL_QUOTE",
		symbol,
		apikey: alphaVantageApiKey,
	});
	const data = await fetchJson<AlphaVantageQuoteResponse>(
		"ALPHA_VANTAGE",
		`${ALPHA_VANTAGE_BASE_URL}?${params.toString()}`,
	);
	markProviderCooldownFromPayload("ALPHA_VANTAGE", data);
	if (
		(data.Note ?? "").length > 0 ||
		(data.Information ?? "").length > 0 ||
		(data.ErrorMessage ?? "").length > 0
	) {
		return null;
	}
	const quote = data["Global Quote"];
	if (quote === undefined) {
		return null;
	}
	const parsed = parseNumber(quote["05. price"]);
	if (parsed === null) {
		return null;
	}
	return {
		price: parsed,
		asOf: new Date().toISOString(),
	};
}

async function fetchPriceFromKrx(symbol: string): Promise<StockQuote | null> {
	if (!hasKrxApiProxy) {
		return null;
	}
	const normalizedSymbol = normalizeKrxSymbol(symbol);
	if (normalizedSymbol.length === 0) {
		return null;
	}

	const rows = await getKrxDailyTradeRows();
	const matched = rows.find(
		(row) => normalizeKrxSymbol(row.ISU_CD) === normalizedSymbol,
	);
	if (matched === undefined) {
		return null;
	}

	const parsed = parseNumber(matched.TDD_CLSPRC);
	if (parsed === null) {
		return null;
	}
	return {
		price: parsed,
		asOf: new Date().toISOString(),
	};
}

async function searchFromKrx(query: string): Promise<SymbolSearchItem[]> {
	if (!hasKrxApiProxy) {
		return [];
	}
	const normalizedQuery = normalizeQuery(query);
	if (normalizedQuery.length === 0) {
		return [];
	}

	const rows = await getKrxBaseInfoRows();
	const results: SymbolSearchItem[] = [];
	const seenSymbols = new Set<string>();
	for (const row of rows) {
		const symbol = normalizeKrxSymbol(row.ISU_SRT_CD);
		if (symbol.length === 0) {
			continue;
		}
		const name = row.ISU_NM?.trim() ?? symbol;
		const abbr = row.ISU_ABBRV?.trim() ?? "";
		const engName = row.ISU_ENG_NM?.trim() ?? "";
		const marketType = normalizeKrxMarketName(row.MKT_TP_NM);
		const searchable = [symbol, name, abbr, engName]
			.map((item) => normalizeQuery(item))
			.filter((item) => item.length > 0);
		const isMatched = searchable.some(
			(item) =>
				item.includes(normalizedQuery) || normalizedQuery.includes(item),
		);
		if (!isMatched) {
			continue;
		}
		results.push({
			name,
			symbol,
			market: "KR",
			exchange: marketType,
			quoteSymbol: buildQuoteSymbol(symbol, "KRX"),
		});
		seenSymbols.add(symbol);
		if (results.length >= 30) {
			break;
		}
	}

	if (results.length < 30) {
		const dailyRows = await getKrxDailyTradeRows();
		for (const row of dailyRows) {
			const symbol = normalizeKrxSymbol(row.ISU_CD);
			if (symbol.length === 0 || seenSymbols.has(symbol)) {
				continue;
			}
			const name = row.ISU_NM?.trim() ?? symbol;
			const searchable = [symbol, name]
				.map((item) => normalizeQuery(item))
				.filter((item) => item.length > 0);
			const isMatched = searchable.some(
				(item) =>
					item.includes(normalizedQuery) || normalizedQuery.includes(item),
			);
			if (!isMatched) {
				continue;
			}
			results.push({
				name,
				symbol,
				market: "KR",
				exchange: row.MKT_NM?.trim() ?? "KRX",
				quoteSymbol: buildQuoteSymbol(symbol, "KRX"),
			});
			seenSymbols.add(symbol);
			if (results.length >= 30) {
				break;
			}
		}
	}
	return results;
}

async function searchFromTwelveData(
	query: string,
): Promise<SymbolSearchItem[]> {
	if (twelveDataApiKey === null) {
		return [];
	}
	const params = new URLSearchParams({
		symbol: query,
		outputsize: "15",
		apikey: twelveDataApiKey,
	});
	const data = await fetchJson<TwelveDataSearchResponse>(
		"TWELVE_DATA",
		`${TWELVE_DATA_BASE_URL}/symbol_search?${params.toString()}`,
	);
	markProviderCooldownFromPayload("TWELVE_DATA", data);
	const rows = data.data ?? [];
	return rows
		.map((row) => {
			const market = detectMarket(row.country);
			if (market === null) {
				return null;
			}
			return {
				name: row.instrument_name ?? row.symbol,
				symbol: row.symbol,
				market,
				exchange: row.exchange ?? "",
				quoteSymbol: buildQuoteSymbol(row.symbol, row.exchange),
			};
		})
		.filter((item): item is SymbolSearchItem => item !== null);
}

async function searchFromEodhd(query: string): Promise<SymbolSearchItem[]> {
	if (eodhdApiKey === null) {
		return [];
	}
	const params = new URLSearchParams({
		api_token: eodhdApiKey,
		limit: "15",
	});
	const data = await fetchJson<unknown>(
		"EODHD",
		`${EODHD_BASE_URL}/search/${encodeURIComponent(query)}?${params.toString()}`,
	);
	markProviderCooldownFromPayload("EODHD", data);
	if (!Array.isArray(data)) {
		return [];
	}
	return data
		.map((row) => {
			const item = row as EodhdSearchRow;
			const symbol = item.Code?.trim().toUpperCase() ?? "";
			if (symbol.length === 0) {
				return null;
			}
			const exchange = normalizeExchange(item.Exchange);
			const market =
				detectMarket(item.Country) ??
				detectMarketByRegion(exchange) ??
				detectMarketBySymbol(symbol);
			if (market === null) {
				return null;
			}
			return {
				name: item.Name?.trim() || symbol,
				symbol,
				market,
				exchange,
				quoteSymbol: buildQuoteSymbol(symbol, exchange),
			};
		})
		.filter((item): item is SymbolSearchItem => item !== null);
}

async function searchFromFmp(query: string): Promise<SymbolSearchItem[]> {
	if (fmpApiKey === null) {
		return [];
	}
	const params = new URLSearchParams({
		query,
		apikey: fmpApiKey,
	});
	const data = await fetchJson<unknown>(
		"FMP",
		`${FMP_BASE_URL}/stable/search-symbol?${params.toString()}`,
	);
	markProviderCooldownFromPayload("FMP", data);
	if (!Array.isArray(data)) {
		return [];
	}
	return data
		.map((row) => {
			const item = row as FmpSearchRow;
			const symbol = item.symbol?.trim() ?? "";
			if (symbol.length === 0) {
				return null;
			}
			const exchange = normalizeExchange(
				item.exchangeShortName ?? item.exchange,
			);
			const market =
				detectMarket(item.country) ??
				detectMarketByRegion(exchange) ??
				(/^\d{6}$/.test(symbol) ? "KR" : null);
			if (market === null) {
				return null;
			}
			return {
				name: item.name?.trim() || symbol,
				symbol,
				market,
				exchange,
				quoteSymbol: buildQuoteSymbol(symbol, exchange),
			};
		})
		.filter((item): item is SymbolSearchItem => item !== null);
}

async function searchFromAlphaVantage(
	query: string,
): Promise<SymbolSearchItem[]> {
	if (alphaVantageApiKey === null) {
		return [];
	}
	const params = new URLSearchParams({
		function: "SYMBOL_SEARCH",
		keywords: query,
		apikey: alphaVantageApiKey,
	});
	const data = await fetchJson<AlphaVantageSearchResponse>(
		"ALPHA_VANTAGE",
		`${ALPHA_VANTAGE_BASE_URL}?${params.toString()}`,
	);
	markProviderCooldownFromPayload("ALPHA_VANTAGE", data);
	if (
		(data.Note ?? "").length > 0 ||
		(data.Information ?? "").length > 0 ||
		(data.ErrorMessage ?? "").length > 0
	) {
		return [];
	}
	const rows = data.bestMatches ?? [];
	return rows
		.map((row) => {
			const symbol = row["1. symbol"]?.trim() ?? "";
			if (symbol.length === 0) {
				return null;
			}
			const name = row["2. name"]?.trim() || symbol;
			const market =
				detectMarketByRegion(row["4. region"] ?? row["4. market"]) ??
				(/^\d{6}(\.[A-Z]+)?$/.test(symbol) ? "KR" : null);
			if (market === null) {
				return null;
			}
			const exchange =
				market === "KR"
					? "KRX"
					: row["4. region"]?.includes("United States")
						? "NASDAQ"
						: "";
			return {
				name,
				symbol,
				market,
				exchange,
				quoteSymbol: buildQuoteSymbol(symbol, exchange),
			};
		})
		.filter((item): item is SymbolSearchItem => item !== null);
}

export async function searchStockSymbols(
	query: string,
): Promise<SymbolSearchItem[]> {
	if (query.trim().length < 1) {
		return [];
	}

	const [krResults, usResults] = await Promise.all([
		searchStockSymbolsByMarket(query, "KR"),
		searchStockSymbolsByMarket(query, "US"),
	]);
	const merged = [...krResults, ...usResults];
	const deduped: SymbolSearchItem[] = [];
	const seen = new Set<string>();
	for (const item of merged) {
		const key = `${item.market}-${item.quoteSymbol}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(item);
	}
	return deduped.slice(0, 15);
}

export async function searchStockSymbolsByMarket(
	query: string,
	market: Market,
): Promise<SymbolSearchItem[]> {
	const localMatches = searchLocalAliases(query).filter(
		(item) => item.market === market,
	);
	if (query.trim().length < 1) {
		return localMatches.slice(0, 15);
	}

	const apiMatches: SymbolSearchItem[] = [];

	if (market === "KR") {
		try {
			apiMatches.push(...(await searchFromKrx(query.trim())));
		} catch (error) {
			if (error instanceof StockProviderError) {
				if (error.status === 401 || error.status === 403) {
					throw error;
				}
			}
		}
	} else {
		for (const provider of enabledUsStockProviders) {
			if (isProviderCoolingDown(provider)) {
				continue;
			}
			try {
				if (provider === "EODHD") {
					apiMatches.push(...(await searchFromEodhd(query.trim())));
				} else if (provider === "TWELVE_DATA") {
					apiMatches.push(...(await searchFromTwelveData(query.trim())));
				} else if (provider === "FMP") {
					apiMatches.push(...(await searchFromFmp(query.trim())));
				} else if (provider === "ALPHA_VANTAGE") {
					apiMatches.push(...(await searchFromAlphaVantage(query.trim())));
				}
			} catch (error) {
				if (error instanceof StockProviderError && error.rateLimited) {
					setProviderCooldown(provider);
				}
			}
		}
	}

	const merged = [
		...localMatches,
		...apiMatches.filter((item) => item.market === market),
	];
	const deduped: SymbolSearchItem[] = [];
	const seen = new Set<string>();
	for (const item of merged) {
		const key = `${item.market}-${item.quoteSymbol}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(item);
	}
	return deduped.slice(0, 15);
}

export async function fetchCurrentPrice(
	symbol: string,
	quoteSymbol: string,
	market?: Market,
): Promise<StockQuote | null> {
	const detectedMarket =
		market ?? detectMarketBySymbol(quoteSymbol) ?? detectMarketBySymbol(symbol);

	if (detectedMarket === "KR" && hasKrxApiProxy) {
		try {
			const krxQuote = await fetchPriceFromKrx(symbol);
			if (krxQuote !== null) {
				return krxQuote;
			}
		} catch (error) {
			if (error instanceof StockProviderError) {
				if (error.status === 401 || error.status === 403) {
					throw error;
				}
				if (error.rateLimited) {
					setProviderCooldown("KRX");
				}
			}
		}
	}

	if (enabledUsStockProviders.length === 0) {
		return null;
	}
	const targets = buildSymbolCandidates(symbol, quoteSymbol);

	for (const provider of enabledUsStockProviders) {
		if (isProviderCoolingDown(provider)) {
			continue;
		}
		for (const target of targets) {
			const normalizedTarget = normalizeTargetForProvider(target, provider);
			if (normalizedTarget.length === 0) {
				continue;
			}
			try {
				let quote: StockQuote | null = null;
				if (provider === "EODHD") {
					quote = await fetchPriceFromEodhd(normalizedTarget);
				} else if (provider === "TWELVE_DATA") {
					quote = await fetchPriceFromTwelveData(normalizedTarget);
				} else if (provider === "FMP") {
					quote = await fetchPriceFromFmp(normalizedTarget);
				} else if (provider === "ALPHA_VANTAGE") {
					quote = await fetchPriceFromAlphaVantage(normalizedTarget);
				}
				if (quote !== null) {
					return quote;
				}
			} catch (error) {
				if (error instanceof StockProviderError && error.rateLimited) {
					setProviderCooldown(provider);
				}
			}
		}
	}

	return null;
}

async function fetchUsdKrwRateFromFrankfurter(): Promise<StockQuote | null> {
	const params = new URLSearchParams({
		base: "USD",
		symbols: "KRW",
	});
	const data = await fetchJson<FrankfurterResponse>(
		"EODHD",
		`${FRANKFURTER_BASE_URL}?${params.toString()}`,
	);
	const rate = parseNumber(data.rates?.KRW);
	if (rate === null) {
		return null;
	}
	const asOf =
		typeof data.date === "string" && data.date.length > 0
			? new Date(`${data.date}T00:00:00Z`).toISOString()
			: new Date().toISOString();
	return {
		price: rate,
		asOf,
	};
}

export async function fetchUsdKrwRate(): Promise<StockQuote | null> {
	try {
		const frankfurter = await fetchUsdKrwRateFromFrankfurter();
		if (frankfurter !== null) {
			return frankfurter;
		}
	} catch {
		// fallback to stock providers
	}
	return fetchCurrentPrice("USD/KRW", "USD/KRW");
}
