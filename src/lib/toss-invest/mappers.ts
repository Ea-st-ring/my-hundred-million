import type { TossHoldingItem, TossStockInfo } from "@/lib/toss-invest/types";
import type { StockHolding } from "@/types/finance";

const QUANTITY_EPSILON = 0.0001;
const PRICE_EPSILON = 0.01;

function numbersDiffer(a: number, b: number, epsilon: number): boolean {
	return Math.abs(a - b) > epsilon;
}

function buildQuoteSymbol(symbol: string, exchange: string): string {
	return exchange.length === 0 ? symbol : `${symbol}:${exchange}`;
}

function resolveExchange(
	item: TossHoldingItem,
	stockInfo: TossStockInfo | undefined,
): string {
	if (stockInfo !== undefined) {
		return stockInfo.market;
	}
	return item.marketCountry === "KR" ? "KRX" : "";
}

export function buildNewHoldingInput(
	item: TossHoldingItem,
	stockInfo: TossStockInfo | undefined,
): Omit<StockHolding, "id"> {
	return {
		broker: "TOSS",
		market: item.marketCountry,
		symbol: item.symbol,
		name: item.name,
		quoteSymbol: buildQuoteSymbol(
			item.symbol,
			resolveExchange(item, stockInfo),
		),
		quantity: Number(item.quantity),
		averagePrice: Number(item.averagePurchasePrice),
		isAccumulating: false,
		accumulationStartedAt: null,
		cadence: null,
		runDay: null,
		accumulationType: "AMOUNT",
		accumulationCurrency: item.currency,
		accumulationValue: 0,
	};
}

export function buildUpdateHoldingInput(
	existing: StockHolding,
	item: TossHoldingItem,
): Omit<StockHolding, "id"> {
	const { id: _id, ...rest } = existing;
	return {
		...rest,
		name: item.name,
		quantity: Number(item.quantity),
		averagePrice: Number(item.averagePurchasePrice),
	};
}

export type TossHoldingSuggestion =
	| {
			kind: "NEW";
			tossItem: TossHoldingItem;
			input: Omit<StockHolding, "id">;
	  }
	| {
			kind: "UPDATE";
			tossItem: TossHoldingItem;
			existing: StockHolding;
			input: Omit<StockHolding, "id">;
	  }
	| {
			kind: "UNCHANGED";
			tossItem: TossHoldingItem;
			existing: StockHolding;
	  };

export function buildHoldingSuggestions(
	tossItems: TossHoldingItem[],
	existingHoldings: StockHolding[],
	stockInfoBySymbol: Map<string, TossStockInfo>,
): TossHoldingSuggestion[] {
	const tossHoldings = existingHoldings.filter(
		(holding) => holding.broker === "TOSS",
	);

	return tossItems.map((item) => {
		const existing = tossHoldings.find(
			(holding) =>
				holding.symbol === item.symbol && holding.market === item.marketCountry,
		);

		if (existing === undefined) {
			return {
				kind: "NEW",
				tossItem: item,
				input: buildNewHoldingInput(item, stockInfoBySymbol.get(item.symbol)),
			};
		}

		const quantityChanged = numbersDiffer(
			existing.quantity,
			Number(item.quantity),
			QUANTITY_EPSILON,
		);
		const averagePriceChanged = numbersDiffer(
			existing.averagePrice,
			Number(item.averagePurchasePrice),
			PRICE_EPSILON,
		);

		if (!quantityChanged && !averagePriceChanged) {
			return { kind: "UNCHANGED", tossItem: item, existing };
		}

		return {
			kind: "UPDATE",
			tossItem: item,
			existing,
			input: buildUpdateHoldingInput(existing, item),
		};
	});
}
