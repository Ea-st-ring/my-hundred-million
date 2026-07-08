import { invokeTossInvest } from "@/lib/toss-invest/client";
import type {
	TossBuyingPower,
	TossCurrency,
	TossHoldingsOverview,
	TossPrice,
	TossStockInfo,
} from "@/lib/toss-invest/types";

export async function fetchTossHoldings(): Promise<TossHoldingsOverview> {
	return invokeTossInvest<TossHoldingsOverview>("HOLDINGS");
}

export async function fetchTossBuyingPower(
	currency: TossCurrency,
): Promise<TossBuyingPower> {
	return invokeTossInvest<TossBuyingPower>("BUYING_POWER", { currency });
}

export async function fetchTossPrices(symbols: string[]): Promise<TossPrice[]> {
	if (symbols.length === 0) {
		return [];
	}
	return invokeTossInvest<TossPrice[]>("PRICES", {
		symbols: symbols.join(","),
	});
}

export async function fetchTossStockInfo(
	symbols: string[],
): Promise<TossStockInfo[]> {
	if (symbols.length === 0) {
		return [];
	}
	return invokeTossInvest<TossStockInfo[]>("STOCK_INFO", {
		symbols: symbols.join(","),
	});
}
