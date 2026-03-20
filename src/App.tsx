import {
	ArcElement,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	Tooltip,
} from "chart.js";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Doughnut } from "react-chartjs-2";

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
	copyPreviousMonthData,
	copySectionDataFromYearMonth,
	deleteExpenseItem,
	deleteHolding,
	deleteInstallment,
	fetchExpenseItems,
	fetchHoldings,
	fetchInstallments,
	fetchOverview,
	fetchSettlementDataset,
	insertExpenseItem,
	insertHolding,
	insertInstallment,
	type SectionYearMonthCopyTarget,
	type SettlementDataset,
	saveOverview,
	setActiveYearMonth,
	updateExpenseItem,
	updateHolding,
	updateInstallment,
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
	type InstallmentSaving,
	type StockHolding,
	type StockQuote,
	type SymbolSearchItem,
} from "@/types/finance";

ChartJS.register(ArcElement, Tooltip, Legend);

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
	actualSpent: 0,
	realizedPnl: 0,
	tossDepositAmount: 0,
	tossDepositCurrency: "KRW",
	samsungDepositAmount: 0,
	samsungDepositCurrency: "KRW",
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
type AppTab = "DASHBOARD" | "YEARLY_SETTLEMENT";
type SectionImportTarget =
	| "STOCK"
	| "INSTALLMENT"
	| "FIXED"
	| "VARIABLE"
	| "CONSUMPTION"
	| "INCOME";
type SectionImportModalTarget = SectionImportTarget | null;

