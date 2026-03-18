import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
	clampPercent,
	formatFxRate,
	formatKrw,
	formatNumber,
	formatUsd,
	parseIntegerInput,
} from "@/lib/format";
import {
	clearActiveUserCode,
	deleteExpenseItem,
	deleteHolding,
	deleteInstallment,
	fetchAccumulationLogsByDateRange,
	fetchExpenseItems,
	fetchHoldings,
	fetchInstallmentContributionLogsByDateRange,
	fetchInstallments,
	fetchOverview,
	insertExpenseItem,
	insertHolding,
	insertInstallment,
	saveOverview,
	updateExpenseItem,
	updateHolding,
	updateInstallment,
	upsertAccumulationLogs,
	upsertInstallmentContributionLogs,
	verifyAndActivateUserCode,
} from "@/lib/repository";
import {
	fetchCurrentPrice,
	fetchUsdKrwRate,
	hasStockApiKey,
	hasUsStockApiKey,
	searchStockSymbolsByMarket,
} from "@/lib/stocks";
import { hasSupabaseEnv } from "@/lib/supabase";
import {
	type AccumulationCurrency,
	type AccumulationType,
	BROKERS,
	CADENCES,
	type Cadence,
	type ExpenseItem,
	type ExpenseKind,
	type FinanceOverview,
	INSTALLMENT_APPLY_MODES,
	INSTALLMENT_BENEFIT_TYPES,
	type InstallmentApplyMode,
	type InstallmentBenefitType,
	type InstallmentContributionLog,
	type InstallmentSaving,
	type StockAccumulationLog,
	type StockHolding,
	type StockQuote,
	type SymbolSearchItem,
} from "@/types/finance";

type HoldingEditDraft = {
	quantity: number;
	averagePrice: number;
	isAccumulating: boolean;
	cadence: Cadence;
	runDay: number;
	accumulationType: AccumulationType;
	accumulationCurrency: AccumulationCurrency;
	accumulationValue: number;
};

type InstallmentDraft = Omit<InstallmentSaving, "id" | "cadence" | "runDay"> & {
	cadence: Cadence;
	runDay: number;
};
type HoldingForm = Omit<
	StockHolding,
	"id" | "accumulationStartedAt" | "cadence" | "runDay"
> & {
	cadence: Cadence;
	runDay: number;
};
type ExpenseDraft = Omit<ExpenseItem, "id" | "kind">;

const defaultOverview: FinanceOverview = {
	id: 1,
	salary: 0,
};

const today = new Date();
const todayIso = toDateInput(today);

const defaultInstallmentDraft: InstallmentDraft = {
	name: "",
	monthlyAmount: 0,
	savedAmount: 0,
	isRecurring: false,
	cadence: "MONTHLY",
	runDay: 1,
	applyMode: "TODAY",
	recurringStartedAt: null,
	startDate: todayIso,
	maturityDate: null,
	benefitType: "INTEREST_RATE",
	benefitValue: 0,
};

const defaultHoldingForm: HoldingForm = {
	broker: "TOSS",
	market: "KR",
	symbol: "",
	name: "",
	quoteSymbol: "",
	quantity: 0,
	averagePrice: 0,
	isAccumulating: false,
	cadence: "MONTHLY",
	runDay: 1,
	accumulationType: "AMOUNT",
	accumulationCurrency: "USD",
	accumulationValue: 0,
};

const defaultExpenseDraft: ExpenseDraft = {
	name: "",
	amount: 0,
};

const QUOTE_CACHE_STORAGE_KEY = "my-hundred-million.quote-cache.v1";
const QUOTE_CACHE_TTL_MS = 30 * 60 * 1000;
const USER_CODE_STORAGE_KEY = "my-hundred-million.user-code.v1";

type CachedQuoteEntry = {
	price: number;
	asOf: string;
	cachedAt: number;
};

type QuoteCacheStore = Record<string, CachedQuoteEntry>;

