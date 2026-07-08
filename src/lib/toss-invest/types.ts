export type TossCurrency = "KRW" | "USD";
export type TossMarketCountry = "KR" | "US";

export type TossApiErrorEnvelope = {
	error: {
		requestId?: string;
		code: string;
		message: string;
		data?: unknown;
	};
};

export type TossAmountPair = {
	krw: string | null;
	usd: string | null;
};

export type TossHoldingItem = {
	symbol: string;
	name: string;
	marketCountry: TossMarketCountry;
	currency: TossCurrency;
	quantity: string;
	lastPrice: string;
	averagePurchasePrice: string;
};

export type TossHoldingsOverview = {
	totalPurchaseAmount: TossAmountPair;
	marketValue: {
		amount: TossAmountPair;
		amountAfterCost: TossAmountPair;
	};
	profitLoss: {
		amount: TossAmountPair;
		amountAfterCost: TossAmountPair;
		rate: string | null;
		rateAfterCost: string | null;
	};
	items: TossHoldingItem[];
};

export type TossBuyingPower = {
	currency: TossCurrency;
	cashBuyingPower: string;
};

export type TossPrice = {
	symbol: string;
	timestamp: string;
	lastPrice: string;
	currency: TossCurrency;
};

export type TossStockInfo = {
	symbol: string;
	name: string;
	englishName: string | null;
	market: string;
	currency: TossCurrency;
	status: string;
};