function App() {
	const [overview, setOverview] = useState<FinanceOverview>(defaultOverview);
	const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
	const [holdings, setHoldings] = useState<StockHolding[]>([]);
	const [installments, setInstallments] = useState<InstallmentSaving[]>([]);
	const [quotes, setQuotes] = useState<Record<number, StockQuote | null>>({});
	const [expenseDrafts, setExpenseDrafts] = useState<
		Record<number, ExpenseDraft>
	>({});
	const [expenseForms, setExpenseForms] = useState<
		Record<ExpenseKind, ExpenseDraft>
	>({
		FIXED: { ...defaultExpenseDraft },
		VARIABLE: { ...defaultExpenseDraft },
		CONSUMPTION: { ...defaultExpenseDraft },
		INCOME: { ...defaultExpenseDraft },
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
	const [selectedYearMonth, setSelectedYearMonth] = useState(() =>
		getInitialYearMonthFromQuery(),
	);
	const [sectionImportYearMonth, setSectionImportYearMonth] = useState<
		Record<SectionImportTarget, string>
	>(() => {
		const initial = getInitialYearMonthFromQuery();
		const previous = getPreviousYearMonthInput(initial);
		return {
			STOCK: previous,
			INSTALLMENT: previous,
			FIXED: previous,
			VARIABLE: previous,
			CONSUMPTION: previous,
			INCOME: previous,
		};
	});
	const [copyingSectionTarget, setCopyingSectionTarget] =
		useState<SectionImportTarget | null>(null);
	const [sectionImportModalTarget, setSectionImportModalTarget] =
		useState<SectionImportModalTarget>(null);
	const [copyingPreviousMonth, setCopyingPreviousMonth] = useState(false);
	const [activeTab, setActiveTab] = useState<AppTab>(() =>
		getInitialTabFromQuery(),
	);
	const [settlementData, setSettlementData] =
		useState<SettlementDataset | null>(null);
	const [loadingSettlementData, setLoadingSettlementData] = useState(false);

	const [stockSearchQuery, setStockSearchQuery] = useState("");
	const [stockSymbolResults, setStockSymbolResults] = useState<
		SymbolSearchItem[]
	>([]);
	const [searchingStockSymbol, setSearchingStockSymbol] = useState(false);
	const [isHoldingFormModalOpen, setIsHoldingFormModalOpen] = useState(false);
	const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
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
	const currentMonthRange = useMemo(
		() => getYearMonthDateRange(selectedYearMonth),
		[selectedYearMonth],
	);
	const selectedMonthLabel = useMemo(() => {
		const [year, month] = selectedYearMonth.split("-");
		return `${year}년 ${month}월`;
	}, [selectedYearMonth]);
	const [selectedYearText, selectedMonthText] = useMemo(
		() => selectedYearMonth.split("-"),
		[selectedYearMonth],
	);
	const activeSectionImportYearMonth = useMemo(() => {
		if (sectionImportModalTarget === null) {
			return "";
		}
		return sectionImportYearMonth[sectionImportModalTarget];
	}, [sectionImportModalTarget, sectionImportYearMonth]);
	const selectableYears = useMemo(() => {
		const selectedYear = Number.parseInt(selectedYearText, 10);
		if (Number.isNaN(selectedYear)) {
			return [new Date().getFullYear()];
		}
		return Array.from({ length: 7 }, (_, index) => selectedYear - 3 + index);
	}, [selectedYearText]);

	useEffect(() => {
		setActiveYearMonth(selectedYearMonth);
	}, [selectedYearMonth]);

	useEffect(() => {
		const previous = getPreviousYearMonthInput(selectedYearMonth);
		setSectionImportYearMonth({
			STOCK: previous,
			INSTALLMENT: previous,
			FIXED: previous,
			VARIABLE: previous,
			CONSUMPTION: previous,
			INCOME: previous,
		});
	}, [selectedYearMonth]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		const [year, month] = selectedYearMonth.split("-");
		const url = new URL(window.location.href);
		url.searchParams.set("year", year);
		url.searchParams.set("month", month);
		url.searchParams.set(
			"tab",
			activeTab === "YEARLY_SETTLEMENT" ? "yearly" : "dashboard",
		);
		window.history.replaceState(null, "", url.toString());
	}, [activeTab, selectedYearMonth]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		const handlePopState = () => {
			const parsed = parseYearMonthFromSearch(window.location.search);
			if (parsed !== null && parsed !== selectedYearMonth) {
				setSelectedYearMonth(parsed);
			}
			const tab = parseTabFromSearch(window.location.search);
			if (tab !== activeTab) {
				setActiveTab(tab);
			}
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [activeTab, selectedYearMonth]);

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
		async (rawCode: string, options?: { silent?: boolean }) => {
			if (!hasSupabaseEnv) {
				setMessage("Supabase 환경변수를 먼저 설정해주세요.");
				return;
			}
			const userCode = rawCode.trim().toUpperCase();
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
		[],
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
			setActiveYearMonth(selectedYearMonth);
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
				const [overviewData, expenseData, holdingsData, installmentData] =
					await Promise.all([
						fetchOverview(),
						fetchExpenseItems(),
						fetchHoldings(),
						fetchInstallments(),
					]);
				if (cancelled) {
					return;
				}

				setOverview(overviewData);
				setExpenseItems(expenseData);
				setHoldings(holdingsData);
				setInstallments(installmentData);
			} catch (error) {
				if (cancelled) {
					return;
				}
				setOverview(defaultOverview);
				setExpenseItems([]);
				setHoldings([]);
				setInstallments([]);
				setQuotes({});
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
	}, [selectedYearMonth, verifiedUserCode]);

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

	useEffect(() => {
		let cancelled = false;
		if (verifiedUserCode === null || activeTab !== "YEARLY_SETTLEMENT") {
			return;
		}
		setLoadingSettlementData(true);
		fetchSettlementDataset()
			.then((data) => {
				if (!cancelled) {
					setSettlementData(data);
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setMessage(extractError(error));
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoadingSettlementData(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [activeTab, verifiedUserCode]);

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

	const consumptionExpenseTotal = useMemo(
		() =>
			expenseItems
				.filter((item) => item.kind === "CONSUMPTION")
				.reduce((sum, item) => sum + item.amount, 0),
		[expenseItems],
	);

	const incomeTotal = useMemo(
		() =>
			expenseItems
				.filter((item) => item.kind === "INCOME")
				.reduce((sum, item) => sum + item.amount, 0),
		[expenseItems],
	);

	const actualSpentTotal = useMemo(
		() => overview.actualSpent + consumptionExpenseTotal,
		[consumptionExpenseTotal, overview.actualSpent],
	);

	const installmentMonthlyTotal = useMemo(() => {
		const referenceDateInput = currentMonthRange.toDate;
		return installments.reduce((sum, item) => {
			if (!item.isRecurring || item.monthlyAmount <= 0) {
				return sum;
			}
			if (item.startDate > referenceDateInput) {
				return sum;
			}
			if (
				item.maturityDate !== null &&
				item.maturityDate < referenceDateInput
			) {
				return sum;
			}
			const cadence = item.cadence ?? "MONTHLY";
			const multiplier = cadence === "WEEKLY" ? 4 : 1;
			return sum + Math.round(item.monthlyAmount * multiplier);
		}, 0);
	}, [currentMonthRange.toDate, installments]);

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
			overview.salary +
			incomeTotal -
			(fixedExpenseTotal +
				variableExpenseTotal +
				installmentMonthlyTotal +
				stockMonthlyTotal)
		);
	}, [
		overview.salary,
		incomeTotal,
		fixedExpenseTotal,
		variableExpenseTotal,
		installmentMonthlyTotal,
		stockMonthlyTotal,
	]);

	async function handleSaveOverview(): Promise<boolean> {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return false;
		}
		setSavingOverviewState(true);
		try {
			await saveOverview({
				salary: overview.salary,
				actualSpent: overview.actualSpent,
				realizedPnl: overview.realizedPnl,
				tossDepositAmount: overview.tossDepositAmount,
				tossDepositCurrency: overview.tossDepositCurrency,
				samsungDepositAmount: overview.samsungDepositAmount,
				samsungDepositCurrency: overview.samsungDepositCurrency,
			});
			setMessage("월 정보가 저장되었습니다.");
			return true;
		} catch (error) {
			setMessage(extractError(error));
			return false;
		} finally {
			setSavingOverviewState(false);
		}
	}

	async function handleSaveDepositModal() {
		const saved = await handleSaveOverview();
		if (saved) {
			setIsDepositModalOpen(false);
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
		setQuotes({});
	}

	async function handleCopyPreviousMonth() {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}
		setCopyingPreviousMonth(true);
		try {
			await copyPreviousMonthData();
			const [overviewData, expenseData, holdingsData, installmentData] =
				await Promise.all([
					fetchOverview(),
					fetchExpenseItems(),
					fetchHoldings(),
					fetchInstallments(),
				]);
			setOverview(overviewData);
			setExpenseItems(expenseData);
			setHoldings(holdingsData);
			setInstallments(installmentData);
			setMessage("직전 월 기록을 불러왔습니다.");
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setCopyingPreviousMonth(false);
		}
	}

	async function handleCopySectionByYearMonth(target: SectionImportTarget) {
		if (!hasSupabaseEnv) {
			setMessage("Supabase 환경변수를 먼저 설정해주세요.");
			return;
		}

		const sourceYearMonth = sectionImportYearMonth[target];
		const repositoryTargetMap: Record<
			SectionImportTarget,
			SectionYearMonthCopyTarget
		> = {
			STOCK: "STOCK_HOLDINGS",
			INSTALLMENT: "INSTALLMENTS",
			FIXED: "FIXED_EXPENSE",
			VARIABLE: "VARIABLE_EXPENSE",
			CONSUMPTION: "CONSUMPTION_EXPENSE",
			INCOME: "INCOME_EXPENSE",
		};

		setCopyingSectionTarget(target);
		try {
			await copySectionDataFromYearMonth(
				sourceYearMonth,
				repositoryTargetMap[target],
			);

			if (
				target === "FIXED" ||
				target === "VARIABLE" ||
				target === "CONSUMPTION" ||
				target === "INCOME"
			) {
				const expenseData = await fetchExpenseItems();
				setExpenseItems(expenseData);
			} else if (target === "STOCK") {
				const holdingsData = await fetchHoldings();
				setHoldings(holdingsData);
				setQuotes({});
			} else {
				const installmentData = await fetchInstallments();
				setInstallments(installmentData);
			}

			const sectionLabel =
				target === "FIXED"
					? "고정 지출"
					: target === "VARIABLE"
						? "비고정 지출"
						: target === "CONSUMPTION"
							? "소비"
							: target === "INCOME"
								? "수입"
								: target === "STOCK"
									? "주식"
									: "적금";
			setMessage(
				`${sectionLabel} 데이터를 ${sourceYearMonth} 기준으로 불러왔습니다.`,
			);
			setSectionImportModalTarget(null);
		} catch (error) {
			setMessage(extractError(error));
		} finally {
			setCopyingSectionTarget(null);
		}
	}

	function handleChangeYear(nextYear: string) {
		const month = Number.parseInt(selectedMonthText, 10);
		const normalizedMonth = Number.isNaN(month)
			? 1
			: Math.min(Math.max(month, 1), 12);
		setSelectedYearMonth(
			`${nextYear}-${String(normalizedMonth).padStart(2, "0")}`,
		);
	}

	function handleChangeMonth(nextMonth: string) {
		const year = Number.parseInt(selectedYearText, 10);
		const normalizedYear = Number.isNaN(year) ? new Date().getFullYear() : year;
		const month = Number.parseInt(nextMonth, 10);
		const normalizedMonth = Number.isNaN(month)
			? 1
			: Math.min(Math.max(month, 1), 12);
		setSelectedYearMonth(
			`${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`,
		);
	}

	function handleExportExcel() {
		if (activeTab === "DASHBOARD") {
			const rows: CsvRow[] = [
				["구분", "값"],
				["기준 연월", selectedYearMonth],
				["월급", overview.salary],
				["수입 섹션 자동 합산", incomeTotal],
				["실제 사용 금액(직접 입력)", overview.actualSpent],
				["소비 섹션 자동 합산", consumptionExpenseTotal],
				["실제 사용 금액(최종)", actualSpentTotal],
				["월별 실현손익", overview.realizedPnl],
				["토스증권 예치금", overview.tossDepositAmount],
				["토스증권 통화", overview.tossDepositCurrency],
				["삼성증권 예치금", overview.samsungDepositAmount],
				["삼성증권 통화", overview.samsungDepositCurrency],
				[],
				["지출 항목"],
				["구분", "항목명", "금액(원)"],
				...expenseItems.map((item) => [item.kind, item.name, item.amount]),
				[],
				["주식 보유 항목"],
				[
					"증권사",
					"시장",
					"종목코드",
					"종목명",
					"수량",
					"평단가",
					"모으기 여부",
					"모으기 주기",
					"모으기 실행일",
					"모으기 타입",
					"모으기 통화",
					"모으기 값",
				],
				...holdings.map((item) => [
					item.broker,
					item.market,
					item.symbol,
					item.name,
					item.quantity,
					item.averagePrice,
					item.isAccumulating ? "Y" : "N",
					item.cadence ?? "",
					item.runDay ?? "",
					item.accumulationType,
					item.accumulationCurrency,
					item.accumulationValue,
				]),
				[],
				["적금 항목"],
				[
					"상품명",
					"누적 납입액",
					"정기 납입액",
					"정기 납입 여부",
					"주기",
					"실행일",
					"적용 시작",
					"시작일",
					"만기일",
					"만기 혜택 타입",
					"만기 혜택 값",
				],
				...installments.map((item) => [
					item.name,
					item.savedAmount,
					item.monthlyAmount,
					item.isRecurring ? "Y" : "N",
					item.cadence ?? "",
					item.runDay ?? "",
					item.applyMode,
					item.startDate,
					item.maturityDate ?? "",
					item.benefitType,
					item.benefitValue,
				]),
			];
			downloadCsvFile(`my-hundred-million-${selectedYearMonth}.csv`, rows);
			setMessage(`${selectedYearMonth} 월 데이터를 엑셀 파일로 내보냈습니다.`);
			return;
		}

		const rows: CsvRow[] = [
			["구분", "값"],
			["기준 연도", `${selectedYearText}년`],
			["총 수입", yearlyTotalIncome],
			["총 지출", yearlyTotalExpense],
			["총 저축", yearlyTotalSaving],
			[],
			["월별 결산"],
			[
				"월",
				"월급",
				"추가 수입",
				"월 잔액",
				"실제 사용",
				"순잔액",
				"실현손익",
				"월말 최종 저축액",
			],
			...yearlySettlementRows.map((row) => [
				row.monthLabel,
				row.salary,
				row.income,
				row.plannedRemaining,
				row.actualSpent,
				row.netAfterActual,
				row.realizedPnl,
				row.cumulativeSaving,
			]),
		];
		downloadCsvFile(`my-hundred-million-${selectedYearText}-yearly.csv`, rows);
		setMessage(`${selectedYearText}년 결산 데이터를 엑셀 파일로 내보냈습니다.`);
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
			const kindLabel =
				kind === "FIXED"
					? "고정 지출"
					: kind === "VARIABLE"
						? "비고정 지출"
						: kind === "CONSUMPTION"
							? "소비"
							: "수입";
			setMessage(`${kindLabel} 항목이 저장되었습니다.`);
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

	const fixedExpenseItems = useMemo(
		() => expenseItems.filter((item) => item.kind === "FIXED"),
		[expenseItems],
	);

	const variableExpenseItems = useMemo(
		() => expenseItems.filter((item) => item.kind === "VARIABLE"),
		[expenseItems],
	);
	const consumptionExpenseItems = useMemo(
		() => expenseItems.filter((item) => item.kind === "CONSUMPTION"),
		[expenseItems],
	);
	const incomeExpenseItems = useMemo(
		() => expenseItems.filter((item) => item.kind === "INCOME"),
		[expenseItems],
	);
	const isSelectedMonthEmpty = useMemo(
		() =>
			overview.salary === 0 &&
			overview.actualSpent === 0 &&
			overview.realizedPnl === 0 &&
			overview.tossDepositAmount === 0 &&
			overview.samsungDepositAmount === 0 &&
			expenseItems.length === 0 &&
			holdings.length === 0 &&
			installments.length === 0,
		[expenseItems.length, holdings.length, installments.length, overview],
	);
	const yearlySettlementRows = useMemo(() => {
		if (settlementData === null) {
			return [] as Array<{
				yearMonth: string;
				monthLabel: string;
				salary: number;
				income: number;
				fixedExpense: number;
				variableExpense: number;
				plannedRemaining: number;
				netAfterActual: number;
				actualSpent: number;
				realizedPnl: number;
				principalTotal: number;
				cumulativeSaving: number;
				hasSavingData: boolean;
			}>;
		}

		const fxRate = usdKrwRate ?? 0;
		const expenseByMonth = new Map<
			string,
			{ fixed: number; variable: number; consumption: number; income: number }
		>();
		for (const item of settlementData.expenses) {
			const current = expenseByMonth.get(item.yearMonth) ?? {
				fixed: 0,
				variable: 0,
				consumption: 0,
				income: 0,
			};
			if (item.kind === "FIXED") {
				current.fixed += item.amount;
			} else if (item.kind === "VARIABLE") {
				current.variable += item.amount;
			} else if (item.kind === "CONSUMPTION") {
				current.consumption += item.amount;
			} else {
				current.income += item.amount;
			}
			expenseByMonth.set(item.yearMonth, current);
		}

		const installmentByMonth = new Map<
			string,
			{ monthly: number; principal: number }
		>();
		for (const item of settlementData.installments) {
			const current = installmentByMonth.get(item.yearMonth) ?? {
				monthly: 0,
				principal: 0,
			};
			current.principal += item.savedAmount;
			if (item.isRecurring && item.monthlyAmount > 0) {
				const range = getYearMonthDateRange(item.yearMonth);
				if (
					item.startDate <= range.toDate &&
					(item.maturityDate === null || item.maturityDate >= range.toDate)
				) {
					const multiplier = item.cadence === "WEEKLY" ? 4 : 1;
					current.monthly += Math.round(item.monthlyAmount * multiplier);
				}
			}
			installmentByMonth.set(item.yearMonth, current);
		}

		const holdingByMonth = new Map<
			string,
			{ monthly: number; principal: number }
		>();
		for (const item of settlementData.holdings) {
			const current = holdingByMonth.get(item.yearMonth) ?? {
				monthly: 0,
				principal: 0,
			};
			const principal =
				item.market === "US"
					? Math.round(item.quantity * item.averagePrice * fxRate)
					: Math.round(item.quantity * item.averagePrice);
			current.principal += principal;

			if (
				item.isAccumulating &&
				item.cadence !== null &&
				item.accumulationValue > 0
			) {
				const multiplier = item.cadence === "WEEKLY" ? 4 : 1;
				let perCycleKrw = 0;
				if (item.accumulationType === "AMOUNT") {
					if (item.market === "US") {
						if (item.accumulationCurrency === "KRW") {
							perCycleKrw = item.accumulationValue;
						} else {
							perCycleKrw = item.accumulationValue * fxRate;
						}
					} else {
						perCycleKrw = item.accumulationValue;
					}
				} else {
					const referencePrice = item.averagePrice;
					perCycleKrw =
						item.market === "US"
							? item.accumulationValue * referencePrice * fxRate
							: item.accumulationValue * referencePrice;
				}
				current.monthly += Math.round(perCycleKrw * multiplier);
			}
			holdingByMonth.set(item.yearMonth, current);
		}

		const overviewByMonth = new Map(
			settlementData.overviews.map((item) => [item.yearMonth, item] as const),
		);

		const monthsInYear = Array.from(
			{ length: 12 },
			(_, index) => index + 1,
		).map((month) => `${selectedYearText}-${String(month).padStart(2, "0")}`);

		return monthsInYear.map((yearMonth) => {
			const overviewSnapshot = overviewByMonth.get(yearMonth);
			const hasInstallmentData = installmentByMonth.has(yearMonth);
			const hasHoldingData = holdingByMonth.has(yearMonth);
			const expenseSnapshot = expenseByMonth.get(yearMonth) ?? {
				fixed: 0,
				variable: 0,
				consumption: 0,
				income: 0,
			};
			const installmentSnapshot = installmentByMonth.get(yearMonth) ?? {
				monthly: 0,
				principal: 0,
			};
			const holdingSnapshot = holdingByMonth.get(yearMonth) ?? {
				monthly: 0,
				principal: 0,
			};
			const salary = overviewSnapshot?.salary ?? 0;
			const actualSpent =
				(overviewSnapshot?.actualSpent ?? 0) + expenseSnapshot.consumption;
			const realizedPnl = overviewSnapshot?.realizedPnl ?? 0;
			const plannedRemaining =
				salary +
				expenseSnapshot.income -
				(expenseSnapshot.fixed +
					expenseSnapshot.variable +
					installmentSnapshot.monthly +
					holdingSnapshot.monthly);
			const netAfterActual = plannedRemaining - actualSpent;
			const principalTotal =
				installmentSnapshot.principal + holdingSnapshot.principal;
			const hasSavingDataForMonth = hasInstallmentData || hasHoldingData;
			const cumulativeSaving = hasSavingDataForMonth ? principalTotal : 0;

			return {
				yearMonth,
				monthLabel: `${Number.parseInt(yearMonth.slice(5), 10)}월`,
				salary,
				income: expenseSnapshot.income,
				fixedExpense: expenseSnapshot.fixed,
				variableExpense: expenseSnapshot.variable,
				plannedRemaining,
				netAfterActual,
				actualSpent,
				realizedPnl,
				principalTotal,
				cumulativeSaving,
				hasSavingData: hasSavingDataForMonth,
			};
		});
	}, [selectedYearText, settlementData, usdKrwRate]);
	const yearlyTotalIncome = useMemo(
		() =>
			yearlySettlementRows.reduce(
				(sum, row) => sum + row.salary + row.income,
				0,
			),
		[yearlySettlementRows],
	);
	const yearlyTotalExpense = useMemo(
		() =>
			yearlySettlementRows.reduce(
				(sum, row) =>
					sum + row.fixedExpense + row.variableExpense + row.actualSpent,
				0,
			),
		[yearlySettlementRows],
	);
	const yearlyTotalSaving = useMemo(() => {
		const lastNonEmptyRow = [...yearlySettlementRows]
			.reverse()
			.find((row) => row.hasSavingData);
		return lastNonEmptyRow?.cumulativeSaving ?? 0;
	}, [yearlySettlementRows]);
	const latestSavingYearMonth = useMemo(
		() =>
			[...yearlySettlementRows].reverse().find((row) => row.hasSavingData)
				?.yearMonth ?? null,
		[yearlySettlementRows],
	);
	const latestSavingMonthLabel = useMemo(() => {
		if (latestSavingYearMonth === null) {
			return `${selectedYearText}년 데이터 없음`;
		}
		const month = Number.parseInt(latestSavingYearMonth.slice(5), 10);
		return `${selectedYearText}년 ${month}월`;
	}, [latestSavingYearMonth, selectedYearText]);
	const savingCompositionItems = useMemo(() => {
		if (settlementData === null || latestSavingYearMonth === null) {
			return [] as Array<{ label: string; amount: number }>;
		}

		const fxRate = usdKrwRate ?? 0;
		const totals = new Map<string, number>();
		for (const item of settlementData.installments) {
			if (item.yearMonth !== latestSavingYearMonth || item.savedAmount <= 0) {
				continue;
			}
			const label = `적금 · ${item.name}`;
			totals.set(label, (totals.get(label) ?? 0) + item.savedAmount);
		}
		for (const item of settlementData.holdings) {
			if (item.yearMonth !== latestSavingYearMonth || item.quantity <= 0) {
				continue;
			}
			const amount =
				item.market === "US"
					? Math.round(item.quantity * item.averagePrice * fxRate)
					: Math.round(item.quantity * item.averagePrice);
			if (amount <= 0) {
				continue;
			}
			const stockName = item.name.trim().length > 0 ? item.name : item.symbol;
			const label = `주식 · ${stockName}`;
			totals.set(label, (totals.get(label) ?? 0) + amount);
		}

		return Array.from(totals.entries())
			.map(([label, amount]) => ({ label, amount }))
			.sort((left, right) => right.amount - left.amount);
	}, [latestSavingYearMonth, settlementData, usdKrwRate]);
	const savingCompositionTotal = useMemo(
		() => savingCompositionItems.reduce((sum, item) => sum + item.amount, 0),
		[savingCompositionItems],
	);
	const savingCompositionChart = useMemo(() => {
		const labels = savingCompositionItems.map((item) => item.label);
		const data = savingCompositionItems.map((item) => item.amount);
		const backgroundColor = savingCompositionItems.map(
			(_, index) => `hsl(${(index * 57) % 360} 72% 58%)`,
		);
		return {
			labels,
			datasets: [
				{
					label: "저축액",
					data,
					backgroundColor,
					borderColor: "#ffffff",
					borderWidth: 2,
				},
			],
		};
	}, [savingCompositionItems]);
	const savingCompositionChartOptions = useMemo(
		() =>
			({
				responsive: true,
				maintainAspectRatio: false,
				cutout: "58%",
				plugins: {
					legend: {
						position: "bottom",
					},
					tooltip: {
						callbacks: {
							label: (context) => {
								const value = Number(context.parsed) || 0;
								const values = (context.dataset.data as number[]) ?? [];
								const total = values.reduce((sum, item) => sum + item, 0);
								const ratio = total > 0 ? (value / total) * 100 : 0;
								return `${context.label}: ${formatKrw(value)} (${ratio.toFixed(1)}%)`;
							},
						},
					},
				},
			}) satisfies ChartOptions<"doughnut">,
		[],
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
									void verifyUserCode(userCodeInput);
								}
							}}
						/>
						<Button
							type="button"
							onClick={() => verifyUserCode(userCodeInput)}
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
			<div className="mx-auto max-w-[1820px] space-y-4">
				<section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant={activeTab === "DASHBOARD" ? "default" : "outline"}
								onClick={() => setActiveTab("DASHBOARD")}
							>
								월별 입력
							</Button>
							<Button
								type="button"
								variant={
									activeTab === "YEARLY_SETTLEMENT" ? "default" : "outline"
								}
								onClick={() => setActiveTab("YEARLY_SETTLEMENT")}
							>
								연말 결산
							</Button>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<select
								className="rounded-md border border-slate-300 px-2 py-2 text-sm"
								value={selectedYearText}
								onChange={(event) => handleChangeYear(event.target.value)}
							>
								{selectableYears.map((year) => (
									<option key={year} value={String(year)}>
										{year}년
									</option>
								))}
							</select>
							{activeTab === "DASHBOARD" ? (
								<>
									<select
										className="rounded-md border border-slate-300 px-2 py-2 text-sm"
										value={selectedMonthText}
										onChange={(event) => handleChangeMonth(event.target.value)}
									>
										{Array.from({ length: 12 }, (_, index) => index + 1).map(
											(month) => (
												<option
													key={month}
													value={String(month).padStart(2, "0")}
												>
													{month}월
												</option>
											),
										)}
									</select>
									{isSelectedMonthEmpty ? (
										<Button
											type="button"
											variant="outline"
											onClick={handleCopyPreviousMonth}
											disabled={copyingPreviousMonth}
										>
											{copyingPreviousMonth
												? "불러오는 중..."
												: "직전 기록 불러오기"}
										</Button>
									) : null}
								</>
							) : null}
							<Button
								type="button"
								variant="outline"
								onClick={handleExportExcel}
							>
								엑셀 내보내기
							</Button>
						</div>
					</div>
				</section>
				<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
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
									<p className="mt-1 text-sm font-semibold">
										{verifiedUserCode}
									</p>
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
									공식: 월급 + 수입 - (고정지출 + 비고정지출 + 적금 월 고정지출
									+ 주식 모으기 월 고정지출)
								</p>
								<div className="mt-3 grid gap-2">
									<SummaryCard label="월급" value={overview.salary} />
									<SummaryCard label="수입(자동합산)" value={incomeTotal} />
									<SummaryCard label="고정지출" value={fixedExpenseTotal} />
									<SummaryCard
										label="비고정지출"
										value={variableExpenseTotal}
									/>
									<SummaryCard
										label="소비 지출(자동합산)"
										value={consumptionExpenseTotal}
									/>
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
								<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs text-slate-500">
										실제 사용 금액 (직접 입력)
									</p>
									<div className="mt-2 flex items-center gap-2">
										<CurrencyInput
											value={overview.actualSpent}
											onChange={(value) =>
												setOverview((prev) => ({ ...prev, actualSpent: value }))
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
									<p className="mt-1 text-xs text-slate-500">
										직접 입력: {formatKrw(overview.actualSpent)}
									</p>
									<p className="mt-1 text-xs text-slate-500">
										소비 섹션 자동 합산: {formatKrw(consumptionExpenseTotal)}
									</p>
									<p className="mt-1 text-sm font-semibold text-slate-700">
										최종 실제 사용 금액: {formatKrw(actualSpentTotal)}
									</p>
								</div>
								<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs text-slate-500">
										월별 실현손익 (음수 가능)
									</p>
									<div className="mt-2 flex items-center gap-2">
										<SignedCurrencyInput
											value={overview.realizedPnl}
											onChange={(value) =>
												setOverview((prev) => ({ ...prev, realizedPnl: value }))
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
									<p
										className={`mt-1 text-xs ${
											overview.realizedPnl >= 0
												? "text-emerald-600"
												: "text-rose-600"
										}`}
									>
										{overview.realizedPnl >= 0 ? "+" : "-"}
										{formatKrw(Math.abs(overview.realizedPnl))}
									</p>
								</div>
							</div>
						</div>
					</aside>
					<div className="space-y-6">
						<header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
							<p className="text-sm text-slate-500">my-hundred-million</p>
							<h1 className="mt-2 text-2xl font-semibold md:text-3xl">
								{activeTab === "DASHBOARD" ? "자산 현황 대시보드" : "연말 결산"}
							</h1>
							<p className="mt-3 text-sm text-slate-600">
								{activeTab === "DASHBOARD"
									? `${selectedMonthLabel} 기준으로 월급, 지출, 주식 모으기, 적금을 관리하고 월 잔액을 확인합니다.`
									: `${selectedYearText}년 1월부터 12월까지 결산 통계를 확인합니다.`}
							</p>
							<div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
								<p>
									Supabase: {hasSupabaseEnv ? "연결 변수 설정됨" : "미설정"}
								</p>
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

						{activeTab === "DASHBOARD" && !loading ? (
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

						{activeTab === "DASHBOARD" ? (
							loading ? (
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
										<SectionYearMonthImportControl
											onOpen={() => setSectionImportModalTarget("STOCK")}
											disabled={copyingSectionTarget !== null}
											loading={copyingSectionTarget === "STOCK"}
										/>

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
												<span>현재가 캐시: 30분</span>
											</div>
											{hasUsHoldings && usdKrwRate === null ? (
												<p className="mt-2 text-xs text-amber-700">
													미국 주식이 있어 월 납입 계산에 환율이 필요합니다.
													환율을 갱신해주세요.
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
																	stockPerformanceSummary.profitKrw >= 0
																		? "+"
																		: "-"
																}${formatNumber(
																	Math.abs(stockPerformanceSummary.profitKrw),
																)}) (${
																	stockPerformanceSummary.profitRate === null
																		? "-"
																		: `${stockPerformanceSummary.profitRate.toFixed(2)}%`
																})`
													}
													deltaEmphasis={
														stockPerformanceSummary.profitKrw >= 0
															? "positive"
															: "negative"
													}
												/>
												<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
													<div className="flex items-center justify-between gap-2">
														<p className="text-xs uppercase tracking-wide text-slate-500">
															증권 계좌 예치금
														</p>
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() => setIsDepositModalOpen(true)}
														>
															입력
														</Button>
													</div>
													<div className="mt-2 grid gap-2">
														<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
															<p className="text-xs text-slate-500">토스증권</p>
															<p className="text-sm font-semibold text-slate-800">
																{overview.tossDepositCurrency === "USD"
																	? formatUsd(overview.tossDepositAmount)
																	: formatKrw(overview.tossDepositAmount)}
															</p>
														</div>
														<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
															<p className="text-xs text-slate-500">삼성증권</p>
															<p className="text-sm font-semibold text-slate-800">
																{overview.samsungDepositCurrency === "USD"
																	? formatUsd(overview.samsungDepositAmount)
																	: formatKrw(overview.samsungDepositAmount)}
															</p>
														</div>
													</div>
												</div>
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
														종목 검색과 신규 보유 등록은 같은 모달에서
														진행합니다.
													</p>
												</div>
											</div>
											{stockPerformanceSummary.missingFxCount > 0 ||
											stockPerformanceSummary.missingQuoteCount > 0 ? (
												<p className="mt-2 text-xs text-slate-500">
													일부 종목은 환율/현재가 미연동으로 수익률 계산에서
													제외되었습니다. (환율 미연동{" "}
													{stockPerformanceSummary.missingFxCount}개, 현재가
													미연동 {stockPerformanceSummary.missingQuoteCount}개)
												</p>
											) : null}

											<div className="mt-5 space-y-4">
												{brokerGroups.map((group) => (
													<div
														className="rounded-xl border border-slate-200 bg-white p-4"
														key={group.broker}
													>
														<h4 className="font-semibold">
															{group.broker === "TOSS"
																? "토스증권"
																: "삼성증권"}{" "}
															({group.items.length})
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
																	profitAmountLocal === null ||
																	costAmountLocal <= 0
																		? null
																		: (profitAmountLocal / costAmountLocal) *
																			100;
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
																						: scheduleText}
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
																							: formatKrw(
																									evaluationAmountLocal,
																								)}
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
																					onClick={() =>
																						handleUpdateHolding(item)
																					}
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
																										accumulationType: event
																											.target
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
																					{draft.accumulationType ===
																						"AMOUNT" && item.market === "US" ? (
																						<div>
																							<label className="mb-1 block text-xs font-medium">
																								금액 통화
																							</label>
																							<select
																								value={
																									draft.accumulationCurrency
																								}
																								onChange={(event) =>
																									setHoldingDrafts((prev) => ({
																										...prev,
																										[item.id]: {
																											...draft,
																											accumulationCurrency:
																												event.target
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
																							draft.accumulationType ===
																							"AMOUNT"
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
										open={isDepositModalOpen}
										title="증권 계좌 예치금 입력"
										onClose={() => setIsDepositModalOpen(false)}
									>
										<p className="text-sm text-slate-600">
											토스/삼성 계좌의 현금 예치금을 통화와 함께 입력합니다.
										</p>
										<div className="mt-4 grid gap-3 md:grid-cols-2">
											<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
												<p className="text-xs font-medium text-slate-700">
													토스증권
												</p>
												<div className="mt-2 grid grid-cols-[92px_minmax(0,1fr)] gap-2">
													<select
														value={overview.tossDepositCurrency}
														onChange={(event) =>
															setOverview((prev) => ({
																...prev,
																tossDepositCurrency: event.target.value as
																	| "KRW"
																	| "USD",
															}))
														}
														className="rounded-md border border-slate-300 px-2 py-2 text-sm"
													>
														<option value="KRW">원화</option>
														<option value="USD">USD</option>
													</select>
													<CurrencyInput
														value={overview.tossDepositAmount}
														onChange={(value) =>
															setOverview((prev) => ({
																...prev,
																tossDepositAmount: value,
															}))
														}
													/>
												</div>
												<p className="mt-2 text-xs text-slate-500">
													{overview.tossDepositCurrency === "USD"
														? formatUsd(overview.tossDepositAmount)
														: formatKrw(overview.tossDepositAmount)}
												</p>
											</div>
											<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
												<p className="text-xs font-medium text-slate-700">
													삼성증권
												</p>
												<div className="mt-2 grid grid-cols-[92px_minmax(0,1fr)] gap-2">
													<select
														value={overview.samsungDepositCurrency}
														onChange={(event) =>
															setOverview((prev) => ({
																...prev,
																samsungDepositCurrency: event.target.value as
																	| "KRW"
																	| "USD",
															}))
														}
														className="rounded-md border border-slate-300 px-2 py-2 text-sm"
													>
														<option value="KRW">원화</option>
														<option value="USD">USD</option>
													</select>
													<CurrencyInput
														value={overview.samsungDepositAmount}
														onChange={(value) =>
															setOverview((prev) => ({
																...prev,
																samsungDepositAmount: value,
															}))
														}
													/>
												</div>
												<p className="mt-2 text-xs text-slate-500">
													{overview.samsungDepositCurrency === "USD"
														? formatUsd(overview.samsungDepositAmount)
														: formatKrw(overview.samsungDepositAmount)}
												</p>
											</div>
										</div>
										<div className="mt-4 flex justify-end gap-2">
											<Button
												type="button"
												variant="outline"
												onClick={() => setIsDepositModalOpen(false)}
											>
												닫기
											</Button>
											<Button
												type="button"
												onClick={() => void handleSaveDepositModal()}
												disabled={savingOverviewState}
											>
												{savingOverviewState ? "저장 중..." : "저장"}
											</Button>
										</div>
									</LayerModal>
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
														const nextMarket = event.target.value as
															| "KR"
															| "US";
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
																	{item.symbol} ({item.market}) /{" "}
																	{item.exchange}
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
															max={
																holdingForm.cadence === "WEEKLY" ? "7" : "31"
															}
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
										<SectionYearMonthImportControl
											onOpen={() => setSectionImportModalTarget("INSTALLMENT")}
											disabled={copyingSectionTarget !== null}
											loading={copyingSectionTarget === "INSTALLMENT"}
										/>
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
											<div className="space-y-3">
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
																		onClick={() =>
																			handleUpdateInstallment(item.id)
																		}
																	>
																		수정 저장
																	</Button>
																	<Button
																		type="button"
																		variant="outline"
																		onClick={() =>
																			handleDeleteInstallment(item.id)
																		}
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
																				[item.id]: {
																					...draft,
																					savedAmount: value,
																				},
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
																			<div>
																				<label className="mb-1 block text-xs font-medium">
																					실행일
																				</label>
																				<input
																					type="number"
																					min="1"
																					max={
																						draft.cadence === "WEEKLY"
																							? "7"
																							: "31"
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
																					{INSTALLMENT_APPLY_MODES.map(
																						(mode) => (
																							<option key={mode} value={mode}>
																								{mode === "TODAY"
																									? "오늘부터"
																									: "다음 회차부터"}
																							</option>
																						),
																					)}
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

											<div className="mt-5 border-t border-slate-200 pt-4">
												<h3 className="font-semibold">적금 항목 추가</h3>
												<div className="mt-3 grid gap-3 md:grid-cols-8">
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
																	installmentForm.benefitType ===
																	"INTEREST_RATE"
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
																	installmentForm.benefitType ===
																	"INTEREST_RATE"
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
										</div>
									</section>

									<section
										id="fixed-expense-section"
										className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-3 lg:h-full lg:overflow-y-auto lg:pr-3"
									>
										<h2 className="text-xl font-semibold">고정 지출</h2>
										<SectionYearMonthImportControl
											onOpen={() => setSectionImportModalTarget("FIXED")}
											disabled={copyingSectionTarget !== null}
											loading={copyingSectionTarget === "FIXED"}
										/>
										<p className="mt-2 text-sm text-slate-600">
											고정 지출 항목을 여러 개 추가하고 금액을 관리할 수
											있습니다.
										</p>
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
											<div className="flex items-center justify-between">
												<h3 className="font-semibold">고정 지출 항목</h3>
												<span className="text-sm font-medium text-slate-700">
													합계 {formatKrw(fixedExpenseTotal)}
												</span>
											</div>
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
																					[item.id]: {
																						...draft,
																						amount: value,
																					},
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
																			onClick={() =>
																				handleDeleteExpense(item.id)
																			}
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
											<div className="mt-4 border-t border-slate-200 pt-4">
												<div className="grid grid-cols-3 gap-2">
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
											</div>
										</div>
									</section>

									<section
										id="variable-expense-section"
										className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-4 lg:h-full lg:overflow-y-auto lg:pr-3"
									>
										<h2 className="text-xl font-semibold">비고정 지출</h2>
										<SectionYearMonthImportControl
											onOpen={() => setSectionImportModalTarget("VARIABLE")}
											disabled={copyingSectionTarget !== null}
											loading={copyingSectionTarget === "VARIABLE"}
										/>
										<p className="mt-2 text-sm text-slate-600">
											비고정 지출 항목을 여러 개 추가하고 금액을 관리할 수
											있습니다.
										</p>
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
											<div className="flex items-center justify-between">
												<h3 className="font-semibold">비고정 지출 항목</h3>
												<span className="text-sm font-medium text-slate-700">
													합계 {formatKrw(variableExpenseTotal)}
												</span>
											</div>
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
																					[item.id]: {
																						...draft,
																						amount: value,
																					},
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
																			onClick={() =>
																				handleDeleteExpense(item.id)
																			}
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
											<div className="mt-4 border-t border-slate-200 pt-4">
												<div className="grid grid-cols-3 gap-2">
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
											</div>
										</div>
									</section>

									<section
										id="consumption-section"
										className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-5 lg:h-full lg:overflow-y-auto lg:pr-3"
									>
										<h2 className="text-xl font-semibold">소비</h2>
										<SectionYearMonthImportControl
											onOpen={() => setSectionImportModalTarget("CONSUMPTION")}
											disabled={copyingSectionTarget !== null}
											loading={copyingSectionTarget === "CONSUMPTION"}
										/>
										<p className="mt-2 text-sm text-slate-600">
											계좌이체 등 예외적인 소비 항목을 기록합니다. 이 섹션
											합계는 실제 사용 금액에 자동 합산됩니다.
										</p>
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
											<div className="flex items-center justify-between">
												<h3 className="font-semibold">소비 항목</h3>
												<span className="text-sm font-medium text-slate-700">
													합계 {formatKrw(consumptionExpenseTotal)}
												</span>
											</div>
											<div className="mt-3">
												{consumptionExpenseItems.length === 0 ? (
													<p className="text-sm text-slate-500">
														등록된 소비 항목이 없습니다.
													</p>
												) : null}
												{consumptionExpenseItems.length > 0 ? (
													<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
														{consumptionExpenseItems.map((item) => {
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
																					[item.id]: {
																						...draft,
																						amount: value,
																					},
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
																			onClick={() =>
																				handleDeleteExpense(item.id)
																			}
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
											<div className="mt-4 border-t border-slate-200 pt-4">
												<div className="grid grid-cols-3 gap-2">
													<input
														className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
														placeholder="예: 계좌이체, 경조사비, 일시 지출"
														value={expenseForms.CONSUMPTION.name}
														onChange={(event) =>
															setExpenseForms((prev) => ({
																...prev,
																CONSUMPTION: {
																	...prev.CONSUMPTION,
																	name: event.target.value,
																},
															}))
														}
													/>
													<CurrencyInput
														value={expenseForms.CONSUMPTION.amount}
														onChange={(value) =>
															setExpenseForms((prev) => ({
																...prev,
																CONSUMPTION: {
																	...prev.CONSUMPTION,
																	amount: value,
																},
															}))
														}
													/>
												</div>
												<Button
													type="button"
													className="mt-2"
													onClick={() => handleAddExpense("CONSUMPTION")}
													disabled={submittingExpenseKind === "CONSUMPTION"}
												>
													{submittingExpenseKind === "CONSUMPTION"
														? "추가 중..."
														: "소비 항목 추가"}
												</Button>
											</div>
										</div>
									</section>
									<section
										id="income-section"
										className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-12 lg:col-start-1 lg:row-start-6 lg:h-full lg:overflow-y-auto lg:pr-3"
									>
										<h2 className="text-xl font-semibold">수입</h2>
										<SectionYearMonthImportControl
											onOpen={() => setSectionImportModalTarget("INCOME")}
											disabled={copyingSectionTarget !== null}
											loading={copyingSectionTarget === "INCOME"}
										/>
										<p className="mt-2 text-sm text-slate-600">
											예상치 못하게 들어온 수입 항목을 기록합니다. 이 섹션
											합계는 월 잔액에 자동 가산됩니다.
										</p>
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
											<div className="flex items-center justify-between">
												<h3 className="font-semibold">수입 항목</h3>
												<span className="text-sm font-medium text-slate-700">
													합계 {formatKrw(incomeTotal)}
												</span>
											</div>
											<div className="mt-3">
												{incomeExpenseItems.length === 0 ? (
													<p className="text-sm text-slate-500">
														등록된 수입 항목이 없습니다.
													</p>
												) : null}
												{incomeExpenseItems.length > 0 ? (
													<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
														{incomeExpenseItems.map((item) => {
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
																					[item.id]: {
																						...draft,
																						amount: value,
																					},
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
																			onClick={() =>
																				handleDeleteExpense(item.id)
																			}
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
											<div className="mt-4 border-t border-slate-200 pt-4">
												<div className="grid grid-cols-3 gap-2">
													<input
														className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
														placeholder="예: 환급금, 상여금, 기타 수입"
														value={expenseForms.INCOME.name}
														onChange={(event) =>
															setExpenseForms((prev) => ({
																...prev,
																INCOME: {
																	...prev.INCOME,
																	name: event.target.value,
																},
															}))
														}
													/>
													<CurrencyInput
														value={expenseForms.INCOME.amount}
														onChange={(value) =>
															setExpenseForms((prev) => ({
																...prev,
																INCOME: {
																	...prev.INCOME,
																	amount: value,
																},
															}))
														}
													/>
												</div>
												<Button
													type="button"
													className="mt-2"
													onClick={() => handleAddExpense("INCOME")}
													disabled={submittingExpenseKind === "INCOME"}
												>
													{submittingExpenseKind === "INCOME"
														? "추가 중..."
														: "수입 항목 추가"}
												</Button>
											</div>
										</div>
									</section>
								</div>
							)
						) : (
							<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
								<h2 className="text-xl font-semibold">연말 결산</h2>
								<p className="mt-2 text-sm text-slate-600">
									1) 월 잔액 - 실제 사용 금액, 2) 월말 기준 최종 저축액(주식 +
									적금)을 확인합니다.
								</p>
								{loadingSettlementData ? (
									<p className="mt-4 text-sm text-slate-500">
										결산 데이터를 불러오는 중...
									</p>
								) : (
									<>
										<div className="mt-4 grid gap-3 md:grid-cols-3">
											<DashboardStatCard
												title={`${selectedYearText}년 총 수입`}
												value={formatKrw(yearlyTotalIncome)}
												emphasis={
													yearlyTotalIncome >= 0 ? "positive" : "negative"
												}
											/>
											<DashboardStatCard
												title={`${selectedYearText}년 총 지출`}
												value={formatKrw(yearlyTotalExpense)}
												emphasis={
													yearlyTotalExpense >= 0 ? "negative" : "positive"
												}
											/>
											<DashboardStatCard
												title={`${selectedYearText}년 총 저축`}
												value={formatKrw(yearlyTotalSaving)}
												emphasis={
													yearlyTotalSaving >= 0 ? "positive" : "negative"
												}
											/>
										</div>
										<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
											<div className="flex items-end justify-between gap-2">
												<h3 className="text-sm font-semibold text-slate-900">
													총 저축 구성(주식/적금)
												</h3>
												<p className="text-xs text-slate-500">
													기준: {latestSavingMonthLabel} · 합계{" "}
													{formatKrw(savingCompositionTotal)}
												</p>
											</div>
											{savingCompositionItems.length === 0 ? (
												<p className="mt-3 text-sm text-slate-500">
													차트를 표시할 저축 데이터가 없습니다.
												</p>
											) : (
												<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
													<div className="h-[280px]">
														<Doughnut
															data={savingCompositionChart}
															options={savingCompositionChartOptions}
														/>
													</div>
													<div className="grid gap-2 self-start">
														{savingCompositionItems.map((item) => (
															<div
																key={item.label}
																className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
															>
																<p className="truncate text-slate-700">
																	{item.label}
																</p>
																<div className="shrink-0 text-right">
																	<p className="font-semibold text-slate-900">
																		{formatKrw(item.amount)}
																	</p>
																	<p className="text-xs text-slate-500">
																		{savingCompositionTotal > 0
																			? `${((item.amount / savingCompositionTotal) * 100).toFixed(1)}%`
																			: "0.0%"}
																	</p>
																</div>
															</div>
														))}
													</div>
												</div>
											)}
										</div>
										<div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
											<table className="min-w-full text-sm">
												<thead className="bg-slate-50 text-slate-600">
													<tr>
														<th className="px-3 py-2 text-left">월</th>
														<th className="px-3 py-2 text-right">추가 수입</th>
														<th className="px-3 py-2 text-right">월 잔액</th>
														<th className="px-3 py-2 text-right">실제 사용</th>
														<th className="px-3 py-2 text-right">순잔액</th>
														<th className="px-3 py-2 text-right">실현손익</th>
														<th className="px-3 py-2 text-right">
															월말 최종 저축액
														</th>
													</tr>
												</thead>
												<tbody>
													{yearlySettlementRows.map((row) => (
														<tr
															key={row.yearMonth}
															className="border-t border-slate-100"
														>
															<td className="px-3 py-2">{row.monthLabel}</td>
															<td className="px-3 py-2 text-right">
																{formatKrw(row.income)}
															</td>
															<td className="px-3 py-2 text-right">
																{formatKrw(row.plannedRemaining)}
															</td>
															<td className="px-3 py-2 text-right">
																{formatKrw(row.actualSpent)}
															</td>
															<td className="px-3 py-2 text-right">
																<span
																	className={
																		row.netAfterActual >= 0
																			? "text-emerald-600"
																			: "text-rose-600"
																	}
																>
																	{formatKrw(row.netAfterActual)}
																</span>
															</td>
															<td className="px-3 py-2 text-right">
																<span
																	className={
																		row.realizedPnl >= 0
																			? "text-emerald-600"
																			: "text-rose-600"
																	}
																>
																	{row.realizedPnl >= 0 ? "+" : "-"}
																	{formatKrw(Math.abs(row.realizedPnl))}
																</span>
															</td>
															<td className="px-3 py-2 text-right">
																{formatKrw(row.cumulativeSaving)}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</>
								)}
							</section>
						)}
						{sectionImportModalTarget !== null ? (
							<LayerModal
								open
								title={`${getSectionImportTargetLabel(sectionImportModalTarget)} 데이터 불러오기`}
								onClose={() => setSectionImportModalTarget(null)}
							>
								<p className="text-sm text-slate-600">
									현재 선택 월은 {selectedMonthLabel}입니다. 불러올 기준 연월을
									선택해주세요.
								</p>
								<div className="mt-4 flex flex-wrap items-center gap-2">
									<input
										type="month"
										value={activeSectionImportYearMonth}
										onChange={(event) =>
											setSectionImportYearMonth((prev) => ({
												...prev,
												[sectionImportModalTarget]: event.target.value,
											}))
										}
										className="rounded-md border border-slate-300 px-3 py-2 text-sm"
									/>
									<Button
										type="button"
										onClick={() =>
											void handleCopySectionByYearMonth(
												sectionImportModalTarget,
											)
										}
										disabled={
											copyingSectionTarget !== null ||
											activeSectionImportYearMonth.trim().length === 0
										}
									>
										{copyingSectionTarget === sectionImportModalTarget
											? "불러오는 중..."
											: "불러오기"}
									</Button>
								</div>
							</LayerModal>
						) : null}
					</div>
				</div>
			</div>
		</main>
	);
}

type SectionYearMonthImportControlProps = {
	onOpen: () => void;
	disabled?: boolean;
	loading: boolean;
};

function SectionYearMonthImportControl({
	onOpen,
	disabled = false,
	loading,
}: SectionYearMonthImportControlProps) {
	return (
		<div className="mt-3 flex items-center justify-end">
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={onOpen}
				disabled={disabled}
			>
				{loading ? "불러오는 중..." : "특정 연월 데이터 불러오기"}
			</Button>
		</div>
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

type SignedCurrencyInputProps = {
	value: number;
	onChange: (value: number) => void;
};

function SignedCurrencyInput({ value, onChange }: SignedCurrencyInputProps) {
	const absolute = Math.abs(value);
	const displayValue =
		absolute === 0 ? "" : `${value < 0 ? "-" : ""}${formatNumber(absolute)}`;
	return (
		<input
			inputMode="numeric"
			className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			value={displayValue}
			onChange={(event) =>
				onChange(parseSignedIntegerInput(event.target.value))
			}
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

type CsvRow = Array<string | number | null | undefined>;

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

function downloadCsvFile(fileName: string, rows: CsvRow[]) {
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

function toYearMonthInput(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	return `${year}-${month}`;
}

function getPreviousYearMonthInput(yearMonth: string): string {
	const [yearText, monthText] = yearMonth.split("-");
	const year = Number.parseInt(yearText, 10);
	const month = Number.parseInt(monthText, 10);
	if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
		return toYearMonthInput(new Date());
	}
	return toYearMonthInput(new Date(year, month - 2, 1));
}

function getSectionImportTargetLabel(target: SectionImportTarget): string {
	if (target === "STOCK") {
		return "주식";
	}
	if (target === "INSTALLMENT") {
		return "적금";
	}
	if (target === "FIXED") {
		return "고정 지출";
	}
	if (target === "VARIABLE") {
		return "비고정 지출";
	}
	if (target === "CONSUMPTION") {
		return "소비";
	}
	return "수입";
}

function parseTabFromSearch(search: string): AppTab {
	const params = new URLSearchParams(search);
	const tab = params.get("tab");
	if (tab === "yearly") {
		return "YEARLY_SETTLEMENT";
	}
	return "DASHBOARD";
}

function getInitialTabFromQuery(): AppTab {
	if (typeof window === "undefined") {
		return "DASHBOARD";
	}
	return parseTabFromSearch(window.location.search);
}

function parseYearMonthFromSearch(search: string): string | null {
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

function getInitialYearMonthFromQuery(): string {
	if (typeof window === "undefined") {
		return toYearMonthInput(new Date());
	}
	return (
		parseYearMonthFromSearch(window.location.search) ??
		toYearMonthInput(new Date())
	);
}

function parseYearMonth(yearMonth: string): { year: number; month: number } {
	const [yearText, monthText] = yearMonth.split("-");
	const year = Number.parseInt(yearText, 10);
	const month = Number.parseInt(monthText, 10);
	if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() + 1 };
	}
	return { year, month };
}

function getYearMonthDateRange(yearMonth: string) {
	const { year, month } = parseYearMonth(yearMonth);
	const start = new Date(year, month - 1, 1);
	const end = new Date(year, month, 0);
	return {
		fromDate: toDateInput(start),
		toDate: toDateInput(end),
	};
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

function parseSignedIntegerInput(input: string): number {
	const trimmed = input.trim();
	const isNegative = trimmed.startsWith("-");
	const digits = trimmed.replace(/\D/g, "");
	if (digits.length === 0) {
		return 0;
	}
	const value = Number.parseInt(digits, 10);
	return isNegative ? -value : value;
}

export default App;