function App() {
	const [overview, setOverview] = useState<FinanceOverview>(defaultOverview);
	const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
	const [holdings, setHoldings] = useState<StockHolding[]>([]);
	const [installments, setInstallments] = useState<InstallmentSaving[]>([]);
	const [quotes, setQuotes] = useState<Record<number, StockQuote | null>>({});
	const [accumulationLogs, setAccumulationLogs] = useState<
		StockAccumulationLog[]
	>([]);
	const [installmentLogs, setInstallmentLogs] = useState<
		InstallmentContributionLog[]
	>([]);
	const [expenseDrafts, setExpenseDrafts] = useState<
		Record<number, ExpenseDraft>
	>({});
	const [expenseForms, setExpenseForms] = useState<
		Record<ExpenseKind, ExpenseDraft>
	>({
		FIXED: { ...defaultExpenseDraft },
		VARIABLE: { ...defaultExpenseDraft },
	});
	const [submittingExpenseKind, setSubmittingExpenseKind] =
		useState<ExpenseKind | null>(null);
	const [holdingDrafts, setHoldingDrafts] = useState<
		Record<number, HoldingEditDraft>
	>({});
	const [installmentDrafts, setInstallmentDrafts] = useState<
		Record<number, InstallmentDraft>
	>({});
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [userCodeInput, setUserCodeInput] = useState("");
	const [verifiedUserCode, setVerifiedUserCode] = useState<string | null>(null);
	const [verifyingUserCode, setVerifyingUserCode] = useState(false);

	const [stockSearchQuery, setStockSearchQuery] = useState("");
	const [stockSymbolResults, setStockSymbolResults] = useState<
		SymbolSearchItem[]
	>([]);
	const [searchingStockSymbol, setSearchingStockSymbol] = useState(false);
	const [isHoldingFormModalOpen, setIsHoldingFormModalOpen] = useState(false);
	const [holdingForm, setHoldingForm] = useState(defaultHoldingForm);
	const [submittingHolding, setSubmittingHolding] = useState(false);

	const [installmentForm, setInstallmentForm] = useState<InstallmentDraft>(
		defaultInstallmentDraft,
	);
	const [submittingInstallment, setSubmittingInstallment] = useState(false);
	const [loadingQuotes, setLoadingQuotes] = useState(false);
	const [savingOverviewState, setSavingOverviewState] = useState(false);
	const [usdKrwRate, setUsdKrwRate] = useState<number | null>(null);
	const [usdKrwUpdatedAt, setUsdKrwUpdatedAt] = useState<string | null>(null);
	const [loadingFxRate, setLoadingFxRate] = useState(false);
	const [reflectingAccumulation, setReflectingAccumulation] = useState(false);
	const [reflectingInstallments, setReflectingInstallments] = useState(false);
	const latestQuoteUpdatedAt = useMemo(() => {
		let maxTime = 0;
		let latest: string | null = null;
		for (const quote of Object.values(quotes)) {
			if (quote === null) {
				continue;
			}
			const time = new Date(quote.asOf).getTime();
			if (Number.isNaN(time)) {
				continue;
			}
			if (time >= maxTime) {
				maxTime = time;
				latest = quote.asOf;
			}
		}
		return latest;
	}, [quotes]);
	const hasUsHoldings = useMemo(
		() => holdings.some((item) => item.market === "US"),
		[holdings],
	);
	const currentMonthRange = useMemo(() => getCurrentMonthDateRange(), []);

	const refreshStockQuotes = useCallback(
		async (options: { forceRefresh: boolean; silent: boolean }) => {
			if (!hasStockApiKey || holdings.length === 0) {
				return;
			}

			setLoadingQuotes(true);
			try {
				const now = Date.now();
				const cache = readQuoteCache();
				const nextCache: QuoteCacheStore = { ...cache };

				const entries = await Promise.all(
					holdings.map(async (holding) => {
						const cacheKey = buildHoldingQuoteCacheKey(holding);
						const cached = cache[cacheKey];
						const isCacheFresh =
							cached !== undefined &&
							now - cached.cachedAt < QUOTE_CACHE_TTL_MS;

						if (!options.forceRefresh && isCacheFresh) {
							return [
								holding.id,
								{ price: cached.price, asOf: cached.asOf } as StockQuote,
							] as const;
						}

						const quote = await fetchCurrentPrice(
							holding.symbol,
							holding.quoteSymbol,
							holding.market,
						);

						if (quote !== null) {
							nextCache[cacheKey] = {
								price: quote.price,
								asOf: quote.asOf,
								cachedAt: now,
							};
							return [holding.id, quote] as const;
						}

						if (cached !== undefined) {
							return [
								holding.id,
								{ price: cached.price, asOf: cached.asOf } as StockQuote,
							] as const;
						}

						return [holding.id, null] as const;
					}),
				);

				writeQuoteCache(nextCache);
				setQuotes((prev) => {
					const next = { ...prev };
					for (const [id, quote] of entries) {
						next[id] = quote;
					}
					return next;
				});

				if (!options.silent && options.forceRefresh) {
					setMessage("현재가가 갱신되었습니다. (캐시 30분)");
				}
			} catch (error) {
				if (!options.silent) {
					setMessage(extractError(error));
				}
			} finally {
				setLoadingQuotes(false);
			}
		},
		[holdings],
	);

	const verifyUserCode = useCallback(
		async (rawCode?: string, options?: { silent?: boolean }) => {
			if (!hasSupabaseEnv) {
				setMessage("Supabase 환경변수를 먼저 설정해주세요.");
				return;
			}
			const userCode = (rawCode ?? userCodeInput).trim().toUpperCase();
			if (userCode.length < 4) {
				if (!options?.silent) {
					setMessage("식별 번호는 4자 이상 입력해주세요.");
				}
				return;
			}
			setVerifyingUserCode(true);
			try {
				const result = await verifyAndActivateUserCode(userCode);
				setVerifiedUserCode(userCode);
				setUserCodeInput(userCode);
				localStorage.setItem(USER_CODE_STORAGE_KEY, userCode);
				setMessage(
					result.migrated
						? "기존 데이터가 현재 식별 번호로 마이그레이션되었습니다."
						: "식별 번호 확인이 완료되었습니다.",
				);
			} catch (error) {
				clearActiveUserCode();
				setVerifiedUserCode(null);
				localStorage.removeItem(USER_CODE_STORAGE_KEY);
				if (!options?.silent) {
					setMessage(extractError(error));
				}
			} finally {
				setVerifyingUserCode(false);
			}
		},
		[userCodeInput],
	);

	useEffect(() => {
		const savedCode = localStorage.getItem(USER_CODE_STORAGE_KEY);
		if (savedCode === null || savedCode.trim().length === 0) {
			return;
		}
		setUserCodeInput(savedCode.trim().toUpperCase());
		verifyUserCode(savedCode, { silent: true }).catch(() => {});
	}, [verifyUserCode]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			if (!hasSupabaseEnv) {
				setLoading(false);
				return;
			}
			if (verifiedUserCode === null) {
				setLoading(false);
				return;
			}

			setLoading(true);
			try {
				const [
					overviewData,
					expenseData,
					holdingsData,
					installmentData,
					stockLogs,
					installmentContributionLogs,
				] = await Promise.all([
					fetchOverview(),
					fetchExpenseItems(),
					fetchHoldings(),
					fetchInstallments(),
					fetchAccumulationLogsByDateRange(
						currentMonthRange.fromDate,
						currentMonthRange.toDate,
					),
					fetchInstallmentContributionLogsByDateRange(
						currentMonthRange.fromDate,
						currentMonthRange.toDate,
					),
				]);
				if (cancelled) {
					return;
				}

				setOverview(overviewData);
				setExpenseItems(expenseData);
				setHoldings(holdingsData);
				setInstallments(installmentData);
				setAccumulationLogs(stockLogs);
				setInstallmentLogs(installmentContributionLogs);
			} catch (error) {
				if (cancelled) {
					return;
				}
				setMessage(extractError(error));
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [currentMonthRange.fromDate, currentMonthRange.toDate, verifiedUserCode]);

	const refreshUsdKrwRate = useCallback(async (silent = false) => {
		setLoadingFxRate(true);
		try {
			const rate = await fetchUsdKrwRate();
			if (rate === null) {
				if (!silent) {
					setMessage("USD/KRW 환율을 불러오지 못했습니다.");
				}
				return;
			}
			setUsdKrwRate(rate.price);
			setUsdKrwUpdatedAt(rate.asOf);
			if (!silent) {
				setMessage(
					`USD/KRW 환율이 갱신되었습니다. (${formatFxRate(rate.price)})`,
				);
			}
		} catch (error) {
			if (!silent) {
				setMessage(extractError(error));
			}
		} finally {
			setLoadingFxRate(false);
		}
	}, []);

	const reflectAccumulationLogs = useCallback(
		async (silent = false) => {
			if (!hasSupabaseEnv) {
				return;
			}

			const todayDate = new Date();
			const dateRange = getCurrentMonthDateRange();
			const existingKeys = new Set(
				accumulationLogs.map((log) => `${log.holdingId}-${log.runDate}`),
			);
			const logsToInsert: Omit<StockAccumulationLog, "id">[] = [];

			for (const holding of holdings) {
				if (
					!holding.isAccumulating ||
					holding.cadence === null ||
					holding.runDay === null
				) {
					continue;
				}

				const dueDates = getDueDatesForCurrentMonth(
					holding.cadence,
					holding.runDay,
					todayDate,
					holding.accumulationStartedAt,
				);

				for (const runDate of dueDates) {
					const key = `${holding.id}-${runDate}`;
					if (existingKeys.has(key)) {
						continue;
					}

					const referencePrice =
						typeof quotes[holding.id]?.price === "number"
							? (quotes[holding.id]?.price ?? 0)
							: holding.averagePrice;
					if (referencePrice <= 0 && holding.accumulationType === "SHARES") {
						continue;
					}

					let localAmount = 0;
					let currency: "KRW" | "USD" = "KRW";
					let fxRate: number | null = null;
					let krwAmount = 0;

					if (holding.accumulationType === "SHARES") {
						localAmount = holding.accumulationValue * referencePrice;
						if (localAmount <= 0) {
							continue;
						}
						if (holding.market === "US") {
							if (usdKrwRate === null) {
								continue;
							}
							currency = "USD";
							fxRate = usdKrwRate;
							krwAmount = Math.round(localAmount * usdKrwRate);
						} else {
							currency = "KRW";
							krwAmount = Math.round(localAmount);
						}
					} else {
						localAmount = holding.accumulationValue;
						if (localAmount <= 0) {
							continue;
						}
						if (
							holding.market === "US" &&
							holding.accumulationCurrency === "USD"
						) {
							if (usdKrwRate === null) {
								continue;
							}
							currency = "USD";
							fxRate = usdKrwRate;
							krwAmount = Math.round(localAmount * usdKrwRate);
						} else {
							currency = "KRW";
							krwAmount = Math.round(localAmount);
						}
					}

					logsToInsert.push({
						holdingId: holding.id,
						runDate,
						localAmount,
						currency,
						fxRate,
						krwAmount,
					});
				}
			}

			if (logsToInsert.length === 0) {
				return;
			}

			setReflectingAccumulation(true);
			try {
				await upsertAccumulationLogs(logsToInsert);
				const latestLogs = await fetchAccumulationLogsByDateRange(
					dateRange.fromDate,
					dateRange.toDate,
				);
				setAccumulationLogs(latestLogs);
				if (!silent) {
					setMessage(
						`모으기 자동 반영 완료: ${logsToInsert.length}건이 이번 달에 반영되었습니다.`,
					);
				}
			} catch (error) {
				if (!silent) {
					setMessage(extractError(error));
				}
			} finally {
				setReflectingAccumulation(false);
			}
		},
		[accumulationLogs, holdings, quotes, usdKrwRate],
	);

	const reflectInstallmentLogs = useCallback(
		async (silent = false) => {
			if (!hasSupabaseEnv) {
				return;
			}

			const todayDate = new Date();
			const dateRange = getCurrentMonthDateRange();
			const existingKeys = new Set(
				installmentLogs.map((log) => `${log.installmentId}-${log.runDate}`),
			);
			const logsToInsert: Omit<InstallmentContributionLog, "id">[] = [];

			for (const installment of installments) {
				if (
					!installment.isRecurring ||
					installment.cadence === null ||
					installment.runDay === null
				) {
					continue;
				}
				if (installment.monthlyAmount <= 0) {
					continue;
				}

				const dueDates = getInstallmentDueDatesForCurrentMonth(
					installment.cadence,
					installment.runDay,
					todayDate,
					installment.recurringStartedAt,
					installment.applyMode,
				);

				for (const runDate of dueDates) {
					const key = `${installment.id}-${runDate}`;
					if (existingKeys.has(key)) {
						continue;
					}
					logsToInsert.push({
						installmentId: installment.id,
						runDate,
						amount: installment.monthlyAmount,
					});
				}
			}

			if (logsToInsert.length === 0) {
				return;
			}

			setReflectingInstallments(true);
			try {
				await upsertInstallmentContributionLogs(logsToInsert);
				const latestLogs = await fetchInstallmentContributionLogsByDateRange(
					dateRange.fromDate,
					dateRange.toDate,
				);
				setInstallmentLogs(latestLogs);
				if (!silent) {
					setMessage(
						`적금 자동 반영 완료: ${logsToInsert.length}건이 이번 달에 반영되었습니다.`,
					);
				}
			} catch (error) {
				if (!silent) {
					setMessage(extractError(error));
				}
			} finally {
				setReflectingInstallments(false);
			}
		},
		[installmentLogs, installments],
	);

	useEffect(() => {
		refreshUsdKrwRate(true).catch(() => {});
	}, [refreshUsdKrwRate]);

	useEffect(() => {
		const nextDrafts: Record<number, ExpenseDraft> = {};
		for (const item of expenseItems) {
			nextDrafts[item.id] = {
				name: item.name,
				amount: item.amount,
			};
		}
		setExpenseDrafts(nextDrafts);
	}, [expenseItems]);

	useEffect(() => {
		const nextDrafts: Record<number, HoldingEditDraft> = {};
		for (const item of holdings) {
			nextDrafts[item.id] = {
				quantity: item.quantity,
				averagePrice: item.averagePrice,
				isAccumulating: item.isAccumulating,
				cadence: item.cadence ?? "MONTHLY",
				runDay: item.runDay ?? 1,
				accumulationType: item.accumulationType,
				accumulationCurrency: item.accumulationCurrency,
				accumulationValue: item.accumulationValue,
			};
		}
		setHoldingDrafts(nextDrafts);
	}, [holdings]);

	useEffect(() => {
		if (!hasUsHoldings || usdKrwRate !== null) {
			return;
		}
		refreshUsdKrwRate(true).catch(() => {});
	}, [hasUsHoldings, usdKrwRate, refreshUsdKrwRate]);

	useEffect(() => {
		reflectAccumulationLogs(true).catch(() => {});
	}, [reflectAccumulationLogs]);

	useEffect(() => {
		reflectInstallmentLogs(true).catch(() => {});
	}, [reflectInstallmentLogs]);

	useEffect(() => {
		const nextDrafts: Record<number, InstallmentDraft> = {};
		for (const item of installments) {
			nextDrafts[item.id] = {
				name: item.name,
				monthlyAmount: item.monthlyAmount,
				savedAmount: item.savedAmount,
				isRecurring: item.isRecurring,
				cadence: item.cadence ?? "MONTHLY",
				runDay: item.runDay ?? 1,
				applyMode: item.applyMode,
				recurringStartedAt: item.recurringStartedAt,
				startDate: item.startDate,
				maturityDate: item.maturityDate,
				benefitType: item.benefitType,
				benefitValue: item.benefitValue,
			};
		}
		setInstallmentDrafts(nextDrafts);
	}, [installments]);

	useEffect(() => {
		refreshStockQuotes({ forceRefresh: false, silent: true }).catch(() => {});
	}, [refreshStockQuotes]);

	const installmentCurrentMonthLogTotal = useMemo(
		() => installmentLogs.reduce((sum, log) => sum + log.amount, 0),
		[installmentLogs],
	);

	const fixedExpenseTotal = useMemo(
		() =>
			expenseItems
				.filter((item) => item.kind === "FIXED")
				.reduce((sum, item) => sum + item.amount, 0),
		[expenseItems],
	);

	const variableExpenseTotal = useMemo(
		() =>
			expenseItems
				.filter((item) => item.kind === "VARIABLE")
				.reduce((sum, item) => sum + item.amount, 0),
		[expenseItems],
	);

	const stockCurrentMonthLogTotal = useMemo(
		() => accumulationLogs.reduce((sum, log) => sum + log.krwAmount, 0),
		[accumulationLogs],
	);

	const installmentMonthlyTotal = useMemo(() => {
		const todayInput = toDateInput(new Date());
		return installments.reduce((sum, item) => {
			if (!item.isRecurring || item.monthlyAmount <= 0) {
				return sum;
			}
			if (item.startDate > todayInput) {
				return sum;
			}
			if (item.maturityDate !== null && item.maturityDate < todayInput) {
				return sum;
			}
			const cadence = item.cadence ?? "MONTHLY";
			const multiplier = cadence === "WEEKLY" ? 4 : 1;
			return sum + Math.round(item.monthlyAmount * multiplier);
		}, 0);
	}, [installments]);

	const stockMonthlyTotal = useMemo(() => {
		return holdings.reduce((sum, holding) => {
			if (
				!holding.isAccumulating ||
				holding.cadence === null ||
				holding.runDay === null ||
				holding.accumulationValue <= 0
			) {
				return sum;
			}

			const cadenceMultiplier = holding.cadence === "WEEKLY" ? 4 : 1;
			let perCycleKrw = 0;

			if (holding.accumulationType === "AMOUNT") {
				if (holding.market === "US") {
					if (holding.accumulationCurrency === "KRW") {
						perCycleKrw = holding.accumulationValue;
					} else {
						if (usdKrwRate === null) {
							return sum;
						}
						perCycleKrw = holding.accumulationValue * usdKrwRate;
					}
				} else {
					perCycleKrw = holding.accumulationValue;
				}
			} else {
				const referencePrice =
					typeof quotes[holding.id]?.price === "number"
						? (quotes[holding.id]?.price ?? 0)
						: holding.averagePrice;
				if (referencePrice <= 0) {
					return sum;
				}
				if (holding.market === "US") {
					if (usdKrwRate === null) {
						return sum;
					}
					perCycleKrw = holding.accumulationValue * referencePrice * usdKrwRate;
				} else {
					perCycleKrw = holding.accumulationValue * referencePrice;
				}
			}

			return sum + Math.round(perCycleKrw * cadenceMultiplier);
		}, 0);
	}, [holdings, quotes, usdKrwRate]);

	const stockPerformanceSummary = useMemo(() => {
		let investedTotalKrw = 0;
		let investedComparableKrw = 0;
		let evaluationComparableKrw = 0;
		let missingQuoteCount = 0;
		let missingFxCount = 0;
		let comparableCount = 0;

		for (const holding of holdings) {
			const fxRate = holding.market === "US" ? usdKrwRate : 1;
			if (fxRate === null) {
				missingFxCount += 1;
				continue;
			}

			const investedKrw = holding.quantity * holding.averagePrice * fxRate;
			investedTotalKrw += investedKrw;

			const quotePrice = quotes[holding.id]?.price;
			if (typeof quotePrice !== "number") {
				missingQuoteCount += 1;
				continue;
			}

			investedComparableKrw += investedKrw;
			evaluationComparableKrw += quotePrice * holding.quantity * fxRate;
			comparableCount += 1;
		}

		const profitKrw = evaluationComparableKrw - investedComparableKrw;
		const profitRate =
			investedComparableKrw > 0
				? (profitKrw / investedComparableKrw) * 100
				: null;

		return {
			investedTotalKrw: Math.round(investedTotalKrw),
			profitKrw: Math.round(profitKrw),
			profitRate,
			comparableCount,
			missingQuoteCount,
			missingFxCount,
		};
	}, [holdings, quotes, usdKrwRate]);

	const monthlyRemaining = useMemo(() => {
		return (
			overview.salary -
			(fixedExpenseTotal +
				variableExpenseTotal +
				installmentMonthlyTotal +
				stockMonthlyTotal)
		);
	}, [
		overview.salary,
		fixedExpenseTotal,
		variableExpenseTotal,
		installmentMonthlyTotal,
		stockMonthlyTotal,
	]);

	async function handleSaveOverview() {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		setSavingOverviewState(true);
		try {
			await saveOverview({
				salary: overview.salary,
			});
			setMessage("월급 정보가 저장되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setSavingOverviewState(false);
		}
	}

	function handleResetUserCode() {
		clearActiveUserCode();
		localStorage.removeItem(USER_CODE_STORAGE_KEY);
		setVerifiedUserCode(null);
		setUserCodeInput("");
		setMessage("");
		setOverview(defaultOverview);
		setExpenseItems([]);
		setHoldings([]);
		setInstallments([]);
		setAccumulationLogs([]);
		setInstallmentLogs([]);
		setQuotes({});
	}

	async function handleAddExpense(kind: ExpenseKind) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}

		const form = expenseForms[kind];
		if (form.name.trim().length === 0) {
			setMessage("지출 항목명을 입력해주세요.");
			return;
		}

		setSubmittingExpenseKind(kind);
		try {
			const created = await insertExpenseItem({
				kind,
				name: form.name.trim(),
				amount: form.amount,
			});
			setExpenseItems((prev) => [...prev, created]);
			setExpenseForms((prev) => ({
				...prev,
				[kind]: { ...defaultExpenseDraft },
			}));
			setMessage(
				`${kind === "FIXED" ? "고정" : "비고정"} 지출 항목이 저장되었습니다.`,
			);
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setSubmittingExpenseKind(null);
		}
	}

	async function handleUpdateExpense(item: ExpenseItem) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		const draft = expenseDrafts[item.id];
		if (draft === undefined) {
			return;
		}
		if (draft.name.trim().length === 0) {
			setMessage("지출 항목명을 입력해주세요.");
			return;
		}

		try {
			await updateExpenseItem(item.id, {
				kind: item.kind,
				name: draft.name.trim(),
				amount: draft.amount,
			});
			setExpenseItems((prev) =>
				prev.map((entry) =>
					entry.id === item.id
						? { ...entry, name: draft.name.trim(), amount: draft.amount }
						: entry,
				),
			);
			setMessage("지출 항목이 수정되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		}
	}

	async function handleDeleteExpense(id: number) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		try {
			await deleteExpenseItem(id);
			setExpenseItems((prev) => prev.filter((item) => item.id !== id));
			setMessage("지출 항목이 삭제되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		}
	}

	async function handleSearchSymbols() {
		if (stockSearchQuery.trim().length < 1) {
			setMessage("검색어를 입력해주세요.");
			return;
		}
		setSearchingStockSymbol(true);

		try {
			const results = await searchStockSymbolsByMarket(
				stockSearchQuery,
				holdingForm.market,
			);
			setStockSymbolResults(results);
			if (results.length === 0) {
				if (!hasUsStockApiKey && holdingForm.market === "US") {
					setMessage(
						"해외 종목 검색은 API 키가 필요합니다. VITE_EODHD_API_KEY 또는 VITE_FMP_API_KEY를 설정해주세요.",
					);
				} else {
					setMessage("검색 결과가 없습니다. 티커(symbol)로 다시 검색해보세요.");
				}
			}
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setSearchingStockSymbol(false);
		}
	}

	function applySymbol(item: SymbolSearchItem) {
		setHoldingForm((prev) => ({
			...prev,
			symbol: item.symbol,
			name: item.name,
			market: item.market,
			quoteSymbol: item.quoteSymbol,
			accumulationCurrency:
				item.market === "US" ? prev.accumulationCurrency : "KRW",
		}));
		setStockSearchQuery(item.symbol);
		setStockSymbolResults([]);
		setIsHoldingFormModalOpen(true);
	}

	async function handleAddHolding() {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		if (
			holdingForm.symbol.trim().length === 0 ||
			holdingForm.name.trim().length === 0
		) {
			setMessage("종목을 먼저 선택해주세요.");
			return;
		}
		setSubmittingHolding(true);
		try {
			const normalizedRunDay = clampRunDay(
				holdingForm.runDay,
				holdingForm.cadence,
			);
			const isAccumulating = holdingForm.isAccumulating;
			const created = await insertHolding({
				...holdingForm,
				symbol: holdingForm.symbol.trim(),
				name: holdingForm.name.trim(),
				quoteSymbol:
					holdingForm.quoteSymbol.trim().length > 0
						? holdingForm.quoteSymbol.trim()
						: holdingForm.symbol.trim(),
				isAccumulating,
				accumulationStartedAt: isAccumulating ? new Date().toISOString() : null,
				cadence: isAccumulating ? holdingForm.cadence : null,
				runDay: isAccumulating ? normalizedRunDay : null,
				accumulationCurrency:
					holdingForm.market === "US"
						? holdingForm.accumulationCurrency
						: "KRW",
				accumulationValue: isAccumulating ? holdingForm.accumulationValue : 0,
			});
			setHoldings((prev) => [...prev, created]);
			setHoldingForm(defaultHoldingForm);
			setStockSymbolResults([]);
			setStockSearchQuery("");
			setIsHoldingFormModalOpen(false);
			setMessage("보유 주식이 저장되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setSubmittingHolding(false);
		}
	}

	async function handleUpdateHolding(item: StockHolding) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		const draft = holdingDrafts[item.id];
		if (draft === undefined) {
			return;
		}
		try {
			const normalizedRunDay = clampRunDay(draft.runDay, draft.cadence);
			const isAccumulating = draft.isAccumulating;
			const shouldResetAccumulationStart =
				isAccumulating &&
				(!item.isAccumulating ||
					item.cadence !== draft.cadence ||
					item.runDay !== normalizedRunDay ||
					item.accumulationType !== draft.accumulationType ||
					item.accumulationCurrency !== draft.accumulationCurrency ||
					item.accumulationValue !== draft.accumulationValue);
			const next: Omit<StockHolding, "id"> = {
				...item,
				quantity: draft.quantity,
				averagePrice: draft.averagePrice,
				isAccumulating,
				accumulationStartedAt: isAccumulating
					? shouldResetAccumulationStart
						? new Date().toISOString()
						: item.accumulationStartedAt
					: null,
				cadence: isAccumulating ? draft.cadence : null,
				runDay: isAccumulating ? normalizedRunDay : null,
				accumulationType: draft.accumulationType,
				accumulationCurrency:
					item.market === "US" ? draft.accumulationCurrency : "KRW",
				accumulationValue: isAccumulating ? draft.accumulationValue : 0,
			};
			await updateHolding(item.id, next);
			setHoldings((prev) =>
				prev.map((entry) =>
					entry.id === item.id ? { ...item, ...next } : entry,
				),
			);
			setMessage(`${item.symbol} 정보가 수정되었습니다.`);
		} catch (error) {
			setMessage(extractError(error));
		}
	}

	async function handleDeleteHolding(id: number) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		try {
			await deleteHolding(id);
			setHoldings((prev) => prev.filter((item) => item.id !== id));
			setQuotes((prev) => {
				const next = { ...prev };
				delete next[id];
				return next;
			});
			setAccumulationLogs((prev) => prev.filter((log) => log.holdingId !== id));
			setMessage("보유 종목이 삭제되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		}
	}

	async function handleAddInstallment() {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		if (installmentForm.name.trim().length === 0) {
			setMessage("적금명을 입력해주세요.");
			return;
		}
		if (
			installmentForm.maturityDate !== null &&
			installmentForm.maturityDate <= installmentForm.startDate
		) {
			setMessage("만기일은 시작일 이후여야 합니다.");
			return;
		}
		if (!isValidInstallmentBenefit(installmentForm)) {
			setMessage("만기 혜택 값(이율 또는 만기금액)을 올바르게 입력해주세요.");
			return;
		}
		if (
			installmentForm.isRecurring &&
			(!isValidRecurringInstallmentConfig(installmentForm) ||
				installmentForm.monthlyAmount <= 0)
		) {
			setMessage("정기 납입 규칙(주기/실행일/회차 납입액)을 확인해주세요.");
			return;
		}
		setSubmittingInstallment(true);
		try {
			const normalizedRunDay = clampRunDay(
				installmentForm.runDay,
				installmentForm.cadence,
			);
			const isRecurring = installmentForm.isRecurring;
			const created = await insertInstallment({
				...installmentForm,
				name: installmentForm.name.trim(),
				monthlyAmount: isRecurring ? installmentForm.monthlyAmount : 0,
				cadence: isRecurring ? installmentForm.cadence : null,
				runDay: isRecurring ? normalizedRunDay : null,
				recurringStartedAt: isRecurring ? new Date().toISOString() : null,
			});
			setInstallments((prev) => [...prev, created]);
			setInstallmentForm(defaultInstallmentDraft);
			setMessage("적금 정보가 저장되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setSubmittingInstallment(false);
		}
	}

	async function handleUpdateInstallment(id: number) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		const draft = installmentDrafts[id];
		if (draft === undefined) {
			return;
		}
		if (draft.name.trim().length === 0) {
			setMessage("적금명을 입력해주세요.");
			return;
		}
		if (draft.maturityDate !== null && draft.maturityDate <= draft.startDate) {
			setMessage("만기일은 시작일 이후여야 합니다.");
			return;
		}
		if (!isValidInstallmentBenefit(draft)) {
			setMessage("만기 혜택 값(이율 또는 만기금액)을 올바르게 입력해주세요.");
			return;
		}
		if (
			draft.isRecurring &&
			(!isValidRecurringInstallmentConfig(draft) || draft.monthlyAmount <= 0)
		) {
			setMessage("정기 납입 규칙(주기/실행일/회차 납입액)을 확인해주세요.");
			return;
		}

		try {
			const target = installments.find((item) => item.id === id);
			if (target === undefined) {
				return;
			}
			const normalizedRunDay = clampRunDay(draft.runDay, draft.cadence);
			const isRecurring = draft.isRecurring;
			const shouldResetRecurringStart =
				isRecurring &&
				(!target.isRecurring ||
					target.monthlyAmount !== draft.monthlyAmount ||
					target.cadence !== draft.cadence ||
					target.runDay !== normalizedRunDay ||
					target.applyMode !== draft.applyMode);
			const next: Omit<InstallmentSaving, "id"> = {
				...target,
				name: draft.name.trim(),
				monthlyAmount: isRecurring ? draft.monthlyAmount : 0,
				savedAmount: draft.savedAmount,
				isRecurring,
				cadence: isRecurring ? draft.cadence : null,
				runDay: isRecurring ? normalizedRunDay : null,
				applyMode: draft.applyMode,
				recurringStartedAt: isRecurring
					? shouldResetRecurringStart
						? new Date().toISOString()
						: target.recurringStartedAt
					: null,
				startDate: draft.startDate,
				maturityDate: draft.maturityDate,
				benefitType: draft.benefitType,
				benefitValue: draft.benefitValue,
			};
			await updateInstallment(id, next);
			setInstallments((prev) =>
				prev.map((item) => (item.id === id ? { id, ...next } : item)),
			);
			setMessage("적금 정보가 수정되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		}
	}

	async function handleDeleteInstallment(id: number) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		try {
			await deleteInstallment(id);
			setInstallments((prev) => prev.filter((item) => item.id !== id));
			setInstallmentLogs((prev) =>
				prev.filter((log) => log.installmentId !== id),
			);
			setMessage("적금 정보가 삭제되었습니다.");
		} catch (error) {
			setMessage(extractError(error));
		}
	}

	const brokerGroups = useMemo(
		() =>
			BROKERS.map((broker) => ({
				broker,
				items: holdings.filter((item) => item.broker === broker),
			})),
		[holdings],
	);

	const monthlyLogSummaryByHolding = useMemo(() => {
		const summary: Record<number, { count: number; krwAmount: number }> = {};
		for (const log of accumulationLogs) {
			const current = summary[log.holdingId] ?? { count: 0, krwAmount: 0 };
			summary[log.holdingId] = {
				count: current.count + 1,
				krwAmount: current.krwAmount + log.krwAmount,
			};
		}
		return summary;
	}, [accumulationLogs]);

	const monthlyInstallmentLogSummary = useMemo(() => {
		const summary: Record<number, { count: number; amount: number }> = {};
		for (const log of installmentLogs) {
			const current = summary[log.installmentId] ?? { count: 0, amount: 0 };
			summary[log.installmentId] = {
				count: current.count + 1,
				amount: current.amount + log.amount,
			};
		}
		return summary;
	}, [installmentLogs]);

	const fixedExpenseItems = useMemo(
		() => expenseItems.filter((item) => item.kind === "FIXED"),
		[expenseItems],
	);

	const variableExpenseItems = useMemo(
		() => expenseItems.filter((item) => item.kind === "VARIABLE"),
		[expenseItems],
	);

	if (verifiedUserCode === null) {
		return (
			<main className="min-h-screen bg-zinc-100 px-3 py-8 text-slate-900 md:px-6 xl:px-8">
				<div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
					<p className="text-sm text-slate-500">my-hundred-million</p>
					<h1 className="mt-2 text-2xl font-semibold">식별 번호 확인</h1>
					<p className="mt-3 text-sm text-slate-600">
						데이터 수정 전 식별 번호를 먼저 검증합니다. 기존 데이터는 첫 인증 시
						현재 식별 번호로 자동 마이그레이션됩니다.
					</p>
					{!hasSupabaseEnv ? (
						<div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
							VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 먼저 설정해주세요.
						</div>
					) : null}
					<div className="mt-4 flex gap-2">
						<input
							className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
							placeholder="예: DONGHYUN-2026"
							value={userCodeInput}
							onChange={(event) => setUserCodeInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									void verifyUserCode();
								}
							}}
						/>
						<Button
							type="button"
							onClick={() => verifyUserCode()}
							disabled={verifyingUserCode || !hasSupabaseEnv}
						>
							{verifyingUserCode ? "검증 중..." : "검증"}
						</Button>
					</div>
					{message.length > 0 ? (
						<div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
							{message}
						</div>
					) : null}
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-zinc-100 px-3 py-8 text-slate-900 md:px-6 xl:px-8">
			<div className="mx-auto grid max-w-[1820px] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
				<aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-hidden">
					<div className="flex items-center gap-2">
						<div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
						<p className="text-lg font-semibold">my-hundred-million</p>
					</div>
					<div className="mt-5 h-full overflow-y-auto pr-1 pb-6">
						<h2 className="text-base font-semibold">5. 시스템 상태</h2>
						<p className="mt-2 text-sm text-slate-600">
							연동 상태와 빠른 갱신 액션을 확인합니다.
						</p>
						<div className="mt-4 grid gap-3">
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
								<p className="text-xs text-slate-500">식별 번호</p>
								<p className="mt-1 text-sm font-semibold">{verifiedUserCode}</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
								<p className="text-xs text-slate-500">Supabase</p>
								<p className="mt-1 text-sm font-semibold">
									{hasSupabaseEnv ? "연결 변수 설정됨" : "미설정"}
								</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
								<p className="text-xs text-slate-500">주식 API</p>
								<p className="mt-1 text-sm font-semibold">
									{hasStockApiKey ? "사용 가능" : "미설정"}
								</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
								<p className="text-xs text-slate-500">환율(USD/KRW)</p>
								<p className="mt-1 text-sm font-semibold">
									{usdKrwRate === null ? "미연동" : formatFxRate(usdKrwRate)}
								</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
								<p className="text-xs text-slate-500">현재가 캐시</p>
								<p className="mt-1 text-sm font-semibold">30분</p>
							</div>
						</div>
						<div className="mt-4 grid gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => refreshUsdKrwRate()}
								disabled={loadingFxRate}
							>
								{loadingFxRate ? "환율 갱신 중..." : "환율 새로고침"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									refreshStockQuotes({
										forceRefresh: true,
										silent: false,
									})
								}
								disabled={loadingQuotes || !hasStockApiKey}
							>
								{loadingQuotes ? "현재가 갱신 중..." : "현재가 새로고침"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={handleResetUserCode}
							>
								식별 번호 변경
							</Button>
						</div>
						<div className="mt-6 border-t border-slate-200 pt-4">
							<h2 className="text-base font-semibold">4. 월 잔액 요약</h2>
							<p className="mt-2 text-xs text-slate-600">
								공식: 월급 - (고정지출 + 비고정지출 + 적금 월 고정지출 + 주식
								모으기 월 고정지출)
							</p>
							<div className="mt-3 grid gap-2">
								<SummaryCard label="월급" value={overview.salary} />
								<SummaryCard label="고정지출" value={fixedExpenseTotal} />
								<SummaryCard label="비고정지출" value={variableExpenseTotal} />
								<SummaryCard
									label="적금 월 고정지출"
									value={installmentMonthlyTotal}
								/>
								<SummaryCard
									label="주식 모으기 월 고정지출"
									value={stockMonthlyTotal}
								/>
							</div>
							<div
								className={`mt-3 rounded-xl p-3 text-center text-base font-semibold ${
									monthlyRemaining >= 0
										? "bg-emerald-100 text-emerald-800"
										: "bg-rose-100 text-rose-800"
								}`}
							>
								월 잔액: {formatKrw(monthlyRemaining)}
							</div>
						</div>
					</div>
				</aside>
				<div className="space-y-6">
					<header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
						<p className="text-sm text-slate-500">my-hundred-million</p>
						<h1 className="mt-2 text-2xl font-semibold md:text-3xl">
							자산 현황 대시보드
						</h1>
						<p className="mt-3 text-sm text-slate-600">
							월급, 지출, 주식 모으기, 적금을 한 곳에서 관리하고 월 잔액을
							확인합니다.
						</p>
						<div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
							<p>Supabase: {hasSupabaseEnv ? "연결 변수 설정됨" : "미설정"}</p>
							<p>
								주식 API:{" "}
								{hasStockApiKey ? "현재가/수익률 계산 가능" : "미설정"}
							</p>
							<p>
								환율(USD/KRW):{" "}
								{usdKrwRate === null ? "미연동" : formatFxRate(usdKrwRate)}
							</p>
						</div>
					</header>

					{!hasSupabaseEnv ? (
						<div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
							VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정해야 저장 기능이
							동작합니다.
						</div>
					) : null}

					{message.length > 0 ? (
						<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
							{message}
						</div>
					) : null}

					{!loading ? (
						<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
							<DashboardStatCard
								title="월 잔액"
								value={formatKrw(monthlyRemaining)}
								emphasis={monthlyRemaining >= 0 ? "positive" : "negative"}
							/>
							<DashboardStatCard
								title="월 지출 합계"
								value={formatKrw(fixedExpenseTotal + variableExpenseTotal)}
							/>
							<DashboardStatCard
								title="월 저축 합계"
								value={formatKrw(installmentMonthlyTotal + stockMonthlyTotal)}
							/>
							<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
								<p className="text-xs text-slate-500">월급</p>
								<div className="mt-2 flex items-center gap-2">
									<CurrencyInput
										value={overview.salary}
										onChange={(value) =>
											setOverview((prev) => ({ ...prev, salary: value }))
										}
									/>
									<Button
										type="button"
										onClick={handleSaveOverview}
										disabled={savingOverviewState}
										className="shrink-0"
									>
										{savingOverviewState ? "저장 중..." : "저장"}
									</Button>
								</div>
								<p className="mt-2 text-xs text-slate-500">
									{formatKrw(overview.salary)}
								</p>
							</div>
						</div>
					) : null}

					{loading ? (
						<section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
							데이터를 불러오는 중...
						</section>
					) : (
						<div className="grid auto-rows-max items-start gap-6 lg:grid-cols-12 lg:auto-rows-[420px]">
							<section
								id="savings-stock-section"
								className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-1 lg:h-full lg:overflow-y-auto lg:pr-3"
							>
								<h2 className="text-xl font-semibold">
									주식 (토스증권 / 삼성증권)
								</h2>

								<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
									<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
										<span>
											USD/KRW 환율:{" "}
											{usdKrwRate === null
												? "미연동"
												: formatFxRate(usdKrwRate)}
										</span>
										<span>
											기준 시각:{" "}
											{usdKrwUpdatedAt === null
												? "-"
												: new Date(usdKrwUpdatedAt).toLocaleString("ko-KR")}
										</span>
										<span>
											현재가 기준 시각:{" "}
											{latestQuoteUpdatedAt === null
												? "-"
												: new Date(latestQuoteUpdatedAt).toLocaleString(
														"ko-KR",
													)}
										</span>
										<Button
											type="button"
											variant="outline"
											onClick={() => reflectAccumulationLogs()}
											disabled={reflectingAccumulation}
										>
											{reflectingAccumulation
												? "자동 반영 중..."
												: "이번 달 자동 반영 실행"}
										</Button>
										<span>
											이번 달 반영 합계: {formatKrw(stockCurrentMonthLogTotal)}{" "}
											({accumulationLogs.length}건)
										</span>
										<span>현재가 캐시: 30분</span>
									</div>
									{hasUsHoldings && usdKrwRate === null ? (
										<p className="mt-2 text-xs text-amber-700">
											미국 주식이 있어 월 납입 계산에 환율이 필요합니다. 환율을
											갱신해주세요.
										</p>
									) : null}
									<div className="mt-4 grid gap-3 lg:grid-cols-3">
										<DashboardStatCard
											title="주식 투입 금액"
											value={formatKrw(
												stockPerformanceSummary.investedTotalKrw,
											)}
											delta={
												stockPerformanceSummary.comparableCount === 0
													? null
													: `(${
															stockPerformanceSummary.profitKrw >= 0 ? "+" : "-"
														}${formatNumber(
															Math.abs(stockPerformanceSummary.profitKrw),
														)})`
											}
											deltaEmphasis={
												stockPerformanceSummary.profitKrw >= 0
													? "positive"
													: "negative"
											}
										/>
										<DashboardStatCard
											title="주식 수익률"
											value={
												stockPerformanceSummary.profitRate === null
													? "-"
													: `${stockPerformanceSummary.profitRate.toFixed(2)}%`
											}
											emphasis={
												stockPerformanceSummary.profitRate === null
													? "default"
													: stockPerformanceSummary.profitRate >= 0
														? "positive"
														: "negative"
											}
										/>
										<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
											<p className="text-xs uppercase tracking-wide text-slate-500">
												종목 관리
											</p>
											<div className="mt-2 flex gap-2">
												<Button
													type="button"
													onClick={() => setIsHoldingFormModalOpen(true)}
												>
													보유 종목 추가
												</Button>
											</div>
											<p className="mt-2 text-xs text-slate-500">
												종목 검색과 신규 보유 등록은 같은 모달에서 진행합니다.
											</p>
										</div>
									</div>
									{stockPerformanceSummary.missingFxCount > 0 ||
									stockPerformanceSummary.missingQuoteCount > 0 ? (
										<p className="mt-2 text-xs text-slate-500">
											일부 종목은 환율/현재가 미연동으로 수익률 계산에서
											제외되었습니다. (환율 미연동{" "}
											{stockPerformanceSummary.missingFxCount}개, 현재가 미연동{" "}
											{stockPerformanceSummary.missingQuoteCount}개)
										</p>
									) : null}

									<div className="mt-5 space-y-4">
										{brokerGroups.map((group) => (
											<div
												className="rounded-xl border border-slate-200 bg-white p-4"
												key={group.broker}
											>
												<h4 className="font-semibold">
													{group.broker === "TOSS" ? "토스증권" : "삼성증권"} (
													{group.items.length})
												</h4>
												<div className="mt-3 space-y-3">
													{group.items.length === 0 ? (
														<p className="text-sm text-slate-500">
															등록된 종목이 없습니다.
														</p>
													) : null}
													{group.items.map((item) => {
														const draft = holdingDrafts[item.id];
														if (draft === undefined) {
															return null;
														}
														const quote = quotes[item.id]?.price;
														const currentPrice =
															typeof quote === "number" ? quote : null;
														const isUsHolding = item.market === "US";
														const evaluationAmountLocal =
															currentPrice === null
																? null
																: currentPrice * draft.quantity;
														const costAmountLocal =
															draft.averagePrice * draft.quantity;
														const profitAmountLocal =
															evaluationAmountLocal === null
																? null
																: evaluationAmountLocal - costAmountLocal;
														const profitRate =
															profitAmountLocal === null || costAmountLocal <= 0
																? null
																: (profitAmountLocal / costAmountLocal) * 100;
														const currentPriceKrw =
															isUsHolding &&
															currentPrice !== null &&
															usdKrwRate !== null
																? currentPrice * usdKrwRate
																: currentPrice;
														const evaluationAmountKrw =
															isUsHolding &&
															evaluationAmountLocal !== null &&
															usdKrwRate !== null
																? evaluationAmountLocal * usdKrwRate
																: evaluationAmountLocal;
														const profitAmountKrw =
															isUsHolding &&
															profitAmountLocal !== null &&
															usdKrwRate !== null
																? profitAmountLocal * usdKrwRate
																: profitAmountLocal;
														const monthlySummary = monthlyLogSummaryByHolding[
															item.id
														] ?? { count: 0, krwAmount: 0 };
														const scheduleText =
															item.isAccumulating &&
															item.cadence !== null &&
															item.runDay !== null
																? item.cadence === "WEEKLY"
																	? `매주 ${getWeekdayLabel(item.runDay)}`
																	: `매달 ${item.runDay}일`
																: "잔고 전용";

														return (
															<div
																key={item.id}
																className="rounded-lg border border-slate-200 p-3"
															>
																<div className="flex flex-wrap items-center justify-between gap-2">
																	<div>
																		<p className="font-medium">
																			{item.name} ({item.symbol})
																		</p>
																		<p className="text-xs text-slate-500">
																			유형:{" "}
																			{item.isAccumulating
																				? `모으기 (${scheduleText})`
																				: scheduleText}{" "}
																			/ 이번달 자동 반영:{" "}
																			{formatKrw(monthlySummary.krwAmount)} (
																			{monthlySummary.count}회)
																		</p>
																		{isUsHolding ? (
																			<p className="text-xs text-slate-500">
																				현재가:{" "}
																				{currentPrice === null
																					? "미연동"
																					: formatUsd(currentPrice)}{" "}
																				/{" "}
																				{currentPriceKrw === null
																					? "환율 미연동"
																					: formatKrw(currentPriceKrw)}
																				<br />
																				평가금액:{" "}
																				{evaluationAmountLocal === null
																					? "-"
																					: formatUsd(
																							evaluationAmountLocal,
																						)}{" "}
																				/{" "}
																				{evaluationAmountKrw === null
																					? "환율 미연동"
																					: formatKrw(evaluationAmountKrw)}
																			</p>
																		) : (
																			<p className="text-xs text-slate-500">
																				현재가:{" "}
																				{currentPrice === null
																					? "미연동"
																					: formatKrw(currentPrice)}{" "}
																				/ 평가금액:{" "}
																				{evaluationAmountLocal === null
																					? "-"
																					: formatKrw(evaluationAmountLocal)}
																			</p>
																		)}
																		<p
																			className={`text-xs ${
																				profitAmountLocal !== null &&
																				profitAmountLocal >= 0
																					? "text-emerald-600"
																					: "text-rose-600"
																			}`}
																		>
																			수익:{" "}
																			{profitAmountLocal === null
																				? "-"
																				: isUsHolding
																					? formatUsd(profitAmountLocal)
																					: formatKrw(profitAmountLocal)}
																			{profitRate === null
																				? ""
																				: ` (${profitRate.toFixed(2)}%)`}
																			{isUsHolding
																				? ` / ${
																						profitAmountKrw === null
																							? "환율 미연동"
																							: formatKrw(profitAmountKrw)
																					}`
																				: ""}
																		</p>
																	</div>
																	<div className="flex gap-2">
																		<Button
																			type="button"
																			onClick={() => handleUpdateHolding(item)}
																		>
																			수정 저장
																		</Button>
																		<Button
																			type="button"
																			variant="outline"
																			onClick={() =>
																				handleDeleteHolding(item.id)
																			}
																		>
																			삭제
																		</Button>
																	</div>
																</div>
																<div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
																	<InlineNumberInput
																		label="수량"
																		value={draft.quantity}
																		step={0.0001}
																		onChange={(value) =>
																			setHoldingDrafts((prev) => ({
																				...prev,
																				[item.id]: {
																					...draft,
																					quantity: value,
																				},
																			}))
																		}
																	/>
																	<InlineNumberInput
																		label={
																			item.market === "US"
																				? "평단가(USD)"
																				: "평단가(원)"
																		}
																		value={draft.averagePrice}
																		step={0.01}
																		onChange={(value) =>
																			setHoldingDrafts((prev) => ({
																				...prev,
																				[item.id]: {
																					...draft,
																					averagePrice: value,
																				},
																			}))
																		}
																	/>
																	<div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-2">
																		<label className="flex items-center gap-2 text-xs font-medium">
																			<input
																				type="checkbox"
																				checked={draft.isAccumulating}
																				onChange={(event) =>
																					setHoldingDrafts((prev) => ({
																						...prev,
																						[item.id]: {
																							...draft,
																							isAccumulating:
																								event.target.checked,
																						},
																					}))
																				}
																			/>
																			모으기 종목
																		</label>
																	</div>
																	{draft.isAccumulating ? (
																		<>
																			<div>
																				<label className="mb-1 block text-xs font-medium">
																					주기
																				</label>
																				<select
																					value={draft.cadence}
																					onChange={(event) =>
																						setHoldingDrafts((prev) => ({
																							...prev,
																							[item.id]: {
																								...draft,
																								cadence: event.target
																									.value as Cadence,
																								runDay: 1,
																							},
																						}))
																					}
																					className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
																				>
																					{CADENCES.map((cadence) => (
																						<option
																							key={cadence}
																							value={cadence}
																						>
																							{cadence === "WEEKLY"
																								? "매주"
																								: "매달"}
																						</option>
																					))}
																				</select>
																			</div>
																			<InlineNumberInput
																				label={
																					draft.cadence === "WEEKLY"
																						? "요일(1=월..7=일)"
																						: "매달 n일"
																				}
																				value={draft.runDay}
																				step={1}
																				onChange={(value) =>
																					setHoldingDrafts((prev) => ({
																						...prev,
																						[item.id]: {
																							...draft,
																							runDay: Math.max(
																								1,
																								Math.round(value),
																							),
																						},
																					}))
																				}
																			/>
																			<div>
																				<label className="mb-1 block text-xs font-medium">
																					모으기 기준
																				</label>
																				<select
																					value={draft.accumulationType}
																					onChange={(event) =>
																						setHoldingDrafts((prev) => ({
																							...prev,
																							[item.id]: {
																								...draft,
																								accumulationType: event.target
																									.value as AccumulationType,
																							},
																						}))
																					}
																					className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
																				>
																					<option value="AMOUNT">
																						회차 금액
																					</option>
																					<option value="SHARES">
																						회차 수량
																					</option>
																				</select>
																			</div>
																			{draft.accumulationType === "AMOUNT" &&
																			item.market === "US" ? (
																				<div>
																					<label className="mb-1 block text-xs font-medium">
																						금액 통화
																					</label>
																					<select
																						value={draft.accumulationCurrency}
																						onChange={(event) =>
																							setHoldingDrafts((prev) => ({
																								...prev,
																								[item.id]: {
																									...draft,
																									accumulationCurrency: event
																										.target
																										.value as AccumulationCurrency,
																								},
																							}))
																						}
																						className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
																					>
																						<option value="USD">USD</option>
																						<option value="KRW">
																							원화(KRW)
																						</option>
																					</select>
																				</div>
																			) : null}
																			<InlineNumberInput
																				label={
																					draft.accumulationType === "AMOUNT"
																						? item.market === "US"
																							? `회차 금액(${draft.accumulationCurrency})`
																							: "회차 금액(원)"
																						: "회차 수량(주)"
																				}
																				value={draft.accumulationValue}
																				step={0.0001}
																				onChange={(value) =>
																					setHoldingDrafts((prev) => ({
																						...prev,
																						[item.id]: {
																							...draft,
																							accumulationValue: value,
																						},
																					}))
																				}
																			/>
																		</>
																	) : null}
																</div>
															</div>
														);
													})}
												</div>
											</div>
										))}
									</div>
								</div>
							</section>
							<LayerModal
								open={isHoldingFormModalOpen}
								title="보유 종목 추가"
								onClose={() => setIsHoldingFormModalOpen(false)}
							>
								<div className="grid grid-cols-2 gap-3">
									<div>
										<label className="mb-1 block text-xs font-medium">
											증권사
										</label>
										<select
											value={holdingForm.broker}
											onChange={(event) =>
												setHoldingForm((prev) => ({
													...prev,
													broker: event.target
														.value as (typeof BROKERS)[number],
												}))
											}
											className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
										>
											{BROKERS.map((broker) => (
												<option value={broker} key={broker}>
													{broker === "TOSS" ? "토스증권" : "삼성증권"}
												</option>
											))}
										</select>
									</div>
									<div>
										<label className="mb-1 block text-xs font-medium">
											시장
										</label>
										<select
											value={holdingForm.market}
											onChange={(event) => {
												const nextMarket = event.target.value as "KR" | "US";
												setStockSymbolResults([]);
												setHoldingForm((prev) => ({
													...prev,
													market: nextMarket,
													accumulationCurrency:
														nextMarket === "US"
															? prev.accumulationCurrency
															: "KRW",
												}));
											}}
											className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
										>
											<option value="KR">한국</option>
											<option value="US">미국</option>
										</select>
									</div>
									<div className="col-span-2">
										<label className="mb-1 block text-xs font-medium">
											종목 검색
										</label>
										<div className="flex gap-2">
											<input
												className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
												value={stockSearchQuery}
												onChange={(event) =>
													setStockSearchQuery(event.target.value)
												}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														void handleSearchSymbols();
													}
												}}
												placeholder={
													holdingForm.market === "KR"
														? "삼성전자, 005930"
														: "AAPL, TSLA, NVDA"
												}
											/>
											<Button
												type="button"
												variant="outline"
												onClick={handleSearchSymbols}
												disabled={searchingStockSymbol}
											>
												{searchingStockSymbol ? "검색 중" : "검색"}
											</Button>
										</div>
										<div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
											{stockSymbolResults.length === 0 ? (
												<p className="text-xs text-slate-500">
													종목명 또는 티커를 검색하고 결과를 선택하세요.
												</p>
											) : (
												stockSymbolResults.map((item) => (
													<button
														type="button"
														key={`${item.quoteSymbol}-${item.name}`}
														onClick={() => applySymbol(item)}
														className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
													>
														<p className="font-medium">{item.name}</p>
														<p className="text-xs text-slate-500">
															{item.symbol} ({item.market}) / {item.exchange}
														</p>
													</button>
												))
											)}
										</div>
										<p className="mt-2 text-xs text-slate-500">
											선택된 종목:{" "}
											{holdingForm.symbol.trim().length > 0
												? `${holdingForm.name} (${holdingForm.symbol})`
												: "없음"}
										</p>
									</div>
									<div>
										<label className="mb-1 block text-xs font-medium">
											보유 수량
										</label>
										<input
											type="number"
											min="0"
											step="0.0001"
											value={holdingForm.quantity}
											onChange={(event) =>
												setHoldingForm((prev) => ({
													...prev,
													quantity: Number.parseFloat(
														event.target.value || "0",
													),
												}))
											}
											className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
										/>
									</div>
									<div>
										<label className="mb-1 block text-xs font-medium">
											평단가 ({holdingForm.market === "US" ? "USD" : "원"})
										</label>
										<input
											type="number"
											min="0"
											step="0.01"
											value={holdingForm.averagePrice}
											onChange={(event) =>
												setHoldingForm((prev) => ({
													...prev,
													averagePrice: Number.parseFloat(
														event.target.value || "0",
													),
												}))
											}
											className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
										/>
									</div>
									<div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 p-2">
										<label className="flex items-center gap-2 text-xs font-medium">
											<input
												type="checkbox"
												checked={holdingForm.isAccumulating}
												onChange={(event) =>
													setHoldingForm((prev) => ({
														...prev,
														isAccumulating: event.target.checked,
													}))
												}
											/>
											모으기 종목으로 관리
										</label>
									</div>
									{holdingForm.isAccumulating ? (
										<>
											<div>
												<label className="mb-1 block text-xs font-medium">
													주기
												</label>
												<select
													value={holdingForm.cadence}
													onChange={(event) =>
														setHoldingForm((prev) => ({
															...prev,
															cadence: event.target.value as Cadence,
															runDay: 1,
														}))
													}
													className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
												>
													{CADENCES.map((cadence) => (
														<option key={cadence} value={cadence}>
															{cadence === "WEEKLY" ? "매주" : "매달"}
														</option>
													))}
												</select>
											</div>
											<div>
												<label className="mb-1 block text-xs font-medium">
													실행일 (
													{holdingForm.cadence === "WEEKLY"
														? "1=월 ... 7=일"
														: "매달 n일"}
													)
												</label>
												<input
													type="number"
													min="1"
													max={holdingForm.cadence === "WEEKLY" ? "7" : "31"}
													step="1"
													value={holdingForm.runDay}
													onChange={(event) =>
														setHoldingForm((prev) => ({
															...prev,
															runDay: Number.parseInt(
																event.target.value || "1",
																10,
															),
														}))
													}
													className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
												/>
											</div>
											<div>
												<label className="mb-1 block text-xs font-medium">
													모으기 기준
												</label>
												<select
													value={holdingForm.accumulationType}
													onChange={(event) =>
														setHoldingForm((prev) => ({
															...prev,
															accumulationType: event.target
																.value as AccumulationType,
														}))
													}
													className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
												>
													<option value="AMOUNT">회차 금액</option>
													<option value="SHARES">회차 수량</option>
												</select>
											</div>
											{holdingForm.accumulationType === "AMOUNT" &&
											holdingForm.market === "US" ? (
												<div>
													<label className="mb-1 block text-xs font-medium">
														금액 통화
													</label>
													<select
														value={holdingForm.accumulationCurrency}
														onChange={(event) =>
															setHoldingForm((prev) => ({
																...prev,
																accumulationCurrency: event.target
																	.value as AccumulationCurrency,
															}))
														}
														className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
													>
														<option value="USD">USD</option>
														<option value="KRW">원화(KRW)</option>
													</select>
												</div>
											) : null}
											<div>
												<label className="mb-1 block text-xs font-medium">
													모으기 값 (
													{holdingForm.accumulationType === "AMOUNT"
														? holdingForm.market === "US"
															? holdingForm.accumulationCurrency
															: "원"
														: "주"}
													)
												</label>
												<input
													type="number"
													min="0"
													step="0.0001"
													value={holdingForm.accumulationValue}
													onChange={(event) =>
														setHoldingForm((prev) => ({
															...prev,
															accumulationValue: Number.parseFloat(
																event.target.value || "0",
															),
														}))
													}
													className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
												/>
											</div>
										</>
									) : null}
								</div>
								<div className="mt-4 flex justify-end gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => setIsHoldingFormModalOpen(false)}
									>
										닫기
									</Button>
									<Button
										type="button"
										onClick={handleAddHolding}
										disabled={submittingHolding}
									>
										{submittingHolding ? "저장 중..." : "보유 종목 저장"}
									</Button>
								</div>
							</LayerModal>

							<section
								id="savings-installment-section"
								className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-2 lg:h-full lg:overflow-y-auto lg:pr-3"
							>
								<h2 className="text-xl font-semibold">적금</h2>
								<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
									<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
										<p>
											이번 달 자동 반영 합계:{" "}
											{formatKrw(installmentCurrentMonthLogTotal)} (
											{installmentLogs.length}건)
										</p>
										<Button
											type="button"
											variant="outline"
											onClick={() => reflectInstallmentLogs()}
											disabled={reflectingInstallments}
										>
											{reflectingInstallments ? "반영 중..." : "적금 자동 반영"}
										</Button>
									</div>
									<div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
										<div className="grid gap-3 md:grid-cols-8">
											<div className="md:col-span-2">
												<label className="mb-1 block text-xs font-medium">
													적금명
												</label>
												<input
													className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
													value={installmentForm.name}
													onChange={(event) =>
														setInstallmentForm((prev) => ({
															...prev,
															name: event.target.value,
														}))
													}
													placeholder="예: 1억 모으기 적금"
												/>
											</div>
											<div>
												<label className="mb-1 block text-xs font-medium">
													현재까지 누적 납입액(원)
												</label>
												<CurrencyInput
													value={installmentForm.savedAmount}
													onChange={(value) =>
														setInstallmentForm((prev) => ({
															...prev,
															savedAmount: value,
														}))
													}
												/>
											</div>
											<div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-2">
												<label className="flex items-center gap-2 text-xs font-medium">
													<input
														type="checkbox"
														checked={installmentForm.isRecurring}
														onChange={(event) =>
															setInstallmentForm((prev) => ({
																...prev,
																isRecurring: event.target.checked,
															}))
														}
													/>
													정기 납입 규칙 사용
												</label>
											</div>
											{installmentForm.isRecurring ? (
												<div className="md:col-span-8 rounded-md border border-slate-200 bg-slate-50 p-3">
													<p className="mb-2 text-xs font-semibold text-slate-700">
														정기 납입 규칙
													</p>
													<div className="grid gap-3 md:grid-cols-4">
														<div>
															<label className="mb-1 block text-xs font-medium">
																주기
															</label>
															<select
																value={installmentForm.cadence}
																onChange={(event) =>
																	setInstallmentForm((prev) => ({
																		...prev,
																		cadence: event.target.value as Cadence,
																		runDay: 1,
																	}))
																}
																className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
															>
																{CADENCES.map((cadence) => (
																	<option key={cadence} value={cadence}>
																		{cadence === "WEEKLY" ? "매주" : "매달"}
																	</option>
																))}
															</select>
														</div>
														<div>
															<label className="mb-1 block text-xs font-medium">
																실행일(
																{installmentForm.cadence === "WEEKLY"
																	? "1=월..7=일"
																	: "매달 n일"}
																)
															</label>
															<input
																type="number"
																min="1"
																max={
																	installmentForm.cadence === "WEEKLY"
																		? "7"
																		: "31"
																}
																step="1"
																className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
																value={installmentForm.runDay}
																onChange={(event) =>
																	setInstallmentForm((prev) => ({
																		...prev,
																		runDay: Number.parseInt(
																			event.target.value || "1",
																			10,
																		),
																	}))
																}
															/>
														</div>
														<div>
															<label className="mb-1 block text-xs font-medium">
																적용 시작
															</label>
															<select
																value={installmentForm.applyMode}
																onChange={(event) =>
																	setInstallmentForm((prev) => ({
																		...prev,
																		applyMode: event.target
																			.value as InstallmentApplyMode,
																	}))
																}
																className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
															>
																{INSTALLMENT_APPLY_MODES.map((mode) => (
																	<option key={mode} value={mode}>
																		{mode === "TODAY"
																			? "오늘부터"
																			: "다음 회차부터"}
																	</option>
																))}
															</select>
														</div>
														<div>
															<label className="mb-1 block text-xs font-medium">
																회차 납입액(원)
															</label>
															<CurrencyInput
																value={installmentForm.monthlyAmount}
																onChange={(value) =>
																	setInstallmentForm((prev) => ({
																		...prev,
																		monthlyAmount: value,
																	}))
																}
															/>
														</div>
													</div>
												</div>
											) : null}
											<div>
												<label className="mb-1 block text-xs font-medium">
													시작일
												</label>
												<input
													type="date"
													className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
													value={installmentForm.startDate}
													onChange={(event) =>
														setInstallmentForm((prev) => ({
															...prev,
															startDate: event.target.value,
														}))
													}
												/>
											</div>
											<div className="md:col-span-2">
												<label className="mb-1 block text-xs font-medium">
													만기일
												</label>
												<div className="flex gap-2">
													<input
														type="date"
														className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
														value={installmentForm.maturityDate ?? ""}
														onChange={(event) =>
															setInstallmentForm((prev) => ({
																...prev,
																maturityDate:
																	event.target.value.length > 0
																		? event.target.value
																		: null,
															}))
														}
													/>
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="shrink-0"
														onClick={() =>
															setInstallmentForm((prev) => ({
																...prev,
																maturityDate: null,
															}))
														}
													>
														해제
													</Button>
												</div>
											</div>
											<div className="md:col-span-3">
												<label className="mb-1 block text-xs font-medium">
													만기 혜택
												</label>
												<div className="grid grid-cols-2 gap-2">
													<select
														value={installmentForm.benefitType}
														onChange={(event) =>
															setInstallmentForm((prev) => ({
																...prev,
																benefitType: event.target
																	.value as InstallmentBenefitType,
																benefitValue: 0,
															}))
														}
														className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
													>
														{INSTALLMENT_BENEFIT_TYPES.map((type) => (
															<option key={type} value={type}>
																{type === "INTEREST_RATE"
																	? "이율(%)"
																	: "만기금액(원)"}
															</option>
														))}
													</select>
													<input
														type="number"
														min="0"
														step={
															installmentForm.benefitType === "INTEREST_RATE"
																? "0.01"
																: "1"
														}
														className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
														value={installmentForm.benefitValue}
														onChange={(event) =>
															setInstallmentForm((prev) => ({
																...prev,
																benefitValue: Number.parseFloat(
																	event.target.value || "0",
																),
															}))
														}
														placeholder={
															installmentForm.benefitType === "INTEREST_RATE"
																? "예: 6.0"
																: "예: 50000000"
														}
													/>
												</div>
											</div>
										</div>
										<Button
											type="button"
											onClick={handleAddInstallment}
											disabled={submittingInstallment}
											className="mt-4"
										>
											{submittingInstallment ? "저장 중..." : "적금 저장"}
										</Button>
									</div>

									<div className="mt-4 space-y-3">
										{installments.length === 0 ? (
											<div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
												등록된 적금이 없습니다.
											</div>
										) : null}
										{installments.map((item) => {
											const draft = installmentDrafts[item.id];
											if (draft === undefined) {
												return null;
											}
											const progress = calcDateProgress(
												draft.startDate,
												draft.maturityDate,
											);
											const monthlySummary = monthlyInstallmentLogSummary[
												item.id
											] ?? {
												count: 0,
												amount: 0,
											};
											const recurringText =
												item.isRecurring &&
												item.cadence !== null &&
												item.runDay !== null
													? `${item.cadence === "WEEKLY" ? "매주" : "매달"} ${
															item.cadence === "WEEKLY"
																? getWeekdayLabel(item.runDay)
																: `${item.runDay}일`
														} / ${
															item.applyMode === "TODAY"
																? "오늘부터"
																: "다음 회차부터"
														}`
													: "비정기";

											return (
												<div
													key={item.id}
													className="rounded-xl border border-slate-200 bg-white p-4"
												>
													<div className="flex flex-wrap items-center justify-between gap-2">
														<div>
															<p className="font-medium">{item.name}</p>
															<p className="text-xs text-slate-500">
																누적 납입액: {formatKrw(item.savedAmount)} /
																정기납입: {recurringText}
															</p>
															<p className="text-xs text-slate-500">
																이번 달 자동 반영:{" "}
																{formatKrw(monthlySummary.amount)} (
																{monthlySummary.count}회)
															</p>
															<p className="text-xs text-slate-500">
																만기 혜택:{" "}
																{item.benefitType === "INTEREST_RATE"
																	? `이율 ${item.benefitValue}%`
																	: `만기금액 ${formatKrw(item.benefitValue)}`}
															</p>
															<p className="text-xs text-slate-500">
																만기일:{" "}
																{item.maturityDate === null
																	? "미설정"
																	: item.maturityDate}
															</p>
														</div>
														<div className="flex gap-2">
															<Button
																type="button"
																onClick={() => handleUpdateInstallment(item.id)}
															>
																수정 저장
															</Button>
															<Button
																type="button"
																variant="outline"
																onClick={() => handleDeleteInstallment(item.id)}
															>
																삭제
															</Button>
														</div>
													</div>
													<div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-8">
														<div className="md:col-span-2">
															<label className="mb-1 block text-xs font-medium">
																적금명
															</label>
															<input
																value={draft.name}
																onChange={(event) =>
																	setInstallmentDrafts((prev) => ({
																		...prev,
																		[item.id]: {
																			...draft,
																			name: event.target.value,
																		},
																	}))
																}
																className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
															/>
														</div>
														<div>
															<label className="mb-1 block text-xs font-medium">
																누적 납입액(원)
															</label>
															<CurrencyInput
																value={draft.savedAmount}
																onChange={(value) =>
																	setInstallmentDrafts((prev) => ({
																		...prev,
																		[item.id]: { ...draft, savedAmount: value },
																	}))
																}
															/>
														</div>
														<div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-2">
															<label className="flex items-center gap-2 text-xs font-medium">
																<input
																	type="checkbox"
																	checked={draft.isRecurring}
																	onChange={(event) =>
																		setInstallmentDrafts((prev) => ({
																			...prev,
																			[item.id]: {
																				...draft,
																				isRecurring: event.target.checked,
																			},
																		}))
																	}
																/>
																정기 납입 규칙 사용
															</label>
														</div>
														{draft.isRecurring ? (
															<div className="md:col-span-8 rounded-md border border-slate-200 bg-slate-50 p-3">
																<p className="mb-2 text-xs font-semibold text-slate-700">
																	정기 납입 규칙
																</p>
																<div className="grid gap-3 md:grid-cols-4">
																	<div>
																		<label className="mb-1 block text-xs font-medium">
																			주기
																		</label>
																		<select
																			value={draft.cadence}
																			onChange={(event) =>
																				setInstallmentDrafts((prev) => ({
																					...prev,
																					[item.id]: {
																						...draft,
																						cadence: event.target
																							.value as Cadence,
																						runDay: 1,
																					},
																				}))
																			}
																			className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
																		>
																			{CADENCES.map((cadence) => (
																				<option key={cadence} value={cadence}>
																					{cadence === "WEEKLY"
																						? "매주"
																						: "매달"}
																				</option>
																			))}
																		</select>
																	</div>
																	<div>
																		<label className="mb-1 block text-xs font-medium">
																			실행일
																		</label>
																		<input
																			type="number"
																			min="1"
																			max={
																				draft.cadence === "WEEKLY" ? "7" : "31"
																			}
																			step="1"
																			value={draft.runDay}
																			onChange={(event) =>
																				setInstallmentDrafts((prev) => ({
																					...prev,
																					[item.id]: {
																						...draft,
																						runDay: Number.parseInt(
																							event.target.value || "1",
																							10,
																						),
																					},
																				}))
																			}
																			className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
																		/>
																	</div>
																	<div>
																		<label className="mb-1 block text-xs font-medium">
																			적용 시작
																		</label>
																		<select
																			value={draft.applyMode}
																			onChange={(event) =>
																				setInstallmentDrafts((prev) => ({
																					...prev,
																					[item.id]: {
																						...draft,
																						applyMode: event.target
																							.value as InstallmentApplyMode,
																					},
																				}))
																			}
																			className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
																		>
																			{INSTALLMENT_APPLY_MODES.map((mode) => (
																				<option key={mode} value={mode}>
																					{mode === "TODAY"
																						? "오늘부터"
																						: "다음 회차부터"}
																				</option>
																			))}
																		</select>
																	</div>
																	<div>
																		<label className="mb-1 block text-xs font-medium">
																			회차 납입액(원)
																		</label>
																		<CurrencyInput
																			value={draft.monthlyAmount}
																			onChange={(value) =>
																				setInstallmentDrafts((prev) => ({
																					...prev,
																					[item.id]: {
																						...draft,
																						monthlyAmount: value,
																					},
																				}))
																			}
																		/>
																	</div>
																</div>
															</div>
														) : null}
														<div>
															<label className="mb-1 block text-xs font-medium">
																시작일
															</label>
															<input
																type="date"
																value={draft.startDate}
																onChange={(event) =>
																	setInstallmentDrafts((prev) => ({
																		...prev,
																		[item.id]: {
																			...draft,
																			startDate: event.target.value,
																		},
																	}))
																}
																className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
															/>
														</div>
														<div className="md:col-span-2">
															<label className="mb-1 block text-xs font-medium">
																만기/혜택
															</label>
															<div className="grid gap-2 md:grid-cols-2">
																<div className="flex gap-2 md:col-span-2">
																	<input
																		type="date"
																		value={draft.maturityDate ?? ""}
																		onChange={(event) =>
																			setInstallmentDrafts((prev) => ({
																				...prev,
																				[item.id]: {
																					...draft,
																					maturityDate:
																						event.target.value.length > 0
																							? event.target.value
																							: null,
																				},
																			}))
																		}
																		className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
																	/>
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		className="shrink-0"
																		onClick={() =>
																			setInstallmentDrafts((prev) => ({
																				...prev,
																				[item.id]: {
																					...draft,
																					maturityDate: null,
																				},
																			}))
																		}
																	>
																		해제
																	</Button>
																</div>
																<select
																	value={draft.benefitType}
																	onChange={(event) =>
																		setInstallmentDrafts((prev) => ({
																			...prev,
																			[item.id]: {
																				...draft,
																				benefitType: event.target
																					.value as InstallmentBenefitType,
																				benefitValue: 0,
																			},
																		}))
																	}
																	className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
																>
																	{INSTALLMENT_BENEFIT_TYPES.map((type) => (
																		<option key={type} value={type}>
																			{type === "INTEREST_RATE"
																				? "이율(%)"
																				: "만기금액(원)"}
																		</option>
																	))}
																</select>
																<input
																	type="number"
																	step={
																		draft.benefitType === "INTEREST_RATE"
																			? "0.01"
																			: "1"
																	}
																	value={draft.benefitValue}
																	onChange={(event) =>
																		setInstallmentDrafts((prev) => ({
																			...prev,
																			[item.id]: {
																				...draft,
																				benefitValue: Number.parseFloat(
																					event.target.value || "0",
																				),
																			},
																		}))
																	}
																	className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
																	placeholder={
																		draft.benefitType === "INTEREST_RATE"
																			? "이율"
																			: "만기금액"
																	}
																/>
															</div>
														</div>
													</div>
													<div className="mt-3">
														{draft.maturityDate === null ? (
															<p className="text-xs text-slate-500">
																만기일 미설정 (기간 진행률 미표시)
															</p>
														) : (
															<>
																<div className="mb-1 flex items-center justify-between text-xs text-slate-600">
																	<span>기간 진행률</span>
																	<span>{progress.toFixed(1)}%</span>
																</div>
																<div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
																	<div
																		className="h-full bg-emerald-500 transition-all"
																		style={{ width: `${progress}%` }}
																	/>
																</div>
															</>
														)}
													</div>
												</div>
											);
										})}
									</div>
								</div>
							</section>

							<section
								id="fixed-expense-section"
								className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-3 lg:h-full lg:overflow-y-auto lg:pr-3"
							>
								<h2 className="text-xl font-semibold">고정 지출</h2>
								<p className="mt-2 text-sm text-slate-600">
									고정 지출 항목을 여러 개 추가하고 금액을 관리할 수 있습니다.
								</p>
								<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
									<div className="flex items-center justify-between">
										<h3 className="font-semibold">고정 지출 항목</h3>
										<span className="text-sm font-medium text-slate-700">
											합계 {formatKrw(fixedExpenseTotal)}
										</span>
									</div>
									<div className="mt-3 grid grid-cols-3 gap-2">
										<input
											className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
											placeholder="예: 월세, 대출 이자, 구독, 기부"
											value={expenseForms.FIXED.name}
											onChange={(event) =>
												setExpenseForms((prev) => ({
													...prev,
													FIXED: {
														...prev.FIXED,
														name: event.target.value,
													},
												}))
											}
										/>
										<CurrencyInput
											value={expenseForms.FIXED.amount}
											onChange={(value) =>
												setExpenseForms((prev) => ({
													...prev,
													FIXED: { ...prev.FIXED, amount: value },
												}))
											}
										/>
									</div>
									<Button
										type="button"
										className="mt-2"
										onClick={() => handleAddExpense("FIXED")}
										disabled={submittingExpenseKind === "FIXED"}
									>
										{submittingExpenseKind === "FIXED"
											? "추가 중..."
											: "고정 지출 항목 추가"}
									</Button>
									<div className="mt-3">
										{fixedExpenseItems.length === 0 ? (
											<p className="text-sm text-slate-500">
												등록된 고정 지출 항목이 없습니다.
											</p>
										) : null}
										{fixedExpenseItems.length > 0 ? (
											<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
												{fixedExpenseItems.map((item) => {
													const draft = expenseDrafts[item.id];
													if (draft === undefined) {
														return null;
													}
													return (
														<div
															key={item.id}
															className="rounded-lg border border-slate-200 bg-white p-2.5"
														>
															<div className="grid grid-cols-1 gap-2">
																<input
																	className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
																	value={draft.name}
																	onChange={(event) =>
																		setExpenseDrafts((prev) => ({
																			...prev,
																			[item.id]: {
																				...draft,
																				name: event.target.value,
																			},
																		}))
																	}
																/>
																<CurrencyInput
																	value={draft.amount}
																	onChange={(value) =>
																		setExpenseDrafts((prev) => ({
																			...prev,
																			[item.id]: { ...draft, amount: value },
																		}))
																	}
																/>
															</div>
															<div className="mt-2 flex justify-end gap-1.5">
																<Button
																	type="button"
																	size="xs"
																	onClick={() => handleUpdateExpense(item)}
																>
																	저장
																</Button>
																<Button
																	type="button"
																	size="xs"
																	variant="outline"
																	onClick={() => handleDeleteExpense(item.id)}
																>
																	삭제
																</Button>
															</div>
														</div>
													);
												})}
											</div>
										) : null}
									</div>
								</div>
							</section>

							<section
								id="variable-expense-section"
								className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-4 lg:h-full lg:overflow-y-auto lg:pr-3"
							>
								<h2 className="text-xl font-semibold">비고정 지출</h2>
								<p className="mt-2 text-sm text-slate-600">
									비고정 지출 항목을 여러 개 추가하고 금액을 관리할 수 있습니다.
								</p>
								<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
									<div className="flex items-center justify-between">
										<h3 className="font-semibold">비고정 지출 항목</h3>
										<span className="text-sm font-medium text-slate-700">
											합계 {formatKrw(variableExpenseTotal)}
										</span>
									</div>
									<div className="mt-3 grid grid-cols-3 gap-2">
										<input
											className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
											placeholder="예: 관리비, 수도세, 전기세"
											value={expenseForms.VARIABLE.name}
											onChange={(event) =>
												setExpenseForms((prev) => ({
													...prev,
													VARIABLE: {
														...prev.VARIABLE,
														name: event.target.value,
													},
												}))
											}
										/>
										<CurrencyInput
											value={expenseForms.VARIABLE.amount}
											onChange={(value) =>
												setExpenseForms((prev) => ({
													...prev,
													VARIABLE: { ...prev.VARIABLE, amount: value },
												}))
											}
										/>
									</div>
									<Button
										type="button"
										className="mt-2"
										onClick={() => handleAddExpense("VARIABLE")}
										disabled={submittingExpenseKind === "VARIABLE"}
									>
										{submittingExpenseKind === "VARIABLE"
											? "추가 중..."
											: "비고정 지출 항목 추가"}
									</Button>
									<div className="mt-3">
										{variableExpenseItems.length === 0 ? (
											<p className="text-sm text-slate-500">
												등록된 비고정 지출 항목이 없습니다.
											</p>
										) : null}
										{variableExpenseItems.length > 0 ? (
											<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
												{variableExpenseItems.map((item) => {
													const draft = expenseDrafts[item.id];
													if (draft === undefined) {
														return null;
													}
													return (
														<div
															key={item.id}
															className="rounded-lg border border-slate-200 bg-white p-2.5"
														>
															<div className="grid grid-cols-1 gap-2">
																<input
																	className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
																	value={draft.name}
																	onChange={(event) =>
																		setExpenseDrafts((prev) => ({
																			...prev,
																			[item.id]: {
																				...draft,
																				name: event.target.value,
																			},
																		}))
																	}
																/>
																<CurrencyInput
																	value={draft.amount}
																	onChange={(value) =>
																		setExpenseDrafts((prev) => ({
																			...prev,
																			[item.id]: { ...draft, amount: value },
																		}))
																	}
																/>
															</div>
															<div className="mt-2 flex justify-end gap-1.5">
																<Button
																	type="button"
																	size="xs"
																	onClick={() => handleUpdateExpense(item)}
																>
																	저장
																</Button>
																<Button
																	type="button"
																	size="xs"
																	variant="outline"
																	onClick={() => handleDeleteExpense(item.id)}
																>
																	삭제
																</Button>
															</div>
														</div>
													);
												})}
											</div>
										) : null}
									</div>
								</div>
							</section>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}

type CurrencyInputProps = {
	value: number;
	onChange: (value: number) => void;
};

function CurrencyInput({ value, onChange }: CurrencyInputProps) {
	return (
		<input
			inputMode="numeric"
			className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			value={value === 0 ? "" : formatNumber(value)}
			onChange={(event) => onChange(parseIntegerInput(event.target.value))}
			placeholder="0"
		/>
	);
}

type InlineNumberInputProps = {
	label: string;
	value: number;
	step: number;
	onChange: (value: number) => void;
};

function InlineNumberInput({
	label,
	value,
	step,
	onChange,
}: InlineNumberInputProps) {
	return (
		<div>
			<label className="mb-1 block text-xs font-medium">{label}</label>
			<input
				type="number"
				min="0"
				step={step}
				value={value}
				onChange={(event) =>
					onChange(Number.parseFloat(event.target.value || "0"))
				}
				className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			/>
		</div>
	);
}

type SummaryCardProps = {
	label: string;
	value: number;
};

function SummaryCard({ label, value }: SummaryCardProps) {
	return (
		<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
			<p className="text-xs text-slate-500">{label}</p>
			<p className="mt-1 text-base font-semibold">{formatKrw(value)}</p>
		</div>
	);
}

type DashboardStatCardProps = {
	title: string;
	value: string;
	emphasis?: "default" | "positive" | "negative";
	delta?: string | null;
	deltaEmphasis?: "default" | "positive" | "negative";
};

function DashboardStatCard({
	title,
	value,
	emphasis = "default",
	delta = null,
	deltaEmphasis = "default",
}: DashboardStatCardProps) {
	const valueClassName =
		emphasis === "positive"
			? "text-emerald-600"
			: emphasis === "negative"
				? "text-rose-600"
				: "text-slate-900";
	const deltaClassName =
		deltaEmphasis === "positive"
			? "text-emerald-600"
			: deltaEmphasis === "negative"
				? "text-rose-600"
				: "text-slate-500";
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
			<div className="mt-2 flex flex-wrap items-end gap-2">
				<p className={`text-2xl font-semibold ${valueClassName}`}>{value}</p>
				{delta !== null ? (
					<p className={`pb-1 text-sm font-semibold ${deltaClassName}`}>
						{delta}
					</p>
				) : null}
			</div>
		</div>
	);
}

type LayerModalProps = {
	open: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
};

function LayerModal({ open, title, onClose, children }: LayerModalProps) {
	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
			<div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-lg font-semibold">{title}</h3>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						닫기
					</Button>
				</div>
				<div className="max-h-[72vh] overflow-y-auto pr-1">{children}</div>
			</div>
		</div>
	);
}

function isValidInstallmentBenefit(draft: InstallmentDraft): boolean {
	if (draft.benefitType === "INTEREST_RATE") {
		return draft.benefitValue >= 0;
	}
	return draft.benefitValue > 0;
}

function isValidRecurringInstallmentConfig(draft: InstallmentDraft): boolean {
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

function getCurrentMonthDateRange() {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return {
		fromDate: toDateInput(start),
		toDate: toDateInput(end),
	};
}

function getDueDatesForCurrentMonth(
	cadence: Cadence,
	runDay: number,
	today: Date,
	accumulationStartedAt: string | null,
): string[] {
	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
	const startAfterDate =
		accumulationStartedAt === null
			? null
			: toDateInput(new Date(accumulationStartedAt));
	const dueDates: string[] = [];

	if (cadence === "MONTHLY") {
		const lastDay = new Date(
			today.getFullYear(),
			today.getMonth() + 1,
			0,
		).getDate();
		const targetDay = Math.min(Math.max(1, runDay), lastDay);
		const targetDate = new Date(
			today.getFullYear(),
			today.getMonth(),
			targetDay,
		);
		const targetDateInput = toDateInput(targetDate);
		if (
			targetDate.getTime() <= today.getTime() &&
			(startAfterDate === null || targetDateInput > startAfterDate)
		) {
			dueDates.push(targetDateInput);
		}
		return dueDates;
	}

	for (
		let cursor = new Date(monthStart);
		cursor.getTime() <= today.getTime();
		cursor.setDate(cursor.getDate() + 1)
	) {
		const weekDay = cursor.getDay() === 0 ? 7 : cursor.getDay();
		const dueDate = toDateInput(cursor);
		if (
			weekDay === Math.min(Math.max(1, runDay), 7) &&
			(startAfterDate === null || dueDate > startAfterDate)
		) {
			dueDates.push(dueDate);
		}
	}

	return dueDates;
}

function getInstallmentDueDatesForCurrentMonth(
	cadence: Cadence,
	runDay: number,
	today: Date,
	recurringStartedAt: string | null,
	applyMode: InstallmentApplyMode,
): string[] {
	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
	const monthStartInput = toDateInput(monthStart);
	const dueDates: string[] = [];

	if (cadence === "MONTHLY") {
		const lastDay = new Date(
			today.getFullYear(),
			today.getMonth() + 1,
			0,
		).getDate();
		const targetDay = Math.min(Math.max(1, runDay), lastDay);
		const targetDate = new Date(
			today.getFullYear(),
			today.getMonth(),
			targetDay,
		);
		if (targetDate.getTime() <= today.getTime()) {
			dueDates.push(toDateInput(targetDate));
		}
	} else {
		for (
			let cursor = new Date(monthStart);
			cursor.getTime() <= today.getTime();
			cursor.setDate(cursor.getDate() + 1)
		) {
			const weekDay = cursor.getDay() === 0 ? 7 : cursor.getDay();
			if (weekDay === Math.min(Math.max(1, runDay), 7)) {
				dueDates.push(toDateInput(cursor));
			}
		}
	}

	if (recurringStartedAt === null) {
		return dueDates;
	}

	const startedDate = toDateInput(new Date(recurringStartedAt));
	if (applyMode === "TODAY") {
		return dueDates.filter((date) => date >= startedDate);
	}
	if (startedDate < monthStartInput) {
		return dueDates;
	}
	const firstDueOnOrAfterStart = dueDates.find((date) => date >= startedDate);
	if (firstDueOnOrAfterStart === undefined) {
		return [];
	}
	return dueDates.filter((date) => date > firstDueOnOrAfterStart);
}

function getWeekdayLabel(value: number): string {
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

function clampRunDay(runDay: number, cadence: Cadence): number {
	if (cadence === "WEEKLY") {
		return Math.min(Math.max(1, runDay), 7);
	}
	return Math.min(Math.max(1, runDay), 31);
}

function calcDateProgress(startDate: string, endDate: string | null): number {
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

function toDateInput(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function extractError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "알 수 없는 오류가 발생했습니다.";
}

function buildHoldingQuoteCacheKey(holding: StockHolding): string {
	const symbol = holding.symbol.trim().toUpperCase();
	const quoteSymbol = holding.quoteSymbol.trim().toUpperCase();
	return `${holding.market}:${quoteSymbol.length > 0 ? quoteSymbol : symbol}`;
}

function readQuoteCache(): QuoteCacheStore {
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

function writeQuoteCache(cache: QuoteCacheStore): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(QUOTE_CACHE_STORAGE_KEY, JSON.stringify(cache));
	} catch {
		// ignore cache write failures
	}
}

export default App;
